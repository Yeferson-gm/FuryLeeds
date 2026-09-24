import { and, asc, desc, eq, gt, isNotNull, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

const PAGE_SIZE = 50;

function encodeCursor(createdAt: string, id: string): string {
  return `${createdAt}\t${id}`;
}

function decodeCursor(
  value: string | null
): { createdAt: string; id: string } | null {
  if (!value) return null;
  const separator = value.indexOf('\t');
  if (separator < 0) return null;
  const createdAt = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!createdAt || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

export async function GET(request: Request) {
  try {
    const { db, accountId } = await getCurrentAccount();
    const rawCursor = new URL(request.url).searchParams.get('cursor');
    const cursor = decodeCursor(rawCursor);
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: 'Cursor inválido' }, { status: 400 });
    }

    if (!cursor) {
      const [latest] = await db
        .select({
          id: schema.messages.id,
          createdAt: schema.messages.createdAt,
        })
        .from(schema.messages)
        .innerJoin(
          schema.conversations,
          eq(schema.conversations.id, schema.messages.conversationId)
        )
        .where(
          and(
            eq(schema.conversations.accountId, accountId),
            isNotNull(schema.messages.createdAt)
          )
        )
        .orderBy(desc(schema.messages.createdAt), desc(schema.messages.id))
        .limit(1);

      return NextResponse.json({
        messages: [],
        cursor: latest?.createdAt
          ? encodeCursor(latest.createdAt, latest.id)
          : encodeCursor('1970-01-01T00:00:00.000Z', ''),
      });
    }

    const rows = await db
      .select({
        id: schema.messages.id,
        conversation_id: schema.messages.conversationId,
        sender_type: schema.messages.senderType,
        content_type: schema.messages.contentType,
        content_text: schema.messages.contentText,
        created_at: schema.messages.createdAt,
        contact_name: schema.contacts.name,
        contact_wa_username: schema.contacts.waUsername,
        contact_phone: schema.contacts.phone,
      })
      .from(schema.messages)
      .innerJoin(
        schema.conversations,
        eq(schema.conversations.id, schema.messages.conversationId)
      )
      .innerJoin(
        schema.contacts,
        eq(schema.contacts.id, schema.conversations.contactId)
      )
      .where(
        and(
          eq(schema.conversations.accountId, accountId),
          isNotNull(schema.messages.createdAt),
          or(
            gt(schema.messages.createdAt, cursor.createdAt),
            and(
              eq(schema.messages.createdAt, cursor.createdAt),
              gt(schema.messages.id, cursor.id)
            )
          )
        )
      )
      .orderBy(asc(schema.messages.createdAt), asc(schema.messages.id))
      .limit(PAGE_SIZE);

    const last = rows.at(-1);
    return NextResponse.json({
      messages: rows,
      cursor:
        last?.created_at != null
          ? encodeCursor(last.created_at, last.id)
          : rawCursor,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
