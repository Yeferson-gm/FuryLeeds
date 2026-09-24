import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export interface ApiKeyRow {
  id: string;
  account_id: string;
  created_by: string | null;
  name: string;
  scopes: string[];
  expires_at: string | null;
  revoked_at: string | null;
}

export async function findActiveKeyByHash(
  hash: string
): Promise<ApiKeyRow | null> {
  try {
    const [row] = await db
      .select({
        id: schema.apiKeys.id,
        account_id: schema.apiKeys.accountId,
        created_by: schema.apiKeys.createdBy,
        name: schema.apiKeys.name,
        scopes: schema.apiKeys.scopes,
        expires_at: schema.apiKeys.expiresAt,
        revoked_at: schema.apiKeys.revokedAt,
      })
      .from(schema.apiKeys)
      .where(
        and(eq(schema.apiKeys.keyHash, hash), isNull(schema.apiKeys.revokedAt))
      )
      .limit(1);

    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }
    return row;
  } catch (error) {
    console.error('[api-keys/store] lookup error:', error);
    return null;
  }
}

export async function getAccountName(
  accountId: string
): Promise<string | null> {
  const [row] = await db
    .select({ name: schema.accounts.name })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);
  return row?.name ?? null;
}

export function touchLastUsed(id: string): void {
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(schema.apiKeys.id, id))
    .catch((error: unknown) => {
      console.warn('[api-keys/store] last_used_at bump failed:', error);
    });
}
