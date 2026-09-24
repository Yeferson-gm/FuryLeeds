import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { getContactDetail, toContact } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';

function optionalNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await getCurrentAccount();
    const { id } = await params;
    const detail = await getContactDetail(ctx.db, ctx.accountId, id);
    if (!detail) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }
    return NextResponse.json(detail);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
    }

    let phone: string | undefined;
    if (body.phone !== undefined) {
      if (typeof body.phone !== 'string') {
        return NextResponse.json(
          { error: 'Teléfono inválido' },
          { status: 400 }
        );
      }
      const value = body.phone.trim();
      if (!parseInternationalPhone(value)) {
        return NextResponse.json(
          { error: 'El teléfono debe incluir + y código de país' },
          { status: 400 }
        );
      }
      phone = value;
    }

    try {
      const [updated] = await ctx.db
        .update(schema.contacts)
        .set({
          ...(phone !== undefined ? { phone } : {}),
          ...(body.name !== undefined
            ? { name: optionalNullableString(body.name) }
            : {}),
          ...(body.email !== undefined
            ? { email: optionalNullableString(body.email) }
            : {}),
          ...(body.company !== undefined
            ? { company: optionalNullableString(body.company) }
            : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(schema.contacts.id, id),
            eq(schema.contacts.accountId, ctx.accountId)
          )
        )
        .returning();
      if (!updated) {
        return NextResponse.json(
          { error: 'Contacto no encontrado' },
          { status: 404 }
        );
      }
      return NextResponse.json({ contact: toContact(updated) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          { error: 'Ya existe un contacto con este teléfono', code: '23505' },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id } = await params;
    const deleted = await ctx.db
      .delete(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, id),
          eq(schema.contacts.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.contacts.id });
    if (deleted.length === 0) {
      return NextResponse.json(
        { error: 'Contacto no encontrado' },
        { status: 404 }
      );
    }
    return NextResponse.json({ deleted: 1 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
