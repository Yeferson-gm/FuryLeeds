# Realtime Architecture

Related: [Architecture](./architecture.md) · [Database](./database.md) · [Security](./security.md) · [API contracts](./api-contracts.md)

## Summary

FuryLeeds realtime is an event-driven invalidation and notification channel:

```text
PostgreSQL row trigger → pg_notify('furyleeds_realtime_v1', compact JSON)
→ dedicated Bun.SQL LISTEN connection
→ account/user/conversation Socket.IO room
→ browser event handler
→ optional HTTP rehydration from the durable database row
```

It does **not poll PostgreSQL** and the browser does **not poll for changes**. Socket.IO is configured for native WebSocket transport only. Some client handlers perform one HTTP fetch after receiving an invalidation event; that is event-driven rehydration, not periodic polling.

## Process integration

`server.ts` creates a Node-compatible HTTP server, gives it to Next.js, and calls `createRealtimeGateway(httpServer)`. Socket.IO therefore shares the public host/port and listens at `/socket.io`.

Server options:

- path `/socket.io`;
- `transports: ['websocket']`;
- Socket.IO client bundle is not served;
- origin allowed when absent, same-host, or exactly equal to the canonical `BETTER_AUTH_URL` origin;
- connection-state recovery window: 2 minutes;
- middlewares are re-run during recovery (`skipMiddlewares: false`).

The browser singleton uses the same path, disables automatic initial connection, forces WebSocket, disables transport upgrade, includes credentials and enables reconnection.

## Authentication and tenant assignment

Every socket handshake must include the Better Auth cookie. Socket middleware:

1. rejects missing cookies;
2. calls `auth.api.getSession()` with that cookie;
3. loads `profiles.account_id` for the session user;
4. stores only `{ userId, accountId }` in `socket.data`.

On connect, the socket joins:

- `account:<accountId>`;
- `account:<accountId>:user:<userId>`.

A requested conversation room is joined only after the server confirms that the conversation ID belongs to the socket's account. Room name:

- `account:<accountId>:conversation:<conversationId>`.

Clients cannot choose an arbitrary account/user room.

## PostgreSQL event source

Migration `drizzle/0002_realtime_socket.sql` installs row-level `AFTER INSERT OR UPDATE OR DELETE` triggers. Every payload contains:

```ts
{
  v: 1,
  kind: 'conversation' | 'thread' | 'notification' | 'presence' | 'broadcast',
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  accountId: string,
  entityId: string,
  // kind-specific routing fields
}
```

The gateway owns a dedicated `Bun.SQL` connection (`max: 1`, `idleTimeout: 0`, connection timeout 5 seconds), calls `listen('furyleeds_realtime_v1', callback)`, parses JSON, validates version/kind/routing fields, and ignores malformed payloads.

### Trigger coverage

| PostgreSQL table | Database kind | Routing data | Socket effect |
|---|---|---|---|
| `conversations` | `conversation` | account + conversation | account room receives `conversation:changed` and `summary:changed` |
| `messages` | `thread` | account + conversation | conversation room receives `thread:changed`; account room may receive browser notification data |
| `message_reactions` | `thread` | account + conversation | conversation room receives `thread:changed` |
| `notifications` | `notification` | account + target user | user room receives `notification:changed` and `summary:changed` |
| `member_presence` | `presence` | account + target user + state | account room receives `presence:changed` |
| `broadcasts` | `broadcast` | account + broadcast | account room receives `broadcast:changed` |

The migration also has a non-realtime trigger on `broadcast_recipients` that recomputes parent broadcast counters; updating the parent then naturally emits the broadcast event.

## Socket contract

### Client to server

| Event | Payload | Behavior |
|---|---|---|
| `presence:set` | `{ status: 'online' | 'away' }` | Upserts the authenticated user's presence. Other values are ignored. |
| `thread:join` | `{ conversationId }`, optional ack `(accepted: boolean)` | Joins the account-qualified room only if that conversation belongs to the socket account. |
| `thread:leave` | `{ conversationId }` | Leaves the account-qualified conversation room. |

### Server to client

