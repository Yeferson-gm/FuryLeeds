import { and, eq } from 'drizzle-orm';
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

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { db, accountId } = await requireRole('viewer');
    const { id } = await params;
    try {
      const [document] = await db
        .select({
          id: schema.aiKnowledgeDocuments.id,
          title: schema.aiKnowledgeDocuments.title,
          content: schema.aiKnowledgeDocuments.content,
          updated_at: schema.aiKnowledgeDocuments.updatedAt,
        })
        .from(schema.aiKnowledgeDocuments)
        .where(
          and(
            eq(schema.aiKnowledgeDocuments.accountId, accountId),
            eq(schema.aiKnowledgeDocuments.id, id)
          )
        )
        .limit(1);
      if (!document)
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json(document);
    } catch (error) {
      console.error('[ai/knowledge/[id] GET] error:', error);
      return NextResponse.json(
        { error: 'Failed to load document' },
        { status: 500 }
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { db, accountId, userId } = await requireRole('admin');
    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const title =
      typeof body?.title === 'string' ? body.title.trim() : undefined;
    const content =
      typeof body?.content === 'string' ? body.content.trim() : undefined;
    if (title === undefined && content === undefined) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    if (title !== undefined && !title) {
      return NextResponse.json(
        { error: 'title cannot be empty' },
        { status: 400 }
      );
    }
    if (content !== undefined && !content) {
      return NextResponse.json(
        { error: 'content cannot be empty' },
        { status: 400 }
      );
    }

    let updated: { id: string } | undefined;
    try {
      [updated] = await db
        .update(schema.aiKnowledgeDocuments)
        .set({ title, content })
        .where(
          and(
            eq(schema.aiKnowledgeDocuments.accountId, accountId),
            eq(schema.aiKnowledgeDocuments.id, id)
          )
        )
        .returning({ id: schema.aiKnowledgeDocuments.id });
    } catch (error) {
      console.error('[ai/knowledge/[id] PATCH] error:', error);
      return NextResponse.json(
        { error: 'Failed to update document' },
        { status: 500 }
      );
    }
    if (!updated)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (content !== undefined) {
      const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
        db,
        accountId
      );
      try {
        await ingestDocument(db, accountId, { embeddingsApiKey }, id, content);
      } catch (err) {
        const message =
          err instanceof AiError ? err.message : 'indexing failed';
        console.error('[ai/knowledge/[id] PATCH] ingest error:', err);
        return NextResponse.json({
          success: true,
          warning: `Updated, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
        });
      }
      if (corrupt) {
        return NextResponse.json({
          success: true,
          warning:
            'Updated with keyword search only — your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key).',
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { db, accountId } = await requireRole('admin');
    const { id } = await params;
    try {
      await db
        .delete(schema.aiKnowledgeDocuments)
        .where(
          and(
            eq(schema.aiKnowledgeDocuments.accountId, accountId),
            eq(schema.aiKnowledgeDocuments.id, id)
          )
        );
    } catch (error) {
      console.error('[ai/knowledge/[id] DELETE] error:', error);
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
