import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

export async function PATCH() {
  try {
    const { db, accountId, userId } = await getCurrentAccount();
    const updated = await db
      .update(schema.notifications)
      .set({ readAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.notifications.accountId, accountId),
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.readAt)
        )
      )
      .returning({ id: schema.notifications.id });

    return NextResponse.json({ ok: true, updated: updated.length });
  } catch (error) {
    return toErrorResponse(error);
  }
}
