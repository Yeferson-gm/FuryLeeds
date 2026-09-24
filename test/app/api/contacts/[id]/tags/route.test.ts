import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { hoisted } from '@test/support/mocks';

const mocks = hoisted(() => ({
  requireRole: mock(),
  add: mock(),
  remove: mock(),
}));

mock.module('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: mock(() =>
    Response.json({ error: 'auth failed' }, { status: 403 })
  ),
}));

mock.module('@/lib/contacts/tag-events', () => ({
  addContactTagAndDispatch: mocks.add,
}));

mock.module('@/lib/contacts/tag-write', () => ({
  ContactTagWriteError: class ContactTagWriteError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  removeContactTag: mocks.remove,
}));

import { DELETE, POST } from '@/app/api/contacts/[id]/tags/route';

const context = {
  db: { name: 'scoped-database' },
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
  account: { id: 'account-1', name: 'Acme' },
};

function request(method: 'POST' | 'DELETE', body: unknown) {
  return new Request('http://localhost/api/contacts/contact-1/tags', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'contact-1' }) };

beforeEach(() => {
  mocks.requireRole.mockReset();
  mocks.add.mockReset();
  mocks.remove.mockReset();
  mocks.requireRole.mockResolvedValue(context);
});

describe('/api/contacts/[id]/tags', () => {
  it('requires an agent and dispatches a newly-added tag', async () => {
    mocks.add.mockResolvedValue({ added: true, dispatched: true });

    const response = await POST(request('POST', { tag_id: 'tag-1' }), params);

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.add).toHaveBeenCalledWith({
      db: context.db,
      accountId: 'account-1',
      contactId: 'contact-1',
      tagId: 'tag-1',
    });
  });

  it('rejects a missing tag id before writing', async () => {
    const response = await POST(request('POST', {}), params);
    expect(response.status).toBe(400);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('removes a tag through the same account-scoped route', async () => {
    mocks.remove.mockResolvedValue(undefined);

    const response = await DELETE(
      request('DELETE', { tag_id: 'tag-1' }),
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.remove).toHaveBeenCalledWith(context.db, {
      accountId: 'account-1',
      contactId: 'contact-1',
      tagId: 'tag-1',
    });
  });
});
