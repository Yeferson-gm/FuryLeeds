import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { validateInteractivePayload } from '@/lib/whatsapp/interactive';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db, accountId } = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const update: Partial<typeof schema.quickReplies.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json(
          { error: 'El título no puede estar vacío' },
          { status: 400 }
        );
      }
      update.title = title;
    }

    if ('kind' in body) {
      if (body.kind !== 'text' && body.kind !== 'interactive') {
        return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 });
      }
      update.kind = body.kind;
      if (body.kind === 'interactive') {
        const result = validateInteractivePayload(body.interactive_payload);
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        update.interactivePayload = body.interactive_payload;
        update.contentText = null;
      } else {
        const text =
          typeof body.content_text === 'string' ? body.content_text.trim() : '';
        if (!text) {
          return NextResponse.json(
            { error: 'El texto es obligatorio' },
            { status: 400 }
          );
        }
        update.contentText = text;
        update.interactivePayload = null;
      }
    } else {
      if ('content_text' in body) {
        update.contentText =
          typeof body.content_text === 'string' ? body.content_text : null;
      }
      if ('interactive_payload' in body) {
        if (body.interactive_payload != null) {
          const result = validateInteractivePayload(body.interactive_payload);
          if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 400 });
          }
        }
        update.interactivePayload = body.interactive_payload ?? null;
      }
    }

    await db
      .update(schema.quickReplies)
      .set(update)
      .where(
        and(
          eq(schema.quickReplies.id, id),
          eq(schema.quickReplies.accountId, accountId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db, accountId } = await requireRole('agent');
    await db
      .delete(schema.quickReplies)
      .where(
        and(
          eq(schema.quickReplies.id, id),
          eq(schema.quickReplies.accountId, accountId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
