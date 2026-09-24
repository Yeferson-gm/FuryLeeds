import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

export async function GET() {
  try {
    const { db, accountId, userId } = await getCurrentAccount();
    const rows = await db
      .select({
        id: schema.notifications.id,
        account_id: schema.notifications.accountId,
        user_id: schema.notifications.userId,
        type: schema.notifications.type,
        conversation_id: schema.notifications.conversationId,
        contact_id: schema.notifications.contactId,
        actor_user_id: schema.notifications.actorUserId,
        title: schema.notifications.title,
        body: schema.notifications.body,
        read_at: schema.notifications.readAt,
        created_at: schema.notifications.createdAt,
      })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.accountId, accountId),
          eq(schema.notifications.userId, userId)
        )
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(100);

    return NextResponse.json({ notifications: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}
