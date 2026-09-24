# Feature Intake

## Purpose

Use this before implementation. The output is a short decision record attached to the issue/change, not ceremony for its own sake.

## 1. Problem and outcome

- Who experiences the problem: owner, admin, agent, viewer, API integrator, or WhatsApp contact?
- What observable outcome defines success?
- What is explicitly out of scope?
- Is the request a feature, defect, migration, operational capability, or security control?
- What evidence shows the problem exists and how often?

## 2. Surface ownership

Identify every affected layer:

- Next App Router page/layout/component;
- route handler under `src/app/api`;
- domain/integration module under `src/lib`;
- Better Auth/session/API-key context;
- Drizzle schema/query/migration;
- Socket.IO event and PostgreSQL trigger;
- Meta, ChatSend, Imgora, Google, AI provider, or customer webhook;
- VPS proxy, scheduler, secrets, backup, or deployment process.

Name one source of truth for each business state. Realtime notifications and UI caches are not authoritative; PostgreSQL-backed state is.

## 3. User and authorization model

- Which roles can view, create, mutate, delete, export, or administer it?
- Is authentication cookie session, scoped API key, public signed webhook, or another verified mechanism?
- From where is `accountId` derived?
- Can any caller-controlled resource ID cross an account boundary?
- Are superadmin capabilities involved, and are they necessary?
- What audit evidence is required?

Any feature without a concrete tenant and authorization model is not ready.

## 4. Data design

- Tables/columns/constraints/indexes affected?
- Append-only migration required?
- Null/default/backfill strategy?
- Uniqueness and idempotency key?
- Transaction boundaries and ambiguous-commit behavior?
- Data retention/deletion/export implications?
- PII, message content, access tokens, provider secrets, or AI keys involved?
- Query cardinality and pagination limits?
- Compatibility between old/new app versions during deploy?

## 5. API and event contracts

- Endpoint method/path, request validation, status codes, and response envelope?
- Session/API-key scope and rate-limit dimension?
- Is the operation retry-safe? Define idempotency/replay behavior.
- Does it change PostgreSQL notification payloads or Socket.IO events?
- How does a reconnect recover missed realtime events?
- Does it create/change outbound customer webhooks and signatures?
- Are API consumers versioned or otherwise protected from breaking changes?

## 6. External systems

### Meta

Define Graph API version assumptions, permissions, webhook authenticity, provider IDs, rate limits, retry/status semantics, and test credentials.

### ChatSend

Define which auth/user event sends mail, enqueue acceptance behavior, timeout, idempotency, and user messaging on failure.

### Imgora

Define collection, MIME/size policy, account folder, signed reference use, upload/delete lifecycle, and orphan cleanup.

### AI providers

Define BYO-key handling, account scoping, token/cost limits, timeout, data shared externally, prompt injection boundaries, and human fallback.

## 7. Realtime/background execution

- Can work complete inside the request safely?
- If using `after()`, what happens if the VPS process exits after response?
- Is durable queue/state required?
- Can two requests/schedulers execute concurrently?
- What claim/lock/idempotency prevents duplication?
- What user-visible status represents queued/running/failed/retryable?

## 8. Security and privacy review

Complete `security-checklist.md` for auth, secrets, files, URLs, webhooks, AI, or cross-account data. Define validation limits, SSRF handling, encryption, redaction, retention, abuse controls, and incident response implications.

## 9. Performance budget

Estimate:

- request count and largest payload;
- expected/peak row counts and query plan;
- database connections/transaction duration;
- client bundle and hydration cost;
- memory for uploads, CSV, audio, and broadcasts;
- external round trips/timeouts;
- Socket.IO event volume and room fanout.

State how the estimates will be measured.

## 10. Failure and recovery design

For each dependency and write step, answer:

- timeout/unavailable/malformed response behavior;
- partial success and compensation;
- retry owner and maximum attempts;
- duplicate/replay behavior;
- operator signal and customer message;
- rollout flag/dry run if risk warrants it;
- rollback versus roll-forward.

## 11. Test plan

List exact unit, route, integration, migration, security, UI/accessibility, realtime, and production smoke tests. Reuse Bun tests and current support mocks. If a required test level is not feasible, explain the gap and compensating validation.

## 12. Operations and documentation

- New/changed environment variables and secret owner?
- Proxy/body/timeouts/scheduler changes?
- Health/readiness and observability signal?
- Deployment order, backup requirement, and rollback?
- Docs to update under `documentation-policy.md`?

## Readiness decision

Record one:

- **Ready** — scope, owner, contracts, security, data, tests, and rollout are clear.
- **Needs discovery** — list unanswered questions and owner.
- **Rejected/deferred** — explain product/architecture/cost reason.

Operational decisions not verifiable in this repository must be labeled **Pending decision**, never silently assumed.
