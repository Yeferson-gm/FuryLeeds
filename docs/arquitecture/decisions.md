# Architecture decisions

This file is the lightweight Architecture Decision Record (ADR) index for FuryLeeds. It records durable decisions that future work must preserve unless the user explicitly approves an architecture change.

## Record format

Each accepted record has an identifier, date, status, context, decision, consequences, and links. New records are append-only in intent: supersede an old decision explicitly rather than silently rewriting history. Clarifications that do not change the decision may edit the existing record.

Statuses:

- **Accepted** — active architecture contract.
- **Superseded** — replaced by a later named record.
- **Pending** — important problem whose implementation choice has not been adopted.

## Decision index

| ID | Decision | Status | Date |
|---|---|---|---|
| ADR-001 | Bun is the sole JavaScript runtime, package manager, test runner, and native SQL provider | Accepted | 2026-09-24 |
| ADR-002 | Next.js runs through the custom `server.ts` entry point | Accepted | 2026-09-24 |
| ADR-003 | PostgreSQL, Bun.SQL, and Drizzle are the only data stack | Accepted | 2026-09-24 |
| ADR-004 | Better Auth owns human authentication | Accepted | 2026-09-24 |
| ADR-005 | Accounts are tenants with account roles plus a separate system role | Accepted | 2026-09-24 |
| ADR-006 | Tenant isolation is application-enforced; PostgreSQL RLS is not currently present | Accepted | 2026-09-24 |
| ADR-007 | ChatSend sends transactional authentication email server-side | Accepted | 2026-09-24 |
| ADR-008 | Imgora is the only persistent file store | Accepted | 2026-09-24 |
| ADR-009 | Meta WhatsApp Cloud API is the messaging provider | Accepted | 2026-09-24 |
| ADR-010 | Realtime uses PostgreSQL `LISTEN/NOTIFY` and WebSocket-only Socket.IO | Accepted | 2026-09-24 |
| ADR-011 | Public API credentials are separate from browser sessions | Accepted | 2026-09-24 |
| ADR-012 | Documentation is part of the implementation contract | Accepted | 2026-09-24 |
| ADR-013 | Legacy compatibility shims, repeated polling, and local persistent uploads are prohibited | Accepted | 2026-09-24 |
| ADR-014 | Production deploys through Dokploy's Dockerfile application method | Accepted | 2026-09-24 |
| ADR-015 | FuryLeeds is private proprietary software | Accepted | 2026-09-24 |
| ADR-016 | FuryLeeds replaces the imported product identity and external namespaces | Accepted | 2026-09-24 |

## ADR-001 — Bun runtime and toolchain

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** FuryLeeds needs one runtime for application execution, package management, tests, and direct PostgreSQL access. Multiple runtime/package-manager paths create divergent dependency and database behavior.
- **Decision:** Use Bun `>=1.4.0` as the runtime, package manager, test runner, and source of native `Bun.SQL`. Use package scripts from `package.json`; do not add Node-only database/runtime paths or alternative lockfiles.
- **Consequences:** The application is Bun-dependent. Runtime code may use Node-compatible APIs only where Bun supports them. Build-time worker behavior must still be considered; the lazy database runtime must not be simplified into imports that make Next build workers require Bun globals prematurely.
- **Links:** [Architecture](architecture.md), [Tooling](../process/tooling.md), [Dependency policy](../process/dependency-policy.md).

## ADR-002 — Custom Next.js and Socket.IO server

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** The application requires Next.js HTTP handling and authenticated Socket.IO on one process and origin.
- **Decision:** Development and production start through `server.ts`. It prepares Next.js, attaches Socket.IO to the shared HTTP server, initializes the PostgreSQL notification listener, and owns graceful shutdown.
- **Consequences:** `next start` alone is unsupported because it omits realtime. Reverse proxies must preserve WebSocket upgrades at `/socket.io`. Deployment health and shutdown checks must cover both HTTP and realtime.
- **Links:** [Architecture](architecture.md), [Realtime](realtime.md), [Deployment](../process/deployment.md).

