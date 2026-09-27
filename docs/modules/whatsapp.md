# WhatsApp integration

Related: [Inbox](inbox-and-messaging.md) · [Broadcasts](broadcasts.md) · [Files/media](files-and-media.md) · [Flows](flows.md) · [AI](ai.md)

## Purpose and ownership

Owns Meta WhatsApp Cloud API credentials/configuration, number registration and WABA subscription, outbound transport, inbound webhook processing, status/reaction handling, WhatsApp identity, media retrieval/mirroring, and message-template lifecycle.

## Important source paths

- `src/lib/whatsapp/*` (notably `meta-api.ts`, `send-message.ts`, `wa-identity.ts`, `webhook-signature.ts`, template helpers)
- `src/app/api/whatsapp/config/**`, `send`, `react`, `media`, `templates/**`, `webhook`
- `src/lib/whatsapp/encryption.ts`, `src/lib/whatsapp/mirror-inbound-media.ts`

## Data model

- `whatsapp_config`: one row per account and unique phone-number ID; encrypted access token, verify token, WABA, connection/registration/subscription state, media-mirroring toggle.
- `message_templates`: tenant catalog with Meta ID, category/language/components, local samples/header handle/media, status/quality/rejection/submission metadata.
- Uses `contacts`, `conversations`, `messages`, `message_reactions`, broadcast rows, and downstream flow/automation/AI tables.
- Integration and AI/webhook secrets use AES-256-GCM via `ENCRYPTION_KEY`.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/whatsapp/config` | GET | Viewer+; validates saved credentials/state against Meta without exposing token. |
| `/api/whatsapp/config` | POST, DELETE | Admin+; validate pairing, register number, subscribe WABA, encrypt/upsert or disconnect. |
| `/api/whatsapp/config/details` | GET, PATCH | Viewer reads metadata; admin toggles inbound media mirroring. |
| `/api/whatsapp/config/verify-registration` | GET | Viewer+; verifies number and app subscription state. |
| `/api/whatsapp/send` | POST | Agent+ rate-limited text/template/interactive/media send. |
| `/api/whatsapp/react` | POST | Agent+ rate-limited reaction mutation. |
| `/api/whatsapp/media/:mediaId` | GET | Session; tenant credentialed Meta media proxy. |
| `/api/templates` | GET | Viewer+; local template catalog. |
| `/api/whatsapp/templates/submit` | POST | Admin+; validate/create local row and submit to Meta. |
| `/api/whatsapp/templates/sync` | POST | Admin+; import/update templates from Meta. |
| `/api/whatsapp/templates/:id` | PATCH, DELETE | Admin+; edit/delete locally and at Meta; supports dry-run behavior. |
| `/api/whatsapp/webhook` | GET | Meta challenge verification against configured verify tokens. |
| `/api/whatsapp/webhook` | POST | Public Meta callback; raw-body HMAC verification, fast acknowledgement, processing in `after()`. |

Broadcast endpoints are in [Broadcasts](broadcasts.md).

## Main flows

### Inbound

1. Verify `X-Hub-Signature-256` over exact raw bytes; parse JSON; return 200 and process in `after()`.
2. Route template-status/quality events separately.
3. Resolve unique `whatsapp_config.phone_number_id`; decrypt token.
4. Resolve phone/BSUID identity, find/create contact and conversation.
5. Apply reactions without inserting a message; otherwise parse/mirror media and resolve quoted parent.
6. Idempotently insert by `(conversation_id,message_id)` before unread/fan-out effects.
7. Update/reopen conversation and broadcast reply state.
8. Dispatch flows, automations, AI and outbound public webhooks in that priority.

### Outbound

Validate payload, load account conversation/contact/config, prefer phone then BSUID, retry recipient-format variants only for Meta recipient errors, persist a sent row, update conversation, and pause active flows.

### Templates

Validate Meta limits and contiguous variables, generate canonical components, upload media-header samples through resumable upload, submit/edit/delete, synchronize catalog, and consume lifecycle webhooks. Unknown lifecycle templates may create a tenant-resolved stub.

## Authorization and tenant boundary

Human endpoints use viewer/admin/agent roles. Public webhook tenancy is derived only from unique Meta identifiers (`phone_number_id` or WABA for template events), never request-supplied account IDs. All subsequent writes carry or join the resolved account.

## Realtime/events

Message/conversation/reaction DB triggers drive Socket.IO. Webhook processing emits public events `conversation.created`, `message.received`, and `message.status_updated`. Broadcast status changes emit broadcast realtime events.

## Failure modes

- Bad webhook signature → 401; malformed JSON → 400.
- No/multiple configs for a phone number → event logged and dropped to avoid cross-tenant guessing.
- Missing phone and BSUID → inbound dropped/outbound 400.
- Decryption/key mismatch, Meta OAuth/permission/ID/PIN/restriction/rate errors, registration mismatch.
- Duplicate inbound is a deliberate no-op; status transitions cannot regress.
- Media mirroring is best-effort; proxy URL remains fallback when possible.
- `after()` work remains bounded by route `maxDuration`.

## Tests

Extensive coverage exists in `test/app/api/whatsapp/*` and `test/lib/whatsapp/*`: signatures, registration/pairing, Meta payloads/errors, phone and BSUID identities, idempotent webhook behavior, media, encryption, templates, sends, reactions and status transitions.

## Extension rules

- Keep raw-body verification before parsing and idempotency before all fan-out.
- Add Meta message/template types through schema checks, parsers, send builders, persistence and tests together.
- Never expose or store plaintext credentials. Keep `ENCRYPTION_KEY` server-only and distinct from the webhook verification token shared with Meta.
- Do not infer a tenant when Meta identifiers are absent or ambiguous.
- Preserve monotonic delivery/recipient status handling and fast webhook acknowledgement.
