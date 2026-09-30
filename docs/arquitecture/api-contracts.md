# HTTP API Contracts

> **Coverage.** This inventory covers every `src/app/api/**/route.ts` file (102 route files). Public `/api/v1` is the stable integration surface. Other `/api/*` routes are browser/internal contracts and may evolve with the UI.
>
> **Integration artifacts.** Root [`api.http`](../../api.http) provides commented manual examples for all machine-facing inbound operations. [`test/test.sh`](../../test/test.sh) safely smoke-tests the same route surface against a running non-production instance through `bun run test:external`; its default requests deliberately stop before persistent or provider side effects.

Related: [Architecture](./architecture.md) · [Security](./security.md) · [Database](./database.md) · [Integrations](./integrations.md)

## Conventions

### Authentication legend

| Label | Meaning |
|---|---|
| Session | Valid Better Auth cookie and a profile linked to an account |
| Viewer/Agent/Admin/Owner | Session plus that minimum account role; higher roles qualify |
| API key(scope) | Tenant-bound key in `Authorization`; named scope required |
| Cron | `x-cron-secret` equals `AUTOMATION_CRON_SECRET` |
| Meta | Public Meta protocol route; POST requires a valid `x-hub-signature-256` |
| Public | No session, key or cron secret required |

`superadmin` bypasses account-role minimums after account context is established. Unless explicitly public/special, all resources are account-scoped.

### Internal response behavior

Most dashboard routes return direct JSON objects such as `{ error: string }`, `{ success: true }`, or feature-specific collections. They are not governed by one shared envelope. Authentication errors are normally `401`; insufficient role is `403`; invalid input `400`; missing scoped entity `404`; conflict `409`; rate limit `429`; uncategorized errors `500`; upstream provider failures commonly `502`.

All `/api/*` responses receive `Cache-Control: no-store` from `next.config.ts`, except a handler may add its own more specific header (for example the authenticated WhatsApp media proxy sets a one-day public cache header).

## Operational endpoint

| Method and path | Authentication | Contract |
|---|---|---|
| `GET /health` | Public | Returns HTTP `200` and `{ "status": "ok" }` with `Cache-Control: no-store, max-age=0`. Contains no dependency, host, version, or secret details. |
| `HEAD /health` | Public | Returns HTTP `204` with the same no-store policy and no body. |

The custom server starts listening only after Next is prepared and the PostgreSQL realtime listener is established. This route is suitable for the container/Dokploy startup healthcheck, but it is not a per-request deep provider/database diagnostic.

The externally consumable inbound surface represented in `api.http` and `test/test.sh` consists of these two health operations, the 16 method/path operations under `/api/v1`, Meta's `GET|POST /api/whatsapp/webhook`, and the two cron GET routes. Better Auth endpoints are a browser/auth-provider protocol rather than the scoped system-integration API, and customer event webhooks are outbound deliveries from FuryLeeds.

## Public API v1

### Authentication and limits

Send a key as:

```http
Authorization: Bearer furyleeds_live_<opaque-value>
```

A bare header value is accepted by the parser, but Bearer is the documented form. Keys can expire or be revoked. Migration `0005` revokes keys issued under the retired product prefix, so external clients must rotate to a newly generated `furyleeds_live_*` key. Each valid key has a fixed-window budget of 120 requests/minute per application process.

### Envelopes

Success:

```json
{ "data": {} }
```

Paginated list:

```json
{ "data": [], "meta": { "next_cursor": null } }
```

Failure:

```json
{ "error": { "code": "bad_request", "message": "Human-readable text" } }
```

Core error codes are `unauthorized`, `forbidden`, `rate_limited`, `bad_request`, `not_found`, and `internal`; domain paths may return additional machine codes such as WhatsApp/provider errors.

### Pagination

Contact, conversation and message lists use descending keyset order by `(created_at, id)`:

- `limit`: default 50, clamped to 1–100;
- `cursor`: opaque base64url cursor from `meta.next_cursor`;
- malformed cursors are treated as absent and restart at the first page.

