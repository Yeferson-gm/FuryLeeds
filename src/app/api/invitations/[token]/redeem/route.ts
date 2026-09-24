import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/auth';
import {
  hashInviteToken,
  InvitationError,
  redeemInvitation,
} from '@/lib/auth/invitations';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function invitationErrorResponse(error: InvitationError): NextResponse {
  const status =
    error.kind === 'unauthorized' ? 401 : error.kind === 'conflict' ? 409 : 400;
  return NextResponse.json({ error: error.message }, { status });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`redeem:${ip}`, RATE_LIMITS.invitationRedeem);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { error: 'Missing invitation token' },
      { status: 400 }
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accountId = await redeemInvitation(
      hashInviteToken(token),
      session.user.id
    );
    return NextResponse.json({ ok: true, accountId });
  } catch (error) {
    if (error instanceof InvitationError) {
      return invitationErrorResponse(error);
    }
    console.error('[redeem] database error:', error);
    return NextResponse.json(
      { error: 'Failed to redeem invitation' },
      { status: 500 }
    );
  }
}
