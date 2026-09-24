import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import { db, schema } from '@/lib/db';
import { type AccountRole, hasMinRole, isAccountRole } from './roles';

export type SystemRole = 'user' | 'superadmin';

export class UnauthorizedError extends Error {
  readonly status = 401 as const;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;

  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('[toErrorResponse] uncategorized error:', err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export interface AccountContext {
  db: typeof db;
  userId: string;
  accountId: string;
  role: AccountRole;
  systemRole: SystemRole;
  account: { id: string; name: string };
}

function isSystemRole(value: unknown): value is SystemRole {
  return value === 'user' || value === 'superadmin';
}

export async function getCurrentAccount(): Promise<AccountContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  let row:
    | { accountId: string; accountRole: string; accountName: string }
    | undefined;
  try {
    [row] = await db
      .select({
        accountId: schema.profiles.accountId,
        accountRole: schema.profiles.accountRole,
        accountName: schema.accounts.name,
      })
      .from(schema.profiles)
      .innerJoin(
        schema.accounts,
        eq(schema.accounts.id, schema.profiles.accountId)
      )
      .where(eq(schema.profiles.userId, session.user.id))
      .limit(1);
  } catch (error) {
    console.error('[getCurrentAccount] account context fetch error:', error);
    throw new ForbiddenError('Could not load account context');
  }

  if (!row) {
    throw new ForbiddenError('Profile is not linked to an account');
  }
  if (!isAccountRole(row.accountRole)) {
    throw new ForbiddenError(`Unknown account role: ${row.accountRole}`);
  }

  const rawSystemRole = session.user.systemRole;
  const systemRole = isSystemRole(rawSystemRole) ? rawSystemRole : 'user';

  return {
    db,
    userId: session.user.id,
    accountId: row.accountId,
    role: row.accountRole,
    systemRole,
    account: { id: row.accountId, name: row.accountName },
  };
}

export async function requireRole(min: AccountRole): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (ctx.systemRole !== 'superadmin' && !hasMinRole(ctx.role, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' role or higher`
    );
  }
  return ctx;
}
