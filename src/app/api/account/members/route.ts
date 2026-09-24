import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { canManageMembers, isAccountRole } from '@/lib/auth/roles';
import { db, schema } from '@/lib/db';
import type { AccountMember } from '@/types';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const rows = await db
      .select({
        userId: schema.profiles.userId,
        fullName: schema.profiles.fullName,
        email: schema.profiles.email,
        avatarUrl: schema.profiles.avatarUrl,
        accountRole: schema.profiles.accountRole,
        createdAt: schema.profiles.createdAt,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.accountId, ctx.accountId))
      .orderBy(asc(schema.profiles.createdAt));

    const canSeeEmails =
      ctx.systemRole === 'superadmin' || canManageMembers(ctx.role);
    const members: AccountMember[] = rows.flatMap((row) => {
      if (!isAccountRole(row.accountRole)) return [];
      return [
        {
          user_id: row.userId,
          full_name: row.fullName ?? '',
          email: canSeeEmails ? row.email : null,
          avatar_url: row.avatarUrl,
          role: row.accountRole,
          joined_at: row.createdAt ?? new Date(0).toISOString(),
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
