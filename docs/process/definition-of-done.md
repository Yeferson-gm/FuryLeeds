# Definition of Done

## Purpose

A FuryLeeds change is done only when implementation, security, data behavior, operations, tests, and documentation agree. “Compiles on my machine” is not done.

## Verified project baseline

FuryLeeds is a single Bun application built with Next.js 16 App Router and React 19. `server.ts` owns the HTTP server and attaches Socket.IO to the same process. PostgreSQL is accessed through one lazy `Bun.SQL`/Drizzle runtime pool, while realtime uses a dedicated PostgreSQL `LISTEN` connection. Better Auth, ChatSend, Imgora, Meta WhatsApp Cloud API, and optional Google/AI providers are server-side boundaries.

## Universal completion gate

Every applicable item must be true:

- [ ] The requested outcome and explicit non-goals are satisfied.
- [ ] The change is minimal, contains no unrelated cleanup, and preserves existing user work.
- [ ] Strict TypeScript passes with `bun run typecheck`.
- [ ] Biome checks pass with `bun run check`; automatic rewrites were reviewed.
- [ ] Relevant Bun tests pass; the full command is `bun test --parallel --preload ./test/setup.ts ./test` or `bun run test`.
- [ ] `bun run build` passes for changes that can affect Next.js compilation, routing, server/client boundaries, or production output.
- [ ] No warning or failure is hidden with `any`, `@ts-ignore`, skipped tests, disabled checks, swallowed exceptions, or dead code.
- [ ] User-facing failure states are intentional and do not expose internals or secrets.
- [ ] Relevant documentation is updated under the policy in `documentation-policy.md`.
- [ ] The final report lists commands actually run and any check not run.

## Architecture and runtime

- [ ] Production behavior is compatible with Bun `>=1.4.0`; database code is not assumed to run under Node.js.
- [ ] Changes preserve the custom `server.ts` entrypoint when realtime is required; `next start` alone is not an equivalent runtime.
- [ ] Server-only credentials and adapters never enter client bundles.
- [ ] New background work has a durable ownership model. Request-bound `after()` work is acceptable only when its failure and process-termination semantics are understood.
- [ ] Graceful shutdown implications are reviewed for HTTP, Socket.IO, PostgreSQL pools/listeners, and in-flight work.

## Authentication, authorization, and tenancy

- [ ] Better Auth session checks are enforced on protected browser/API surfaces.
- [ ] `/api/v1/*` API-key flows validate key format, hash lookup, revocation, expiry, scope, rate limit, and account binding.
- [ ] Every business read/write includes the authenticated `accountId`; resource IDs supplied by callers are never sufficient authorization.
- [ ] Socket.IO authenticates the cookie before joining account/user/conversation rooms.
- [ ] Role-sensitive actions test owner/admin/agent/viewer behavior as applicable.
- [ ] Public routes such as Meta webhooks and invitation peeks have explicit abuse and authenticity controls.

## Database and migrations

- [ ] Schema changes modify the Drizzle schema and add a new append-only SQL migration under `drizzle/`.
- [ ] `bun run db:generate` output is reviewed; released migrations are not rewritten.
- [ ] Migration forward compatibility, lock duration, backfill cost, defaults, constraints, indexes, and rollback/roll-forward behavior are documented.
- [ ] `bun run db:migrate` is tested against a disposable non-production PostgreSQL database when a migration changes.
- [ ] Queries use the shared pool and preserve account scoping, uniqueness, idempotency, and transactional boundaries.
- [ ] Realtime schema changes preserve `furyleeds_realtime_v1` payload shape and PostgreSQL `NOTIFY` size constraints.

## External integrations

### Meta WhatsApp

- [ ] Raw webhook bytes are verified with `X-Hub-Signature-256` before JSON processing.
- [ ] Access/verify tokens remain encrypted and never appear in logs or responses.
- [ ] Webhook replay, duplicate message IDs, status ordering, rate limits, and Meta timeouts are tested.

### ChatSend

- [ ] Auth email failures follow the intended fail-open/fail-closed behavior.
- [ ] No API key/access token is logged.
- [ ] Timeout, non-JSON, auth failure, and non-202 send behavior are handled and tested.

### Imgora

- [ ] File type and byte limits are enforced before upload.
- [ ] Asset references remain signed and bound to account plus collection.
- [ ] Credentials remain server-side; provider URLs are validated; timeout/error mapping is tested.
- [ ] Deletion and orphan-cleanup implications are addressed.

## Realtime

- [ ] Events are tenant-scoped and room membership is authorized.
- [ ] Client behavior tolerates reconnect, duplicate events, missed transient notifications, and recovery by refetching authoritative HTTP data.
- [ ] Database triggers/listener and Socket.IO contracts are updated together.
- [ ] WebSocket-only proxy requirements are reflected in deployment documentation when changed.

## UI and accessibility

- [ ] Loading, empty, success, validation, permission, offline, and provider-failure states are covered where relevant.
- [ ] Keyboard operation, focus, labels, semantics, contrast, and reduced-motion behavior are reviewed.
- [ ] Client components are used only when interaction requires them; secrets and privileged queries remain server-side.
- [ ] Responsive behavior is manually checked for affected screens.

## Operational readiness

- [ ] Required environment variables are identified without committing values.
- [ ] Logs provide actionable context without PII, message bodies, cookies, tokens, API keys, encrypted values, or provider credentials.
- [ ] Performance impact respects `performance-budget.md` or includes measured evidence and an approved exception.
- [ ] A deployment and rollback/roll-forward plan exists for risky changes.
- [ ] Any dependency outage has an explicit user-visible and operator-visible outcome.

## Release blocker rule

Security regressions, cross-account access, data loss/corruption risk, failing required checks, an untested migration, missing production configuration, or an undefined backup/restore path for a destructive release blocks deployment. Current VPS delivery details remain a pending operational decision; no change may pretend otherwise.
