import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { db, schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:apiKeyRevoke:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const revoked = await db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.apiKeys.id, id),
          eq(schema.apiKeys.accountId, ctx.accountId),
          isNull(schema.apiKeys.revokedAt)
        )
      )
      .returning({ id: schema.apiKeys.id });

    if (revoked.length === 0) {
      return NextResponse.json(
        { error: 'API key not found or already revoked' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
