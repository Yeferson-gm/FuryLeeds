# Failure Mode Policy

## Principle

Fail closed for authentication, authorization, tenant scope, signatures, and secret/config validation. Fail visibly and recoverably for dependencies. Never convert data uncertainty into silent success.

## Universal response sequence

1. Contain: stop unsafe writes, rollout, or traffic if integrity/security is at risk.
2. Preserve: keep relevant logs, revision, timestamps, request/provider IDs, and database evidence without copying secrets or PII.
3. Classify: security, data integrity, availability, performance, or external dependency.
4. Restore: choose rollback, roll forward, retry, provider degradation, or database restore based on evidence.
5. Verify: test user-visible behavior and invariants, not only process health.
6. Learn: add a regression test and update runbooks/policies for material incidents.

## Severity guide

- **SEV-1:** cross-account access, credential exposure, destructive corruption, total outage, or unrecoverable inbound-message loss.
- **SEV-2:** critical flow unavailable, sustained webhook/Socket.IO failure, auth/email failure blocking users, or severe degradation.
- **SEV-3:** bounded feature/provider failure with workaround and no integrity risk.
- **SEV-4:** cosmetic/local issue or developer-tooling failure.

Incident roles, paging channels, and response-time targets are **pending operational decisions**.

## Startup/configuration failures

Missing `DATABASE_URL`, invalid production `BETTER_AUTH_URL`, invalid port, or missing feature credentials must produce a clear secret-safe error. Do not substitute localhost or dummy credentials in production. A process that cannot initialize mandatory database/realtime behavior must not receive traffic.

## PostgreSQL failures

Expected symptoms include pool acquisition timeout, connection refusal, migration mismatch, deadlock, constraint violation, or lost `LISTEN` connection.

- Reject/return errors rather than serving cross-tenant or stale privileged data.
- Do not create a new pool per retry/request.
- Bound retries with jitter only for known transient/idempotent operations.
- Treat unknown commit outcome as ambiguous; verify database state before replaying writes.
- Realtime clients must refetch authoritative HTTP state after reconnect because PostgreSQL notifications are transient.
- On migration failure, stop deployment; never mark the migration as applied manually without reconciling schema and journal.

## Better Auth and ChatSend

Better Auth signup/reset/verification may invoke ChatSend. When ChatSend authentication or enqueue fails:

- preserve generic user-safe errors and avoid account enumeration;
- never log API keys, access tokens, verification URLs, reset OTPs, recipients, cookies, or email body;
- the adapter considers verification delivery accepted only on ChatSend `202`; Better Auth catches/logs callback failures, so do not present signup completion as proof of delivery;
- reset-code request UI remains deliberately non-enumerating because delivery is deferred; it says only that a code was sent if the account exists;
- retry only with a stable idempotency model; the generic fallback email key includes a UUID and is not sufficient for automatic exactly-once retry;
- expose provider failure to operators without logging sensitive mail data.

If auth secrets change unexpectedly, sessions or signed references may become invalid. Rotate through a documented coordinated procedure.

## Meta webhook and outbound messaging

- Invalid/missing `X-Hub-Signature-256`: return `401`; never process.
- Invalid JSON after valid signature: return `400`.
- Missing account configuration: do not attach the event to another account; log controlled identifiers and investigate.
- Duplicate/replayed inbound events: rely on unique provider IDs/transactional idempotency; never weaken constraints to “make it pass.”
- Meta timeout/rate limit: classify retryability, obey provider guidance, and preserve message status.
- Acknowledged webhook processing runs through Next `after()` and is process-bound. A crash after `200` can lose unfinished work; durable ingestion is a known architectural risk and must be addressed before stronger delivery guarantees are claimed.

## Imgora

- Timeout/unavailable/invalid response: return a controlled 502-style failure and keep database state consistent.
- Validation/size/type failure: reject before upload.
- Successful upload followed by database failure can orphan an asset; record enough non-secret identity to reconcile and define cleanup.
- Never return or log `IMGORA_API_KEY`.
- Signed references failing HMAC/account/collection checks respond as not found to avoid enumeration.

## Socket.IO and realtime

- Failed session/account lookup: reject handshake.
- Malformed PostgreSQL payload: ignore and warn; do not broadcast.
- Lost connection/restart: reconnect and refetch summaries/threads; notifications are hints, not the source of truth.
- Never join a conversation room before confirming it belongs to the socket account.
- Repeated listener failure should make readiness fail once health checks exist.

## Scheduled and background work

Automation/flow cron routes return unavailable when `AUTOMATION_CRON_SECRET` is absent and compare supplied secrets safely. Schedulers must handle non-2xx, overlap, and timeout. Long-running campaign/automation work needs claims/idempotency and durable state. Never rely on detached promises; understand `after()` termination semantics.

## Outbound customer webhooks

Current delivery signs payloads, rejects non-public targets, disables endpoints after 15 consecutive failures, and uses a 5-second timeout. It does not implement a durable retry queue.

- Do not follow redirects.
- Maintain SSRF checks at delivery time, including DNS behavior.
- Do not log endpoint secrets or payloads containing sensitive data.
- Surface disabled endpoints and failure count to operators/users.
- Never promise at-least-once delivery until durable attempts/retries exist.

## Rate-limit failure

The limiter is in memory and per process. Restart resets it; multiple replicas multiply capacity. Do not present it as distributed abuse protection. If scaling beyond one process, replace it with a shared atomic store while preserving tenant/user/API-key dimensions.

## Validation failures during development

Assume a newly failing check is caused by the current change until proven otherwise. Reproduce narrowly, fix root cause, then run broader checks. Do not delete tests, loosen assertions, disable Biome/TypeScript, regenerate snapshots blindly, or add dependencies to mask the issue.

## Out-of-scope discoveries

Do not modify unrelated behavior unless it blocks delivery or is an active security/data-integrity issue. Report the finding with impact and reproduction in the agreed tracker. `docs/TODO.md` exists, but whether it is the authoritative tracker is a **pending process decision**.

## Incident exit criteria

Service is restored, data/security invariants are verified, delayed/ambiguous operations are reconciled, exposed credentials are rotated, customers/operators receive appropriate communication, and follow-up work has an owner. “The process restarted” is not sufficient.
