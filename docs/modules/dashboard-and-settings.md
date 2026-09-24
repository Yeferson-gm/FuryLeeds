# Dashboard and settings

Related: [Auth/accounts](auth-and-accounts.md) · [Pipelines](pipelines.md) · [WhatsApp](whatsapp.md) · [AI](ai.md)

## Purpose and ownership

Owns read-only dashboard projections and the consolidated settings overview. Domain-specific settings mutations remain owned by account, WhatsApp, contacts/tags/custom fields, pipelines, AI and API-key modules.

## Important source paths

- `src/app/api/dashboard/_queries.ts`, `src/app/api/dashboard/**`
- `src/lib/dashboard/{queries,date-utils,types}.ts`
- `src/app/api/settings/overview/route.ts`
- Shared formatting/preferences: `src/lib/{currency,themes,dates}.ts`

## Data model

No dedicated dashboard tables. Projections read:
- conversations/contacts/messages for operational metrics and response time;
- deals/pipelines/stages for open value and stage distribution;
- broadcasts and automation logs for activity;
- profiles/templates/tags/custom fields/WhatsApp config/invitations for settings counts.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/dashboard/metrics` | GET | Session; open conversations, new contacts, open deal value/count, agent messages today with comparisons. |
| `/api/dashboard/conversations?days=` | GET | Session; incoming/outgoing daily series for validated range. |
| `/api/dashboard/pipeline` | GET | Session; open deal count/value by ordered stage. |
| `/api/dashboard/response-time` | GET | Session; first agent/bot response after a customer message over 14 days, weekday and weekly averages. |
| `/api/dashboard/activity?limit=` | GET | Session; merged recent inbound messages, contacts, deals, broadcasts and automation runs. |
| `/api/settings/overview` | GET | Viewer+; counts and WhatsApp configured flag; pending invites only visible to admin+/superadmin. |

## Main flows

- Date helpers use server-local day boundaries and Monday-first week indexing.
- Metrics compare today's values with yesterday-derived values; deal totals parse numeric strings safely.
- Conversation series buckets every message: customer inbound, all other sender types outbound.
- Response time pairs the first pending customer message with the next non-customer response in each conversation.
- Activity performs bounded per-domain queries, normalizes links/text, sorts by timestamp and truncates to requested limit.
- Settings overview runs independent count queries in parallel and redacts invitation count as `null` for non-managers.

## Authorization and tenant boundary

Every query receives `accountId` from session context and filters tenant-root rows or joins through account-owned parents. Settings capability determines sensitive count visibility; it does not rely only on client hiding.

## Realtime/events

Dashboard endpoints are request/response only. Clients can use conversation/broadcast/summary realtime invalidation to refetch, but there is no dashboard-specific event or cache.

## Failure modes

- DB/auth errors map through shared safe 401/403/500 handling.
- Metrics are computed in application memory and can become expensive with large histories.
- Server-local timezone may differ from the account/user timezone; no per-account timezone exists.
- “Previous” metric fields are not uniformly percentages; consumers must use typed semantics.
- Response time treats bot and agent alike as outgoing response.

## Tests

`test/app/api/dashboard/routes.test.ts` verifies route delegation/auth behavior; `test/lib/dashboard/date-utils.test.ts` verifies day/week calculations. Query aggregation semantics are not comprehensively integration-tested. Settings overview has no dedicated test.

## Extension rules

- Keep all projection joins explicitly account-scoped.
- Define timezone and comparison semantics before adding time-based KPIs.
- Prefer SQL aggregation/pagination as data volume grows.
- Add dashboard types, query, route and tests together; keep mutations in the owning domain module.
