import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

type RouteContext = {
  params: Promise<{ id: string; noteId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id: contactId, noteId } = await params;
    const rows = await ctx.db
      .delete(schema.contactNotes)
      .where(
        and(
          eq(schema.contactNotes.id, noteId),
          eq(schema.contactNotes.contactId, contactId),
          eq(schema.contactNotes.accountId, ctx.accountId)
        )
      )
      .returning({ id: schema.contactNotes.id });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Nota no encontrada' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
