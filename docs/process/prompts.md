# Engineering Prompts

These prompts help humans or coding agents work safely in FuryLeeds. They do not override repository instructions, user scope, code review, or validation evidence.

## Base implementation prompt

```text
Work in the FuryLeeds repository. Before editing, inspect AGENTS.md, package.json, relevant source/tests, Drizzle schema and migrations, and docs/process. Preserve all pre-existing uncommitted work.

Verified architecture: Bun 1.4 package/runtime/test runner; Next.js 16 App Router + React 19; custom server.ts serving Next and Socket.IO on one HTTP server; PostgreSQL through shared Bun.SQL + Drizzle; Better Auth cookie sessions; scoped hashed API keys for /api/v1; PostgreSQL LISTEN/NOTIFY feeding Socket.IO; server-side Meta, ChatSend and Imgora adapters.

Implement only the requested scope. Enforce accountId on every business query/mutation, preserve auth/role/API-key scopes, raw Meta webhook signature verification, encrypted credentials, signed account-scoped Imgora references, WebSocket room authorization, and append-only migrations. Prefer built-ins and existing packages; justify any dependency. Never expose or log secrets, cookies, tokens, message/file/AI content, or DATABASE_URL.

Add or update focused Bun tests and matching docs. Run the narrowest tests first, then relevant bun run check, bun run typecheck, bun run test, and bun run build. Report only checks actually run. Label unverified deployment, branch, CI, backup, or platform assumptions as Pending decision.
```

## Bug investigation prompt

```text
Investigate before changing code. Reproduce the failure, identify the exact route/module and account/auth context, inspect existing tests and recent local diff without discarding user work, and trace data across HTTP -> auth -> account scope -> Drizzle/Bun.SQL -> provider/realtime.

Classify whether the cause is application logic, schema/migration, Next server/client lifecycle, Bun compatibility, PostgreSQL notification, Socket.IO reconnect/room authorization, Meta retry/signature/status ordering, ChatSend, Imgora, AI provider, or VPS proxy/config. Capture secret-safe evidence. Make a change only when the root cause is supported. Add a regression test, run focused then broader validation, and state remaining uncertainty.
```

## Security review prompt

```text
Review the proposed FuryLeeds change adversarially. Map every entry point and trust boundary. Check authentication, role/scope, accountId derivation and query constraints, IDOR, mass assignment, CSRF/origin assumptions, SSRF and redirect/DNS behavior, webhook HMAC over raw bytes, replay/idempotency, rate-limit dimension, file MIME/size/path policy, encrypted credentials, signed Imgora references, API key hashing/revocation/expiry, Socket.IO room isolation, secret/PII logging, AI prompt/data egress, and failure behavior.

Use security-checklist.md. Cite concrete files and tests. Distinguish verified vulnerabilities, defense-in-depth recommendations, and unknown operational controls. Do not claim PostgreSQL RLS, WAF, distributed rate limiting, backups, or secret management unless verified.
```

## Database migration prompt

```text
Design an append-only Drizzle/PostgreSQL migration for FuryLeeds. Inspect all current SQL migrations and schema declarations first. Analyze existing rows, null/default/backfill strategy, constraints, indexes, lock/table-rewrite risk, trigger and realtime payload effects, Bun.SQL/Drizzle/Better Auth compatibility, old/new application overlap, and rollback versus roll-forward.

Generate/review SQL, never rewrite released migrations. Test on a disposable migrated PostgreSQL database, verify representative queries and tenant constraints, and document deploy ordering and backup requirements. Never run against production or use production credentials without explicit authorization.
```

## Meta webhook/realtime prompt

```text
Preserve the exact raw-body X-Hub-Signature-256 verification before parsing. Design duplicate/replay-safe writes around provider message IDs and valid status progression. Derive account ownership from stored WhatsApp configuration, never request payload choice. Keep acknowledgment fast but do not overstate durability of Next after() on a single VPS process.

For realtime, keep PostgreSQL NOTIFY payloads bounded and tenant-scoped, validate their version/shape, authenticate Socket.IO cookies before rooms, verify conversation ownership before joins, and make clients refetch authoritative data after reconnect. Test invalid signatures, malformed payloads, duplicates, cross-account IDs, disconnect/recovery, and listener failure.
```

## Provider integration prompt

```text
Integrate through a narrow server-side adapter using native fetch unless an SDK has a documented security/protocol benefit. Validate required URLs/config, keep credentials server-only, set explicit timeout, map malformed/non-2xx responses safely, define retry/idempotency/partial-success semantics, add mocks for success/error/timeout, and add secret-safe logs/metrics.

For ChatSend preserve OAuth token exchange and accepted enqueue semantics. For Imgora preserve MIME/size policy, account/collection path isolation, signed opaque references, X-Imgora-Origin, and orphan/delete handling. Document all data sent outside FuryLeeds.
```

## Dependency upgrade prompt

```text
Upgrade one dependency or cohesive family only. Read dependency-policy.md and dependency-upgrades.md, release notes, peer requirements, Bun 1.4/Next 16 compatibility, install scripts, license/security history, and current overrides. Use Bun, inspect package.json and bun.lock diffs, run focused compatibility tests plus check/typecheck/test/build, production-start smoke when relevant, and report rollback. Do not normalize unrelated versions or remove overrides without proving the lockfile no longer needs them.
```

## Documentation-only prompt

```text
Change only the explicitly named documentation files. Verify claims against current code/config/tests and distinguish Current, Required, Proposed, and Pending decision. Do not copy assumptions from another project. Do not run formatters that can alter unrelated files. Validate file list, Markdown structure/links, git diff --check, and confirm no non-requested path changed by your work.
```

## Completion prompt

```text
Before declaring done: compare the requested scope with git diff; confirm no unrelated/user changes were overwritten; list files changed; run the agreed focused and broad checks; inspect failures rather than hiding them; update docs; note migrations/config/deployment impact; and report exact commands/results plus pending decisions. Never claim deployment readiness while Dockerfile/compose, health checks, backups, secret delivery, proxy, or CI remain undefined.
```
