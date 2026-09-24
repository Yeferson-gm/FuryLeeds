import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { canManageMembers } from '@/lib/auth/roles';
import { schema } from '@/lib/db';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const canSeeInvitations =
      ctx.systemRole === 'superadmin' || canManageMembers(ctx.role);

    const [
      [members],
      [templates],
      [templatesPending],
      [tags],
      [customFields],
      [whatsappConfigs],
      invitations,
    ] = await Promise.all([
      ctx.db
        .select({ value: count() })
        .from(schema.profiles)
        .where(eq(schema.profiles.accountId, ctx.accountId)),
      ctx.db
        .select({ value: count() })
        .from(schema.messageTemplates)
        .where(eq(schema.messageTemplates.accountId, ctx.accountId)),
      ctx.db
        .select({ value: count() })
        .from(schema.messageTemplates)
        .where(
          and(
            eq(schema.messageTemplates.accountId, ctx.accountId),
            eq(schema.messageTemplates.status, 'PENDING')
          )
        ),
      ctx.db
        .select({ value: count() })
        .from(schema.tags)
        .where(eq(schema.tags.accountId, ctx.accountId)),
      ctx.db
        .select({ value: count() })
        .from(schema.customFields)
        .where(eq(schema.customFields.accountId, ctx.accountId)),
      ctx.db
        .select({ value: count() })
        .from(schema.whatsappConfig)
        .where(eq(schema.whatsappConfig.accountId, ctx.accountId)),
      canSeeInvitations
        ? ctx.db
            .select({ value: count() })
            .from(schema.accountInvitations)
            .where(
              and(
                eq(schema.accountInvitations.accountId, ctx.accountId),
                isNull(schema.accountInvitations.acceptedAt),
                gt(
                  schema.accountInvitations.expiresAt,
                  new Date().toISOString()
                )
              )
            )
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      counts: {
        members: members?.value ?? 0,
        pendingInvites: invitations?.[0]?.value ?? null,
        templates: templates?.value ?? 0,
        templatesPending: templatesPending?.value ?? 0,
        tags: tags?.value ?? 0,
        customFields: customFields?.value ?? 0,
      },
      whatsappConfigured: (whatsappConfigs?.value ?? 0) > 0,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
