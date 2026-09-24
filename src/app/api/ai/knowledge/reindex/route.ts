import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { loadEmbeddingsKey } from '@/lib/ai/config';
import { ingestDocument } from '@/lib/ai/knowledge';
import { AiError } from '@/lib/ai/types';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

export async function POST() {
  try {
    const { db, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(
      `ai-kb-reindex:${userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    let docs: { id: string; content: string }[];
    try {
      docs = await db
        .select({
          id: schema.aiKnowledgeDocuments.id,
          content: schema.aiKnowledgeDocuments.content,
        })
        .from(schema.aiKnowledgeDocuments)
        .where(eq(schema.aiKnowledgeDocuments.accountId, accountId));
    } catch (error) {
      console.error('[ai/knowledge/reindex] fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to load documents' },
        { status: 500 }
      );
    }

    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      db,
      accountId
    );
    if (corrupt) {
      return NextResponse.json({
        success: false,
        reindexed: 0,
        error:
          'Your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key in Settings → AI Assistant). Nothing was reindexed.',
      });
    }

    let reindexed = 0;
    for (const doc of docs) {
      try {
        await ingestDocument(
          db,
          accountId,
          { embeddingsApiKey },
          doc.id,
          doc.content
        );
        reindexed += 1;
      } catch (err) {
        const message = err instanceof AiError ? err.message : String(err);
        console.error(`[ai/knowledge/reindex] doc ${doc.id} failed:`, message);
        return NextResponse.json({
          success: false,
          reindexed,
          total: docs.length,
          error: `Reindexed ${reindexed}, then hit an error: ${message}`,
        });
      }
    }

    return NextResponse.json({ success: true, reindexed });
  } catch (err) {
    return toErrorResponse(err);
  }
}
