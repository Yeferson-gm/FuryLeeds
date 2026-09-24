# Testing Strategy

## Current harness

- Runner: Bun test.
- Full script: `bun test --parallel --preload ./test/setup.ts ./test` (`bun run test`).
- Watch: `bun run test:watch`.
- Setup sets deterministic test `ENCRYPTION_KEY` and `META_APP_SECRET`, then clears mocks after each test.
- Tests live under `test/app`, `test/components`, and `test/lib`, with shared support mocks.
- The suite currently covers route handlers, auth/account roles, API keys, AI, automations/flows, contacts/inbox, dashboards, media/Imgora, rate limiting, webhooks/SSRF/signing, Meta API/webhooks/templates/encryption, broadcasts, presence, and utility logic.
- No verified browser E2E framework, coverage threshold, disposable PostgreSQL integration harness, load suite, or CI execution exists in the current working tree.

## Principles

- Test behavior and security invariants, not private implementation details.
- Prefer pure modules and dependency injection/mocks at external boundaries.
- Keep tests deterministic, isolated, parallel-safe, and free of production credentials/network.
- A regression fix includes a test that fails for the defect and passes for the fix.
- Do not assert only status code when authorization, side effects, or response shape matter.

## Test pyramid

### Unit tests

Required for decision-heavy pure logic: validation, normalization, status transitions, encryption/signing helpers, scopes/roles, idempotency, CSV parsing, file policy, realtime event parsing, AI chunk/context rules, and automation/flow graph logic.

Include boundary values, malformed input, Unicode, empty/missing values, duplicate/replayed input, and deterministic time/random behavior.

### Route/service tests

Exercise route handlers with realistic `Request` objects and controlled auth/database/provider dependencies. Verify:

- success response and exact relevant side effects;
- unauthenticated, forbidden role/scope, expired/revoked key;
- cross-account resource ID;
- validation and body limits;
- conflict/not-found behavior without enumeration;
- provider timeout/non-2xx/malformed response;
- retry/idempotency and partial failure;
- cache/security headers when route-specific.

### Database integration tests

A disposable real PostgreSQL database is required for high-risk query/migration behavior, even though the harness is not yet established. Cover migrations from empty and previous supported schema, constraints/indexes/triggers, transactions/concurrency, Better Auth adapter compatibility, account-scoped queries, PostgreSQL `LISTEN/NOTIFY`, and broadcast counters.

Never point tests at production. Use a clearly disposable database and fail closed on unsafe names/hosts once tooling is added.

### Realtime integration tests

With real custom HTTP/Socket.IO server and disposable PostgreSQL where feasible:

- valid session handshake and account/user room membership;
- no-cookie/invalid session rejection;
- cross-account conversation join denial;
- DB write → notification → correct room event;
- malformed event ignored;
- disconnect/reconnect/recovery and authoritative refetch;
- shutdown closes Socket.IO/listener.

### Browser E2E

Tool choice is a **pending dependency decision**. Minimum critical journeys once established:

1. signup → ChatSend verification → welcome email contract → login;
2. request password-reset OTP → reject wrong/expired code → reset → confirmation email;
3. account invitation and role enforcement;
4. connect/configure WhatsApp in a safe test account;
5. inbound message appears and realtime updates inbox;
6. send message/media and observe status;
7. contacts/pipeline/broadcast critical paths;
8. API key creation and `/api/v1/me`/scoped call;
9. Imgora upload/read/delete authorization.

Use non-production providers or explicit sandboxes/mocks; do not send customer messages.

## Security test matrix

Mandatory when relevant:

- IDOR/cross-account IDs for every resource route;
- Meta raw-body HMAC: valid, invalid, missing, multiple rotated secrets if supported;
- customer webhook HMAC, timestamp format, SSRF private/loopback/redirect/DNS cases;
- API-key malformed/hash/revoked/expired/scope/rate-limit;
- file MIME/size/path/reference tamper/account/collection mismatch;
- cron secret missing/wrong/correct;
- encryption round trip, wrong key/tamper, no secret in errors;
- Socket.IO origin/session/room isolation;
- HTML escaping and safe response fields.

## External adapter tests

Use mocked `fetch` for ChatSend, Imgora, Meta, AI, and customer webhooks. Test request method/headers/body without snapshotting secrets; success, timeout, network error, malformed JSON, expected error statuses, unexpected statuses, and abort behavior. Small manual sandbox smoke tests complement but never replace automated contract tests.

## External API smoke suite

`test/test.sh` is a POSIX-shell smoke test for every machine-facing inbound operation: `GET|HEAD /health`, all 16 public `/api/v1` method/path contracts, Meta webhook verification/intake, and both scheduler routes. It runs against an already-started FuryLeeds process and a real non-production PostgreSQL database; it complements rather than replaces isolated Bun route/service tests.

Prerequisites:

- `curl`;
- a running instance selected by `BASE_URL` (default `http://localhost:3000`);
- a non-production `furyleeds_live_*` key in `API_KEY` with all seven public scopes: `messages:send`, `messages:read`, `contacts:read`, `contacts:write`, `conversations:read`, `broadcasts:send`, and `webhooks:manage`.

Run it without placing the key in source or documentation, for example by exporting `API_KEY` securely in the current shell and then executing:

```bash
bun run test:external
```

The default suite is intentionally non-destructive. Read operations use a synthetic valid UUID for not-found checks. Write/provider routes receive deliberately invalid bodies, a missing Meta signature, or an intentionally wrong cron secret and must reject them before persistent writes, WhatsApp sends, broadcast dispatch, inbound processing, or scheduled work. Cron accepts `401` when configured and `503` when the server has no cron secret. The script prints only labels and status codes: it does not print API keys, authorization headers, or response bodies that may contain tenant data.

`test:external` is not included in `bun run test` because it requires a live server, database, and explicitly provisioned API key. Do not point it at production: even though the expected default path is side-effect free, it authenticates against and reads real tenant resources.

The root `api.http` collection contains manual examples for the same surfaces. Some examples intentionally demonstrate real writes and provider effects; execute only entries marked `EFECTO REAL` against a controlled test account after reviewing their payloads.

## UI and accessibility

Test state reducers/helpers and critical interactive components. Manually verify affected pages for keyboard, focus, labels, screen-reader names, reduced motion, responsive layout, loading/empty/error, and realtime reconnect. Add automated browser accessibility checks after an E2E tool is approved.

## Commands and progression

```bash
# focused file
bun test --preload ./test/setup.ts ./test/lib/storage/imgora.test.ts

# focused name
bun test --preload ./test/setup.ts ./test -t "description"

# full isolated Bun tests
bun run test

# live external contract smoke; requires a running server and API_KEY
bun run test:external

# static/build gates
bun run check
bun run typecheck
bun run build
```

Because the configured full suite is parallel, new tests must not share mutable globals, ports, fixed rows, or mock state unsafely.

## Coverage and flakiness

No numeric coverage gate is verified. Prefer risk-based coverage over an invented percentage. If coverage tooling is adopted, measure statements/branches/functions for security- and decision-heavy modules and forbid gaming with trivial tests.

A flaky test is a defect: quarantine only with owner, reason, issue, and expiry; never silently skip. Investigate timers, random IDs, time zones, mock leakage, parallel shared state, and network dependence.

## Merge/release expectations

Focused tests while developing; full test, typecheck, check, and build for behavioral releases. Migration/realtime/provider changes also require production-like integration smoke. Document exact results and pre-existing failures separately; never claim a check that was not run.
