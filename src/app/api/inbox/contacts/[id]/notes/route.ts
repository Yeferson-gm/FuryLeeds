import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { toContactNote } from '@/lib/contacts/repository';
import { schema } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await requireRole('agent');
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => null)) as {
      note_text?: unknown;
    } | null;
    const noteText =
      typeof body?.note_text === 'string' ? body.note_text.trim() : '';
    if (!noteText) {
      return NextResponse.json(
        { error: 'note_text requerido' },
        { status: 400 }
      );
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

    const [row] = await ctx.db
      .insert(schema.contactNotes)
      .values({
        contactId,
        accountId: ctx.accountId,
        userId: ctx.userId,
        noteText,
      })
      .returning();
    return NextResponse.json({ note: toContactNote(row) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
