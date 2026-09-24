import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

type Params = { params: Promise<{ conversationId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { db, accountId, userId } = await requireRole('agent');
    const limit = checkRateLimit(`ai-takeover:${userId}`, RATE_LIMITS.send);
    if (!limit.success) return rateLimitResponse(limit);

    const { conversationId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.paused !== 'boolean') {
      return NextResponse.json(
        { error: 'El campo paused (boolean) es obligatorio' },
        { status: 400 }
      );
    }
    const paused = body.paused as boolean;
    const assignToMe = body.assign_to_me === true;
    const tenantFilter = and(
      eq(schema.conversations.id, conversationId),
      eq(schema.conversations.accountId, accountId)
    );

    let conversation: { id: string } | undefined;
    try {
      [conversation] = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(tenantFilter)
        .limit(1);
    } catch (error) {
      console.error('[ai/autoreply] conversation lookup error:', error);
      return NextResponse.json(
        { error: 'No se pudo cargar la conversación' },
        { status: 500 }
      );
    }
    if (!conversation) {
      return NextResponse.json(
        { error: 'No se encontró la conversación' },
        { status: 404 }
      );
    }

    try {
      await db
        .update(schema.conversations)
        .set(
          paused
            ? {
                aiAutoreplyDisabled: true,
                ...(assignToMe ? { assignedAgentId: userId } : {}),
              }
            : {
                aiAutoreplyDisabled: false,
                assignedAgentId: null,
                aiReplyCount: 0,
                aiHandoffSummary: null,
              }
        )
        .where(tenantFilter);
    } catch (error) {
      console.error('[ai/autoreply] update error:', error);
      return NextResponse.json(
        { error: 'No se pudo actualizar la conversación' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, paused });
  } catch (err) {
    return toErrorResponse(err);
  }
}
