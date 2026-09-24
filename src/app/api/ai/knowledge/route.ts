import { desc, eq } from 'drizzle-orm';
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

export async function GET() {
  try {
    const { db, accountId } = await requireRole('viewer');
    try {
      const documents = await db
        .select({
          id: schema.aiKnowledgeDocuments.id,
          title: schema.aiKnowledgeDocuments.title,
          updated_at: schema.aiKnowledgeDocuments.updatedAt,
        })
        .from(schema.aiKnowledgeDocuments)
        .where(eq(schema.aiKnowledgeDocuments.accountId, accountId))
        .orderBy(desc(schema.aiKnowledgeDocuments.updatedAt));
      return NextResponse.json({ documents });
    } catch (error) {
      console.error('[ai/knowledge GET] error:', error);
      return NextResponse.json(
        { error: 'Failed to load knowledge base' },
        { status: 500 }
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const content =
      typeof body?.content === 'string' ? body.content.trim() : '';
    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 }
      );
    }

    let doc: { id: string } | undefined;
    try {
      [doc] = await db
        .insert(schema.aiKnowledgeDocuments)
        .values({ accountId, createdBy: userId, title, content })
        .returning({ id: schema.aiKnowledgeDocuments.id });
    } catch (error) {
      console.error('[ai/knowledge POST] insert error:', error);
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 }
      );
    }
    if (!doc) {
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 }
      );
    }

    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      db,
      accountId
    );
    try {
      await ingestDocument(
        db,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content
      );
    } catch (err) {
      const message = err instanceof AiError ? err.message : 'indexing failed';
      console.error('[ai/knowledge POST] ingest error:', err);
      return NextResponse.json({
        success: true,
        id: doc.id,
        warning: `Saved, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
      });
    }

    if (corrupt) {
      return NextResponse.json({
        success: true,
        id: doc.id,
        warning:
          'Saved with keyword search only — your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key).',
      });
    }
    return NextResponse.json({ success: true, id: doc.id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
