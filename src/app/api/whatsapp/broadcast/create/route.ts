import { and, eq } from 'drizzle-orm';
import { after, NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';
import {
  BroadcastError,
  createBroadcast,
  deliverBroadcast,
} from '@/lib/whatsapp/broadcast-core';
import {
  customValuesByContact,
  parseAudience,
  parseVariables,
  resolveAudience,
  resolveVariables,
} from '../_shared';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const limit = checkRateLimit(
      `broadcast-create:${ctx.userId}`,
      RATE_LIMITS.broadcast
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const templateName =
      typeof body?.template?.name === 'string' ? body.template.name : '';
    const templateLanguage =
      typeof body?.template?.language === 'string'
        ? body.template.language
        : 'en_US';
    const audience = parseAudience(body?.audience);
    const variables = parseVariables(body?.variables);
    const draft = body?.draft === true;

    if (!name || !templateName || !audience) {
      return NextResponse.json(
        { error: 'Nombre, plantilla y audiencia son obligatorios' },
        { status: 400 }
      );
    }

    const [template] = await ctx.db
      .select({
        id: schema.messageTemplates.id,
        status: schema.messageTemplates.status,
      })
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.accountId, ctx.accountId),
          eq(schema.messageTemplates.name, templateName),
          eq(schema.messageTemplates.language, templateLanguage)
        )
      )
      .limit(1);
    if (template?.status !== 'APPROVED') {
      return NextResponse.json(
        { error: 'La plantilla no existe o no está aprobada' },
        { status: 400 }
      );
    }

    const audienceFilter = {
      type: audience.type,
      tagIds: audience.tagIds,
      customField: audience.customField,
      excludeTagIds: audience.excludeTagIds,
    };

    if (draft) {
      const [created] = await ctx.db
        .insert(schema.broadcasts)
        .values({
          userId: ctx.userId,
          accountId: ctx.accountId,
          name,
          templateName,
          templateLanguage,
          templateVariables: variables,
          audienceFilter,
          status: 'draft',
          totalRecipients: 0,
        })
        .returning({ id: schema.broadcasts.id });
      return NextResponse.json({ broadcast_id: created.id }, { status: 201 });
    }

    const contacts = await resolveAudience(
      ctx.db,
      ctx.accountId,
      ctx.userId,
      audience,
      { createCsvContacts: true }
    );
    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron contactos para esta audiencia.' },
        { status: 400 }
      );
    }

    const customValues = await customValuesByContact(
      ctx.db,
      ctx.accountId,
      contacts.map((contact) => contact.id)
    );
    const plan = await createBroadcast(ctx.db, ctx.accountId, ctx.userId, {
      name,
      templateName,
      templateLanguage,
      recipients: contacts.map((contact) => ({
        to: contact.phone,
        params: resolveVariables(
          variables,
          contact,
          customValues.get(contact.id)
        ),
      })),
    });

    await ctx.db
      .update(schema.broadcasts)
      .set({
        templateVariables: variables,
        audienceFilter,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(schema.broadcasts.id, plan.broadcastId),
          eq(schema.broadcasts.accountId, ctx.accountId)
        )
      );

    const headerMediaUrl =
      typeof body?.headerMediaUrl === 'string'
        ? body.headerMediaUrl.trim()
        : '';
    if (headerMediaUrl && plan.templateRow) {
      plan.templateRow = {
        ...plan.templateRow,
        header_media_url: headerMediaUrl,
      };
    }

    after(async () => {
      try {
        await deliverBroadcast(ctx.db, plan);
      } catch (error) {
        console.error('[dashboard-broadcast] delivery failed:', error);
      }
    });

    return NextResponse.json(
      {
        broadcast_id: plan.broadcastId,
        recipients: plan.planned.length,
        rejected: plan.rejected,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof BroadcastError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return toErrorResponse(error);
  }
}
