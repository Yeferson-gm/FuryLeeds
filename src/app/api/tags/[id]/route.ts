import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { error: 'Identificador de etiqueta inválido.' },
        { status: 400 }
      );
    }

    const [deleted] = await ctx.db
      .delete(schema.tags)
      .where(
        and(eq(schema.tags.id, id), eq(schema.tags.accountId, ctx.accountId))
      )
      .returning({ id: schema.tags.id });

    if (!deleted) {
      return NextResponse.json(
        { error: 'Etiqueta no encontrada.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
