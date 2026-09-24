import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { toCustomValue } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => null)) as {
      values?: unknown;
    } | null;
    if (
      !body?.values ||
      typeof body.values !== 'object' ||
      Array.isArray(body.values)
    ) {
      return NextResponse.json({ error: 'values inválido' }, { status: 400 });
    }

    const [contact] = await ctx.db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, contactId),
          eq(schema.contacts.accountId, ctx.accountId)
        )
      )
      .limit(1);
    if (!contact) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }

    const entries = Object.entries(body.values)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
      .map(([fieldId, value]) => [fieldId, value.trim()] as const)
      .filter(([, value]) => value);
    const fieldIds = [...new Set(entries.map(([fieldId]) => fieldId))];
    if (fieldIds.length > 100) {
      return NextResponse.json({ error: 'Demasiados campos' }, { status: 400 });
    }

    if (fieldIds.length > 0) {
      const ownedFields = await ctx.db
        .select({ id: schema.customFields.id })
        .from(schema.customFields)
        .where(
          and(
            eq(schema.customFields.accountId, ctx.accountId),
            inArray(schema.customFields.id, fieldIds)
          )
        );
      if (ownedFields.length !== fieldIds.length) {
        return NextResponse.json(
          { error: 'Uno o más campos no pertenecen a la cuenta' },
          { status: 400 }
        );
      }
    }

    const rows = await ctx.db.transaction(async (transaction) => {
      await transaction
        .delete(schema.contactCustomValues)
        .where(eq(schema.contactCustomValues.contactId, contactId));
      if (entries.length === 0) return [];
      return transaction
        .insert(schema.contactCustomValues)
        .values(
          entries.map(([customFieldId, value]) => ({
            contactId,
            customFieldId,
            value,
          }))
        )
        .returning();
    });

    return NextResponse.json({ values: rows.map(toCustomValue) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
