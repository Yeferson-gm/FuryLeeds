import { describe, expect, it } from 'bun:test';
import { buildConversationContext } from '@/lib/ai/context';
import type { AiDatabase } from '@/lib/ai/types';

function fakeDb(rows: unknown[]): AiDatabase {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => Promise.resolve(rows),
  };
  return { select: () => query } as unknown as AiDatabase;
}

describe('buildConversationContext', () => {
  it('maps senderType to role and returns chronological order', async () => {
    const rows = [
      { senderType: 'customer', contentText: 'third' },
      { senderType: 'agent', contentText: 'second' },
      { senderType: 'customer', contentText: 'first' },
    ];
    const out = await buildConversationContext(
      fakeDb(rows),
      'acct-1',
      'conv-1'
    );
    expect(out).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ]);
  });

  it('treats bot messages as assistant', async () => {
    const out = await buildConversationContext(
      fakeDb([{ senderType: 'bot', contentText: 'auto reply' }]),
      'acct-1',
      'conv-1'
    );
    expect(out).toEqual([{ role: 'assistant', content: 'auto reply' }]);
  });

  it('drops empty / whitespace-only messages', async () => {
    const out = await buildConversationContext(
      fakeDb([
        { senderType: 'customer', contentText: '   ' },
        { senderType: 'customer', contentText: null },
        { senderType: 'customer', contentText: 'real' },
      ]),
      'acct-1',
      'conv-1'
    );
    expect(out).toEqual([{ role: 'user', content: 'real' }]);
  });
});
