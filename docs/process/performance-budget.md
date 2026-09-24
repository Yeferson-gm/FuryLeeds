# Performance Budget

## Status

The repository contains no verified production baseline or load-test harness. The values below are initial engineering targets and must be calibrated on the actual VPS, PostgreSQL size, network, and representative data. They are not claims about current performance.

## Measurement rules

- Measure production builds through `bun run start`, not Next dev mode.
- Use representative, synthetic, account-scoped data; never copy production PII casually.
- Report p50/p95/p99, sample size, concurrency, payload/data size, warm/cold state, VPS shape, PostgreSQL shape, and release SHA.
- Separate application time from Meta/ChatSend/Imgora/AI/customer-webhook time.
- Compare like for like; one local run is not a benchmark.

## Initial user-facing targets

### Web pages

- LCP: ≤2.5 s at p75 on representative mobile conditions.
- INP: ≤200 ms at p75.
- CLS: ≤0.1 at p75.
- Initial route JavaScript: avoid >200 KiB gzip without measured justification; track route-specific output from Next build tooling when available.
- No unbounded list rendering; paginate or virtualize contacts, conversations, messages, broadcasts, and logs.

### First-party HTTP APIs

Excluding external-provider wait time:

- simple indexed reads: p95 ≤250 ms;
- normal writes: p95 ≤500 ms;
- dashboard/aggregate reads: p95 ≤1 s with explicit row/time range bounds;
- error responses should not perform substantially more work than success paths.

These are starting budgets; an endpoint with a documented provider call gets a separate dependency budget.

## External dependency budgets

- Every provider call must have an explicit timeout.
- Imgora currently uses 120 s; treat this as an upload ceiling, not a normal latency target.
- Customer webhook delivery currently uses 5 s.
- AI timeout is configurable through `AI_REQUEST_TIMEOUT_MS` with code-defined fallback.
- ChatSend and Meta calls must not be allowed to hang indefinitely; missing explicit timeout is performance/reliability debt.
- Retries must be bounded, jittered where appropriate, and safe for idempotency.

## Meta webhook intake

Return acknowledgment quickly after signature validation and JSON acceptance; target p95 <1 s before `after()` processing. Track processing completion lag separately. Do not trade signature verification or durable correctness for fast acknowledgment. Current process-bound `after()` work limits delivery guarantees and must be considered under load/restarts.

## Database budgets

- Reuse the existing process-wide application pool (`max: 20`) and dedicated realtime listener (`max: 1`).
- Size total possible connections across replicas, migration processes, and operational sessions below PostgreSQL capacity with safety headroom. Exact allowed percentage is **pending infrastructure decision**.
- No query in a request loop when a bounded set-based query is practical.
- Paginate public/API/UI collections with stable order and maximum limit.
- Add indexes from measured query plans and cardinality, not intuition.
- Review `EXPLAIN (ANALYZE, BUFFERS)` in non-production for material queries.
- Keep transactions short; never hold a transaction open across slow provider HTTP calls unless correctness explicitly demands and is reviewed.
- Monitor trigger cost: realtime and broadcast-count triggers add work to writes.

## Realtime budgets

- Socket transport is WebSocket-only; proxy upgrade latency and disconnect rate must be measured.
- Target event-to-client p95 ≤500 ms within the same region when PostgreSQL and process are healthy.
- Notifications are compact invalidation hints; PostgreSQL `NOTIFY` payloads must remain below its limit (current migration deliberately targets <8 KB).
- Do not broadcast message/file bodies unnecessarily.
- Reconnect recovery must use bounded HTTP refetch; avoid reconnect stampedes.

## Memory and payload controls

- Do not buffer unbounded CSVs, uploads, provider responses, or exports.
- Preserve MIME- and collection-specific Imgora upload limits in `src/lib/storage/policy.ts`.
- Enforce request body and import row limits at both reverse proxy and application.
- Audio/media browser libraries should load only where needed.
- Large broadcasts require bounded batches, claims, backpressure, and observable progress.

## Client and rendering

- Prefer Server Components and server data access by default.
- Add `'use client'` only at the smallest interactive boundary.
- Lazy-load heavy editors/charts/flow/audio modules when they are not needed for initial interaction.
- Avoid duplicate realtime subscriptions and repeated full-list refetches from one event.
- Images/media should have bounded dimensions, efficient formats, and non-blocking loading appropriate to their role.

## Regression gate

A change fails the budget when it causes a statistically meaningful regression on a representative scenario, an unbounded query/payload, pool saturation, or a large bundle increase without approval. Include before/after evidence and mitigation. Exceptions require an owner, user value, measured impact, and expiry/revisit date.

## Pending performance infrastructure

Choose and document: representative VPS/database profiles, load tool, fixture generator, CI budget checks, RUM/synthetic monitoring, query-statistics access, and accepted concurrency/throughput targets. Do not invent “requests per second” capacity before measuring the deployed topology.
