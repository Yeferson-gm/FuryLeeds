# Security Architecture

Related: [Architecture](./architecture.md) · [Database](./database.md) · [API contracts](./api-contracts.md) · [Realtime](./realtime.md) · [Integrations](./integrations.md)

## Trust boundaries

FuryLeeds accepts traffic from four materially different principals:

1. browser users authenticated by Better Auth session cookies;
2. external integrations authenticated by tenant-bound public API keys;
3. Meta, authenticated for webhook POSTs by HMAC signatures and for verification GETs by per-account verify tokens;
4. an external scheduler authenticated by a shared cron header secret.

Third-party services receive only the data needed for their function: Meta receives outbound message payloads/media links; ChatSend receives email content and recipient; Imgora receives file bytes and account-partitioned paths; configured AI providers receive prompts, selected conversation context and retrieved knowledge excerpts; customer webhook endpoints receive subscribed event payloads.

## Authentication

### Better Auth browser sessions

Better Auth uses its PostgreSQL Drizzle adapter with transactions and UUID ID generation. The catch-all handler is mounted as `GET`/`POST /api/auth/[...all]`. Configuration includes:

- email/password enabled;
- minimum password length 8;
- verified email required;
- no automatic sign-in immediately after password signup;
- verification email on signup and sign-in;
- verification-link lifetime 3,600 seconds;
- password reset through a six-digit email OTP with a 600-second lifetime, five allowed attempts, hashed database storage, and three requests/minute;
- automatic sign-in after successful verification;
- Google OAuth only when both client ID and secret exist;
- canonical `baseURL` and sole trusted origin from `BETTER_AUTH_URL` (localhost fallback only outside production);
- Next.js cookie plugin.

Session records include expiry, unique token, IP and user-agent fields. Better Auth owns cookie construction and session validation. ChatSend is invoked only by server-side mail callbacks; browser code never receives its credentials. Reset-request responses do not reveal whether the email exists, and OTP delivery uses Better Auth's configured background-task handler to reduce provider-latency timing differences. The long-lived Bun process owns that promise; it is process-bound, not durable.

`src/proxy.ts` redirects unauthenticated protected pages to canonical `/login` without retaining an unused destination query parameter, and blocks unauthenticated non-webhook `/api/whatsapp/*` requests. This is defense in depth only; handlers perform their own session/role checks.

### Public API keys

Keys have the form `furyleeds_live_` plus 32 random bytes encoded as base64url. Migration `0005` revokes every still-active key issued under the retired product prefix; integrations must create and store a new FuryLeeds key. At creation:

- plaintext is returned once;
- a short non-secret prefix is stored for display;
- only SHA-256 is stored for lookup;
- creation/revocation requires account admin or owner.

`requireApiKey()` accepts `Authorization: Bearer <key>` and also parses a non-empty bare header. It rejects malformed, unknown, revoked and expired keys, applies a per-key in-memory rate limit, checks the endpoint scope, and asynchronously updates `last_used_at`.

Scopes are:

- `messages:send`, `messages:read`;
- `contacts:read`, `contacts:write`;
- `conversations:read`;
- `broadcasts:send`;
- `webhooks:manage`.

Scope authority is independent of the creator's later account role. Only key creation is role-gated.

### Cron authentication

`GET /api/automations/cron` and `GET /api/flows/cron` require `AUTOMATION_CRON_SECRET` and compare `x-cron-secret` with `timingSafeEqual` after checking equal buffer lengths. They return `503` when the server secret is absent and `401` on mismatch.

## Authorization and roles

### System role

`user.system_role` is `user` or `superadmin`. During user creation, an email included in comma-separated `SUPERADMIN_EMAILS` receives `superadmin`; the field is not accepted from signup input.

### Account role

`profiles.account_role` is ordered:

```text
owner (4) > admin (3) > agent (2) > viewer (1)
```

Current policy helpers define:

| Capability | Minimum/current role |
|---|---|
| Read account data | viewer |
| Operational writes and sends | agent |
| Account settings, members, credentials and definitions | admin |
| Transfer ownership, destructive account ownership actions | owner |

