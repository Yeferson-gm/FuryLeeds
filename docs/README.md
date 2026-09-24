# FuryLeeds documentation

This directory is the detailed engineering reference for FuryLeeds. It documents verified implementation, accepted architecture, module ownership, operational requirements, and known gaps. Start at the repository root [`AGENTS.md`](../AGENTS.md) for mandatory agent instructions.

## Authority and language

When sources disagree, use this evidence order:

1. running behavior and automated tests;
2. current source and SQL migrations;
3. `package.json`, `bun.lock`, and active configuration;
4. architecture, module, and process documentation;
5. discussions and historical/reference material.

Correct stale prose in the same workstream. English is the primary documentation language. Spanish is appropriate for user-facing copy, `MEMORY.md`, `TODO.md`, operator notes, and short contextual explanations.


## Recommended reading order

### Every engineering session

1. [`AGENTS.md`](../AGENTS.md)
2. [`ROLE.md`](../ROLE.md)
3. [`SYSTEM.md`](../SYSTEM.md)
4. [`MEMORY.md`](../MEMORY.md)
5. this index
6. the architecture, module, and process documents that own the intended change

### New contributor or local setup

1. [`README.md`](../README.md)
2. [System architecture](arquitecture/architecture.md)
3. [Tooling](process/tooling.md)
4. [Database architecture](arquitecture/database.md)
5. [Testing strategy](process/testing-strategy.md)
6. [Definition of Done](process/definition-of-done.md)

### Feature work

1. [Feature intake](process/feature-intake.md)
2. the owning [functional module](modules/_index.md)
3. [API contracts](arquitecture/api-contracts.md), [database](arquitecture/database.md), [realtime](arquitecture/realtime.md), or [frontend](arquitecture/frontend.md) as applicable
4. [Security checklist](process/security-checklist.md)
5. [Definition of Done](process/definition-of-done.md)

### Security, authentication, or tenant work

1. [Security architecture](arquitecture/security.md)
2. [Auth and accounts](modules/auth-and-accounts.md)
3. [Database architecture](arquitecture/database.md)
4. [API contracts](arquitecture/api-contracts.md)
5. [Security checklist](process/security-checklist.md)

### Provider or external integration work

1. [Integrations](arquitecture/integrations.md)
2. the owning module: [WhatsApp](modules/whatsapp.md), [files/media](modules/files-and-media.md), [AI](modules/ai.md), or [public API/webhooks](modules/public-api-and-webhooks.md)
3. [Failure modes](process/failure-mode.md)
4. [Security checklist](process/security-checklist.md)

### Realtime or deployment work

1. [Realtime architecture](arquitecture/realtime.md)
2. [System architecture](arquitecture/architecture.md)
3. [Deployment](process/deployment.md)
4. [Observability](process/observability.md)
5. [Performance budget](process/performance-budget.md)
6. [Architecture decisions](arquitecture/decisions.md)

## Architecture and cross-cutting contracts

| Document | Scope |
|---|---|
| [Architecture](arquitecture/architecture.md) | Runtime topology, process boundaries, source organization, request models, domain map, and scaling constraints. |
| [Database](arquitecture/database.md) | Complete table inventory, relations, constraints, migrations, transaction patterns, and known schema risks. |
| [API contracts](arquitecture/api-contracts.md) | Complete browser, public API, provider callback, and cron route inventory with auth and payload conventions. |
| [Security](arquitecture/security.md) | Trust boundaries, sessions, roles, tenant isolation, cryptography, webhook/file/browser controls, and rate limits. |
| [Realtime](arquitecture/realtime.md) | PostgreSQL triggers, `LISTEN/NOTIFY`, typed Socket.IO events, rooms, authentication, reconnect, and scaling. |
| [Integrations](arquitecture/integrations.md) | PostgreSQL, Better Auth, ChatSend, Imgora, Meta, AI, customer webhooks, scheduler, and environment inventory. |
| [Frontend](arquitecture/frontend.md) | App Router composition, providers, state/data flows, permission UX, responsiveness, and accessibility. |
| [Design system](arquitecture/design-system.md) | Tailwind v4 tokens, themes, primitives, layout, typography, states, and extension rules. |
| [Architecture decisions](arquitecture/decisions.md) | Accepted durable decisions and explicitly pending decisions. |

The directory name `arquitecture` is retained as current repository reality. Renaming it requires a coordinated link migration and is not implied by ordinary documentation edits.

## Functional modules

The complete ownership index is [`modules/_index.md`](modules/_index.md).

