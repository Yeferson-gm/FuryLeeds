# Public API and webhooks

Related: [Auth/accounts](auth-and-accounts.md) · [Contacts](contacts.md) · [Inbox](inbox-and-messaging.md) · [Broadcasts](broadcasts.md) · [WhatsApp](whatsapp.md)

## Purpose and ownership

Owns machine authentication, scoped REST `/api/v1`, stable response/error envelopes, cursor pagination, API contact/conversation/message/broadcast services, outbound event-webhook registration, signing, delivery and SSRF defense.

## Important source paths

- `src/lib/auth/api-context.ts`
- `src/lib/api-keys/*`, `src/lib/api/v1/*`
- `src/app/api/v1/**`, `src/app/api/account/api-keys/**`
- `src/lib/webhooks/{events,endpoints,sign,ssrf,deliver}.ts`

## Data model

- `api_keys`: hashed `furyleeds_live_*` token, account, scopes, expiry/revocation/use metadata. Migration `0005` revokes keys issued under the retired product prefix; plaintext cannot be migrated and clients must receive a newly created key.
- `webhook_endpoints`: account, encrypted secret, HTTPS URL, event array, active flag, last delivery/failure count.
- API uses existing contacts/conversations/messages/broadcasts tables.

Scopes: `messages:send`, `messages:read`, `contacts:read`, `contacts:write`, `conversations:read`, `broadcasts:send`, `webhooks:manage`.

Webhook events: `message.received`, `message.status_updated`, `conversation.created`.

## API endpoints

| Endpoint | Methods | Required scope |
|---|---|---|
| `/api/v1/me` | GET | Valid key only. |
| `/api/v1/contacts` | GET, POST | `contacts:read`, `contacts:write`. |
| `/api/v1/contacts/:id` | GET, PATCH | `contacts:read`, `contacts:write`. |
| `/api/v1/conversations` | GET | `conversations:read`. |
| `/api/v1/conversations/:id` | GET | `conversations:read`. |
| `/api/v1/conversations/:id/messages` | GET | `messages:read`. |
| `/api/v1/messages` | POST | `messages:send`; target by conversation or international phone. |
| `/api/v1/broadcasts` | POST | `broadcasts:send`. |
| `/api/v1/broadcasts/:id` | GET | `broadcasts:send`. |
| `/api/v1/webhooks` | GET, POST | `webhooks:manage`. |
| `/api/v1/webhooks/:id` | GET, PATCH, DELETE | `webhooks:manage`. |

## Main flows

- Key authentication hashes the presented value, checks active/expiry/scope, applies 120/min per-key fixed-window limit, and returns account context.
- Responses use `{data}` or `{data,meta:{next_cursor}}`; errors use machine code/message and optional details.
- Lists use descending `(created_at,id)` keyset cursors, default 50/max 100; cursor UUID/timestamp validation blocks filter injection.
- Message service reuses the same WhatsApp core as the dashboard. Phone target may create contact/conversation after payload validation.
- Webhook create accepts normalized HTTPS URL/events and returns plaintext signing secret once; stored secret is encrypted.
- Delivery verifies DNS/public IP, refuses redirects, times out at 5s, signs exact JSON in `X-FuryLeeds-Signature`, and disables after 15 consecutive failures. Consumers must update from the retired header namespace; no dual-header compatibility shim is emitted.

## Authorization and tenant boundary

Scopes are independent of creator's current role; admin+ controls key issuance. Every service accepts `accountId` from validated key context and filters all reads/writes. Webhook endpoint IDs are account-scoped.

## Realtime/events

Public API writes trigger the same DB realtime events as UI writes. Outbound webhooks are best-effort and asynchronous relative to business success; no delivery-attempt table or retry queue exists.

## Failure modes

- Missing/malformed/unknown/revoked/expired key → 401; missing scope → 403; exhausted local bucket → 429.
- Invalid cursor/input → 400; foreign resource generally → 404.
- Webhook DNS can fail/change; private/reserved targets and redirects are refused.
- Delivery non-2xx, timeout or decrypt failure increments count; endpoint auto-disables at 15.
- In-memory limiter is per process; webhook delivery has no automatic retry/history.

## Tests and integration examples

`test/lib/api-keys/*`, `test/lib/auth/api-context.test.ts`, `test/lib/api/v1/*`, and `test/lib/webhooks/*` cover auth/scopes/rate limits, serialization/pagination, message/broadcast validation, URL normalization, signatures/replay tolerance, SSRF and delivery failure disabling.

The root `api.http` is the manual integration collection for all 16 `/api/v1` operations plus the machine-facing health, Meta callback, and cron surfaces. Its Spanish comments identify required scopes and mark requests that create data, call Meta, process signed callbacks, or execute scheduled work as `EFECTO REAL`; it contains placeholders only, never credentials.

`test/test.sh` is the live external contract smoke suite exposed as `bun run test:external`. It requires a running non-production instance and one API key carrying all seven scopes. Its default path is intentionally non-destructive: it uses reads, not-found UUIDs, invalid write payloads, a missing Meta signature, and an invalid cron secret so every operation is routed and authorized without creating contacts/webhooks, sending messages/broadcasts, processing Meta events, or running jobs. It suppresses response bodies and authorization material.

## Extension rules

- Add one declared scope and enforce it at the route boundary.
- Keep v1 envelopes/serializers free of internal secrets and audit fields.
- Preserve keyset ordering when adding filters.
- New webhook events require vocabulary, source dispatch, docs/payload contract and tests.
- Never follow webhook redirects; encrypt secrets and reveal only once.
