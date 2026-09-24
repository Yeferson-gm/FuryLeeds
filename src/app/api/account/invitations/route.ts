// ============================================================
// /api/account/invitations
//
//   GET  — list outstanding (un-redeemed, non-expired) invites.
//   POST — create a new invite link.
//
// Both admin+. The list endpoint is what the Members tab uses to
// populate the "Pending invitations" section; create is what the
// "Invite member" dialog calls.
//
// IMPORTANT: the plaintext token is returned exactly ONCE — in
// the POST response. We store only the SHA-256 hash on the row,
// so neither GET nor a future PATCH can ever resurface the
// link. The admin sees it in the creation modal, copies it, and
// shares it via WhatsApp/Slack/whatever they like. If they
// dismiss the modal without copying, the only recourse is to
// revoke and re-issue.
// ============================================================

import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { applicationUrl } from '@/lib/app-url';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  clampExpiryDays,
  generateInviteToken,
  inviteExpiresAt,
  inviteUrl,
} from '@/lib/auth/invitations';
import { isAccountRole } from '@/lib/auth/roles';
import { db, schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

// Invitation links always use the same canonical origin as Better Auth and
// OAuth. Request Host headers are intentionally ignored to prevent poisoned
// links when the API is reached through an unexpected proxy or hostname.

const MAX_LABEL_LEN = 80;

export async function GET() {
  try {
    const ctx = await requireRole('admin');

    const invitations = await db
      .select({
        id: schema.accountInvitations.id,
        role: schema.accountInvitations.role,
        label: schema.accountInvitations.label,
        created_by_user_id: schema.accountInvitations.createdByUserId,
        created_at: schema.accountInvitations.createdAt,
        expires_at: schema.accountInvitations.expiresAt,
        accepted_at: schema.accountInvitations.acceptedAt,
        accepted_by_user_id: schema.accountInvitations.acceptedByUserId,
      })
      .from(schema.accountInvitations)
      .where(
        and(
          eq(schema.accountInvitations.accountId, ctx.accountId),
          isNull(schema.accountInvitations.acceptedAt),
          gt(schema.accountInvitations.expiresAt, new Date().toISOString())
        )
      )
      .orderBy(desc(schema.accountInvitations.createdAt));

    return NextResponse.json({ invitations });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    // 30/min per user. The Members tab is a clicks-only UI so any
    // legitimate admin is far below this; the cap exists to keep
    // a script run in a loop or a compromised admin session from
    // flooding `account_invitations` with rows.
    const limit = checkRateLimit(
      `admin:inviteCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      role?: unknown;
      expiresInDays?: unknown;
      label?: unknown;
    } | null;

    const role = body?.role;
    if (!isAccountRole(role) || role === 'owner') {
      // The DB CHECK already rejects 'owner', but failing fast
      // here gives a clearer 400 than the eventual constraint
      // violation surfaced as a 500.
      return NextResponse.json(
        { error: "'role' must be one of admin, agent, viewer" },
        { status: 400 }
      );
    }

    const expiresInDaysRaw = body?.expiresInDays;
    // `clampExpiryDays` tolerates undefined / NaN / negatives by
    // collapsing to the safe default, so we just pass the raw
    // value through after a type narrow.
    const expiresInDays =
      typeof expiresInDaysRaw === 'number' ? expiresInDaysRaw : undefined;
    const expiryDays = clampExpiryDays(expiresInDays);
    const expiresAt = inviteExpiresAt(expiryDays);

    let label: string | null = null;
    if (typeof body?.label === 'string') {
      const trimmed = body.label.trim();
      if (trimmed.length > MAX_LABEL_LEN) {
        return NextResponse.json(
          { error: `Label must be ${MAX_LABEL_LEN} characters or fewer` },
          { status: 400 }
        );
      }
      label = trimmed === '' ? null : trimmed;
    }

    const { token, hash } = generateInviteToken();

    const [data] = await db
      .insert(schema.accountInvitations)
      .values({
        accountId: ctx.accountId,
        tokenHash: hash,
        role,
        createdByUserId: ctx.userId,
        label,
        expiresAt: expiresAt.toISOString(),
      })
      .returning({
        id: schema.accountInvitations.id,
        role: schema.accountInvitations.role,
        label: schema.accountInvitations.label,
        expires_at: schema.accountInvitations.expiresAt,
        created_at: schema.accountInvitations.createdAt,
      });

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to create invitation' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        invitation: data,
        // Plaintext payload — visible to the admin exactly once.
        token,
        url: inviteUrl(token, applicationUrl()),
        expiresInDays: expiryDays,
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
