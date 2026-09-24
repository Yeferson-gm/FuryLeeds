import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { toCustomField } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      field_name?: unknown;
    } | null;
    const fieldName =
      typeof body?.field_name === 'string' ? body.field_name.trim() : '';
    if (!fieldName) {
      return NextResponse.json(
        { error: 'field_name requerido' },
        { status: 400 }
      );
    }
    const [row] = await ctx.db
      .update(schema.customFields)
      .set({ fieldName })
      .where(
        and(
          eq(schema.customFields.id, id),
          eq(schema.customFields.accountId, ctx.accountId)
        )
      )
      .returning();
    if (!row) {
      return NextResponse.json(
        { error: 'Campo no encontrado' },
        { status: 404 }
      );
    }
    return NextResponse.json({ field: toCustomField(row) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    const rows = await ctx.db
      .delete(schema.customFields)
      .where(
        and(
          eq(schema.customFields.id, id),
          eq(schema.customFields.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.customFields.id });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Campo no encontrado' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
