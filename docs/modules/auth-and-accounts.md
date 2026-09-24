# Auth and accounts

Related: [Public API](public-api-and-webhooks.md) · [Dashboard/settings](dashboard-and-settings.md) · [Notifications/presence](notifications-and-presence.md)

## Purpose and ownership

Owns human identity/session authentication, the account tenant, membership/roles, invitations, account/profile settings, ownership transfer, and creation/revocation of public API keys. Better Auth owns credential/session lifecycle; application code owns `accounts` and `profiles`.

## Important source paths

- `src/lib/auth/auth.ts`, `account.ts`, `roles.ts`, `invitations.ts`, `api-context.ts`
- `src/lib/account/members.ts`
- `src/lib/api-keys/{keys,scopes,store}.ts`
- `src/app/api/auth/[...all]/route.ts`
- `src/app/api/account/**`, `src/app/api/invitations/**`
- `src/lib/db/{auth-schema,crm-schema}.ts`

## Data model

- Better Auth: `user`, `session`, `account` (provider credentials), `verification`. Their text primary keys use PostgreSQL `gen_random_uuid()::text` defaults so Better Auth's UUID mode and adapter `DEFAULT` inserts share one database contract.
- Tenant: `accounts(id,name,owner_user_id,default_currency)`; one personal account per owner.
- Membership: `profiles(user_id UNIQUE,account_id,account_role,identity snapshot)`.
- Invitations: `account_invitations`; SHA-256 token hash only, non-owner role, expiry and acceptance audit.
- API keys: `api_keys`; SHA-256 hash, display prefix, free `text[]` scopes, expiry/revocation/last use.

New Better Auth users receive a personal account and owner profile transactionally. The bootstrap insert uses only the current `profiles` columns and assigns `account_role='owner'`; the obsolete generic `profiles.role` removed by migration `0003` is not referenced. Profile identity mirrors later Better Auth user updates.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/auth/[...all]` | Better Auth handlers | Email/password, verification link, six-digit reset OTP, optional Google OAuth. |
| `/api/account` | GET, PATCH | Session; returns account/profile. Any member edits own name/avatar; admin+ renames account. |
| `/api/account/members` | GET | Any member; returns tenant members and capabilities. |
| `/api/account/members/:userId` | PATCH, DELETE | Admin+; change non-owner roles or remove a member into a new personal account. |
| `/api/account/transfer-ownership` | POST | Owner only; transactional owner/profile role swap. |
| `/api/account/invitations` | GET, POST | Admin+; list live pending invitations or create one-time plaintext link. |
| `/api/account/invitations/:id` | DELETE | Admin+; revoke within tenant. |
| `/api/invitations/:token/peek` | GET | Public, per-IP rate limited; reveals account name/role/expiry only. |
| `/api/invitations/:token/redeem` | POST | Authenticated and rate limited; transactional consume. |
| `/api/account/api-keys` | GET, POST | Any member lists metadata; admin+ creates and receives plaintext once. |
| `/api/account/api-keys/:id` | DELETE | Admin+; soft revocation. |

## Main flows

- **Signup:** Better Auth creates the user plus personal account/owner profile, sends a one-hour verification link through ChatSend, auto-signs in after verification, then sends one idempotent welcome email. OAuth users whose provider already verified their email receive the same welcome after creation.
- **Password recovery:** `/forgot-password` requests a six-digit email OTP and completes the reset in the same page. Better Auth stores the OTP hashed, expires it after 10 minutes, permits five attempts, rotates it on resend, and rate-limits requests. On success it invokes the post-reset ChatSend confirmation.
- **Google OAuth:** Better Auth persists short-lived PKCE/state data in `verification`, redirects through `/api/auth/callback/google`, then creates or links the user. Migration `0004` supplies the database-generated ID required by that state insert.
- **Invitation redemption:** locks invitation/current account; rejects used/expired links, existing shared-account members, or personal accounts containing CRM data; moves profile and marks invitation accepted.
- **Member removal:** transactional removal with creation/reuse of a personal owner account for the removed user.
- **API key auth:** parses Bearer or bare `furyleeds_live_*`, hashes lookup value, rejects revoked/expired keys, rate-limits per key, verifies scope, asynchronously bumps `last_used_at`.

## Authorization and tenant boundary

`getCurrentAccount()` resolves the Better Auth session to exactly one profile/account. `requireRole()` enforces minimum roles, with system `superadmin` bypass. Role policy lives only in `roles.ts`. All account mutations constrain the resolved account; public keys are permanently bound to one `account_id`.

## Realtime/events

Membership/account changes have no dedicated socket event. Account deletion cascades tenant data through foreign keys. API-key use does a best-effort timestamp update.

## Failure modes

- Missing/invalid session → 401; missing profile/account or malformed role → 403.
- Better Auth catches and logs verification-mail callback failure: user/account creation may complete while activation remains unavailable until mail delivery succeeds. Better Auth secret/base URL or a DB hook failure can still fail the broader auth flow. Reset OTP delivery is deferred through Better Auth's background-task handler and is process-bound; ChatSend outage can therefore leave a generic successful request without a delivered code.
- Welcome and password-changed confirmation email are best-effort after the identity mutation and never reverse or falsely fail that completed mutation.
- Invitation conflicts deliberately prevent accidental loss of personal-account data.
- In-memory rate limits are per process; horizontal deployments require a shared limiter.
- `ENCRYPTION_KEY` is unrelated to password auth but required by integrations managed from the account.

## Tests

`test/proxy.test.ts` verifies clean `/login` redirects without unused return-path query parameters. `test/lib/auth/{account,roles,invitations,api-context}.test.ts`, `test/lib/api-keys/{keys,scopes}.test.ts`, and `test/lib/email/{auth-email,chatsend}.test.ts` cover context resolution, roles, token/key behavior, ChatSend transport, escaped auth templates, OTP secrecy/idempotency, welcome copy, and password-change confirmation. Member/ownership route transactions and a full OTP route integration do not have dedicated tests.

## Extension rules

- Add permissions as capability predicates in `roles.ts`, then consume them in API/UI.
- Never store invitation/API plaintext secrets; return them once.
- Keep membership and ownership changes transactional and preserve one-profile/one-account semantics.
- New `/api/v1` capabilities require a declared scope and admin-controlled key creation.
