import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { aiKnowledgeChunks } from '@/lib/db/crm-schema';
import { chunkText } from './chunk';
import { embedTexts, toVectorLiteral } from './embeddings';
import type { AiConfig, AiDatabase } from './types';

interface MatchRow {
  id: string;
  content: string;
}

/** Replace all retrieval chunks for a document. */
export async function ingestDocument(
  db: AiDatabase,
  accountId: string,
  config: Pick<AiConfig, 'embeddingsApiKey'>,
  documentId: string,
  content: string
): Promise<void> {
  const chunks = chunkText(content);
  await db
    .delete(aiKnowledgeChunks)
    .where(
      and(
        eq(aiKnowledgeChunks.accountId, accountId),
        eq(aiKnowledgeChunks.documentId, documentId)
      )
    );

  if (chunks.length === 0) return;

  let embeddings: number[][] | null = null;
  let embedError: unknown = null;
  if (config.embeddingsApiKey) {
    try {
      embeddings = await embedTexts(config.embeddingsApiKey, chunks);
    } catch (err) {
      embedError = err;
    }
  }

  await db.insert(aiKnowledgeChunks).values(
    chunks.map((chunkContent, index) => ({
      documentId,
      accountId,
      chunkIndex: index,
      content: chunkContent,
      embedding: embeddings?.[index]
        ? sql`${toVectorLiteral(embeddings[index])}::vector(1536)`
        : null,
    }))
  );

  if (embedError) throw embedError;
}

/**
 * Retrieve semantic matches first and top them up with lexical FTS matches.
 * Retrieval remains best-effort and returns fewer/zero excerpts on failure.
 */
export async function retrieveKnowledge(
  db: AiDatabase,
  accountId: string,
  config: Pick<AiConfig, 'embeddingsApiKey'>,
  queryText: string,
  k = 5
): Promise<string[]> {
  const query = queryText.trim();
  if (!query || k <= 0) return [];

  try {
    const [chunk] = await db
      .select({ id: aiKnowledgeChunks.id })
      .from(aiKnowledgeChunks)
      .where(eq(aiKnowledgeChunks.accountId, accountId))
      .limit(1);
    if (!chunk) return [];
  } catch {
    return [];
  }

  const picked = new Map<string, string>();

  if (config.embeddingsApiKey) {
    try {
      const [queryEmbedding] = await embedTexts(config.embeddingsApiKey, [
        query,
      ]);
      if (queryEmbedding) {
        const vector = toVectorLiteral(queryEmbedding);
        const rows = await db
          .select({
            id: aiKnowledgeChunks.id,
            content: aiKnowledgeChunks.content,
          })
          .from(aiKnowledgeChunks)
          .where(
            and(
              eq(aiKnowledgeChunks.accountId, accountId),
              isNotNull(aiKnowledgeChunks.embedding)
            )
          )
          .orderBy(
            sql`${aiKnowledgeChunks.embedding} <=> ${vector}::vector(1536)`
          )
          .limit(k);
        for (const row of rows as MatchRow[]) picked.set(row.id, row.content);
      }
    } catch (err) {
      console.error(
        '[ai knowledge] semantic retrieval failed, falling back to FTS:',
        err
      );
    }
  }

  if (picked.size < k) {
    try {
      const rows = await db
        .select({
          id: aiKnowledgeChunks.id,
          content: aiKnowledgeChunks.content,
        })
        .from(aiKnowledgeChunks)
        .where(
          and(
            eq(aiKnowledgeChunks.accountId, accountId),
            sql`${aiKnowledgeChunks.fts} @@ plainto_tsquery('simple', ${query})`
          )
        )
        .orderBy(
          desc(
            sql`ts_rank(${aiKnowledgeChunks.fts}, plainto_tsquery('simple', ${query}))`
          )
        )
        .limit(k);
      for (const row of rows as MatchRow[]) {
        if (picked.size >= k) break;
        if (!picked.has(row.id)) picked.set(row.id, row.content);
      }
    } catch (err) {
      console.error('[ai knowledge] lexical retrieval failed:', err);
    }
  }

  return Array.from(picked.values()).slice(0, k);
}
