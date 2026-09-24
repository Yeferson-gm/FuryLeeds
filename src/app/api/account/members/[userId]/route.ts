import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isAccountRole } from '@/lib/auth/roles';
import { sqlClient } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

class MemberMutationError extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string
  ) {
    super(message);
    this.name = 'MemberMutationError';
  }
}

interface TargetProfile {
  account_id: string;
  account_role: string;
  full_name: string;
  email: string;
}

function mutationErrorResponse(error: MemberMutationError): NextResponse {
  return NextResponse.json({ error: error.message }, { status: error.status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:memberRole:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;
    const body = (await request.json().catch(() => null)) as {
      role?: unknown;
    } | null;
    const role = body?.role;

    if (!isAccountRole(role)) {
      return NextResponse.json(
        { error: "'role' must be one of owner, admin, agent, viewer" },
        { status: 400 }
      );
    }
    if (role === 'owner') {
      return NextResponse.json(
        {
          error:
            'Use POST /api/account/transfer-ownership to promote a member to owner',
        },
        { status: 400 }
      );
    }
    if (userId === ctx.userId) {
      return mutationErrorResponse(
        new MemberMutationError(400, 'Cannot change your own role')
      );
    }

    await sqlClient.begin(async (transaction) => {
      const targets = (await transaction`
        SELECT account_id, account_role, full_name, email
        FROM profiles
        WHERE user_id = ${userId}
        FOR UPDATE
      `) as unknown as TargetProfile[];
      const target = targets[0];
      if (!target) {
        throw new MemberMutationError(400, 'Target user not found');
      }
      if (target.account_id !== ctx.accountId) {
        throw new MemberMutationError(
          403,
          'Target user is not a member of your account'
        );
      }
      if (target.account_role === 'owner') {
        throw new MemberMutationError(
          400,
          'Use transfer_account_ownership to demote an owner'
        );
      }

      await transaction`
        UPDATE profiles
        SET account_role = ${role}, updated_at = NOW()
        WHERE user_id = ${userId}
          AND account_id = ${ctx.accountId}
          AND account_role <> 'owner'
      `;
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MemberMutationError) return mutationErrorResponse(err);
    return toErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:memberRemove:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;
    if (userId === ctx.userId) {
      throw new MemberMutationError(
        400,
        'Cannot remove yourself; transfer ownership or leave the account instead'
      );
    }

    const newPersonalAccountId = await sqlClient.begin(async (transaction) => {
      const targets = (await transaction`
        SELECT account_id, account_role, full_name, email
        FROM profiles
        WHERE user_id = ${userId}
        FOR UPDATE
      `) as unknown as TargetProfile[];
      const target = targets[0];
      if (!target) {
        throw new MemberMutationError(400, 'Target user not found');
      }
      if (target.account_id !== ctx.accountId) {
        throw new MemberMutationError(
          403,
          'Target user is not a member of your account'
        );
      }
      if (target.account_role === 'owner') {
        throw new MemberMutationError(
          400,
          'Cannot remove the account owner; transfer ownership first'
        );
      }

      const accounts = (await transaction`
        INSERT INTO accounts (name, owner_user_id)
        VALUES (${target.full_name || target.email || 'My account'}, ${userId})
        RETURNING id
      `) as unknown as { id: string }[];
      const accountId = accounts[0]?.id;
      if (!accountId) throw new Error('Failed to create personal account');

      await transaction`
        UPDATE profiles
        SET account_id = ${accountId}, account_role = 'owner', updated_at = NOW()
        WHERE user_id = ${userId}
          AND account_id = ${ctx.accountId}
          AND account_role <> 'owner'
      `;
      return accountId;
    });

    return NextResponse.json({ ok: true, newPersonalAccountId });
  } catch (err) {
    if (err instanceof MemberMutationError) return mutationErrorResponse(err);
    return toErrorResponse(err);
  }
}
