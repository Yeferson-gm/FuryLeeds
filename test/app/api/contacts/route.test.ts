import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { hoisted } from '@test/support/mocks';

const mocks = hoisted(() => ({
  getCurrentAccount: mock(),
  requireRole: mock(),
  listContacts: mock(),
}));

mock.module('@/lib/auth/account', () => ({
  getCurrentAccount: mocks.getCurrentAccount,
  requireRole: mocks.requireRole,
  toErrorResponse: mock(() =>
    Response.json({ error: 'auth failed' }, { status: 401 })
  ),
}));

mock.module('@/lib/contacts/repository', () => ({
  listContacts: mocks.listContacts,
  toContact: (row: unknown) => row,
}));

import { GET } from '@/app/api/contacts/route';

const context = {
  db: { name: 'scoped-database' },
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
  systemRole: 'user',
  account: { id: 'account-1', name: 'Acme' },
};

beforeEach(() => {
  mocks.getCurrentAccount.mockReset();
  mocks.requireRole.mockReset();
  mocks.listContacts.mockReset();
  mocks.getCurrentAccount.mockResolvedValue(context);
});

describe('/api/contacts', () => {
  it('lists an account-scoped page with search and OR tag filters', async () => {
    mocks.listContacts.mockResolvedValue({
      contacts: [{ id: 'contact-1', tags: [] }],
      total: 41,
    });

    const response = await GET(
      new Request(
        'http://localhost/api/contacts?page=2&page_size=10&search=Ana&tag_id=tag-1&tag_id=tag-2'
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.getCurrentAccount).toHaveBeenCalledTimes(1);
    expect(mocks.listContacts).toHaveBeenCalledWith(context.db, {
      accountId: 'account-1',
      search: 'Ana',
      tagIds: ['tag-1', 'tag-2'],
      limit: 10,
      offset: 20,
    });
    expect(await response.json()).toEqual({
      contacts: [{ id: 'contact-1', tags: [] }],
      total: 41,
    });
  });

  it('caps page size and normalizes a negative page', async () => {
    mocks.listContacts.mockResolvedValue({ contacts: [], total: 0 });

    await GET(
      new Request('http://localhost/api/contacts?page=-3&page_size=1000')
    );

    expect(mocks.listContacts).toHaveBeenCalledWith(context.db, {
      accountId: 'account-1',
      search: undefined,
      tagIds: [],
      limit: 100,
      offset: 0,
    });
  });
});
