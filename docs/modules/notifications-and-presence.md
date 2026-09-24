# Notifications and presence

Related: [Inbox](inbox-and-messaging.md) · [Auth/accounts](auth-and-accounts.md) · [Broadcasts](broadcasts.md)

## Purpose and ownership

Owns persisted per-user notifications, unread summaries, browser desktop-notification policy, member presence state, and the PostgreSQL-to-Socket.IO realtime bridge shared by conversations, threads and broadcasts.

## Important source paths

- `src/app/api/notifications/**`, `src/app/api/presence/route.ts`
- `src/lib/notifications/browser-notify.ts`, `src/lib/presence.ts`
- `src/lib/realtime/{events,server,client,summary-store}.ts`
- `drizzle/0002_realtime_socket.sql`

## Data model

- `notifications`: account/user, only current type `conversation_assigned`, optional conversation/contact/actor, title/body/read timestamp.
- `member_presence`: one row per user, account, stored `online|away`, last seen. `offline` is derived after 75 seconds; idle/away policy uses five minutes.
- No insertion path for `notifications` exists in the inspected `src/lib`/`src/app/api`; current APIs only read/mark rows. Assignment mutation also does not dispatch the declared `conversation_assigned` automation trigger.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/notifications` | GET | Session; latest notifications for current account and user. |
| `/api/notifications/:id` | PATCH | Session; mark one owned unread notification read. |
| `/api/notifications/read-all` | PATCH | Session; mark all current user's account notifications read. |
| `/api/notifications/summary` | GET | Session; unread conversation count + unread notification count. |
| `/api/notifications/messages` | GET | Session; cursor feed of account messages for realtime catch-up. |
| `/api/presence` | GET | Session; account presence rows. |
| `/api/presence` | POST | Session; upsert own `online|away` heartbeat. |

## Main flows

- Socket handshake authenticates Better Auth cookie and resolves account profile.
- Socket joins account and own user room; authorized clients may join owned conversation rooms.
- Presence updates on connect, explicit `presence:set`, HTTP heartbeat and last-socket disconnect (away).
- PostgreSQL triggers publish typed JSON for conversations, messages/reactions, notifications, presence and broadcasts.
- Gateway routes account-wide, user-only or thread-only events and emits summary invalidation.
- Browser notifications apply user localStorage preference, visibility/current-thread suppression and 30-second message-ID dedupe.

## Authorization and tenant boundary

Notification mutation requires both `account_id` and `user_id`. Presence reads are account-scoped; writes force current user/account. Socket room membership derives from server-side session/profile and conversation ownership.

## Realtime/events

Events: `conversation:changed`, `thread:changed`, `summary:changed`, `notification:changed`, `presence:changed`, `broadcast:changed`, `browser-message:created`; client events: `presence:set`, `thread:join`, `thread:leave`. PostgreSQL payloads are versioned (`v:1`) and channel is `furyleeds_realtime_v1`.

## Failure modes

- Missing cookie/profile rejects socket handshake.
- Malformed DB event is logged/ignored.
- Missing `DATABASE_URL` prevents gateway startup.
- Socket presence writes are best-effort; stale timestamps derive offline state.
- PostgreSQL `NOTIFY` payload limit is handled by truncating/removing browser message content.
- Notifications may remain empty because no producer exists in the inspected implementation.

## Tests

`test/app/api/notifications/realtime-routes.test.ts`, `test/lib/notifications/browser-notify.test.ts`, and `test/lib/presence.test.ts` cover account/user scoping, catch-up feeds, browser suppression/dedupe/content and derived presence. Gateway/PostgreSQL trigger integration is not exercised end-to-end.

## Extension rules

- A new notification type needs schema check, shared type/UI icon, producer, realtime behavior and tests.
- Never trust client-supplied account/user room identifiers.
- Version breaking realtime payload changes.
- Keep DB-trigger payloads below PostgreSQL's notification limit.
