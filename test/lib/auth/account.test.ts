import { beforeEach, describe, expect, it, mock } from 'bun:test';

const getSession = mock();
const limit = mock();
const where = mock(() => ({ limit }));
const innerJoin = mock(() => ({ where }));
const from = mock(() => ({ innerJoin }));
const select = mock(() => ({ from }));

mock.module('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'session=test' })),
}));
mock.module('@/lib/auth/auth', () => ({
  auth: { api: { getSession } },
}));
mock.module('@/lib/db', () => ({
  db: { select },
  schema: {
    profiles: {
      accountId: 'profiles.accountId',
      accountRole: 'profiles.accountRole',
      userId: 'profiles.userId',
    },
    accounts: { id: 'accounts.id', name: 'accounts.name' },
  },
}));

const { ForbiddenError, getCurrentAccount, requireRole, UnauthorizedError } =
  await import('@/lib/auth/account');

beforeEach(() => {
  getSession.mockReset();
  select.mockClear();
  from.mockClear();
  innerJoin.mockClear();
  where.mockClear();
  limit.mockReset();
});

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'user-1',
      systemRole: 'user',
      ...overrides,
    },
  };
}

describe('getCurrentAccount', () => {
  it('resolves the Better Auth user and account with Drizzle', async () => {
    getSession.mockResolvedValue(session());
    limit.mockResolvedValue([
      { accountId: 'acct-1', accountRole: 'owner', accountName: 'Acme' },
    ]);

    await expect(getCurrentAccount()).resolves.toMatchObject({
      userId: 'user-1',
      accountId: 'acct-1',
      role: 'owner',
      systemRole: 'user',
      account: { id: 'acct-1', name: 'Acme' },
    });
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('throws UnauthorizedError without a Better Auth session', async () => {
    getSession.mockResolvedValue(null);
    await expect(getCurrentAccount()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(select).not.toHaveBeenCalled();
  });

  it('maps database failures to a safe ForbiddenError', async () => {
    getSession.mockResolvedValue(session());
    limit.mockRejectedValue(new Error('database details'));
    const error = await getCurrentAccount().catch((caught) => caught);
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toBe('Could not load account context');
  });

  it('rejects a session whose profile has no account', async () => {
    getSession.mockResolvedValue(session());
    limit.mockResolvedValue([]);
    await expect(getCurrentAccount()).rejects.toThrow(
      'Profile is not linked to an account'
    );
  });
});

describe('requireRole', () => {
  it('rejects an account role below the requested minimum', async () => {
    getSession.mockResolvedValue(session());
    limit.mockResolvedValue([
      { accountId: 'acct-1', accountRole: 'agent', accountName: 'Acme' },
    ]);
    await expect(requireRole('admin')).rejects.toThrow(
      "requires the 'admin' role"
    );
  });

  it('allows a system superadmin while preserving account context', async () => {
    getSession.mockResolvedValue(session({ systemRole: 'superadmin' }));
    limit.mockResolvedValue([
      { accountId: 'acct-1', accountRole: 'viewer', accountName: 'Acme' },
    ]);
    const context = await requireRole('owner');
    expect(context.systemRole).toBe('superadmin');
    expect(context.accountId).toBe('acct-1');
  });
});
