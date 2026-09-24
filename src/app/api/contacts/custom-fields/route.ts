import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { toCustomField } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const rows = await ctx.db
      .select()
      .from(schema.customFields)
      .where(eq(schema.customFields.accountId, ctx.accountId))
      .orderBy(asc(schema.customFields.fieldName));
    return NextResponse.json({ fields: rows.map(toCustomField) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
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
      .insert(schema.customFields)
      .values({
        userId: ctx.userId,
        accountId: ctx.accountId,
        fieldName,
        fieldType: 'text',
      })
      .returning();
    return NextResponse.json({ field: toCustomField(row) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