### Endpoint contracts

| Method and path | Scope | Contract |
|---|---|---|
| `GET /api/v1/me` | valid key, no scope | Returns `{ account: { id, name }, key: { id, scopes } }`. Identity/key health probe. |
| `GET /api/v1/contacts` | `contacts:read` | Paginated contacts. Filters: sanitized `search`, tag ID via `tag`, plus common `limit/cursor`. |
| `POST /api/v1/contacts` | `contacts:write` | Body requires `phone`; optional `name`, `email`, `company`, string `tags[]`. Returns contact with 201 if created, 200 if an existing normalized identity is reused. |
| `GET /api/v1/contacts/{id}` | `contacts:read` | Returns one tenant contact or 404. |
| `PATCH /api/v1/contacts/{id}` | `contacts:write` | Optional `name`, `email`, `company` (string or null) and `tags[]`; only supplied fields change. |
| `GET /api/v1/conversations` | `conversations:read` | Paginated list; optional `status`, `contact_id`, `limit`, `cursor`. |
| `GET /api/v1/conversations/{id}` | `conversations:read` | One hydrated tenant conversation or 404. |
| `GET /api/v1/conversations/{id}/messages` | `messages:read` | Paginated messages for a tenant conversation or 404. |
| `POST /api/v1/messages` | `messages:send` | Resolve/create contact and conversation by `to`, then send and persist. Details below. |
| `POST /api/v1/broadcasts` | `broadcasts:send` | Create template campaign for 1–1,000 recipients and dispatch with `after()`. Returns 202. Details below. |
| `GET /api/v1/broadcasts/{id}` | `broadcasts:send` | Returns status and aggregate recipient counters for polling progress. |
| `GET /api/v1/webhooks` | `webhooks:manage` | Lists endpoints without secrets. Non-paginated list envelope with `next_cursor: null`. |
| `POST /api/v1/webhooks` | `webhooks:manage` | Requires valid HTTPS `url` and non-empty known `events[]`; returns endpoint plus plaintext signing secret once, status 201. |
| `GET /api/v1/webhooks/{id}` | `webhooks:manage` | Returns one secret-free endpoint. |
| `PATCH /api/v1/webhooks/{id}` | `webhooks:manage` | Updates one or more of HTTPS `url`, known `events[]`, boolean `is_active`; re-enabling resets failure count. |
| `DELETE /api/v1/webhooks/{id}` | `webhooks:manage` | Deletes endpoint and returns `{ id, deleted: true }`. |

#### `POST /api/v1/messages`

Request:

```json
{
  "to": "+14155550123",
  "name": "Jane Doe",
  "type": "text",
  "text": "Hello",
  "media_url": "https://public.example/file.pdf",
  "filename": "invoice.pdf",
  "template": {
    "name": "order_update",
    "language": "en_US",
    "params": ["A123"]
  },
  "interactive_payload": {},
  "reply_to_message_id": "internal-message-uuid"
}
```

- `to` is required and resolves a phone/WhatsApp identity.
- `type` defaults to `text`; supported send-core values are `text`, `template`, `interactive`, `image`, `video`, `document`, `audio`.
- `text` is body text or media caption.
- media types require `media_url`; document may include `filename`.
- template requires `template.name`; `params` may be a positional body array or a structured object for header/body/buttons.
- `reply_to_message_id`, when supplied, must belong to the resolved conversation.
- validation happens before creating a contact/conversation.

201 response data contains internal `message_id`, Meta `whatsapp_message_id`, `conversation_id`, `contact_id`, and `contact_created`.

#### `POST /api/v1/broadcasts`

Request:

```json
{
  "name": "July promo",
  "template_name": "promo_july",
  "template_language": "en_US",
  "recipients": [
    { "to": "+14155550123", "params": ["Jane"] },
    { "to": "+14155550124" }
  ]
}
```

