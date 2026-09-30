# External Integrations

Related: [Architecture](./architecture.md) · [API contracts](./api-contracts.md) · [Security](./security.md) · [Realtime](./realtime.md)

> Variable names are documented without values. Never place credentials in this document, source control, browser code or logs.

## Integration matrix

| Integration | Direction | Primary use | Credentials/config |
|---|---|---|---|
| PostgreSQL | outbound + LISTEN | Durable state, migrations, realtime notifications | `DATABASE_URL` |
| Better Auth | internal library + browser protocol | Sessions, password/email verification, Google OAuth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, optional Google pair |
| ChatSend | outbound HTTPS | Verification, password-reset OTP, welcome, and password-change confirmation email | `CHATSEND_BASE_URL`, `CHATSEND_API_KEY` |
| Imgora | outbound HTTPS | Account-partitioned file/media storage | `IMGORA_API_URL`, `IMGORA_API_KEY`, `IMGORA_ORIGIN`, `IMGORA_BASE_FOLDER` |
| Meta WhatsApp Cloud API | bidirectional HTTPS | Messages, reactions, media, templates, number/WABA setup and webhooks | encrypted per-account token/config; `META_APP_ID`, `META_APP_SECRET` |
| OpenAI | outbound HTTPS | Chat replies and optional knowledge embeddings | account-provided keys in AI config |
| Anthropic | outbound HTTPS | Chat replies | account-provided key in AI config |
| Customer webhooks | outbound HTTPS | Deliver CRM domain events | generated per-endpoint signing secret |
| External scheduler | inbound HTTPS | Resume delayed automations and expire stale flow runs | `AUTOMATION_CRON_SECRET` |

## ChatSend

### Purpose and call sequence

FuryLeeds renders Spanish plain-text plus escaped HTML for four authentication lifecycle messages:

- a one-hour email-verification link after password signup;
- a six-digit password-reset OTP, valid for 10 minutes;
- a welcome message after email verification, or after creation when an OAuth provider already verified the email;
- a security confirmation after a password is changed successfully.

Each send calls the ChatSend adapter:

1. `POST {CHATSEND_BASE_URL}/oauth/token`
   - JSON: `{ "grantType": "apiKey", "apiKey": "…" }`;
   - expects `data.accessToken` in a successful JSON response.
2. `POST {CHATSEND_BASE_URL}/api/v1/client/emails`
   - `Authorization: Bearer <access-token>`;
   - `Idempotency-Key`;
   - direct content containing recipient, subject, text and HTML;
   - success is specifically HTTP `202`.

`CHATSEND_BASE_URL` is normalized by removing trailing slashes, must use HTTP(S), and must use HTTPS in production. Both provider calls have a 10-second timeout. Authentication/token acquisition occurs for each send; there is no token cache or automatic retry.

Verification and welcome messages use deterministic event keys. The reset OTP key contains only a SHA-256 digest of normalized recipient plus OTP, not plaintext recipient/code. Generic calls construct a SHA-256-derived prefix plus a random UUID, so separately completed password changes are not accidentally deduplicated.

### Password-reset OTP behavior

Better Auth's email-OTP plugin stores only a hash of the six-digit code in `verification`, permits five attempts, expires it after 600 seconds, rotates it on resend, and limits requests to three per minute using Better Auth's configured limiter. Passwordless sign-in/signup and OTP email verification are not enabled by this integration: the mail callback rejects every OTP type except `forget-password`.

The public request response is deliberately non-enumerating. ChatSend delivery runs through Better Auth's configured `advanced.backgroundTasks.handler`, so provider latency does not reveal whether a user exists. The long-lived Bun process owns that promise; it is process-bound and is not a durable queue. Provider failure is logged without recipient, code, body, URL, or credentials.

### Failure behavior

Missing URL/key, invalid URL/protocol, insecure production HTTP, non-2xx token responses, malformed/missing access tokens, timeout/network errors, and non-202 enqueue responses fail explicitly inside the adapter. Better Auth's mail runner catches and logs verification callback failures, so signup may complete while activation remains blocked until a verification message can actually be delivered; the signup UI therefore instructs the user to check their inbox without claiming provider acceptance. Welcome and post-password-change messages are best-effort after the underlying identity mutation has succeeded, so their failure is reported to operators but does not turn a completed verification/password change into a false client failure.

## Imgora storage

### Configuration and transport

All four values are required when storage is used:

