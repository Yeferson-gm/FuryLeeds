import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { schema } from '@/lib/db';
import { validateInteractivePayload } from '@/lib/whatsapp/interactive';

export async function GET() {
  try {
    const { db, accountId } = await getCurrentAccount();
    const rows = await db
      .select()
      .from(schema.quickReplies)
      .where(eq(schema.quickReplies.accountId, accountId))
      .orderBy(desc(schema.quickReplies.createdAt));
    return NextResponse.json({ quick_replies: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await requireRole('agent');
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const kind = body.kind === 'interactive' ? 'interactive' : 'text';
    if (!title) {
      return NextResponse.json(
        { error: 'El título es obligatorio' },
        { status: 400 }
      );
    }

    let contentText: string | null = null;
    let interactivePayload: unknown = null;
    if (kind === 'interactive') {
      const result = validateInteractivePayload(body.interactive_payload);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      interactivePayload = body.interactive_payload;
    } else {
      contentText =
        typeof body.content_text === 'string' ? body.content_text.trim() : '';
      if (!contentText) {
        return NextResponse.json(
          { error: 'El texto es obligatorio' },
          { status: 400 }
        );
      }
    }

    const [created] = await db
      .insert(schema.quickReplies)
      .values({
        accountId,
        userId,
        title,
        kind,
        contentText,
        interactivePayload,
      })
      .returning();

    return NextResponse.json({ quick_reply: created }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