`requireRole(minimum)` first requires a valid session and profile/account join. A `superadmin` then bypasses the account-role threshold, but not the requirement to have a profile linked to an account.

Some legacy/internal read routes call `getCurrentAccount()` directly rather than `requireRole('viewer')`; both require membership, but the latter makes policy intent more explicit.

## Tenant isolation

The tenant boundary is `accounts.id`. `getCurrentAccount()` derives `accountId` from the session user's unique profile; clients do not supply the active tenant. Public API keys are stored with and resolve to one `accountId`. Socket handshakes derive it from the session profile. Meta inbound traffic derives it from the unique WhatsApp `phone_number_id` configuration.

The application consistently intends to combine IDs with `account_id` in route/domain queries, and Socket.IO validates conversation membership before room joins.

However, PostgreSQL RLS is not configured. Consequences:

- application database credentials can read/write all tenants;
- every new query must explicitly scope the tenant or join through a scoped parent;
- IDs alone are not authorization;
- raw SQL deserves the same tenant review as Drizzle queries;
- composite cross-account relationships are not universally enforced by FKs.

## Secret handling and cryptography

| Secret | Storage/verification |
|---|---|
| Better Auth secret | Environment variable `BETTER_AUTH_SECRET`; not stored in docs/source |
| WhatsApp access and verify tokens | AES-256-GCM encrypted in `whatsapp_config`; random 12-byte IV and 16-byte auth tag; serialized as `iv:ciphertext:tag` hex |
| Encryption key | `ENCRYPTION_KEY`, normalized for surrounding deployment whitespace/quotes, then validated as exactly 64 hex characters (32 bytes); it remains server-only |
| Invitation token | 32 random bytes/base64url; SHA-256 hash only in DB; default expiry 7 days, hard maximum 365 days |
| Public API key | 32 random bytes/base64url with prefix; SHA-256 hash only in DB |
| Outbound webhook secret | 32 random bytes/base64url with `whsec_` prefix; AES-GCM encrypted in DB; plaintext returned once |
| Imgora reference | HMAC-SHA256 signed opaque payload; signing key is `ENCRYPTION_KEY`, falling back to `BETTER_AUTH_SECRET` |
| Meta webhook | HMAC-SHA256 over the exact raw request body; one or more comma-separated app secrets; constant-time candidate comparisons |
| Cron | Environment secret compared in constant time |

Changing `ENCRYPTION_KEY` without rotating/re-encrypting stored data makes WhatsApp tokens and outbound webhook secrets unreadable. The WhatsApp config health endpoint detects token decryption failure and asks for reset. The WhatsApp configuration route validates the master key before any Meta request and rejects reusing it as the public webhook verification token.

## Meta webhook security

`POST /api/whatsapp/webhook` fails closed if `META_APP_SECRET` is absent. It verifies `x-hub-signature-256: sha256=<hex>` against the raw body before parsing JSON. Multiple app secrets are supported, and all configured candidates are evaluated.

`GET` challenge verification loads encrypted `verify_token` values from all WhatsApp configs and accepts a token matching any decrypted row. Malformed ciphertext is ignored without leaking credential details. This route is public by protocol.

Meta message status transitions are guarded against regression for broadcast recipients: the success ladder only moves forward, `failed` is accepted only from pending/sent, and failed is terminal.

## Outbound webhook security

Management requires an API key with `webhooks:manage`. Endpoint URLs must be absolute HTTPS URLs. Before every delivery, DNS is resolved and loopback/private/link-local/ULA/reserved destinations and internal hostnames are rejected. Redirects are `manual`, preventing a normal redirect to an internal target.

Residual risk: the code explicitly does not pin the resolved IP to the socket, so DNS rebinding between validation and connection is not fully prevented.

Every payload is signed:

```text
X-FuryLeeds-Signature: t=<unix_seconds>,v1=<HMAC-SHA256(secret, "<t>.<raw-body>")>
```

The included verifier defaults to a 300-second replay tolerance. Deliveries time out after 5 seconds, are not automatically retried, and disable an endpoint after 15 consecutive failures.

## File and media security

