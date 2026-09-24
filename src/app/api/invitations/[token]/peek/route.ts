import { NextResponse } from 'next/server';
import { hashInviteToken, peekInvitation } from '@/lib/auth/invitations';
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`peek:${ip}`, RATE_LIMITS.invitationPeek);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { ok: false, reason: 'not_found' },
      { status: 404 }
    );
  }

  try {
    return NextResponse.json(await peekInvitation(hashInviteToken(token)));
  } catch (error) {
    console.error('[peek] database error:', error);
    return NextResponse.json(
      { ok: false, reason: 'server_error' },
      { status: 500 }
    );
  }
}
