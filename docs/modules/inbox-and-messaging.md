# Inbox and messaging

Related: [Contacts](contacts.md) · [WhatsApp](whatsapp.md) · [Flows](flows.md) · [AI](ai.md) · [Notifications](notifications-and-presence.md)

## Purpose and ownership

Owns CRM conversations and message-thread presentation: inbox listing, contact filters, thread reads, assignment/status/read state, reactions, replies, quick replies, and the durable representation of inbound/outbound messages. Meta transport belongs to [WhatsApp](whatsapp.md).

## Important source paths

- `src/app/api/inbox/**`, `src/app/api/quick-replies/**`
- `src/lib/inbox/conversations.ts`, `src/lib/conversations/reopen.ts`
- `src/lib/whatsapp/send-message.ts`, `interactive.ts`
- `src/lib/media/{gallery,filename,download,blob-cache}.ts`
- `src/lib/realtime/{events,client}.ts`

## Data model

- `conversations`: unique `(account_id,contact_id)`, status `open|pending|closed`, assignee user ID, last-message projection, unread count, AI state.
- `messages`: sender `customer|agent|bot`; content `text|image|document|audio|video|location|template|interactive`; Meta message ID, status, media, template, reply link, interactive payload/reply ID, AI/error metadata.
- Unique `(conversation_id,message_id)` is the inbound idempotency boundary.
- `message_reactions`: unique message + actor type/id.
- `quick_replies`: account-owned text or validated interactive payload.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/inbox` | GET | Viewer+; conversations + contacts/tags; optional conversation filter; WhatsApp connection state. |
| `/api/inbox/resources` | GET | Viewer+; account members and approved templates. |
| `/api/inbox/conversations/:id` | GET | Viewer+; thread messages and reactions. |
| `/api/inbox/conversations/:id` | PATCH | Agent+; status, assignment, or mark unread count to zero. |
| `/api/inbox/contacts/:id` | GET | Viewer+; contact detail. |
| `/api/inbox/contacts/:id/notes` | POST | Agent+; inbox convenience alias for contact notes. |
| `/api/quick-replies` | GET, POST | Member reads; agent+ creates text/interactive reply. |
| `/api/quick-replies/:id` | PATCH, DELETE | Agent+; tenant-scoped mutation. |
| `/api/whatsapp/send` | POST | Agent+; sends and persists one message. |
| `/api/whatsapp/react` | POST | Agent+; add/change/remove agent reaction. |

## Main flows

- Inbox list joins contacts and batches contact tags; UI-side helpers apply OR within selected tags and AND across tag/company facets.
- Thread load verifies conversation ownership before loading messages/reactions.
- Assignment verifies the assignee is a profile in the same account. Mark-read accepts only `unread_count: 0`.
- Outbound send validates before DB side effects, resolves phone/BSUID, sends to Meta, persists message, updates conversation projection, and best-effort pauses active flows as `paused_by_agent`.
- Inbound insert bumps unread count, reopens a closed conversation, and updates the last-message projection.

## Authorization and tenant boundary

All conversation entry points constrain `conversations.account_id`; messages/reactions inherit tenancy only through a verified conversation join. Reply targets must belong to the same conversation. Assignment targets must be same-account profiles.

## Realtime/events

PostgreSQL emits `conversation:changed` account-wide, `thread:changed` to joined conversation rooms, `summary:changed`, and `browser-message:created` for customer inserts. Thread joining is authorized against the socket's account.

## Failure modes

- Missing/foreign conversation or assignee → 404.
- Invalid status/assignment/read mutation/interactive payload → 400.
- Meta may accept a send while local persistence fails; this returns a DB error but cannot unsend the WhatsApp message.
- Reply parent without Meta ID sends without quoted context; foreign parent is rejected.
- Agent-send flow pausing is best-effort and does not fail the message.

## Tests

`test/app/api/inbox/route.test.ts`, `test/lib/inbox/conversations.test.ts`, `test/app/api/whatsapp/send/route.test.ts`, `test/lib/whatsapp/send-message.test.ts`, interactive tests, media tests, and `test/app/api/notifications/realtime-routes.test.ts` cover filtering/normalization, send validation/persistence, BSUID routing and realtime read models. Quick-reply routes lack dedicated tests.

## Extension rules

- Treat conversation ownership as the gate before any message/reaction operation.
- Keep `last_message_*` and unread projections synchronized with durable messages.
- New content types require DB checks, Meta parsing/sending, serializers, browser notification copy and UI rendering.
- Preserve the agent-intervention rule that pauses deterministic flows.
