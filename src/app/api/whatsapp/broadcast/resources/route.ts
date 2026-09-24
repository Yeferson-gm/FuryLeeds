import { and, asc, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { toContact } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';
import { toMessageTemplate } from '@/lib/whatsapp/db';
import { parseAudience, resolveAudience } from '../_shared';

export async function GET() {
  try {
    const ctx = await requireRole('viewer');
    const [templateRows, tags, customFields, previewRows] = await Promise.all([
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
      ctx.db
        .select({
          id: schema.tags.id,
          user_id: schema.tags.userId,
          name: schema.tags.name,
          color: schema.tags.color,
          created_at: schema.tags.createdAt,
        })
        .from(schema.tags)
        .where(eq(schema.tags.accountId, ctx.accountId))
        .orderBy(asc(schema.tags.name)),
      ctx.db
        .select({
          id: schema.customFields.id,
          user_id: schema.customFields.userId,
          account_id: schema.customFields.accountId,
          field_name: schema.customFields.fieldName,
          field_type: schema.customFields.fieldType,
          field_options: schema.customFields.fieldOptions,
          created_at: schema.customFields.createdAt,
        })
        .from(schema.customFields)
        .where(eq(schema.customFields.accountId, ctx.accountId))
        .orderBy(asc(schema.customFields.fieldName)),
      ctx.db
        .select()
        .from(schema.contacts)
        .where(eq(schema.contacts.accountId, ctx.accountId))
        .orderBy(desc(schema.contacts.createdAt))
        .limit(1),
    ]);

    const previewRow = previewRows[0];
    const previewValues = previewRow
      ? await ctx.db
          .select({
            custom_field_id: schema.contactCustomValues.customFieldId,
            value: schema.contactCustomValues.value,
          })
          .from(schema.contactCustomValues)
          .where(eq(schema.contactCustomValues.contactId, previewRow.id))
      : [];

    return NextResponse.json({
      templates: templateRows.map(toMessageTemplate),
      tags: tags.map((tag) => ({ ...tag, created_at: tag.created_at ?? '' })),
      customFields: customFields.map((field) => ({
        ...field,
        field_options: field.field_options ?? undefined,
        created_at: field.created_at ?? '',
      })),
      previewContact: previewRow ? toContact(previewRow) : null,
      previewValues,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const body = await request.json().catch(() => null);
    const audience = parseAudience(body?.audience);
    if (!audience) {
      return NextResponse.json(
        { error: 'Audiencia inválida' },
        { status: 400 }
      );
    }
    const contacts = await resolveAudience(
      ctx.db,
      ctx.accountId,
      ctx.userId,
      audience,
      { createCsvContacts: false }
    );
    return NextResponse.json({ count: contacts.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}
