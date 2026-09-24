import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sqlClient } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

class TransferError extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string
  ) {
    super(message);
    this.name = 'TransferError';
  }
}

function looksLikeUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const limit = checkRateLimit(
      `admin:transferOwnership:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      newOwnerUserId?: unknown;
    } | null;
    const newOwnerUserId = body?.newOwnerUserId;
    if (!looksLikeUuid(newOwnerUserId)) {
      return NextResponse.json(
        { error: "'newOwnerUserId' must be a valid UUID" },
        { status: 400 }
      );
    }
    if (newOwnerUserId === ctx.userId) {
      throw new TransferError(400, 'You are already the owner');
    }

    await sqlClient.begin(async (transaction) => {
      const accounts = (await transaction`
        SELECT owner_user_id
        FROM accounts
        WHERE id = ${ctx.accountId}
        FOR UPDATE
      `) as unknown as { owner_user_id: string }[];
      if (accounts[0]?.owner_user_id !== ctx.userId) {
        throw new TransferError(
          403,
          'Only the account owner can transfer ownership'
        );
      }

      const targets = (await transaction`
        SELECT account_id
        FROM profiles
        WHERE user_id = ${newOwnerUserId}
        FOR UPDATE
      `) as unknown as { account_id: string }[];
      const target = targets[0];
      if (!target) throw new TransferError(400, 'Target user not found');
      if (target.account_id !== ctx.accountId) {
        throw new TransferError(
          403,
          'Target user is not a member of your account'
        );
      }

      await transaction`
        UPDATE profiles
        SET account_role = CASE
          WHEN user_id = ${ctx.userId} THEN 'admin'::account_role_enum
          WHEN user_id = ${newOwnerUserId} THEN 'owner'::account_role_enum
          ELSE account_role
        END,
        updated_at = NOW()
        WHERE account_id = ${ctx.accountId}
          AND user_id IN (${ctx.userId}, ${newOwnerUserId})
      `;
      await transaction`
        UPDATE accounts
        SET owner_user_id = ${newOwnerUserId}, updated_at = NOW()
        WHERE id = ${ctx.accountId}
          AND owner_user_id = ${ctx.userId}
      `;
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TransferError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return toErrorResponse(err);
  }
}
