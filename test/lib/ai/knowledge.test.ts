import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { hoisted, required } from '@test/support/mocks';
import type { AiDatabase } from '@/lib/ai/types';
import { aiKnowledgeChunks } from '@/lib/db/crm-schema';

const h = hoisted(() => ({ embedTexts: mock() }));
mock.module('@/lib/ai/embeddings', () => ({
  embedTexts: h.embedTexts,
  toVectorLiteral: (vector: number[]) => `[${vector.join(',')}]`,
}));

import { ingestDocument, retrieveKnowledge } from '@/lib/ai/knowledge';

interface FakeState {
  semantic: { id: string; content: string }[];
  fts: { id: string; content: string }[];
  hasChunks: boolean;
  matchCalls: string[];
  inserted: Record<string, unknown>[] | null;
  deleted: boolean;
}

function makeDb() {
  const state: FakeState = {
    semantic: [],
    fts: [],
    hasChunks: true,
    matchCalls: [],
    inserted: null,
    deleted: false,
  };

  let chunkQueries = 0;
  const db = {
    select: () => {
      let rows: unknown[] = [];
      const query = {
        from: (table: unknown) => {
          if (table === aiKnowledgeChunks) {
            chunkQueries += 1;
            if (chunkQueries === 1) {
              rows = state.hasChunks ? [{ id: 'chunk-1' }] : [];
            } else {
              const semantic =
                h.embedTexts.mock.calls.length > 0 &&
                !state.matchCalls.includes('semantic');
              state.matchCalls.push(semantic ? 'semantic' : 'fts');
              rows = semantic ? state.semantic : state.fts;
            }
          }
          return query;
        },
        where: () => query,
        orderBy: () => query,
        limit: () => Promise.resolve(rows),
      };
      return query;
    },
    delete: () => ({
      where: () => {
        state.deleted = true;
        return Promise.resolve();
      },
    }),
    insert: () => ({
      values: (rows: Record<string, unknown>[]) => {
        state.inserted = rows;
        return Promise.resolve();
      },
    }),
  };

  return { db: db as unknown as AiDatabase, state };
}

beforeEach(() => {
  h.embedTexts.mockReset();
  h.embedTexts.mockImplementation(async (_key: string, inputs: string[]) =>
    inputs.map((_, index) => [index, index])
  );
});

describe('retrieveKnowledge', () => {
  it('returns [] for an empty query without touching the DB', async () => {
    const { db, state } = makeDb();
    expect(
      await retrieveKnowledge(db, 'acct', { embeddingsApiKey: null }, '  ')
    ).toEqual([]);
    expect(state.matchCalls).toEqual([]);
  });

  it('short-circuits before embedding and matching when the KB is empty', async () => {
    const { db, state } = makeDb();
    state.hasChunks = false;
    const out = await retrieveKnowledge(
      db,
      'acct',
      { embeddingsApiKey: 'sk-x' },
      'q'
    );
    expect(out).toEqual([]);
    expect(h.embedTexts).not.toHaveBeenCalled();
    expect(state.matchCalls).toEqual([]);
  });

  it('uses lexical FTS only when there is no embeddings key', async () => {
    const { db, state } = makeDb();
    state.fts = [{ id: 'f1', content: 'F1' }];
    const out = await retrieveKnowledge(
      db,
      'acct',
      { embeddingsApiKey: null },
      'q'
    );
    expect(out).toEqual(['F1']);
    expect(state.matchCalls).toEqual(['fts']);
    expect(h.embedTexts).not.toHaveBeenCalled();
  });

  it('uses semantic search when an embeddings key is present', async () => {
    const { db, state } = makeDb();
    state.semantic = [
      { id: 's1', content: 'S1' },
      { id: 's2', content: 'S2' },
      { id: 's3', content: 'S3' },
    ];
    const out = await retrieveKnowledge(
      db,
      'acct',
      { embeddingsApiKey: 'sk-x' },
      'q',
      3
    );
    expect(out).toEqual(['S1', 'S2', 'S3']);
    expect(h.embedTexts).toHaveBeenCalledTimes(1);
    expect(state.matchCalls).toEqual(['semantic']);
  });

  it('tops up with FTS and dedupes when semantic is short', async () => {
    const { db, state } = makeDb();
    state.semantic = [
      { id: 's1', content: 'S1' },
      { id: 's2', content: 'S2' },
    ];
    state.fts = [
      { id: 's2', content: 'S2-dup' },
      { id: 'f1', content: 'F1' },
    ];
    const out = await retrieveKnowledge(
      db,
      'acct',
      { embeddingsApiKey: 'sk-x' },
      'q',
      3
    );
    expect(out).toEqual(['S1', 'S2', 'F1']);
    expect(state.matchCalls).toEqual(['semantic', 'fts']);
  });
});

describe('ingestDocument', () => {
  it('embeds chunks when a key is present', async () => {
    const { db, state } = makeDb();
    await ingestDocument(
      db,
      'acct',
      { embeddingsApiKey: 'sk-x' },
      'doc-1',
      'hello world'
    );
    expect(h.embedTexts).toHaveBeenCalledTimes(1);
    expect(state.deleted).toBeTrue();
    expect(state.inserted).toHaveLength(1);
    const insertedChunk = required(
      state.inserted?.[0],
      'Expected one inserted chunk'
    );
    expect(insertedChunk.embedding).not.toBeNull();
    expect(insertedChunk.accountId).toBe('acct');
    expect(insertedChunk.documentId).toBe('doc-1');
  });

  it('stores chunks without embeddings when there is no key', async () => {
    const { db, state } = makeDb();
    await ingestDocument(
      db,
      'acct',
      { embeddingsApiKey: null },
      'doc-1',
      'hello world'
    );
    expect(h.embedTexts).not.toHaveBeenCalled();
    const insertedChunk = required(
      state.inserted?.[0],
      'Expected one inserted chunk'
    );
    expect(insertedChunk.embedding).toBeNull();
  });

  it('deletes existing chunks and inserts nothing for empty content', async () => {
    const { db, state } = makeDb();
    await ingestDocument(
      db,
      'acct',
      { embeddingsApiKey: 'sk-x' },
      'doc-1',
      '   '
    );
    expect(state.deleted).toBeTrue();
    expect(state.inserted).toBeNull();
    expect(h.embedTexts).not.toHaveBeenCalled();
  });

  it('still stores lexical chunks when embedding fails, then rethrows', async () => {
    const { db, state } = makeDb();
    h.embedTexts.mockRejectedValueOnce(new Error('rate limited'));
    await expect(
      ingestDocument(
        db,
        'acct',
        { embeddingsApiKey: 'sk-x' },
        'doc-1',
        'hello world'
      )
    ).rejects.toThrow('rate limited');
    expect(state.inserted).toHaveLength(1);
    const insertedChunk = required(
      state.inserted?.[0],
      'Expected one inserted chunk'
    );
    expect(insertedChunk.embedding).toBeNull();
  });
});
