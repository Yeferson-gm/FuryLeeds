import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { listContacts, toContact } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';
import { parseInternationalPhone } from '@/lib/whatsapp/phone-utils';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  try {
    const ctx = await getCurrentAccount();
    const url = new URL(request.url);
    const page = Math.max(
      0,
      Number.parseInt(url.searchParams.get('page') ?? '0', 10) || 0
    );
    const requestedSize =
      Number.parseInt(
        url.searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE),
        10
      ) || DEFAULT_PAGE_SIZE;
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedSize));

    const result = await listContacts(ctx.db, {
      accountId: ctx.accountId,
      search: url.searchParams.get('search') ?? undefined,
      tagIds: url.searchParams.getAll('tag_id').filter(Boolean),
      limit: pageSize,
      offset: page * pageSize,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!parseInternationalPhone(phone)) {
      return NextResponse.json(
        { error: 'El teléfono debe incluir + y código de país' },
        { status: 400 }
      );
    }

    try {
      const [created] = await ctx.db
        .insert(schema.contacts)
        .values({
          userId: ctx.userId,
          accountId: ctx.accountId,
          phone,
          name: nullableString(body?.name),
          email: nullableString(body?.email),
          company: nullableString(body?.company),
        })
        .returning();
      return NextResponse.json(
        { contact: toContact(created) },
        { status: 201 }
      );
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

export async function DELETE(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as {
      ids?: unknown;
    } | null;
    const ids = Array.isArray(body?.ids)
      ? [
          ...new Set(
            body.ids.filter(
              (id): id is string => typeof id === 'string' && !!id
            )
          ),
        ]
      : [];
    if (ids.length === 0 || ids.length > 100) {
      return NextResponse.json(
        { error: 'Se requiere entre 1 y 100 IDs' },
        { status: 400 }
      );
    }

    const deleted = await ctx.db
      .delete(schema.contacts)
      .where(
        and(
          eq(schema.contacts.accountId, ctx.accountId),
          inArray(schema.contacts.id, ids)
        )
      )
      .returning({ id: schema.contacts.id });
    return NextResponse.json({ deleted: deleted.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}
