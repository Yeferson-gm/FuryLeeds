 # FuryLeeds — Agent entry point

> **Read this file first in every session.** It is the mandatory entry point for agents and developers working in this repository. It explains what to read, which decisions are already closed, where each kind of change belongs, and which documentation must be updated before delivery.

## 1. Product in one paragraph

FuryLeeds is a multi-tenant WhatsApp CRM for teams. It provides a shared inbox, contacts, tags and custom fields, sales pipelines and deals, broadcasts, WhatsApp templates, automations, interactive flows, AI-assisted replies, notifications, presence, files, account administration, and a scoped public API. Each registered customer owns an account tenant. Tenant roles are `owner`, `admin`, `agent`, and `viewer`; `superadmin` is a system-level SaaS administrator role.

The application is one full-stack Next.js codebase running on Bun. PostgreSQL is the source of truth. Better Auth owns human authentication, ChatSend sends transactional authentication email, Imgora stores files outside the VPS, Meta provides WhatsApp Cloud API, and Socket.IO provides realtime updates from PostgreSQL `LISTEN/NOTIFY` events.

## 2. Mandatory reading order

Before changing code:

1. [`AGENTS.md`](./AGENTS.md) — this entry point.
2. [`ROLE.md`](./ROLE.md) — expected engineering role and decision standard.
3. [`SYSTEM.md`](./SYSTEM.md) — complete system map and locked-in architecture.
4. [`MEMORY.md`](./MEMORY.md) — current state, completed work, known gaps, and next actions.
5. [`docs/README.md`](./docs/README.md) — documentation index.
6. The architecture document relevant to the task:
   - [System architecture](./docs/arquitecture/architecture.md)
   - [Database](./docs/arquitecture/database.md)
   - [API contracts](./docs/arquitecture/api-contracts.md)
   - [Security](./docs/arquitecture/security.md)
   - [Realtime](./docs/arquitecture/realtime.md)
   - [Integrations](./docs/arquitecture/integrations.md)
   - [Frontend](./docs/arquitecture/frontend.md)
   - [Design system](./docs/arquitecture/design-system.md)