- `IMGORA_API_URL`: HTTP(S) provider API base;
- `IMGORA_API_KEY`: Bearer credential;
- `IMGORA_ORIGIN`: parsed URL; only its origin is sent as `X-Imgora-Origin`;
- `IMGORA_BASE_FOLDER`: one or more safe path segments.

Provider requests use a 120-second timeout. Network/timeout errors map to storage `502`; selected provider statuses (`400`, `404`, `409`, `413`) are preserved, and other failures map to `502`.

### Upload

`POST /api/files` receives authenticated multipart `collection` and `file`. Server-side policy checks MIME and byte size before provider access. Imgora endpoint is selected by resource type:

```text
/image/pro/upload
/video/pro/upload
/audio/pro/upload
/file/pro/upload
```

Multipart fields are `file`, `folder`, and `filename`. Provider response must contain `data.public_id` and a valid HTTP(S) `data.secure_url`.

Provider folders include base folder, collection and an account-prefixed path, preventing normal path collision between tenants. Collections:

- `avatars`;
- `chat-media`;
- `flow-media`.

Limits and MIME allow-list are in [Security](./security.md#file-and-media-security).

### References, reads and deletion

The application returns:

- `publicUrl`: provider CDN URL, required when Meta must fetch outbound media;
- `path`: opaque signed reference.

The reference serializes version, account ID, collection, public ID and type; it is HMAC-SHA256 signed with `ENCRYPTION_KEY` or fallback `BETTER_AUTH_SECRET`. Authenticated GET/DELETE routes validate signature, account and collection before calling:

- `GET {IMGORA_API_URL}/resources/{publicId}?type={type}`;
- `DELETE {IMGORA_API_URL}/assets/{publicId}`.

GET redirects to the returned CDN URL.

### Inbound WhatsApp media mirror

When `whatsapp_config.mirror_inbound_media` is not false, the webhook downloads Meta media and best-effort uploads it to Imgora under `chat-media/account-<id>/inbound`. Size is checked using Meta metadata and again after download. On any failure the webhook keeps the short-lived Meta proxy URL/fallback and continues; mirroring must not reject the inbound message.

## Meta WhatsApp Cloud API

### API base and tenant configuration

The adapter pins Graph API `v21.0` at `https://graph.facebook.com/v21.0`. Each CRM account has at most one `whatsapp_config`; a phone number ID is globally unique in the instance.

Stored fields include numeric `phone_number_id`, optional WABA ID, encrypted access/verify tokens, connection/registration/subscription status and media-mirroring toggle. AES-256-GCM encryption uses the server-only `ENCRYPTION_KEY`; access tokens are decrypted only server-side. The webhook verification token is a separate customer-created secret shared with Meta and must never reuse the master encryption key.

### Connect/setup sequence

`POST /api/whatsapp/config` (admin) performs, in order:

1. validates required access token and phone number ID;
2. rejects non-numeric Meta IDs and invalid non-empty PIN (must be six digits);
3. rejects a phone number already claimed by a different account;
4. verifies the number with `GET /{phone-number-id}?fields=id,display_phone_number,verified_name,quality_rating`;
5. when WABA is supplied, lists up to five pages of 100 WABA numbers and verifies that the phone number belongs to it;
6. validates the server-only 64-hex-character `ENCRYPTION_KEY`, rejects using that master key as the webhook verification token, and encrypts credentials;
7. for a new/changed number or supplied PIN, optionally calls `POST /{phone-number-id}/register` with `messaging_product: whatsapp` and PIN;
8. calls idempotent `POST /{waba-id}/subscribed_apps` when WABA is present;
9. inserts/updates the account config.

Registration is deliberately skipped when no PIN is supplied, allowing Meta test numbers to be saved. A registration failure is persisted as disconnected and returned as a structured successful-save/error state; WABA subscription failure aborts before persistence. Existing same-number registrations are not re-registered without a fresh PIN.

Health checks verify the token against Meta and, when possible, inspect subscribed apps. `META_APP_ID` lets diagnostics distinguish whether the matching app is subscribed.

### Outbound messages

All sends use `POST /{phone-number-id}/messages` with Bearer authorization and `messaging_product: whatsapp`.

Supported adapter operations:

- free-form text, optionally replying with Meta `context.message_id`;
- image/video/document/audio by public URL;
- approved templates with body/header/media/button parameters;
- reactions (empty emoji removes);
- typing indicator/read status;
- interactive reply buttons and lists.

Recipients may be ordinary phone numbers (`to`, recipient type individual) or Meta business-scoped user IDs (`recipient`). The identity adapter detects BSUID format.

Free-form messages are subject to Meta's 24-hour customer-service window; approved templates are required outside it/for first contact. Audio omits caption and filename. Media captions are treated as limited to 1,024 characters by the adapter contract.

Interactive limits enforced in adapter code:

| Item | Limit |
|---|---:|
| Reply buttons | 3 |
| Button title | 20 chars |
| List sections | 10 |
| Total list rows | 10 |
| List row title | 24 chars |
| List row description | 72 chars |
| Body | 1,024 chars |
| Footer | 60 chars |
| Text header | 60 chars |

### Templates

The adapter supports:

- resumable media upload using `META_APP_ID` and the account access token, with each session/upload request bounded to 20 seconds;
- `POST /{waba-id}/message_templates` submission, bounded to 20 seconds;
- `POST /{meta-template-id}` editing;
- `DELETE /{waba-id}/message_templates?name=...&hsm_id=...` deletion;
- local synchronization and webhook-driven status/quality/components updates.

Local validation limits include body 1,024, footer 60, text header 60, button text 25, 10 total buttons, max 2 URL buttons, 1 phone button, 1 copy-code button, and lowercase/digit/underscore names up to 512 characters. `WHATSAPP_TEMPLATES_DRY_RUN=true|1` avoids live mutation in supported template handlers.

### Inbound webhook

Meta is configured to call `/api/whatsapp/webhook`.

Verification GET accepts `hub.mode`, `hub.challenge`, and `hub.verify_token`; it decrypts stored verify tokens and returns challenge text only on a match.

POST security and processing:

1. reads raw body;
2. validates HMAC-SHA256 header with every comma-separated `META_APP_SECRET` candidate; missing configuration fails closed;
3. parses JSON;
4. schedules processing in Next `after()` and acknowledges 200;
5. resolves the account by unique `metadata.phone_number_id`;
6. handles message statuses, inbound messages/reactions and template lifecycle events.

Inbound processing supports phone and username/BSUID identities, contact/conversation find-or-create, text/media/location/interactive/template-button replies, swipe-reply context, broadcast reply attribution, delivery error details, optional media mirror, automation/flow/AI dispatch and outbound customer webhooks.

Meta status webhook delivery may be repeated/out of order. Message rows are updated by Meta ID; broadcast recipient transitions are guarded against regression. Contact/conversation/message uniqueness and conflict handling provide insertion idempotency where declared.

The route acknowledges before processing but uses `after()` rather than a detached promise. Work is still bounded by `maxDuration = 60`; there is no durable inbound queue in this repository.

### Media retrieval

`GET /api/whatsapp/media/{mediaId}` uses the current account's encrypted token to:

1. fetch media metadata from `GET /{media-id}`;
2. download the returned URL with Bearer authorization;
3. proxy bytes with provider/metadata content type.

This avoids exposing the access token. Mirrored Imgora media is preferred for longer-lived storage when enabled.

### Meta errors

`MetaApiError` retains Graph message, numeric code/subcode, type, `fbtrace_id`, HTTP status and WhatsApp details. Configuration routes translate errors into actionable `error` plus a safe `meta` object and use `400` for caller-fixable input/credential problems or `502` for upstream conditions. Tokens are not included.

## AI providers

### Account-controlled configuration

Each account may have one config with provider `openai` or `anthropic`, model (free text), API key, optional separate embeddings key, prompt, enable flags, handoff agent and per-conversation auto-reply maximum (1–20). Keys are supplied by the account (“BYO key”). The current database fields are plaintext text columns; no application-layer encryption is visible for AI keys.

### OpenAI

- Chat: `POST https://api.openai.com/v1/chat/completions`.
- Embeddings: `POST https://api.openai.com/v1/embeddings`.
- Default UI model: `gpt-5.4-mini` (editable, not an allow-list).
- Embedding model: `text-embedding-3-small`, expected 1,536 dimensions.
- Embedding batches: 96 texts.

### Anthropic

- `POST https://api.anthropic.com/v1/messages`.
- Header `anthropic-version: 2023-06-01`.
- Default UI model: `claude-haiku-4-5-20251001` (editable).
- Consecutive roles are merged; leading assistant messages are dropped so payload begins with a user turn.
- Anthropic has no embedding path here; optional embeddings always use OpenAI and may use a separate key.

### Shared behavior and limits

- default provider request timeout: 30 seconds (`AI_REQUEST_TIMEOUT_MS` overrides with a positive number);
- default recent context: 20 text messages (`AI_CONTEXT_MESSAGE_LIMIT` overrides);
- generation cap: 1,024 output tokens;
- account prompt is appended to a fixed safety/prompt-injection scaffold;
- auto-reply can emit `[[HANDOFF]]`, which is parsed as human handoff;
- usage is persisted by provider/model/mode;
- knowledge documents are paragraph-aware chunks of at most 1,200 characters by default;
- semantic retrieval is best-effort and falls back to PostgreSQL FTS.

See the current vector schema mismatch in [Database](./database.md#known-schema-and-migration-limits).

## Outbound customer webhooks

### Registration

Managed only through `/api/v1/webhooks` with `webhooks:manage`. URLs must be HTTPS. Secrets are generated as `whsec_` + 32 random bytes, encrypted in the DB and returned only at creation.

### Delivery and verification

The dispatcher selects active account endpoints subscribed to the event and sends all concurrently via `Promise.allSettled`. Each request:

- is DNS-checked against private/reserved targets immediately before delivery;
- uses POST JSON;
- does not follow redirects;
- times out in 5 seconds;
- carries event, endpoint ID and timestamped HMAC headers.

Payload signing is over `<unix-seconds>.<exact-raw-body>` with HMAC-SHA256. Receivers should constant-time compare and reject stale timestamps; project verifier default tolerance is 300 seconds.

There is no retry queue. Success resets `failure_count` and updates `last_delivery_at`; failure increments the count and disables at 15. Re-enabling via PATCH resets failures. DNS rebinding remains a documented residual SSRF risk.

## External scheduler

No scheduler product is embedded. Operators must periodically call:

- `GET /api/automations/cron` to resume up to 50 due delayed executions per call;
- `GET /api/flows/cron` to sweep stale active flow runs.

Both use `x-cron-secret`. The flow sweep loads all active runs in the current implementation and evaluates each flow's timeout hours. Overlapping automation calls are safe from duplicate claiming through `FOR UPDATE SKIP LOCKED`.

## Environment variable reference

| Variable | Sensitive | Used by |
|---|---:|---|
| `DATABASE_URL` | yes | DB, migrations, realtime |
| `BETTER_AUTH_URL` | no (origin only) | Better Auth, links, socket origin |
| `BETTER_AUTH_SECRET` | yes | Better Auth; fallback reference signing |
| `SUPERADMIN_EMAILS` | operationally sensitive | Auth creation hook |
| `GOOGLE_CLIENT_ID` | no/identifier | Optional OAuth |
| `GOOGLE_CLIENT_SECRET` | yes | Optional OAuth |
| `CHATSEND_BASE_URL` | no | ChatSend |
| `CHATSEND_API_KEY` | yes | ChatSend |
| `ENCRYPTION_KEY` | yes | WhatsApp/webhook encryption; reference signing |
| `META_APP_ID` | no/identifier | Meta diagnostics/resumable upload |
| `META_APP_SECRET` | yes | Meta webhook signatures; comma-separated rotation/multi-app supported |
| `WHATSAPP_TEMPLATES_DRY_RUN` | no | Template routes |
| `IMGORA_API_URL` | no | Imgora |
| `IMGORA_API_KEY` | yes | Imgora |
| `IMGORA_ORIGIN` | no | Imgora origin header |
| `IMGORA_BASE_FOLDER` | no | Imgora namespacing |
| `AI_REQUEST_TIMEOUT_MS` | no | AI timeout |
| `AI_CONTEXT_MESSAGE_LIMIT` | no | AI prompt context |
| `AUTOMATION_CRON_SECRET` | yes | Cron routes |
| `PORT`, `NODE_ENV` | no | Process runtime; bind address is fixed by development/production mode |

## Operational limits across integrations

- No general durable queue/retry subsystem exists.
- ChatSend has a 10-second timeout per token/send request and no automatic retry.
- Imgora has a 120-second per-request timeout.
- AI defaults to 30 seconds and uses account-funded keys/quotas.
- Customer webhooks get one 5-second attempt.
- Public and dashboard broadcasts are capped at 1,000 recipients/request; sequential background fan-out may exceed 60 seconds.
- Meta itself enforces messaging windows, template approval and number throughput; FuryLeeds does not replace those limits.
- Provider calls may transfer customer conversation text, contact identifiers, files and knowledge excerpts outside the deployment. Operators must evaluate provider privacy, retention, region and cost policies.