`template_name` and a non-empty recipient array are required; max 1,000 per request. The broadcast and recipient rows are persisted synchronously. Sequential Meta fan-out runs in `after()` within a 60-second route bound. A near-cap batch can outlive that bound, so large sends should be split. The 202 response reports `broadcast_id`, `status: sending`, total/accepted and rejected recipients.

#### Outbound webhook events

Supported subscriptions:

- `message.received`;
- `message.status_updated`;
- `conversation.created`.

Delivery body:

```json
{
  "id": "event-uuid",
  "event": "message.received",
  "occurred_at": "ISO-8601",
  "account_id": "tenant-uuid",
  "data": {}
}
```

Headers include `X-FuryLeeds-Event`, `X-FuryLeeds-Webhook-Id`, and `X-FuryLeeds-Signature: t=<seconds>,v1=<hex-hmac>`. The rebrand is a deliberate breaking namespace change; receivers must update their header lookup. There is one attempt with a 5-second timeout; redirects are not followed; 15 consecutive failures disable the endpoint. See [Integrations](./integrations.md#outbound-customer-webhooks).

## Better Auth API

| Methods and path | Auth | Purpose |
|---|---|---|
| `GET, POST /api/auth/[...all]` | Better Auth protocol | Catch-all Better Auth endpoints for signup/sign-in/session, verification link, six-digit email-OTP password reset and optional Google OAuth. FuryLeeds uses `/email-otp/request-password-reset` and `/email-otp/reset-password`; exact protocol details remain owned by installed Better Auth `1.7.x`. |

## Account, membership and invitation API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/account` | Session | Current account/profile overview. |
| `PATCH /api/account` | Session; handler applies account/admin policy internally | Update account/profile settings accepted by the route; admin actions are rate-limited. |
| `GET /api/account/members` | Session | List account members and roles. |
| `PATCH /api/account/members/{userId}` | Admin | Change a member's account role, subject to owner safeguards. |
| `DELETE /api/account/members/{userId}` | Admin | Remove a member, subject to owner/self safeguards. |
| `POST /api/account/transfer-ownership` | Owner | Transfer ownership to another member transactionally. |
| `GET /api/account/invitations` | Admin | List invitations. |
| `POST /api/account/invitations` | Admin | Create one-time invitation; role cannot be owner; expiry defaults 7 days and caps at 365. Returns plaintext token/link once. |
| `DELETE /api/account/invitations/{id}` | Admin | Revoke/delete a scoped invitation. |
| `GET /api/invitations/{token}/peek` | Public, 30/min/IP | Returns valid account name/role/expiry or `ok:false` reason (`not_found`, `expired`, `used`). |
| `POST /api/invitations/{token}/redeem` | Session, 10/min/IP | Atomically consumes invitation, moves an empty newly-created personal profile into target account, and removes the empty personal account. Conflicts if caller already has shared/non-empty account data. |
| `GET /api/account/api-keys` | Session | Lists safe API-key metadata; no hashes/plaintext. |
| `POST /api/account/api-keys` | Admin | Creates key from validated scopes; plaintext returned once. |
| `DELETE /api/account/api-keys/{id}` | Admin | Revokes a key. |

## Contacts API (dashboard)

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/contacts` | Session | List/filter account contacts. |
| `POST /api/contacts` | Agent | Create contact. |
| `DELETE /api/contacts` | Agent | Bulk delete according to handler payload. |
| `GET /api/contacts/{id}` | Session | Contact detail. |
| `PATCH /api/contacts/{id}` | Agent | Update contact. |
| `DELETE /api/contacts/{id}` | Agent | Delete contact. |
| `GET /api/contacts/lookup` | Session | Lookup contact by route query criteria. |
| `POST /api/contacts/import` | Agent | Import contacts from request payload. |
| `GET /api/contacts/tags` | Session | Contact-tag resources. |
| `GET /api/contacts/{id}/tags` | Session | List contact tags. |
| `POST /api/contacts/{id}/tags` | Agent | Attach tag (`tag_id`). |
| `DELETE /api/contacts/{id}/tags` | Agent | Detach tag (`tag_id`). |
| `POST /api/contacts/{id}/notes` | Agent | Add contact note. |
| `DELETE /api/contacts/{id}/notes/{noteId}` | Agent | Delete scoped contact note. |
| `PUT /api/contacts/{id}/custom-values` | Agent | Upsert/synchronize custom values for contact. |
| `GET /api/contacts/custom-fields` | Session | List custom field definitions. |
| `POST /api/contacts/custom-fields` | Admin | Create custom field. |
| `PATCH /api/contacts/custom-fields/{id}` | Admin | Update custom field. |
| `DELETE /api/contacts/custom-fields/{id}` | Admin | Delete custom field and cascading values. |
| `GET /api/tags` | Viewer | List account tags. |
| `POST /api/tags` | Admin | Create tag. |
| `DELETE /api/tags/{id}` | Admin | Delete tag and joins. |

## Inbox, notification and presence API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/inbox` | Viewer | Hydrated conversation list; `conversation_id` is used by realtime rehydration. |
| `GET /api/inbox/resources` | Viewer | Inbox supporting resources. |
| `GET /api/inbox/conversations/{id}` | Viewer | Thread/conversation detail. |
| `PATCH /api/inbox/conversations/{id}` | Agent | Update status/assignment/read state accepted by handler. |
| `GET /api/inbox/contacts/{id}` | Viewer | Inbox contact detail. |
| `POST /api/inbox/contacts/{id}/notes` | Agent | Add note from inbox workflow. |
| `GET /api/notifications` | Session | List user's account notifications. |
| `GET /api/notifications/messages` | Session | Message-oriented notification feed. |
| `GET /api/notifications/summary` | Session | `total_unread` and `unread_notifications`, used after realtime invalidation. |
| `PATCH /api/notifications/{id}` | Session | Mark/update a notification belonging to current user. |
| `PATCH /api/notifications/read-all` | Session | Mark all current-user notifications read. |
| `GET /api/presence` | Session | List persisted account presence. |
| `POST /api/presence` | Session | Upsert own status; body status must be `online` or `away`. |

## WhatsApp configuration, messaging and media API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/whatsapp/config` | Viewer | Verify stored config against Meta; returns `connected:false` diagnostic states as HTTP 200 for UI rendering. |
| `POST /api/whatsapp/config` | Admin | Validate server encryption configuration before provider effects; reject reusing `ENCRYPTION_KEY` as `verify_token`; validate numeric IDs/token/WABA pairing/PIN, register number, subscribe WABA, encrypt and upsert one account config. Invalid master-key configuration returns 500; secret reuse and invalid inputs return 400. |
| `DELETE /api/whatsapp/config` | Admin | Remove/reset account WhatsApp configuration. |
| `GET /api/whatsapp/config/details` | Viewer | Safe configuration details (without plaintext token). |
| `PATCH /api/whatsapp/config/details` | Admin | Update supported non-secret details, including configuration options. |
| `GET /api/whatsapp/config/verify-registration` | Viewer | Diagnose phone registration/WABA app subscription. |
| `POST /api/whatsapp/send` | Agent, 60/min/user | Send by `conversation_id` or `contact_id`; supports text/template/interactive/media/reply and returns internal and Meta IDs. |
| `POST /api/whatsapp/react` | Agent, 120/min/user | Body `{ message_id, emoji }`; empty emoji removes reaction. Sends Meta reaction then mirrors DB state. |
| `GET /api/whatsapp/media/{mediaId}` | Session | Fetches Meta metadata and bytes using tenant token, then proxies content. |
| `GET /api/whatsapp/webhook` | Public Meta verification | Requires `hub.mode=subscribe`, challenge and a verify token matching any encrypted config; returns challenge text. |
| `POST /api/whatsapp/webhook` | Meta signature | Raw-body HMAC verification, 200 acknowledgement, background inbound/status/template processing; max duration 60 seconds. |

`POST /api/whatsapp/send` requires `message_type` and either `conversation_id` or `contact_id`. Fields consumed are `content_text`, `media_url`, `filename`, `template_name`, `template_language`, `template_params`, `template_message_params`, `interactive_payload`, and `reply_to_message_id`.

## Broadcast and template API (dashboard)

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/whatsapp/broadcast` | Viewer | List account broadcasts. |
| `POST /api/whatsapp/broadcast` | Agent, 60/min/user | Dispatch recipient batches for a campaign. |
| `POST /api/whatsapp/broadcast/create` | Agent | Create campaign/audience records. |
| `GET /api/whatsapp/broadcast/{id}` | Viewer | Broadcast detail/progress. |
| `DELETE /api/whatsapp/broadcast/{id}` | Agent | Delete a scoped broadcast. |
| `POST /api/whatsapp/broadcast/{id}/resume` | Agent | Resume by status scope; max 1,000 recipients, delivery lock stale after 30 minutes. |
| `GET /api/whatsapp/broadcast/resources` | Viewer | Templates/tags/supporting broadcast resources. |
| `POST /api/whatsapp/broadcast/resources` | Viewer | Resolve/preview audience resources according to handler payload. |
| `GET /api/templates` | Viewer | Read local message templates for UI. |
| `PATCH /api/whatsapp/templates/{id}` | Admin | Edit local/Meta template as supported; dry-run environment flag honored. |
| `DELETE /api/whatsapp/templates/{id}` | Admin | Delete local/Meta template as supported. |
| `POST /api/whatsapp/templates/submit` | Admin | Validate and submit template to Meta; supports dry-run. A completed request rejected by Meta returns JSON with HTTP `424` so reverse proxies do not replace the actionable provider error with a generic `502` page; Meta rate limits remain `429`. |
| `POST /api/whatsapp/templates/sync` | Admin | Synchronize templates/status from Meta. |

## Files API

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/files` | Session | Multipart fields `collection` and `file`; validates type/size, uploads to Imgora, returns `{ path, publicUrl }`, status 201. |
| `GET /api/files/{collection}/{reference}` | Session | Validates signed one-segment reference against current account/collection and redirects to Imgora CDN URL. |
| `DELETE /api/files/{collection}/{reference}` | Session | Validates same binding and deletes provider asset. |

Collections are `avatars`, `chat-media`, `flow-media`; limits are documented in [Security](./security.md#file-and-media-security).

## Pipelines and deals API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/pipelines` | Viewer | List pipelines. |
| `POST /api/pipelines` | Admin | Create pipeline. |
| `GET /api/pipelines/{id}` | Viewer | Pipeline with stages/deals. |
| `PATCH /api/pipelines/{id}` | Admin | Update pipeline. |
| `DELETE /api/pipelines/{id}` | Admin | Delete pipeline and cascading children. |
| `POST /api/pipelines/{id}/stages` | Admin | Create stage. |
| `DELETE /api/pipelines/{id}/stages/{stageId}` | Admin | Delete scoped stage subject to handler constraints. |
| `POST /api/pipelines/{id}/deals` | Agent | Create deal in pipeline. |
| `PATCH /api/pipelines/{id}/deals/{dealId}` | Agent | Update/move deal. |
| `DELETE /api/pipelines/{id}/deals/{dealId}` | Agent | Delete deal. |
| `GET /api/pipelines/resources` | Viewer | Pipeline supporting contacts/members/resources. |
| `PATCH /api/pipelines/settings` | Admin | Update pipeline/account settings accepted by handler (including currency workflow). |

## Automations API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/automations` | Viewer | List automations. |
| `POST /api/automations` | Agent | Create automation. |
| `GET /api/automations/{id}` | Viewer | Automation and steps. |
| `PATCH /api/automations/{id}` | Agent | Update automation/steps. |
| `DELETE /api/automations/{id}` | Agent | Delete automation. |
| `POST /api/automations/{id}/duplicate` | Agent | Clone automation definition. |
| `GET /api/automations/{id}/logs` | Viewer | Execution log list. |
| `GET /api/automations/resources` | Viewer | Contacts/tags/templates/resources for builder. |
| `POST /api/automations/engine` | Agent | Manually invoke/test engine for supported request trigger. |
| `GET /api/automations/cron` | Cron | Atomically claims/resumes up to 50 due delayed executions; returns `{ processed }`. |

## Flows API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/flows` | Viewer | List flows. |
| `POST /api/flows` | Agent | Create flow. |
| `GET /api/flows/{id}` | Viewer | Flow with graph. |
| `PUT /api/flows/{id}` | Agent | Replace/update flow definition and nodes. |
| `DELETE /api/flows/{id}` | Agent | Delete flow and cascading execution data. |
| `POST /api/flows/{id}/activate` | Agent | Validate/activate flow. |
| `GET /api/flows/{id}/runs` | Viewer | List execution runs/events. |
| `GET /api/flows/templates` | Viewer | Built-in flow templates. |
| `GET /api/flows/cron` | Cron | Scans active runs, applies each flow's timeout policy, records timeout events; returns `{ swept }`. |

## AI API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/ai/config` | Viewer | Safe account AI config; API keys are not returned. |
| `POST /api/ai/config` | Admin | Validate and upsert provider/model/keys/prompt/auto-reply settings. |
| `DELETE /api/ai/config` | Admin | Delete account AI configuration. |
| `POST /api/ai/test` | Admin | Test configured/provider credentials. |
| `POST /api/ai/draft` | Agent; 20/min/user and 60/min/account | Generate a draft from conversation context/knowledge without automatically sending. |
| `POST /api/ai/playground` | Agent | Generate against supplied playground context using account config. |
| `POST /api/ai/autoreply/{conversationId}` | Agent, send-rate bucket | Pause/resume AI auto-reply takeover for a tenant conversation (`paused` boolean). |
| `GET /api/ai/knowledge` | Viewer | List knowledge documents. |
| `POST /api/ai/knowledge` | Admin | Create and ingest document/chunks. |
| `GET /api/ai/knowledge/{id}` | Viewer | Read one document. |
| `PATCH /api/ai/knowledge/{id}` | Admin | Update and re-ingest document. |
| `DELETE /api/ai/knowledge/{id}` | Admin | Delete document and cascading chunks. |
| `POST /api/ai/knowledge/reindex` | Admin | Rebuild knowledge chunks/embeddings. |
| `GET /api/ai/usage` | Admin | Account AI token usage. |

Provider timeout defaults to 30 seconds, recent context to 20 messages, and generated output is capped at 1,024 tokens. The per-conversation auto-reply maximum is constrained to 1–20.

## Dashboard and settings API

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/dashboard/activity` | Session | Recent account activity. |
| `GET /api/dashboard/conversations` | Session | Dashboard conversation series/summary. |
| `GET /api/dashboard/metrics` | Session | Account KPI summary. |
| `GET /api/dashboard/pipeline` | Session | Pipeline dashboard aggregation. |
| `GET /api/dashboard/response-time` | Session | Response-time aggregation. |
| `GET /api/settings/overview` | Viewer | Consolidated safe settings/status overview. |
| `GET /api/quick-replies` | Session | List quick replies. |
| `POST /api/quick-replies` | Agent | Create text/interactive quick reply. |
| `PATCH /api/quick-replies/{id}` | Agent | Update scoped quick reply. |
| `DELETE /api/quick-replies/{id}` | Agent | Delete scoped quick reply. |

## Compatibility boundaries

- `/api/v1` is explicitly versioned and has a stable envelope; internal dashboard routes are not.
- Better Auth subroutes are controlled by the installed Better Auth package.
- Socket.IO has a separate event contract in [Realtime](./realtime.md#socket-contract).
- Meta webhook and Graph contracts are external and pinned in adapter code to Graph API `v21.0`.
- The public API has no OpenAPI document in this repository; this document and route code are the current contract references.
