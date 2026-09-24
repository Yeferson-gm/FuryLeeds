# Functional module index

This directory documents the backend modules implemented under `src/lib`, `src/app/api`, and the effective schema in `src/lib/db/*`.

## Architecture at a glance

- **Runtime:** Next.js 16 route handlers, Bun, PostgreSQL, Drizzle ORM, Better Auth, Socket.IO.
- **Tenant root:** `accounts.id`. Session requests resolve one `profiles.account_id`; public requests resolve one `api_keys.account_id`.
- **Roles:** `owner > admin > agent > viewer`; `superadmin` bypasses account-role minimums but still operates inside a resolved account context.
- **Primary schema:** `src/lib/db/crm-schema.ts`, `src/lib/db/auth-schema.ts`, and `src/lib/db/relations.ts`.
- **Realtime:** PostgreSQL triggers publish to `furyleeds_realtime_v1`; `src/lib/realtime/server.ts` maps events to account, user, and conversation Socket.IO rooms.
- **External systems:** Meta WhatsApp Cloud API, OpenAI/Anthropic, Imgora, and arbitrary signed outbound webhook endpoints.
- **Background work:** Next.js `after()` for webhook/broadcast work; secret-protected GET cron endpoints for automation waits and stale flow runs.

## Modules

| Module | Responsibility |
|---|---|
| [Auth and accounts](auth-and-accounts.md) | Identity, sessions, accounts, roles, members, invitations, ownership, API-key management. |
| [Contacts](contacts.md) | Contacts, phone identity/deduplication, tags, notes, custom fields, CSV import. |
| [Inbox and messaging](inbox-and-messaging.md) | Conversation lists/threads, assignment/status/read state, quick replies, outbound message persistence. |
| [WhatsApp](whatsapp.md) | Meta configuration, registration, webhook ingestion, sends, reactions, templates, status updates. |
| [Broadcasts](broadcasts.md) | Campaign audience creation, template fan-out, recipient lifecycle, retry/resume, aggregate counters. |
| [Automations](automations.md) | Triggered action trees, conditions, waits, logs, cron resumption. |
| [Flows](flows.md) | Stateful deterministic conversation graphs, activation validation, runs, fallback and timeout handling. |
| [Pipelines](pipelines.md) | Pipelines, stages, deals, assignments, currency. |
| [AI](ai.md) | Provider configuration, drafts/playground, RAG knowledge, auto-reply and handoff, usage. |
| [Notifications and presence](notifications-and-presence.md) | In-app notification reads, summaries, browser notifications, online/away/offline presence. |
| [Files and media](files-and-media.md) | Tenant-scoped Imgora storage, signed references, inbound media mirroring/proxying, client blob helpers. |
| [Public API and webhooks](public-api-and-webhooks.md) | API keys/scopes, `/api/v1`, pagination/envelopes, outbound signed webhooks and SSRF defenses. |
| [Dashboard and settings](dashboard-and-settings.md) | Metrics/activity/reporting and consolidated settings overview. |

## Cross-module flow

1. Meta calls the [WhatsApp webhook](whatsapp.md), which verifies the raw-body signature.
2. The webhook resolves `whatsapp_config` to an account, upserts a [contact](contacts.md) and conversation, and idempotently inserts a message.
3. A matching [flow](flows.md) gets first right of consumption.
4. If not consumed, message-level [automations](automations.md) run; relationship triggers still run even when a flow consumes the message.
5. [AI auto-reply](ai.md) runs only for non-consumed plain text and yields to active message automations or assigned agents.
6. Public [webhook events](public-api-and-webhooks.md) are delivered best-effort.
7. PostgreSQL publishes [realtime](notifications-and-presence.md) changes to authenticated account/user/thread rooms.

## Shared extension rules

1. Every tenant-owned query must constrain `account_id` directly or via an account-scoped parent join; UUID possession is never authorization.
2. Use `getCurrentAccount`/`requireRole` for session APIs and `requireApiKey` for `/api/v1`; do not duplicate role/scope checks.
3. Add schema relations, indexes, constraints, migration SQL, serializers, and tests together.
4. Preserve inbound idempotency and monotonic status transitions.
5. Keep webhook/automation/AI side effects failure-isolated from Meta acknowledgement.
6. Add realtime/public events only with typed vocabularies, tenant-correct payloads, and consumer tests.
7. Secrets must remain encrypted or hashed at rest and must never be returned after initial creation.
