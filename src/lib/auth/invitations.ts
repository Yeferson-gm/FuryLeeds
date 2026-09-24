// ============================================================
// Invitation token utilities and transactional persistence.
//
// Why we hash tokens at rest
// --------------------------
// The DB stores only `account_invitations.token_hash` (SHA-256
// of the random token), never the plaintext. A leaked DB snapshot
// (logs, backups, support exports) therefore can't be used to
// redeem invites — the attacker would need the original token,
// which is returned exactly once at creation time.
//
// Why 32 bytes
// ------------
// 32 bytes of CSPRNG entropy is the standard for opaque session-
// style tokens. base64url-encodes to a 43-char string, fits
// comfortably in a URL, and is well past the practical brute-
// force boundary even with SHA-256 collisions (256 bits >> any
// realistic adversary).
//
// Why base64url (not hex)
// -----------------------
// URL-safe and shorter than hex. `crypto.randomBytes(32).toString
// ('base64url')` lands at 43 characters; hex would be 64.
// ============================================================

import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema, sqlClient } from '@/lib/db';
import type { AccountRole } from './roles';

/** Default invite link lifetime if the caller doesn't specify. */
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;

/** Hard ceiling on user-supplied `expiresInDays` (1 year). */
export const MAX_INVITE_EXPIRY_DAYS = 365;

export interface GeneratedToken {
  /** Plaintext token — return to the creator ONCE, never persist. */
  token: string;
  /** SHA-256 hex digest of the token. Persist this in the DB. */
  hash: string;
}

/**
 * Generate a fresh invite token + its hash. Call once per invite
 * creation; the plaintext is shown to the admin in the UI and
 * embedded in the shareable link, the hash is stored in
 * `account_invitations.token_hash`.
 */
export function generateInviteToken(): GeneratedToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashInviteToken(token) };
}

/**
 * Deterministic SHA-256 of a plaintext token. Used at redeem time
 * to look up the matching `account_invitations` row by `token_hash`.
 * Pure function — same input always produces the same output.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Build the public invite URL the admin will share. The token is
 * carried in the path (not the query) so referrer-policy noise
 * and browser autocomplete don't trip up token preservation.
 *
 * `baseUrl` must NOT have a trailing slash. The function tolerates
 * one anyway so callers do not need to normalize the canonical
 * application URL first.
 */
export function inviteUrl(token: string, baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/join/${token}`;
}

/**
 * Compute the `expires_at` timestamp for a new invite.
 *
 * - Clamps `expiresInDays` to `[1, MAX_INVITE_EXPIRY_DAYS]`.
 * - Falls back to `DEFAULT_INVITE_EXPIRY_DAYS` for missing input.
 * - `now` is injectable so tests don't need timer mocking.
 */
export function inviteExpiresAt(
  expiresInDays: number | undefined,
  now: Date = new Date()
): Date {
  const days = clampExpiryDays(expiresInDays);
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ms);
}

/** Exposed for tests and for the API route that echoes the clamped value back. */
export function clampExpiryDays(expiresInDays: number | undefined): number {
  if (
    expiresInDays === undefined ||
    !Number.isFinite(expiresInDays) ||
    expiresInDays <= 0
  ) {
    return DEFAULT_INVITE_EXPIRY_DAYS;
  }
  return Math.min(Math.floor(expiresInDays), MAX_INVITE_EXPIRY_DAYS);
}

export type InvitationFailure = 'invalid' | 'unauthorized' | 'conflict';

export class InvitationError extends Error {
  constructor(
    readonly kind: InvitationFailure,
    message: string
  ) {
    super(message);
    this.name = 'InvitationError';
  }
}

export type InvitationPreview =
  | {
      ok: true;
      account_name: string;
      role: AccountRole;
      expires_at: string;
    }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' };

export async function peekInvitation(
  tokenHash: string
): Promise<InvitationPreview> {
  const [row] = await db
    .select({
      accountName: schema.accounts.name,
      role: schema.accountInvitations.role,
      expiresAt: schema.accountInvitations.expiresAt,
      acceptedAt: schema.accountInvitations.acceptedAt,
    })
    .from(schema.accountInvitations)
    .innerJoin(
      schema.accounts,
      eq(schema.accounts.id, schema.accountInvitations.accountId)
    )
    .where(eq(schema.accountInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.acceptedAt) return { ok: false, reason: 'used' };
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    account_name: row.accountName,
    role: row.role,
    expires_at: row.expiresAt,
  };
}

interface LockedInvitationRow {
  id: string;
  account_id: string;
  role: AccountRole;
  expires_at: string | Date;
  accepted_at: string | Date | null;
}

interface CurrentAccountRow {
  account_id: string;
  owner_user_id: string;
}

export async function redeemInvitation(
  tokenHash: string,
  userId: string
): Promise<string> {
  return sqlClient.begin(async (transaction) => {
    const invitations = (await transaction`
      SELECT id, account_id, role, expires_at, accepted_at
      FROM account_invitations
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `) as unknown as LockedInvitationRow[];
    const invitation = invitations[0];

    if (!invitation) {
      throw new InvitationError('invalid', 'Invitation not found');
    }
    if (invitation.accepted_at) {
      throw new InvitationError(
        'invalid',
        'Invitation has already been redeemed'
      );
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      throw new InvitationError('invalid', 'Invitation has expired');
    }

    const currentAccounts = (await transaction`
      SELECT p.account_id, a.owner_user_id
      FROM profiles p
      INNER JOIN accounts a ON a.id = p.account_id
      WHERE p.user_id = ${userId}
      FOR UPDATE OF p, a
    `) as unknown as CurrentAccountRow[];
    const current = currentAccounts[0];

    if (!current) {
      throw new InvitationError('unauthorized', 'Caller has no profile');
    }
    if (current.account_id === invitation.account_id) {
      throw new InvitationError(
        'conflict',
        'You are already a member of this account'
      );
    }
    if (current.owner_user_id !== userId) {
      throw new InvitationError(
        'conflict',
        'You are already in a shared account; sign up with a different email to join this one'
      );
    }

    const dataRows = (await transaction`
      SELECT EXISTS (
        SELECT 1 FROM contacts WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM conversations WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM broadcasts WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM automations WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM flows WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM pipelines WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM message_templates WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM tags WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM custom_fields WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM contact_notes WHERE account_id = ${current.account_id}
        UNION ALL SELECT 1 FROM whatsapp_config WHERE account_id = ${current.account_id}
        LIMIT 1
      ) AS has_data
    `) as unknown as { has_data: boolean }[];

    if (dataRows[0]?.has_data) {
      throw new InvitationError(
        'conflict',
        'Your account already contains data; sign up with a different email to join this one'
      );
    }

    await transaction`
      UPDATE profiles
      SET account_id = ${invitation.account_id},
          account_role = ${invitation.role},
          updated_at = NOW()
      WHERE user_id = ${userId}
        AND account_id = ${current.account_id}
    `;
    await transaction`
      UPDATE account_invitations
      SET accepted_at = NOW(), accepted_by_user_id = ${userId}
      WHERE id = ${invitation.id}
        AND accepted_at IS NULL
    `;
    await transaction`
      DELETE FROM accounts
      WHERE id = ${current.account_id}
        AND owner_user_id = ${userId}
    `;

    return invitation.account_id;
  });
}
