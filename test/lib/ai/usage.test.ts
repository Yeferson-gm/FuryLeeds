import { describe, expect, it, mock, spyOn } from 'bun:test';
import type { AiDatabase } from '@/lib/ai/types';
import { logAiUsage } from '@/lib/ai/usage';

function fakeDb() {
  const values = mock().mockResolvedValue(undefined);
  const insert = mock(() => ({ values }));
  return {
    db: { insert } as unknown as AiDatabase,
    insert,
    values,
  };
}

describe('logAiUsage', () => {
  it('inserts a row mapping normalized usage to the schema fields', async () => {
    const { db, insert, values } = fakeDb();
    await logAiUsage(db, {
      accountId: 'acct-1',
      conversationId: 'conv-1',
      mode: 'auto_reply',
      provider: 'anthropic',
      model: 'claude-x',
      usage: { promptTokens: 30, completionTokens: 6, totalTokens: 36 },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      accountId: 'acct-1',
      conversationId: 'conv-1',
      mode: 'auto_reply',
      provider: 'anthropic',
      model: 'claude-x',
      promptTokens: 30,
      completionTokens: 6,
      totalTokens: 36,
    });
  });

  it('is a no-op when the provider reported no usage', async () => {
    const { db, insert } = fakeDb();
    await logAiUsage(db, {
      accountId: 'acct-1',
      conversationId: null,
      mode: 'draft',
      provider: 'openai',
      model: 'gpt-x',
      usage: null,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('never throws when the insert errors', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {});
    const db = {
      insert: () => ({ values: () => Promise.reject(new Error('boom')) }),
    } as unknown as AiDatabase;
    await expect(
      logAiUsage(db, {
        accountId: 'acct-1',
        conversationId: 'conv-1',
        mode: 'draft',
        provider: 'openai',
        model: 'gpt-x',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