## ADR-003 — PostgreSQL, Bun.SQL, and Drizzle only

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** The product requires a self-controlled source of truth on the user's VPS and a typed, reviewable schema/migration workflow.
- **Decision:** PostgreSQL is the only application database. Access it through Bun native `Bun.SQL` and `drizzle-orm/bun-sql`. Drizzle ORM and Drizzle Kit own typed queries, schema definitions, and append-only migrations.
- **Consequences:** Supabase, InsForge, Firebase, SQLite, hosted database abstractions, second ORMs, and compatibility adapters are outside the architecture. Schema changes require reviewed migration SQL. Production credentials remain server-only.
- **Links:** [Database](database.md), [Security](security.md), [Deployment](../process/deployment.md).

## ADR-004 — Better Auth for human identity

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** FuryLeeds requires email/password registration and login, verification, reset, cookie sessions, and Google sign-in without delegating the application database to a hosted auth/database platform.
- **Decision:** Better Auth owns human users, identities, sessions, email/password flows, and optional Google OAuth using the PostgreSQL Drizzle adapter. Browser authentication uses Better Auth cookies.
- **Consequences:** Better Auth schema and callbacks remain authoritative for human identity. Google is enabled only when both provider variables exist. Public API keys are not Better Auth sessions. Authentication email is delegated to the server-side ChatSend adapter under ADR-007.
- **Links:** [Security](security.md), [Auth and accounts](../modules/auth-and-accounts.md), [Integrations](integrations.md).

## ADR-005 — Account tenancy and two role dimensions

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** Each registered customer needs an isolated CRM account, while the SaaS operator needs separate system administration authority.
- **Decision:** `accounts.id` is the tenant root. Account roles are ordered `owner > admin > agent > viewer`. Better Auth users additionally have system role `user` or `superadmin`. A `superadmin` may satisfy account-role thresholds only after a valid profile/account context is resolved.
- **Consequences:** The browser never chooses an `accountId` as authorization proof. New resources and queries must retain account ownership. `admin` is a tenant administrator; `owner` is the customer's account owner; `superadmin` is the general SaaS operator role.
- **Links:** [Security](security.md), [Database](database.md), [Auth and accounts](../modules/auth-and-accounts.md).

## ADR-006 — Application-level tenant isolation without current RLS

