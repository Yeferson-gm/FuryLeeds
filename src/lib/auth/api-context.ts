import { and, eq, isNull } from 'drizzle-orm';
import { forbidden, rateLimited, unauthorized } from '@/lib/api/v1/respond';
import { hashApiKey, looksLikeApiKey } from '@/lib/api-keys/keys';
import { type ApiScope, hasScope } from '@/lib/api-keys/scopes';
import { db, schema } from '@/lib/db';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export interface ApiKeyContext {
  authType: 'api_key';
  db: typeof db;
  accountId: string;
  keyId: string;
  scopes: string[];
  createdBy: string | null;
}

function extractKey(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const value = header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : header.trim();
  return value.length > 0 ? value : null;
}

export async function requireApiKey(
  request: Request,
  scope?: ApiScope
): Promise<ApiKeyContext> {
  const presented = extractKey(request);
  if (!presented || !looksLikeApiKey(presented)) {
    throw unauthorized();
  }

  const [row] = await db
    .select({
      id: schema.apiKeys.id,
      accountId: schema.apiKeys.accountId,
      createdBy: schema.apiKeys.createdBy,
      scopes: schema.apiKeys.scopes,
      expiresAt: schema.apiKeys.expiresAt,
    })
    .from(schema.apiKeys)
    .where(
      and(
        eq(schema.apiKeys.keyHash, hashApiKey(presented)),
        isNull(schema.apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (
    !row ||
    (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now())
  ) {
    throw unauthorized();
  }

  const limit = checkRateLimit(`apikey:${row.id}`, RATE_LIMITS.publicApi);
  if (!limit.success) {
    throw rateLimited(limit);
  }

  if (scope && !hasScope(row.scopes, scope)) {
    throw forbidden(`This API key is missing the '${scope}' scope`);
  }

  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.apiKeys.id, row.id),
        eq(schema.apiKeys.accountId, row.accountId)
      )
    )
    .catch((error: unknown) => {
      console.warn('[api-context] last_used_at bump failed:', error);
    });

  return {
    authType: 'api_key',
    db,
    accountId: row.accountId,
    keyId: row.id,
    scopes: row.scopes,
    createdBy: row.createdBy,
  };
}