Uploads are authenticated and server-proxied; Imgora credentials are never exposed to browsers. Collections are allow-listed: `avatars`, `chat-media`, `flow-media`. Account/path segments use a strict alphanumeric/underscore/hyphen pattern; names are sanitized and canonical extensions derive from allow-listed MIME types.

Limits:

- avatars: 2 MiB, image JPEG/PNG/WebP/GIF only;
- chat/flow images: 5 MiB;
- video/audio/documents: 16 MiB;
- only MIME types listed in `src/lib/storage/policy.ts` are accepted.

Opaque file references are signed and bind version, account, collection, provider public ID and resource type. Resolve/delete returns a not-found response on malformed signature, wrong account or wrong collection. Public CDN URLs are still returned for provider/Meta use; confidentiality therefore depends on the CDN URL behavior, while API references enforce account authorization.

Inbound WhatsApp media mirroring is best-effort and repeats size checks before and after download.

## Input, transport and browser controls

- Drizzle parameterization and Bun.SQL tagged templates are used for database values.
- Public API cursors validate an ISO timestamp and UUID before use.
- API responses receive `Cache-Control: no-store` globally through Next config.
- HSTS: two years, include subdomains, preload.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`.
- strict-origin-when-cross-origin referrer policy.
- camera/geolocation/payment/USB denied; microphone allowed same-origin for voice notes.
- CSP allows same-origin scripts, Cloudflare Web Analytics from `static.cloudflareinsights.com`, HTTPS images/media, same-origin WebSocket connections, and beacon delivery to `cloudflareinsights.com`, but is currently **report-only**, not enforcing. `script-src-elem` is explicit so injected `<script>` elements do not fall back ambiguously to `script-src`.
- HTML remains transformable so Cloudflare Automatic Setup can inject its Web Analytics beacon. Browser privacy tools such as Brave Shields may independently block that request; application CSP cannot and must not override a user's local blocker.
- Socket.IO validates same-host/canonical origin when an Origin header exists and authenticates the cookie during middleware.

## Rate limits

The implementation is an in-memory fixed-window map, opportunistically swept every 1,000 checks.

| Bucket | Limit |
|---|---|
| Message send | 60/min per user |
| Broadcast dispatch | 60/min per user |
| Reactions | 120/min per user |
| Invitation preview | 30/min per client IP |
| Invitation redeem | 10/min per client IP |
| Admin actions | 30/min per user |
| Public API | 120/min per API key |
| AI draft | 20/min per user and 60/min per account |
| AI auto-reply | 30/min per account, plus configured per-conversation max 1–20 |

429 responses include `Retry-After` and `X-RateLimit-*` headers. Limits are **per process** and can be bypassed/multiplied by horizontal scaling or restarts. Proxy-derived IP limiting trusts the first `x-forwarded-for` value; deployment must ensure untrusted clients cannot forge that header directly.

## Security-relevant operational limits

1. CSP does not yet block violations.
2. No distributed rate limiter exists.
3. No database RLS exists.
4. Socket.IO accepts requests without an Origin header, then relies on session authentication.
5. Better Auth/session cookie properties are delegated to Better Auth and should be verified in the deployed environment.
6. `after()` tasks and outbound webhook deliveries are not a durable queue.
7. AI keys are stored in `ai_configs.api_key`/`embeddings_api_key` as text in the current schema; unlike WhatsApp and webhook secrets, the inspected code/schema does not encrypt those fields at rest.
8. Better Auth provider token columns are also stored according to Better Auth's adapter behavior; no application-layer encryption is visible here.
9. The account data boundary relies on review discipline. Add tests for cross-account access whenever adding or changing a route.

## Security review checklist for new endpoints

- Derive the account from a session/API key/config, never from an unchecked body field.
- Require the lowest sufficient role/scope.
- Add `account_id` to every root lookup, update and delete.
- Validate child ownership through an account-scoped join.
- Avoid returning encrypted/hash/secret columns.
- Apply a suitable rate limit to high-cost or high-impact writes.
- Keep provider error data useful but do not expose tokens, raw credentials or internal stack traces.
- Use raw-body signature verification for incoming webhooks.
- Apply SSRF controls before server-side fetching of user-supplied URLs.
- Add a migration for constraints rather than relying only on UI validation.
