# Automations

Related: [WhatsApp](whatsapp.md) · [Contacts](contacts.md) · [Flows](flows.md) · [Pipelines](pipelines.md)

## Purpose and ownership

Owns account-scoped event-triggered action trees, activation validation, execution/logging, conditional branches, wait suspension/resumption, templates and builder tree operations.

## Important source paths

- `src/lib/automations/{engine,repository,steps-tree,builder-tree,validate,templates,meta-send,trigger-meta}.ts`
- `src/app/api/automations/**`
- Trigger callers: WhatsApp webhook and contact tag/public-contact write paths.

## Data model

- `automations`: account/author, trigger type/config, active flag and counters.
- `automation_steps`: ordered tree using `parent_step_id` plus `yes|no` branch; JSON config.
- `automation_logs`: trigger, contact, append-only step result JSON, `success|partial|failed`.
- `automation_pending_executions`: wait continuation context, scope/position/run time and status.

Real triggers: `new_message_received`, `first_inbound_message`, `keyword_match`, `interactive_reply`, `new_contact_created`, `conversation_assigned`, `tag_added`, `time_based`. Current concrete callers dispatch all except assignment/time-based automatically; `/api/automations/engine` can dispatch a supplied trigger, and cron resumes waits rather than scheduling trigger scans.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/automations` | GET, POST | Viewer lists; agent+ creates blank/template automation. |
| `/api/automations/:id` | GET, PATCH, DELETE | Viewer reads; agent+ replaces metadata/steps, activates after validation, or deletes. |
| `/api/automations/:id/duplicate` | POST | Agent+; transactional tree clone with remapped parents. |
| `/api/automations/:id/logs` | GET | Viewer+; automation and recent logs. |
| `/api/automations/resources` | GET | Viewer+; tags, approved templates, fields, pipelines/stages. |
| `/api/automations/engine` | POST | Agent+ manual trigger dispatch. |
| `/api/automations/cron` | GET | `CRON_SECRET`; claims and resumes due pending executions. |

## Main flows

- Dispatcher verifies contact ownership, selects active matching tenant automations, applies trigger-specific matching, and never throws to callers.
- Each execution starts a pessimistic failed log, runs ordered root/branch steps, appends results atomically, and increments counters.
- `wait` writes a pending continuation and marks the log partial; cron resumes at the next position.
- Actions: send text/template/buttons/list, add/remove tag, assign conversation, update built-in/custom contact field, create deal, signed-off external POST with SSRF guard, close conversation, condition, wait.
- Conditions: tag presence, contact field equality, message contains, local server time window.
- Tag chains dispatch recursively only for new joins and stop at depth 3.

## Authorization and tenant boundary

UI APIs use viewer/agent. Engine entry verifies contact/account ownership before loading automations. Every sensitive lookup/update includes account directly or joins an account-owned parent; custom field, pipeline resource and webhook target ownership is checked.

## Realtime/events

No dedicated automation socket event. Side effects generate normal conversation/message/broadcast events. Logs are read by polling/API. Tag actions may recursively trigger more automation runs.

## Failure modes

- Dispatch is failure-isolated; errors become logs/console output rather than breaking webhook acknowledgement.
- A failed step stops its scope; a wait intentionally leaves a partial log.
- Sends fail when no conversation/config/address exists or Meta rejects.
- External webhook blocks private/reserved destinations, redirects and >10s requests.
- `round_robin` currently selects the first account profile, not a true rotation.
- Unknown step returns a detail at runtime but activation validation should reject it.

## Tests

`test/lib/automations/{engine,validate,builder-tree}.test.ts` covers tenant isolation, conditions/triggers, custom fields, SSRF, no-conversation errors, recursive tree editing and activation validation. Cron claiming and full route CRUD have limited direct coverage.

## Extension rules

- Add a trigger to shared types/metadata/validator, then add a concrete dispatch source; declaring it alone does not make it fire.
- Add a step across types, validation, builder, persistence and engine execution.
- Keep actions idempotent where possible and append useful log detail.
- Preserve contact/account guards and tag-chain depth.
