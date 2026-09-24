import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

export async function GET() {
  try {
    const { db, accountId, userId } = await getCurrentAccount();
    const [[conversationResult], [notificationResult]] = await Promise.all([
      db
        .select({ value: count() })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.accountId, accountId),
            gt(schema.conversations.unreadCount, 0)
          )
        ),
      db
        .select({ value: count() })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.accountId, accountId),
            eq(schema.notifications.userId, userId),
            isNull(schema.notifications.readAt)
          )
        ),
    ]);

    return NextResponse.json({
      total_unread: conversationResult?.value ?? 0,
      unread_notifications: notificationResult?.value ?? 0,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
