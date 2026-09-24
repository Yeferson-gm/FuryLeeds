import { describe, expect, it, mock, spyOn } from 'bun:test';
import { reopenClosedConversation } from '@/lib/conversations/reopen';

interface Recorded {
  updates: number;
  payload: Record<string, unknown> | null;
  whereCalls: number;
}

function stubDatabase(options: { matched?: boolean; error?: Error } = {}) {
  const calls: Recorded = { updates: 0, payload: null, whereCalls: 0 };
  const builder = {
    set(payload: Record<string, unknown>) {
      calls.payload = payload;
      return builder;
    },
    where() {
      calls.whereCalls += 1;
      return builder;
    },
    async returning() {
      if (options.error) throw options.error;
      return options.matched === false ? [] : [{ id: 'conv-1' }];
    },
  };
  const database = {
    update: mock(() => {
      calls.updates += 1;
      return builder;
    }),
  };
  return { database, calls };
}

const closedConversation = {
  id: 'conv-1',
  accountId: 'account-1',
  status: 'closed',
};

describe('reopenClosedConversation', () => {
  it('flips an account-owned closed conversation back to open', async () => {
    const { database, calls } = stubDatabase();

    const reopened = await reopenClosedConversation(
      database as never,
      closedConversation
    );

    expect(reopened).toBe(true);
    expect(calls.updates).toBe(1);
    expect(calls.whereCalls).toBe(1);
    expect(calls.payload).toMatchObject({ status: 'open' });
    expect(calls.payload).toHaveProperty('updatedAt');
  });

  it('returns false when the guarded update no longer matches', async () => {
    const { database } = stubDatabase({ matched: false });
    await expect(
      reopenClosedConversation(database as never, closedConversation)
    ).resolves.toBe(false);
  });

  it.each(['open', 'pending'])(
    'issues no query for a %s conversation',
    async (status) => {
      const { database, calls } = stubDatabase();

      const reopened = await reopenClosedConversation(database as never, {
        ...closedConversation,
        status,
      });

      expect(reopened).toBe(false);
      expect(calls.updates).toBe(0);
    }
  );

  it('issues no query when status is missing', async () => {
    const { database, calls } = stubDatabase();

    await expect(
      reopenClosedConversation(database as never, {
        id: 'conv-1',
        accountId: 'account-1',
      })
    ).resolves.toBe(false);
    expect(calls.updates).toBe(0);
  });

  it('swallows a failed update so inbound processing continues', async () => {
    const spy = spyOn(console, 'error').mockImplementation(() => {});
    const { database } = stubDatabase({ error: new Error('database offline') });

    await expect(
      reopenClosedConversation(database as never, closedConversation)
    ).resolves.toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
