# Observability

## Current state

FuryLeeds currently uses human-readable `console.info`, `console.warn`, and `console.error` messages. The custom server logs startup, request-handler failures, graceful shutdown, Socket.IO failures, malformed PostgreSQL notifications, provider/webhook failures, and selected background failures. `GET|HEAD /health` provides a minimal non-cacheable container health signal. There is no verified metrics backend, tracing SDK, error tracker, alert manager, request-correlation middleware, deep dependency health endpoint, or structured JSON logger.

The Dokploy container emits logs to stdout/stderr. Dokploy/VPS log collection, retention, search, dashboards, and alert routing are **pending operational decisions**.

## Objectives

Operators must be able to answer:

- Is the process alive and ready?
- Are users authenticated and account boundaries intact?
- Are Meta webhooks arriving and being processed?
- Are outbound messages, emails, files, AI requests, and customer webhooks succeeding?
- Is PostgreSQL healthy, saturated, blocked, or missing notifications?
- Are Socket.IO clients connecting, recovering, and receiving tenant-scoped events?
- Are scheduled automations/flows running without overlap/backlog?
- Which release introduced a regression?

## Logging contract

New operational logs should be one event per line, preferably structured JSON once a shared logger is deliberately introduced. Do not add a logging dependency merely to obtain JSON.

Recommended fields when available:

- `timestamp`, `level`, `event`, `message`;
- `service=furyleeds`, `environment`, `release`;
- `request_id`, `method`, normalized `route`, `status`, `duration_ms`;
- `account_id`, `user_id`, `api_key_id` (opaque IDs only when necessary);
- `provider`, `operation`, provider status/code, `duration_ms`;
- `conversation_id`, `message_id`, `broadcast_id`, `job_id` where operationally necessary;
- error class/code and stack for unexpected exceptions.

Use stable event names such as `http.request.completed`, `meta.webhook.rejected`, `realtime.listener.failed`, `chatsend.enqueue.failed`, or `imgora.upload.completed`. Avoid dynamic values in event names.

## Prohibited log data

Never log:

- cookies, session tokens, API keys, OAuth/Meta/ChatSend/Imgora/AI credentials;
- `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, cron secret, webhook secret/signature inputs;
- raw email reset/verification URLs or tokens;
- full request/response bodies, WhatsApp message content, uploaded files, AI knowledge/prompt content;
- SQL query text or bound parameter arrays from ORM/driver exceptions, because parameters may contain contact PII, message content and document URLs;
- plaintext or encrypted credential columns;
- `DATABASE_URL`, authorization headers, full customer webhook URLs with sensitive query strings;
- unnecessary names, emails, phones, IPs, or user agents.

Use allowlisted metadata and redaction at creation time; “we will scrub later” is not sufficient.

## Request correlation

Introduce or propagate a bounded request ID for HTTP calls. Accept an upstream ID only after syntax/length validation, otherwise generate one. Return it in a response header and propagate it to internal logs and safe outbound metadata where supported. Do not use request IDs as authorization or idempotency keys.

Background `after()` work needs its own operation ID linked to the initiating request, because it may outlive the response. Meta provider message IDs and webhook event IDs can be logged in controlled form when required for reconciliation.

## Metrics to establish

### HTTP and runtime

- request rate, status classes, latency by normalized route;
- process restarts, uptime, RSS/heap, CPU, event-loop lag;
- active requests and graceful-shutdown duration.

### PostgreSQL

- pool in-use/idle/wait, acquisition/connect/query latency, error/deadlock counts;
- connection total versus PostgreSQL limit;
- migration success/failure;
- realtime listener connected/reconnect/failure and malformed payload counts.

### Auth/security

- login/signup/reset outcomes without account enumeration;
- invalid Meta signatures, API-key auth failures, scope denials, rate-limit rejects;
- Socket.IO handshake rejection categories;
- customer webhook SSRF rejections and automatic endpoint disables.

### Providers/features

- Meta inbound accepted/processed/failed and processing lag;
- outbound send/status failures and broadcast progress/stalls;
- ChatSend token/enqueue latency and failure;
- Imgora upload/get/delete latency, bytes, timeout/error, orphan reconciliation;
- AI request latency, timeout, provider status, token/cost metadata where safely available;
- Socket.IO connections, reconnects, room joins denied, event volume;
- cron starts/completions/failures/duration and pending execution age.

Metrics must not use unbounded labels such as email, phone, URL, message text, or arbitrary IDs.

## Health endpoints

`GET /health` returns `200` with a minimal `{ "status": "ok" }`; `HEAD /health` returns `204`. Both are public, non-cacheable, and intentionally disclose no configuration, dependency, release, or host details. The Docker image uses this route for its healthcheck.

The HTTP server starts listening only after Next.js is prepared and the PostgreSQL realtime listener has initialized, so the route is suitable for Dokploy startup/rollout health. It does not issue a fresh PostgreSQL or provider request on every probe. If operations later require separate deep readiness or protected dependency diagnostics, define their failure semantics before implementation; provider outages must not automatically cause destructive restart loops.

## Alert candidates

Initial alerts should be based on measured baselines, not invented thresholds:

- readiness unavailable or restart loop;
- elevated 5xx/latency;
- PostgreSQL connection exhaustion/deadlocks;
- realtime listener disconnected;
- Meta signature rejections or inbound processing failures;
- ChatSend/Imgora/Meta sustained provider errors;
- stalled broadcast/automation/flow work;
- webhook endpoints being disabled rapidly;
- disk/memory/CPU saturation and failed backups.

Exact thresholds, on-call routing, retention, dashboards, and SLOs are **pending decisions**.

## Incident evidence

Record UTC timeline, release SHA, configuration changes (names, never values), symptom, impacted accounts/counts, provider status, mitigation, and reconciliation. Preserve only the minimum sensitive evidence under access control and retention policy.