| Document | Domain |
|---|---|
| [Auth and accounts](modules/auth-and-accounts.md) | Better Auth, account bootstrap, sessions, members, invitations, roles, ownership, and API-key administration. |
| [Contacts](modules/contacts.md) | Contact identity, tags, notes, custom fields, deduplication, and CSV import. |
| [Inbox and messaging](modules/inbox-and-messaging.md) | Conversation listing/thread state, messages, assignment, reactions, quick replies, and composer behavior. |
| [WhatsApp](modules/whatsapp.md) | Meta setup, registration, templates, sends, media, webhook intake, and status lifecycle. |
| [Broadcasts](modules/broadcasts.md) | Audience construction, personalization, dispatch, resume, recipients, and aggregate funnel state. |
| [Automations](modules/automations.md) | Triggers, conditions, actions, waits, execution logs, and cron continuation. |
| [Flows](modules/flows.md) | Graph editing, activation validation, stateful runs, events, fallback, and timeout behavior. |
| [Pipelines](modules/pipelines.md) | Pipelines, stages, deals, assignment, values, and analytics. |
| [AI](modules/ai.md) | Provider configuration, drafts, playground, knowledge retrieval, auto-reply, handoff, and usage. |
| [Notifications and presence](modules/notifications-and-presence.md) | Notifications, browser alerts, summaries, and member presence. |
| [Files and media](modules/files-and-media.md) | Imgora storage, policies, signed references, proxying, mirroring, and client blob lifecycle. |
| [Public API and webhooks](modules/public-api-and-webhooks.md) | API keys/scopes, `/api/v1`, envelopes, pagination, webhook signing, SSRF defenses, and delivery. |
| [Dashboard and settings](modules/dashboard-and-settings.md) | Metrics, activity, reporting, consolidated settings, and account configuration. |

### Frontend inventories

- [Pages](modules/pages.md) — all application page routes and layouts.
- [Components](modules/components.md) — all feature and UI component files.
- [Hooks](modules/hooks.md) — all browser hooks and their contracts.

Update these inventories whenever adding, moving, or deleting the corresponding source files.

## Engineering process

| Document | Purpose |
|---|---|
| [Feature intake](process/feature-intake.md) | Frame scope, ownership, trust boundaries, side effects, contracts, and validation before implementation. |
| [Definition of Done](process/definition-of-done.md) | Completion gates for implementation, security, data, providers, realtime, UI, operations, tests, and docs. |
| [Security checklist](process/security-checklist.md) | Threat-oriented review for auth, tenancy, secrets, providers, files, webhooks, and deployment. |
| [Testing strategy](process/testing-strategy.md) | Test layers, commands, fixtures, tenant/security cases, provider boundaries, and release confidence. |
| [Dependency policy](process/dependency-policy.md) | Rules for choosing, adding, auditing, and removing dependencies. |
| [Dependency upgrades](process/dependency-upgrades.md) | Controlled upgrade procedure and validation. |
| [Deployment](process/deployment.md) | Verified VPS runtime contract, migration/release sequence, proxy requirements, rollback, and open operations decisions. |
| [Observability](process/observability.md) | Logging, metrics, tracing, redaction, alerts, and current gaps. |
| [Performance budget](process/performance-budget.md) | Frontend/backend/provider/database performance expectations and measurement requirements. |
| [Failure modes](process/failure-mode.md) | Expected handling for database, provider, async, realtime, and partial-success failures. |
| [Git workflow](process/git-workflow.md) | Verified repository practices and pending governance decisions. |
| [Tooling](process/tooling.md) | Runtime, package scripts, configuration, external systems, and tool-adoption policy. |
| [Prompts](process/prompts.md) | Safe, evidence-based agent prompt/workflow guidance. |
| [Documentation policy](process/documentation-policy.md) | Truth labels, ownership, required updates, style, security, validation, and ADR rules. |

## Ownership matrix

| Change | Update at minimum |
|---|---|
| Runtime, topology, or source boundary | `SYSTEM.md`, architecture, decisions when durable, deployment/tooling as applicable |
| Table, column, constraint, index, query invariant, or migration | database architecture, owning module, migration notes, `MEMORY.md` if operationally relevant |
| HTTP route or payload | API contracts, owning module, tests, public onboarding if externally visible |
| Authentication, roles, tenant isolation, cookies, or secrets | security architecture, auth/accounts module, security checklist, integration/deployment inventories |
| Socket event, room, trigger, listener, or reconnect behavior | realtime architecture, owning module/hook/component, database docs for triggers |
| Provider or environment variable | integrations, security, deployment, tooling, README, owning module |
| Page, navigation, or layout | pages inventory, frontend architecture, relevant module |
| Component or browser hook | components/hooks inventory, frontend/design-system docs when shared behavior changes |
| Design token or UI primitive | design system, components inventory, accessibility/performance review |
| Functional domain behavior | matching module file and any API/database/realtime/provider documents affected |
| Test/build/dependency/process policy | matching process file and README commands if contributor-facing |
| Durable architecture choice | architecture decisions plus affected architecture/process docs |
| Out-of-scope defect or risk | [`TODO.md`](TODO.md) with date, context, impact, and next step |
| Completed milestone, blocker, or immediate next action | [`MEMORY.md`](../MEMORY.md) |

## Documentation completion rules

A behavior change is incomplete until documentation describes:

- ownership and tenant boundary;
- authentication, role, scope, and untrusted input;
- database/API/realtime/provider contracts affected;
- success, validation, empty, permission, retry, and failure behavior;
- side effects and partial-success semantics;
- environment and deployment changes;
- tests and validation actually run;
- remaining debt or pending decisions without presenting them as implemented.

Do not store secrets, live connection strings, customer data, tokens, signed file references, or private logs in documentation. Use placeholders and project-relative paths.

## Active state and debt

- [`MEMORY.md`](../MEMORY.md) is the living handoff for completed work, current blockers, and next actions.
- [`TODO.md`](TODO.md) records scoped technical/operational debt discovered outside the active task.
- [Architecture decisions](arquitecture/decisions.md) records accepted durable decisions and separates unresolved choices.

Keep these three views synchronized without duplicating full implementation contracts from the architecture/module documents.
