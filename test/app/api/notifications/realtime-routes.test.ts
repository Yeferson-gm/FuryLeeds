import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { asThenable, hoisted } from '@test/support/mocks';

const mocks = hoisted(() => ({
  getCurrentAccount: mock(),
  select: mock(),
  insert: mock(),
  values: mock(),
  onConflictDoUpdate: mock(),
}));

mock.module('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  toErrorResponse: mock(() =>
    Response.json({ error: 'auth failed' }, { status: 401 })
  ),
}));

mock.module('@/lib/db', () => ({
  schema: {
    notifications: {
      id: 'notifications.id',
      accountId: 'notifications.account_id',
      userId: 'notifications.user_id',
      type: 'notifications.type',
      conversationId: 'notifications.conversation_id',
      contactId: 'notifications.contact_id',
      actorUserId: 'notifications.actor_user_id',
      title: 'notifications.title',
      body: 'notifications.body',
      readAt: 'notifications.read_at',
      createdAt: 'notifications.created_at',
    },
    memberPresence: {
      userId: 'member_presence.user_id',
      accountId: 'member_presence.account_id',
      status: 'member_presence.status',
      lastSeenAt: 'member_presence.last_seen_at',
    },
    messages: {
      id: 'messages.id',
      conversationId: 'messages.conversation_id',
      senderType: 'messages.sender_type',
      contentType: 'messages.content_type',
      contentText: 'messages.content_text',
      createdAt: 'messages.created_at',
    },
    conversations: {
      id: 'conversations.id',
      accountId: 'conversations.account_id',
      contactId: 'conversations.contact_id',
    },
    contacts: {
      id: 'contacts.id',
      name: 'contacts.name',
      waUsername: 'contacts.wa_username',
      phone: 'contacts.phone',
    },
  },
}));

import { GET as getMessages } from '@/app/api/notifications/messages/route';
import { GET as getNotifications } from '@/app/api/notifications/route';
import {
  GET as getPresence,
  POST as postPresence,
} from '@/app/api/presence/route';

const context = {
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
  systemRole: 'user',
  account: { id: 'account-1', name: 'Acme' },
};

function selectChain(result: unknown[]) {
  const limit = mock(async () => result);
  const orderBy = mock(() => ({ limit }));
  const where = mock(() => asThenable({ orderBy }, async () => result));
  const from = mock(() => ({ where }));
  mocks.select.mockReturnValue({ from });
  return { from, where, orderBy, limit };
}

function joinedSelectChain(result: unknown[]) {
  const limit = mock(async () => result);
  const chain = {
    innerJoin: mock(() => chain),
    where: mock(() => chain),
    orderBy: mock(() => chain),
    limit,
  };
  const from = mock(() => chain);
  mocks.select.mockReturnValue({ from });
  return { ...chain, from };
}

beforeEach(() => {
  mocks.getCurrentAccount.mockReset();
  mocks.select.mockReset();
  mocks.insert.mockReset();
  mocks.values.mockReset();
  mocks.onConflictDoUpdate.mockReset();
  mocks.getCurrentAccount.mockResolvedValue(context);
});

describe('notification and presence snapshot APIs', () => {
  it('returns the signed-in user notification snapshot in the UI shape', async () => {
    const rows = [
      {
        id: 'notification-1',
        account_id: 'account-1',
        user_id: 'user-1',
        type: 'conversation_assigned',
        conversation_id: 'conversation-1',
        contact_id: null,
        actor_user_id: null,
        title: 'Nueva asignación',
        body: null,
        read_at: null,
        created_at: '2026-09-23T12:00:00.000Z',
      },
    ];
    const chain = selectChain(rows);

    const response = await getNotifications();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notifications: rows });
    expect(mocks.getCurrentAccount).toHaveBeenCalledTimes(1);
    expect(chain.where).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(100);
  });

  it('establishes a message cursor without replaying the existing backlog', async () => {
    const chain = joinedSelectChain([
      { id: 'message-9', createdAt: '2026-09-23T12:00:00.000Z' },
    ]);

    const response = await getMessages(
      new Request('http://localhost/api/notifications/messages')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      messages: [],
      cursor: '2026-09-23T12:00:00.000Z\tmessage-9',
    });
    expect(chain.innerJoin).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it('rejects a malformed message cursor before querying', async () => {
    const response = await getMessages(
      new Request('http://localhost/api/notifications/messages?cursor=bad')
    );

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('returns the current account presence snapshot', async () => {
    const rows = [
      {
        user_id: 'user-1',
        status: 'online',
        last_seen_at: '2026-09-23T12:00:00.000Z',
      },
    ];
    const chain = selectChain(rows);

    const response = await getPresence();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ presence: rows });
    expect(chain.where).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid presence without touching the database', async () => {
    const response = await postPresence(
      new Request('http://localhost/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'offline' }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('upserts a heartbeat for the session user and account', async () => {
    mocks.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.values.mockReturnValue({
      onConflictDoUpdate: mocks.onConflictDoUpdate,
    });
    mocks.insert.mockReturnValue({ values: mocks.values });

    const response = await postPresence(
      new Request('http://localhost/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'away' }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        accountId: 'account-1',
        status: 'away',
      })
    );
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
