# Broadcasts

Related: [WhatsApp](whatsapp.md) · [Contacts](contacts.md) · [Public API](public-api-and-webhooks.md) · [Notifications/realtime](notifications-and-presence.md)

## Purpose and ownership

Owns template campaign creation, audience resolution, recipient snapshots, background fan-out, status aggregation, progress reads, cancellation of unsent campaigns, and retry/resume.

## Important source paths

- `src/lib/whatsapp/{broadcast-core,broadcast-resume}.ts`
- `src/lib/api/v1/broadcasts.ts`
- `src/lib/{broadcast-csv,broadcast-retry,broadcast-status}.ts`
- `src/app/api/whatsapp/broadcast/**`, `src/app/api/v1/broadcasts/**`
- `drizzle/0002_realtime_socket.sql` (aggregate/realtime triggers)

## Data model

- `broadcasts`: account/author, template/language/variables, audience filter, schedule, lifecycle `draft|scheduled|sending|sent|failed`, aggregate counts and delivery lock.
- `broadcast_recipients`: optional contact, frozen template params, lifecycle `pending|sent|delivered|read|replied|failed`, timestamps/error/Meta ID.
- Unique non-null recipient Meta IDs support status correlation.
- PostgreSQL trigger derives funnel counts from recipient status; application code owns only campaign terminal status.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/whatsapp/broadcast` | GET, POST | Viewer lists; agent+ legacy/batched send path. |
| `/api/whatsapp/broadcast/create` | POST | Agent+; validates approved template, creates campaign/recipients, dispatches in `after()`. |
| `/api/whatsapp/broadcast/resources` | GET, POST | Viewer+; templates/tags/fields/preview contacts and audience count. |
| `/api/whatsapp/broadcast/:id` | GET, DELETE | Viewer reads detail; agent deletes only draft/scheduled/non-sending campaign. |
| `/api/whatsapp/broadcast/:id/resume` | POST | Agent+; lock, retry pending/failed/all, max 1,000 per request. |
| `/api/v1/broadcasts` | POST | API key `broadcasts:send`; max 1,000 explicit recipients. |
| `/api/v1/broadcasts/:id` | GET | Same scope; account-scoped progress. |

## Main flows

- Resolve audience to account contacts; public API creates contacts for valid international numbers.
- Reject invalid numbers individually, dedupe by resolved contact, and freeze params per recipient.
- Create parent and recipients in one transaction with status `sending`/`pending`.
- Return quickly; `after()` sends each recipient independently with phone-variant retry.
- Webhook statuses move recipients monotonically and DB trigger updates counts; inbound replies mark recent recipients replied.
- Finalize as `failed` only when all recipients failed, otherwise `sent`; remain `sending` while pending exists.
- Resume uses a 30-minute stale lock, marks unusable contacts failed, caps each pass and always releases best-effort.

## Authorization and tenant boundary

Session endpoints use viewer/agent roles; public endpoints use the API key account. Campaign lookup/lock/delete always includes `account_id`; recipient access starts from an owned campaign or joins account-owned contacts.

## Realtime/events

Broadcast insert/update/delete emits `broadcast:changed` to the account room. Recipient changes update parent counters, which then emit a parent broadcast update.

## Failure modes

- Missing config/template, malformed local template, empty/oversized audience → 4xx/5xx before sends.
- One Meta failure marks only that recipient failed; other recipients continue.
- Process interruption leaves pending rows; resume is the recovery path.
- Concurrent resume fails lock acquisition (409-like response); stale locks recover after 30 minutes.
- Count columns must not be manually written because that races the DB trigger.

## Tests

`test/lib/whatsapp/{broadcast-core,broadcast-resume}.test.ts`, `test/lib/api/v1/broadcasts.test.ts`, and broadcast CSV/retry/status/shared tests cover validation, transactions, locking, frozen params, unsendable recipients and finalization. Full `after()` fan-out route integration is less directly covered.

## Extension rules

- Keep create and delivery phases separate and recipient failures isolated.
- Snapshot all send-time variables needed by resume.
- Let the DB trigger own aggregate counters.
- New recipient states require schema checks, monotonic webhook logic, trigger aggregates, UI mappings and tests.
