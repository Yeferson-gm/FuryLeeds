# Pipelines

Related: [Contacts](contacts.md) · [Dashboard/settings](dashboard-and-settings.md) · [Automations](automations.md)

## Purpose and ownership

Owns sales pipelines, ordered stages, deals, deal assignment, status/value metadata, and the account-wide default currency used by manual and automated deal creation.

## Important source paths

- `src/app/api/pipelines/**`, especially `_shared.ts`
- `src/lib/currency.ts`
- `src/lib/db/crm-schema.ts` (`pipelines`, `pipeline_stages`, `deals`, `accounts.default_currency`)
- Automation `create_deal` in `src/lib/automations/engine.ts`

## Data model

- `pipelines(account_id,user_id,name)`.
- `pipeline_stages(pipeline_id,name,position,color)`; cascades with pipeline.
- `deals(account_id,pipeline_id,stage_id,contact_id,conversation_id,assigned_to profile UUID,title,value,currency,notes,expected_close_date,status)` with `open|won|lost`.
- Account default currency is a three-letter uppercase code; route restricts it to the application currency catalog.

## API endpoints

| Endpoint | Methods | Access / behavior |
|---|---|---|
| `/api/pipelines` | GET, POST | Viewer lists; admin+ creates pipeline with default stages transactionally. |
| `/api/pipelines/:id` | GET | Viewer+; stages, deals, contact and assignee projections. |
| `/api/pipelines/:id` | PATCH, DELETE | Admin+; rename/reorder/recolor existing stages or delete. |
| `/api/pipelines/:id/stages` | POST | Admin+; append validated stage. |
| `/api/pipelines/:id/stages/:stageId` | DELETE | Admin+; refused while deals occupy stage. |
| `/api/pipelines/:id/deals` | POST | Agent+; validates owned pipeline/stage/resources and creates deal. |
| `/api/pipelines/:id/deals/:dealId` | PATCH, DELETE | Agent+; move/update/close or delete owned deal. |
| `/api/pipelines/resources` | GET | Viewer+; contacts/profiles and optional latest conversation for contact. |
| `/api/pipelines/settings` | PATCH | Admin+; default currency. |

## Main flows

- Pipeline creation inserts parent plus standard ordered stages in one transaction.
- Detail reads group deals under stages and include optional contact/profile data.
- Deal mutation checks stage belongs to the same pipeline; shared validators normalize value/status/date/assignment.
- Automation `create_deal` uses account default currency and configured pipeline/stage.
- Dashboard aggregates open deal count/value and open values per stage.

## Authorization and tenant boundary

Pipeline/deal access includes `account_id`. Stage rows lack account ID, so callers first validate their parent pipeline or join it. Contact/conversation/profile resources must belong to the same account; assignee stores profile UUID, unlike conversation assignment which stores user ID.

## Realtime/events

No pipeline/deal socket event. Dashboard and pipeline views refresh through HTTP. Automation-created deals appear in dashboard activity.

## Failure modes

- Missing/foreign pipeline, deal, stage or resource → 404.
- Invalid value/status/date/currency → 400.
- Stage deletion with deals → conflict response.
- Database constraints prevent deleting referenced stages but conversation deletion behavior is not cascade.
- Automation configuration can reference stale stages and fail at insert time.

## Tests

`test/app/api/pipelines/route.test.ts` covers pipeline route behavior; currency formatting is covered by `test/lib/currency.test.ts`. Deal/stage mutation and tenant-boundary routes have limited direct tests.

## Extension rules

- Resolve stage ownership through its pipeline on every entry point.
- Keep account currency consistent for all deal creation paths.
- New deal fields must be added to shared validation/serialization, automation configuration and dashboard calculations as applicable.
- Do not delete/reorder stages without defining behavior for existing deals.
