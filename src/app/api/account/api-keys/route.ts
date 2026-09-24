// ============================================================
// /api/account/api-keys
//
//   GET  — list this account's API keys (safe columns only).
//   POST — mint a new key.
//
// These are the dashboard endpoints for managing keys. Every query
// is explicitly scoped by account_id. Listing is open to any member
// (viewer+) — the roster is not secret; the key itself is never in it.
// Minting is admin+ because a key hands out account capabilities.
//
// IMPORTANT: the plaintext key is returned exactly ONCE, in the POST
// response. We persist only its SHA-256 hash, so neither GET nor any
// future endpoint can resurface it — same one-time-reveal contract
// as invite links. If the admin loses it, they revoke and re-issue.
// ============================================================

import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { generateApiKey } from '@/lib/api-keys/keys';
import { normalizeScopes } from '@/lib/api-keys/scopes';
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { db, schema } from '@/lib/db';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

const MAX_NAME_LEN = 80;
// Hard ceiling on caller-supplied expiry (1 year), mirroring the
// invite-link clamp. NULL/absent = never expires.
const MAX_EXPIRY_DAYS = 365;

const safeColumns = {
  id: schema.apiKeys.id,
  name: schema.apiKeys.name,
  key_prefix: schema.apiKeys.keyPrefix,
  scopes: schema.apiKeys.scopes,
  last_used_at: schema.apiKeys.lastUsedAt,
  expires_at: schema.apiKeys.expiresAt,
  revoked_at: schema.apiKeys.revokedAt,
  created_at: schema.apiKeys.createdAt,
};

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const keys = await db
      .select(safeColumns)
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.accountId, ctx.accountId))
      .orderBy(desc(schema.apiKeys.createdAt));

    return NextResponse.json({ keys });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(
      `admin:apiKeyCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      scopes?: unknown;
      expiresInDays?: unknown;
    } | null;

    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!rawName) {
      return NextResponse.json(
        { error: "'name' is required" },
        { status: 400 }
      );
    }
    if (rawName.length > MAX_NAME_LEN) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME_LEN} characters or fewer` },
        { status: 400 }
      );
    }

    // Scopes default to none if omitted — that yields a key that can
    // only call the scope-free endpoints (e.g. GET /api/v1/me).
    const scopes = normalizeScopes(body?.scopes ?? []);
    if (scopes === null) {
      return NextResponse.json(
        { error: "'scopes' must be an array of known scope strings" },
        { status: 400 }
      );
    }

    let expiresAt: string | null = null;
    const rawExpiry = body?.expiresInDays;
    if (
      typeof rawExpiry === 'number' &&
      Number.isFinite(rawExpiry) &&
      rawExpiry > 0
    ) {
      const days = Math.min(Math.floor(rawExpiry), MAX_EXPIRY_DAYS);
      expiresAt = new Date(
        Date.now() + days * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    const { plaintext, hash, prefix } = generateApiKey();

    const [data] = await db
      .insert(schema.apiKeys)
      .values({
        accountId: ctx.accountId,
        createdBy: ctx.userId,
        name: rawName,
        keyPrefix: prefix,
        keyHash: hash,
        scopes,
        expiresAt,
      })
      .returning(safeColumns);

    if (!data) {
      return NextResponse.json(
        { error: 'Failed to create API key' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        key: data,
        // Plaintext — shown to the admin exactly once.
        plaintext,
      },
      { status: 201 }
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
