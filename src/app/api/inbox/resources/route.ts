import { and, asc, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { toMessageTemplate } from '@/lib/whatsapp/db';
import type { Profile } from '@/types';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const [profileRows, templateRows] = await Promise.all([
      ctx.db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.accountId, ctx.accountId))
        .orderBy(asc(schema.profiles.fullName)),
      ctx.db
        .select()
        .from(schema.messageTemplates)
        .where(
          and(
            eq(schema.messageTemplates.accountId, ctx.accountId),
            eq(schema.messageTemplates.status, 'APPROVED')
          )
        )
        .orderBy(desc(schema.messageTemplates.createdAt)),
    ]);

    const profiles: Profile[] = profileRows.map((row) => ({
      id: row.id,
      user_id: row.userId,
      full_name: row.fullName,
      email: row.email,
      avatar_url: row.avatarUrl ?? undefined,
      account_id: row.accountId,
      account_role: row.accountRole,
      created_at: row.createdAt ?? '',
    }));

    return NextResponse.json({
      profiles,
      templates: templateRows
        .filter((row) => row.status === 'APPROVED')
        .map(toMessageTemplate),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
