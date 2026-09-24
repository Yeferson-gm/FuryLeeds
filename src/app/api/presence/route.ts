import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';

export async function GET() {
  try {
    const { db, accountId } = await getCurrentAccount();
    const rows = await db
      .select({
        user_id: schema.memberPresence.userId,
        status: schema.memberPresence.status,
        last_seen_at: schema.memberPresence.lastSeenAt,
      })
      .from(schema.memberPresence)
      .where(eq(schema.memberPresence.accountId, accountId));

    return NextResponse.json({ presence: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, accountId, userId } = await getCurrentAccount();
    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
    } | null;
    if (body?.status !== 'online' && body?.status !== 'away') {
      return NextResponse.json(
        { error: 'Estado de presencia inválido' },
        { status: 400 }
      );
    }

    await db
      .insert(schema.memberPresence)
      .values({
        userId,
        accountId,
        status: body.status,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: schema.memberPresence.userId,
        set: {
          accountId,
          status: body.status,
          lastSeenAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