- **Date:** 2026-09-24
- **Status:** Accepted description of current architecture
- **Context:** Current migrations do not define PostgreSQL Row Level Security policies. Tenant isolation is implemented through account-scoped application queries and parent joins.
- **Decision:** Treat explicit `account_id` constraints as a mandatory application invariant and never claim that PostgreSQL RLS exists. Resource UUID possession is not authorization.
- **Consequences:** Database credentials can access all tenants, so every query/raw SQL path requires cross-account review and tests. Adding RLS later would be a separate migration and architecture decision, not a documentation-only claim.
- **Links:** [Security](security.md#tenant-isolation), [Database](database.md), [Security checklist](../process/security-checklist.md).

## ADR-007 — ChatSend for authentication email

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** Verification, password recovery, and identity lifecycle email must not depend on Supabase email, and provider credentials must not be exposed to browsers.
- **Decision:** Better Auth server callbacks render escaped HTML and plain text, exchange `CHATSEND_API_KEY` for a short-lived bearer token, and enqueue mail through ChatSend with an idempotency key. Signup verification remains link-based; password recovery uses Better Auth's hashed six-digit OTP. Welcome and password-change confirmation messages are lifecycle notifications.
- **Consequences:** ChatSend configuration and availability affect verification/reset delivery. API keys and bearer/refresh tokens remain server-only. The adapter authenticates per send, has a 10-second request timeout, and has no automatic retry or token cache. Reset OTP delivery uses Better Auth's process-bound background-task handler to reduce account-enumeration timing; it is not durable and does not depend on Next request `AsyncLocalStorage`.
- **Links:** [Integrations](integrations.md#chatsend), [Auth and accounts](../modules/auth-and-accounts.md), [Failure modes](../process/failure-mode.md).

## ADR-008 — Imgora-only persistent file storage

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** Application uploads and WhatsApp media must survive deployments without consuming the VPS application filesystem.
- **Decision:** Store persistent user files and media in Imgora through server-side authenticated adapters. Namespace objects by account and collection and expose signed opaque references where authenticated access is required.
- **Consequences:** No `LOCAL_STORAGE_PATH` or equivalent persistent upload directory belongs in the runtime contract. Upload policy, timeout/error mapping, signed references, and remote cleanup remain application responsibilities. Public provider URLs may still be required for Meta delivery.
- **Links:** [Integrations](integrations.md#imgora-storage), [Files and media](../modules/files-and-media.md), [Security](security.md#file-and-media-security).

## ADR-009 — Meta WhatsApp Cloud API

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** FuryLeeds centers on official WhatsApp messaging, templates, media, reactions, number setup, and delivery callbacks.
- **Decision:** Integrate directly with Meta WhatsApp Cloud API. Keep per-account access/verify credentials encrypted, verify inbound raw-body signatures, and preserve webhook/message idempotency and monotonic status handling.
- **Consequences:** Product behavior is subject to Meta windows, template approval, rate limits, retries, and provider availability. Provider success and local persistence can partially succeed and require explicit reconciliation design.
- **Links:** [Integrations](integrations.md#meta-whatsapp-cloud-api), [WhatsApp](../modules/whatsapp.md), [Security](security.md#meta-webhook-security).

## ADR-010 — Event-driven realtime with Socket.IO

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** Shared inbox, notifications, presence, messages, and account state require immediate authenticated updates without repeated HTTP polling.
- **Decision:** PostgreSQL triggers publish compact events to `furyleeds_realtime_v1`; a dedicated Bun listener validates and forwards typed events through authenticated, room-scoped Socket.IO. Client and server allow WebSocket transport only.
- **Consequences:** HTTP snapshots initialize and recover authoritative state but must not become polling loops. Events are transient hints, not a durable log. The current in-memory adapter supports a single application process until a distributed adapter/routing decision is adopted.
- **Links:** [Realtime](realtime.md), [Notifications and presence](../modules/notifications-and-presence.md), [Deployment](../process/deployment.md).

## ADR-011 — Separate browser and public API trust boundaries

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** Humans operate the dashboard with sessions, while customer software needs scoped account automation without human cookies.
- **Decision:** Browser routes use Better Auth sessions and account roles. `/api/v1` uses independently generated, hashed, account-bound API keys with explicit scopes and rate limits. Neither credential type substitutes for the other.
- **Consequences:** Public clients never submit human cookies as integration credentials. API keys are shown once, cannot exceed their scopes, and must be revoked/rotated independently from user sessions.
- **Links:** [API contracts](api-contracts.md), [Security](security.md#public-api-keys), [Public API and webhooks](../modules/public-api-and-webhooks.md).

## ADR-012 — Documentation-first continuity

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** FuryLeeds spans security-sensitive tenancy, provider side effects, database migrations, realtime, and many UI/API modules. Chat history cannot be the continuity mechanism.
- **Decision:** Root, architecture, module, process, decision, debt, and memory documents are implementation deliverables. Meaningful behavior changes update their owning documentation in the same workstream.
- **Consequences:** Work is incomplete when documentation is stale. `AGENTS.md` defines reading order, `SYSTEM.md` maps the whole system, `MEMORY.md` records current state, and `docs/README.md` is the detailed index.
- **Links:** [Documentation index](../README.md), [Documentation policy](../process/documentation-policy.md), [Definition of Done](../process/definition-of-done.md).

## ADR-013 — No legacy shims, polling replacement, or local file persistence

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** Compatibility layers for removed platforms and duplicated request/config shapes obscure the active architecture and create untestable paths.
- **Decision:** Do not retain legacy Supabase/InsForge contracts, alternate request shapes, dead exports, commented implementations, speculative adapters, repeated HTTP polling that replaces Socket.IO, or filesystem persistence for uploads.
- **Consequences:** Migrations are explicit and obsolete paths are removed rather than hidden behind fallbacks. Backward compatibility is added only for a specific approved migration requirement with a deletion plan.
- **Links:** [Architecture](architecture.md), [Realtime](realtime.md), [Files and media](../modules/files-and-media.md), [Dependency policy](../process/dependency-policy.md).

## ADR-014 — Dokploy Dockerfile deployment

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** FuryLeeds needs a reproducible Bun production artifact that preserves the custom Next.js/Socket.IO server and can be deployed on the owner's VPS.
- **Decision:** Deploy FuryLeeds as a Dokploy Application using build type `Dockerfile`, path `Dockerfile`, context `.`, final stage `runner`, one replica, and container port `3000`. Dokploy/Traefik owns HTTPS/domain routing. Docker Compose is not an active path. PostgreSQL migrations run only from a trusted operator checkout and are excluded from the runtime image and Dokploy execution.
- **Consequences:** The image is multi-stage, non-root, lockfile-frozen, healthchecked at `/health`, receives secrets only as Dokploy runtime variables, and contains no migration SQL or operational scripts. Database releases require a separate controlled operator action before application deployment. Horizontal scaling is still prohibited until Socket.IO/rate-limit coordination is designed. A real staging deployment remains required before production acceptance.
- **Links:** [Deployment](../process/deployment.md), [Architecture](architecture.md), [Realtime](realtime.md).

## ADR-015 — Private proprietary ownership

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** The product is an internal/private commercial system and is not intended for open-source licensing or unrestricted redistribution.
- **Decision:** FuryLeeds and its first-party source, schema, documentation, designs, assets, and configuration are proprietary property of CEDRUS TECHNOLOGY GROUP S.A.C. `package.json` declares `UNLICENSED`; `LICENCE.md` is the controlling repository notice.
- **Consequences:** Access does not grant copying, modification, hosting, distribution, resale, disclosure, or derivative-work rights without express written authorization. Third-party dependencies retain their own licenses and must continue to be reviewed for compatibility.
- **Links:** [Repository license](../../LICENCE.md), [Dependency policy](../process/dependency-policy.md).

## ADR-016 — FuryLeeds product identity and namespaces

- **Date:** 2026-09-24
- **Status:** Accepted
- **Context:** The imported repository identity and its visible/technical namespaces no longer represent the custom product. Keeping both identities would leak the retired brand into UI, generated credentials, webhook contracts, browser persistence, database realtime objects, images, and operational documentation.
- **Decision:** `FuryLeeds` is the sole product/repository brand. Lowercase `furyleeds` is used only where technical formats require it: package name, API-key prefix, PostgreSQL channel/functions/triggers, CSS/localStorage/event identifiers, image tags, and storage examples. Public webhook headers use `X-FuryLeeds-*`. The canonical Git remote is `git@github.com:Yeferson-gm/FuryLeeds.git`.
- **Consequences:** This is intentionally breaking. Migration `0005_rebrand_furyleeds.sql` replaces existing realtime objects and revokes API keys issued under the retired prefix because plaintext keys cannot be transformed. API clients must create new keys; webhook consumers must read `X-FuryLeeds-*`; browser appearance/notification/editor preferences reset under the new local keys. No dual-name compatibility shim remains.
- **Links:** [Database](database.md), [API contracts](api-contracts.md), [Realtime](realtime.md), [Design system](design-system.md), [Git workflow](../process/git-workflow.md).

## Pending architecture decisions

The following are real gaps, not accepted implementations:

| Area | Decision still required |
|---|---|
| Dokploy verification | Staging proof of image build without migration assets, Traefik HTTPS/WebSocket routing, health transition, graceful shutdown, and rollback settings. |
| Ingress hardening | Trusted proxy/client-IP policy, DNS ownership, request limits/timeouts, and production certificate verification. |
| PostgreSQL operations | Hosting topology, supported version, off-host backup, encryption, retention, RPO/RTO, restore owner, and drill cadence. |
| Horizontal scaling | Socket.IO adapter, sticky routing, singleton/listener/worker responsibilities, distributed rate limiting, and scheduler coordination. |
| Durable work | Queue/ledger/lease/retry architecture for provider side effects, inbound work, broadcasts, and outbound webhooks. |
| Security hardening | CSP enforcement plan, possible RLS adoption, AI/provider-token encryption at rest, and credential rotation procedures. |
| Delivery governance | CI/CD, branch/review/release policy, secret distribution, artifact registry, and required checks. |
| Observability | Metrics, tracing/error tracking, alert routing, retention, incident response, and SLO ownership. |

When one is resolved, add an accepted ADR and update all affected architecture and process documents. Do not edit the pending row into an implementation claim without executable evidence.
