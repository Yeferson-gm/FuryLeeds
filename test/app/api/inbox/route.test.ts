import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { asThenable, hoisted } from '@test/support/mocks';

const authMocks = hoisted(() => ({
  requireRole: mock(),
}));

mock.module('@/lib/auth/account', () => ({
  requireRole: authMocks.requireRole,
  toErrorResponse: mock(() =>
    Response.json({ error: 'auth failed' }, { status: 401 })
  ),
}));

import { PATCH as patchConversation } from '@/app/api/inbox/conversations/[id]/route';
import { GET as getInbox } from '@/app/api/inbox/route';

function queuedDatabase(results: unknown[][]) {
  let selectIndex = 0;
  const update = mock(() => {
    throw new Error('unexpected update');
  });
  const select = mock(() => {
    const result = results[selectIndex++] ?? [];
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
      builder[method] = mock(chain);
    }
    return asThenable(builder, () => result);
  });
  return { select, update };
}

function context(db: ReturnType<typeof queuedDatabase>) {
  return {
    db,
    accountId: 'account-1',
    userId: 'user-1',
    role: 'agent',
    systemRole: 'user',
    account: { id: 'account-1', name: 'Acme' },
  };
}

beforeEach(() => {
  authMocks.requireRole.mockReset();
});

describe('inbox API authorization and tenancy', () => {
  it('loads the inbox through requireRole and returns account resources', async () => {
    const db = queuedDatabase([
      [],
      [
        {
          id: 'tag-1',
          userId: 'user-1',
          accountId: 'account-1',
          name: 'VIP',
          color: '#fff',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      [{ status: 'connected' }],
    ]);
    authMocks.requireRole.mockResolvedValue(context(db));

    const response = await getInbox(new Request('http://localhost/api/inbox'));

    expect(response.status).toBe(200);
    expect(authMocks.requireRole).toHaveBeenCalledWith('viewer');
    expect(await response.json()).toEqual({
      conversations: [],
      tags: [
        {
          id: 'tag-1',
          user_id: 'user-1',
          name: 'VIP',
          color: '#fff',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      whatsapp_connected: true,
    });
  });

  it('does not patch a conversation outside the current account', async () => {
    const db = queuedDatabase([[]]);
    authMocks.requireRole.mockResolvedValue(context(db));

    const response = await patchConversation(
      new Request('http://localhost/api/inbox/conversations/foreign', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      }),
      { params: Promise.resolve({ id: 'foreign' }) }
    );

    expect(response.status).toBe(404);
    expect(authMocks.requireRole).toHaveBeenCalledWith('agent');
    expect(db.update).not.toHaveBeenCalled();
  });
});