| Event | Payload | Audience |
|---|---|---|
| `conversation:changed` | `{ id, conversationId, eventType }` | Entire account |
| `thread:changed` | `{ conversationId }` | Members currently joined to that conversation |
| `summary:changed` | no payload | Entire account after conversation changes; one user after their notification changes |
| `notification:changed` | `{ id, notificationId, eventType }` | Target user only |
| `presence:changed` | `{ eventType: 'UPSERT'|'DELETE', userId, status?, lastSeenAt? }` | Entire account |
| `broadcast:changed` | `{ id, broadcastId, eventType }` | Entire account |
| `browser-message:created` | message/contact preview fields | Entire account, only for inserted inbound customer messages when payload size permits |

All event interfaces are defined in `src/lib/realtime/events.ts`; this file is the wire-type source of truth.

## Presence lifecycle

At connection, the server upserts the user as `online`. Explicit client status changes also upsert. At disconnect, the gateway queries the authenticated user's room; it marks the user `away` only when no sockets remain, so closing one of several tabs does not make the user appear away.

Presence is persisted in `member_presence`, so the database trigger broadcasts it and `GET /api/presence` can hydrate the current state. There is no heartbeat expiry job in the current implementation; an unclean process/network failure may leave stale `online` state until a later update.

## Client rehydration and coalescing

`useRealtime()` listens for `conversation:changed`. A delete can be applied from the event ID. Inserts/updates fetch:

```text
GET /api/inbox?conversation_id=<id>
Cache-Control: no-store
```

Only one hydration per conversation runs at a time. If more events arrive while loading, the hook retains the latest pending event and hydrates again afterward. This keeps notification payloads compact and makes PostgreSQL the durable source of truth.

The notification summary store listens for `summary:changed` and `connect`, then fetches `/api/notifications/summary`. It serializes requests and records one pending refresh when events arrive during a request.

## Browser message previews

For an inserted customer message, the database trigger may include:

- internal message and conversation IDs;
- sender/content types and text;
- creation timestamp;
- contact name, WhatsApp username and phone.

PostgreSQL notification payloads are limited to roughly 8 KB. The trigger repeatedly shortens `content_text` until JSON is at most 7,900 bytes. If large contact fields still make it near 8,000 bytes, it emits only routing identifiers. The originating message insert must not fail because a notification is oversized.

## Failure, consistency and recovery semantics

- `NOTIFY` is transient; there is no replay log, acknowledgement or exactly-once guarantee.
- Durable state is in PostgreSQL. Socket events are invalidations/previews, not an authoritative copy of rows.
- Socket.IO recovery can restore short disconnections for up to two minutes, but database events missed outside the recoverable session are not replayed by PostgreSQL.
- Reconnect handlers refresh summary state. Feature pages should re-fetch durable data when correctness after a long disconnect matters.
- Invalid database payloads are logged and dropped.
- Presence writes are best-effort and log failures.
- Realtime gateway startup is mandatory: a missing `DATABASE_URL` closes Socket.IO and aborts server startup.

## Scaling constraints

1. Socket.IO uses the default in-memory adapter; rooms are process-local.
2. Every application process with a listener receives every PostgreSQL notification, which is useful for fan-out, but client connections still live on one process.
3. No sticky-session or adapter configuration is present in this repository. Horizontal deployments need a Socket.IO adapter and compatible load-balancer behavior.
4. Only WebSocket is enabled; environments that block WebSocket upgrades have no long-polling fallback.
5. The same database change can lead to follow-up HTTP reads from many clients. The current event payload intentionally avoids shipping full entity state except the compact inbound browser preview.
6. Trigger-generated events occur after row operations within the transaction and are delivered by PostgreSQL on commit; rolled-back changes do not become durable client state.

## Adding a realtime entity safely

A compatible change requires all of the following:

1. add a new versioned database payload shape and trigger migration;
2. extend `DatabaseRealtimeEvent` and the runtime validator in `src/lib/realtime/server.ts`;
3. choose the narrowest account/user/conversation room;
4. extend `ServerToClientEvents` and gateway routing;
5. add client consumption with HTTP rehydration where payload size/state consistency warrants it;
6. test cross-account rejection and malformed/oversized payload behavior;
7. preserve old payload handling or bump the payload version deliberately.