7. The owning module document in [`docs/modules/`](./docs/modules/_index.md).
8. The applicable process document in [`docs/process/`](./docs/README.md#engineering-process).

If code, tests, and documentation disagree, investigate. Current executable behavior and tests have higher authority than prose, but stale documentation must be corrected in the same workstream.

## 3. Locked-in decisions

Do not reopen these decisions unless the user explicitly requests an architecture change.

### Runtime and application

- Bun is the runtime, package manager, test runner, and native SQL provider.
- Next.js 16 App Router and React 19 are the web application framework.
- Production and development must start through `server.ts`; `next start` alone omits Socket.IO.
- TypeScript is strict and Biome owns linting/formatting.
- Tailwind CSS v4 is the styling system.
- Production deployment uses a Dokploy Application with the repository `Dockerfile`; Docker Compose is not an active deployment path.
- The system is private proprietary software owned by CEDRUS TECHNOLOGY GROUP S.A.C.

### Data

- PostgreSQL on the user's own VPS is the only application database.
- Drizzle ORM/Kit is the only ORM and migration system.
- Database access uses Bun's native `Bun.SQL` through `drizzle-orm/bun-sql`.
- No Supabase, InsForge, Firebase, hosted database abstraction, or second ORM.
- Tenant data is scoped by `account_id` in application queries and parent joins. The repository currently contains no PostgreSQL RLS policy layer; never claim otherwise.

### Authentication and authorization

- Better Auth owns email/password sessions and Google OAuth.
- Browser authentication uses Better Auth cookies.
- Account roles are `owner > admin > agent > viewer`.
- `superadmin` is a system role for the SaaS operator; it does not remove the need to resolve an account context for tenant data.
- Public API clients use account-bound API keys and scopes; browser cookies and public API credentials are separate trust boundaries.

### Integrations

- ChatSend sends authentication email from server-side code. Its secrets never enter browser bundles.
- Imgora stores uploaded media and assets. Files must not be persisted on the VPS filesystem.
- Meta WhatsApp Cloud API owns message delivery, templates, webhooks, media download, reactions, and registration.
- AI is bring-your-own-provider-key for supported OpenAI/Anthropic-compatible paths.

### Realtime

- Socket.IO is mandatory for application realtime.
- Realtime transport is WebSocket-only; no polling fallback.
- PostgreSQL triggers publish `NOTIFY` events; one Bun listener forwards them to authenticated Socket.IO rooms.
- Snapshot HTTP routes may initialize or recover state, but repeated HTTP polling must not replace realtime.

### Quality

- No compatibility shims, legacy request shapes, dead code, orphan exports, commented-out implementations, or speculative abstractions.
- Do not silence diagnostics with ignores, `any`, `ts-ignore`, disabled rules, or meaningless wrappers.
- Do not add a dependency when Bun, Next, React, Drizzle, Better Auth, Socket.IO, native `fetch`, or existing utilities already solve the problem.
- Fix causes, not symptoms.
- Every meaningful behavior change requires matching documentation.

## 4. Repository map

```text
./
├── AGENTS.md                 agent entry point
├── LICENCE.md                proprietary ownership and use restrictions
├── Dockerfile                Dokploy production image
├── ROLE.md                   expected engineering role
├── SYSTEM.md                 system-wide technical reference
├── MEMORY.md                 living project memory
├── README.md                 human onboarding and setup
├── docs/
│   ├── README.md             documentation index
│   ├── TODO.md               scoped debt and unresolved findings
│   ├── arquitecture/         architecture and cross-cutting contracts
│   ├── modules/              functional modules, pages, components, hooks
│   └── process/              engineering and operational policies
├── drizzle/                  SQL migrations and Drizzle snapshots
├── scripts/                  operational scripts, currently migration runner
├── src/app/                  pages, layouts, and route handlers
├── src/components/           feature and UI components
├── src/hooks/                browser state/integration hooks
├── src/lib/                  domain services and infrastructure
├── test/                     Bun test suite
├── public/                   public assets and vendored Opus worker
└── server.ts                 Next + Socket.IO Bun process entry point
```


## 5. Ownership map

| Change | Primary documentation |
|---|---|
| Runtime or system topology | `SYSTEM.md`, `docs/arquitecture/architecture.md` |
| Docker/Dokploy deployment | `Dockerfile`, `.dockerignore`, `docs/process/deployment.md` |
| Ownership or licensing | `LICENCE.md`, `README.md`, `package.json` |
| Table, constraint, migration, query invariant | `docs/arquitecture/database.md` |
| HTTP route or payload | `docs/arquitecture/api-contracts.md` and owning module doc |
| Auth, roles, tenant isolation, secrets | `docs/arquitecture/security.md`, `docs/modules/auth-and-accounts.md` |
| Socket event, room, trigger, reconnect behavior | `docs/arquitecture/realtime.md` |
| Meta, ChatSend, Imgora, AI provider | `docs/arquitecture/integrations.md` and module doc |
| Page or navigation flow | `docs/modules/pages.md`, `docs/arquitecture/frontend.md` |
| Component or hook | `docs/modules/components.md` or `docs/modules/hooks.md` |
| Design token or UI primitive | `docs/arquitecture/design-system.md` |
| Functional domain | matching file under `docs/modules/` |
| Testing/dependency/deploy/process | matching file under `docs/process/` |
| Durable architecture decision | `docs/arquitecture/decisions.md` |
| Out-of-scope bug/debt | `docs/TODO.md` |
| Work completed/current next step | `MEMORY.md` |

## 6. Change procedure

### Before implementation

1. Identify the owning module and trust boundary.
2. Read the relevant architecture/module/process docs.
3. Search existing code and tests before designing a new pattern.
4. Determine whether schema, API, realtime, permissions, environment, or provider contracts change.
5. Define focused validation before editing.

Use [Feature intake](./docs/process/feature-intake.md) for meaningful work.

### During implementation

- Keep tenant constraints explicit.
- Validate untrusted input before side effects.
- Require server-side authorization; UI gates are not security boundaries.
- Keep secrets server-only and redact logs/errors.
- Preserve idempotency for Meta callbacks and externally retried requests.
- Keep Socket.IO events typed and room-scoped.
- Add migrations rather than manually mutating production schema.
- Update tests and documentation with behavior.

### Before delivery

Follow [Definition of Done](./docs/process/definition-of-done.md). At minimum run the checks relevant to the change:

```bash
bun run check
bun run typecheck
bun run test
bun run build
bunx drizzle-kit check
git diff --check
```

For a schema change, also run `bun run db:migrate` against an authorized non-production database. Never claim migration success if credentials prevented execution.

## 7. Documentation obligations

Documentation is a deliverable, not optional cleanup.

- New module: add a file under `docs/modules/` and link it from `_index.md`.
- New API route: update the complete route inventory and module docs.
- New page/component/hook: update `pages.md`, `components.md`, or `hooks.md`.
- New integration/environment variable: update integrations, security, deployment, tooling, and README as applicable.
- New realtime event: document source trigger, payload, rooms, authorization, reconnect/refetch, and durability.
- New durable decision: add an ADR entry.
- Completed milestone or newly discovered blocker: update `MEMORY.md`.

Primary documentation language is English. Spanish is appropriate for user-facing copy, TODO entries, operator notes, and short contextual explanations.

## 8. Security non-negotiables

- Never expose `DATABASE_URL`, Better Auth secrets, Google OAuth secrets, Meta tokens/app secret, encryption keys, ChatSend keys/tokens, Imgora keys, AI provider keys, API keys, session cookies, invitation tokens, or cron secrets.
- Never accept an `accountId` from the browser as authorization proof.
- Never trust a UUID merely because it exists.
- Never log raw authorization headers, cookies, message bodies, contact PII, provider secrets, or signed file references.
- Preserve raw-body verification for Meta webhooks.
- Preserve SSRF defenses for outbound webhooks and remote media operations.
- Treat encryption-key replacement as a credential recovery/migration operation; there is no legacy fallback decryption.

Read [Security architecture](./docs/arquitecture/security.md) and [Security checklist](./docs/process/security-checklist.md) for sensitive work.

## 9. Known architectural constraints

These are current facts, not invitations to patch around them:

- Rate limiting is process-local and unsuitable as a global limit under horizontal scaling.
- Socket.IO uses an in-memory adapter; horizontal scaling requires an explicit adapter/sticky-routing decision.
- Next `after()` work is not a durable queue.
- Outbound customer webhooks are best-effort and have no durable retry ledger.
- CSP is report-only.
- AI embedding schema/query compatibility requires verification before semantic retrieval is considered production-ready.
- Dokploy/Dockerfile is the accepted deployment path, but staging deployment verification, PostgreSQL backups, CI image policy, monitoring, and restore drills remain operational gaps.

See [`MEMORY.md`](./MEMORY.md) and [`docs/TODO.md`](./docs/TODO.md).

## 10. Final rule

A good FuryLeeds agent does not merely generate code. It preserves tenant boundaries, understands provider side effects, keeps realtime truly realtime, removes obsolete paths, updates the documentation graph, validates honestly, and leaves enough memory for the next agent to continue without reconstructing the project from scratch.
