import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ApiError, type ApiErrorCode } from '@/lib/api/v1/respond';
import { generateApiKey } from '@/lib/api-keys/keys';
import { __resetRateLimitForTests, RATE_LIMITS } from '@/lib/rate-limit';

interface KeyRow {
  id: string;
  accountId: string;
  createdBy: string | null;
  scopes: string[];
  expiresAt: string | null;
}

const limit = mock<() => Promise<KeyRow[]>>();
const selectWhere = mock(() => ({ limit }));
const from = mock(() => ({ where: selectWhere }));
const select = mock(() => ({ from }));
const updateWhere = mock(() => Promise.resolve([]));
const set = mock(() => ({ where: updateWhere }));
const update = mock(() => ({ set }));
const database = { select, update };

mock.module('@/lib/db', () => ({
  db: database,
  schema: {
    apiKeys: {
      id: 'apiKeys.id',
      accountId: 'apiKeys.accountId',
      createdBy: 'apiKeys.createdBy',
      scopes: 'apiKeys.scopes',
      expiresAt: 'apiKeys.expiresAt',
      keyHash: 'apiKeys.keyHash',
      revokedAt: 'apiKeys.revokedAt',
      lastUsedAt: 'apiKeys.lastUsedAt',
    },
  },
}));

const { requireApiKey } = await import('@/lib/auth/api-context');
const KEY = generateApiKey().plaintext;

function requestWith(authHeader?: string): Request {
  return new Request('https://crm.example.com/api/v1/me', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

function row(overrides: Partial<KeyRow> = {}): KeyRow {
  return {
    id: 'key-1',
    accountId: 'acct-1',
    createdBy: 'user-1',
    scopes: ['messages:send'],
    expiresAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  __resetRateLimitForTests();
  limit.mockReset();
  select.mockClear();
  update.mockClear();
  updateWhere.mockClear();
});

afterEach(() => __resetRateLimitForTests());

async function expectApiError(
  promise: Promise<unknown>,
  code: ApiErrorCode,
  status: number
) {
  await expect(promise).rejects.toBeInstanceOf(ApiError);
  await promise.catch((error: unknown) => {
    const apiError = error as ApiError;
    expect(apiError.code).toBe(code);
    expect(apiError.status).toBe(status);
  });
}

describe('requireApiKey', () => {
  it('401s when no Authorization header is present', async () => {
    await expectApiError(requireApiKey(requestWith()), 'unauthorized', 401);
    expect(select).not.toHaveBeenCalled();
  });

  it("401s on a token that doesn't look like a furyleeds key", async () => {
    await expectApiError(
      requireApiKey(requestWith('Bearer some-invite-token')),
      'unauthorized',
      401
    );
    expect(select).not.toHaveBeenCalled();
  });

  it('401s when the key is unknown, revoked, or expired', async () => {
    limit.mockResolvedValue([]);
    await expectApiError(
      requireApiKey(requestWith(`Bearer ${KEY}`)),
      'unauthorized',
      401
    );
  });

  it('returns a database context for a valid key', async () => {
    limit.mockResolvedValue([row()]);
    const context = await requireApiKey(requestWith(`Bearer ${KEY}`));
    expect(context).toMatchObject({
      authType: 'api_key',
      db: database,
      accountId: 'acct-1',
      keyId: 'key-1',
      scopes: ['messages:send'],
      createdBy: 'user-1',
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("accepts a bare key without the 'Bearer ' prefix", async () => {
    limit.mockResolvedValue([row()]);
    expect((await requireApiKey(requestWith(KEY))).accountId).toBe('acct-1');
  });

  it('401s an expired key', async () => {
    limit.mockResolvedValue([
      row({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    ]);
    await expectApiError(
      requireApiKey(requestWith(`Bearer ${KEY}`)),
      'unauthorized',
      401
    );
  });

  it('403s when the key lacks the required scope', async () => {
    limit.mockResolvedValue([row({ scopes: ['contacts:read'] })]);
    await expectApiError(
      requireApiKey(requestWith(`Bearer ${KEY}`), 'messages:send'),
      'forbidden',
      403
    );
  });

  it('passes when the key has the required scope', async () => {
    limit.mockResolvedValue([row()]);
    const context = await requireApiKey(
      requestWith(`Bearer ${KEY}`),
      'messages:send'
    );
    expect(context.accountId).toBe('acct-1');
  });

  it('429s once the per-key budget is exhausted', async () => {
    limit.mockResolvedValue([row()]);
    for (let index = 0; index < RATE_LIMITS.publicApi.limit; index++) {
      await requireApiKey(requestWith(`Bearer ${KEY}`));
    }
    await expectApiError(
      requireApiKey(requestWith(`Bearer ${KEY}`)),
      'rate_limited',
      429
    );
  });
});
