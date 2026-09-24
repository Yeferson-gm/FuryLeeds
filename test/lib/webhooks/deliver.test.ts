import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@test/support/mocks';

mock.module('@/lib/whatsapp/encryption', () => ({
  decrypt: (secret: string) => secret,
  encrypt: (secret: string) => secret,
}));

import { dispatchWebhookEvent } from '@/lib/webhooks/deliver';

interface Row {
  id: string;
  accountId: string;
  url: string;
  secret: string;
}

function makeDb(rows: Row[]) {
  const updates: Record<string, unknown>[] = [];
  const database = {
    select: () => ({
      from: () => ({ where: async () => rows }),
    }),
    update: () => ({
      set: (payload: Record<string, unknown>) => ({
        where: async () => {
          updates.push(payload);
        },
      }),
    }),
  } as unknown as Parameters<typeof dispatchWebhookEvent>[0];
  return { database, updates };
}

beforeEach(() => {
  stubGlobal('fetch', mock());
});
afterEach(() => unstubAllGlobals());

describe('dispatchWebhookEvent', () => {
  it('signs and posts without following redirects, then resets failures', async () => {
    const fetchMock = mock().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    stubGlobal('fetch', fetchMock);
    const { database, updates } = makeDb([
      {
        id: 'a',
        accountId: 'acct-1',
        url: 'https://8.8.8.8/hook',
        secret: 's1',
      },
    ]);

    await dispatchWebhookEvent(database, 'acct-1', 'message.received', {
      x: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://8.8.8.8/hook');
    expect(options.redirect).toBe('manual');
    expect(options.headers['X-FuryLeeds-Event']).toBe('message.received');
    expect(options.headers['X-FuryLeeds-Signature']).toMatch(
      /^t=\d+,v1=[0-9a-f]{64}$/
    );
    expect(JSON.parse(options.body).account_id).toBe('acct-1');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ failureCount: 0 });
  });

  it('uses one atomic update when delivery fails', async () => {
    stubGlobal(
      'fetch',
      mock().mockResolvedValue({ ok: false, status: 500 } as Response)
    );
    const { database, updates } = makeDb([
      {
        id: 'b',
        accountId: 'acct-1',
        url: 'https://1.1.1.1/hook',
        secret: 's2',
      },
    ]);
    await dispatchWebhookEvent(database, 'acct-1', 'message.received', {});
    expect(updates).toHaveLength(1);
    expect(updates[0].failureCount).toBeDefined();
    expect(updates[0].isActive).toBeDefined();
  });

  it('blocks a non-public target without fetching', async () => {
    const fetchMock = mock();
    stubGlobal('fetch', fetchMock);
    const { database, updates } = makeDb([
      {
        id: 'c',
        accountId: 'acct-1',
        url: 'https://127.0.0.1/hook',
        secret: 's3',
      },
    ]);
    await dispatchWebhookEvent(database, 'acct-1', 'message.received', {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
  });

  it('does nothing when no endpoints are subscribed', async () => {
    const fetchMock = mock();
    stubGlobal('fetch', fetchMock);
    const { database, updates } = makeDb([]);
    await dispatchWebhookEvent(database, 'acct-1', 'message.received', {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
