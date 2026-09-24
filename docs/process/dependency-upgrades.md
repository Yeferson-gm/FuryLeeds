# Dependency Upgrade Policy

## Goal

Upgrade deliberately, preserve Bun/Next compatibility, and keep security fixes moving without combining unrelated risk.

## Cadence

- Critical exploited vulnerability: triage immediately; patch or mitigate as an emergency change.
- High severity or credential/auth/data-boundary issue: review within one business day.
- Routine patch/minor updates: review in small batches on a regular cadence chosen by maintainers (**pending decision: exact cadence**).
- Major framework/runtime upgrades: dedicated change with migration plan, measurements, and rollback.

No dependency automation or active CI workflow is present in the current working tree. Whether a bot opens upgrades and which checks gate them is a **pending operational decision**.

## Upgrade classes

### Runtime foundation

Bun, Next.js, React, TypeScript, Tailwind/PostCSS, Drizzle, Better Auth, and Socket.IO are architecture-level dependencies. Upgrade one compatible family at a time and read release notes, migration guides, peer ranges, and known Bun issues.

### UI and feature libraries

Base UI, dnd-kit, XYFlow, Dagre, Recharts, Lucide, Sileo, SweetAlert2, Boneyard, and animation helpers may be grouped only when tightly related. Validate interaction, hydration, accessibility, CSS output, lazy-loading boundaries, generated skeleton compatibility, and client bundle impact.

### Transitive security overrides

For each `overrides` entry:

1. identify which parent pulls the vulnerable range;
2. confirm the forced version satisfies runtime behavior;
3. update the parent when possible;
4. remove the override only after inspecting `bun.lock`;
5. retain a temporary override when upstream is still unsafe, with a follow-up owner.

## Safe procedure

1. Start from a clean understanding of existing uncommitted work; never overwrite it.
2. Record current versions and the target release notes.
3. Change only one dependency or cohesive family with Bun commands.
4. Inspect both manifest and lockfile diffs, including lifecycle scripts and new transitive packages.
5. Run `bun install --frozen-lockfile` in a clean checkout/container-equivalent environment when available.
6. Run `bun run check`, `bun run typecheck`, relevant focused tests, `bun run test`, and `bun run build`.
7. Smoke-test the affected production path.
8. For server/runtime changes, start through `bun run start` after a production build, not `next start`.
9. Document behavior/configuration changes and rollback instructions.

## Mandatory focused checks

- Bun: SQL driver, test runner, ESM loading, custom server startup, signals.
- Next/React: App Router compilation, route handlers, `after()`, proxy behavior, hydration, cache/security headers.
- Drizzle: generated SQL diff, migrations, Better Auth adapter transactions, Bun SQL adapter.
- Better Auth: signup, verification email, login, reset, session cookie, optional Google OAuth, account bootstrap hooks.
- Socket.IO: cookie handshake, WebSocket-only transport, reconnect/recovery, account and conversation room isolation.
- Tailwind/PostCSS/UI: production CSS, responsive pages, keyboard/focus behavior.
- ChatSend/Imgora/Meta-facing changes: mocked error/timeout tests plus non-production integration smoke where credentials permit.

## Major upgrades

A major upgrade needs:

- explicit compatibility matrix for Bun, Next, React, TypeScript, and affected peers;
- list of removed/deprecated APIs and source migrations;
- database/auth/session compatibility analysis when applicable;
- before/after build size and representative latency/memory measurements;
- deployment ordering and rollback/roll-forward plan;
- no unrelated feature work;
- maintainer approval (**pending decision: approver identity and PR rules**).

## Lockfile and reproducibility

The lockfile is authoritative. Reject upgrades that only work with an uncommitted lockfile, depend on a warm local cache, or require an undeclared global tool. The production image/process must install the same graph using Bun 1.4-compatible tooling.

## Failed upgrade

If validation fails, do not weaken tests or types. Isolate whether the cause is source incompatibility, peer mismatch, Bun incompatibility, changed defaults, or a transitive regression. Fix within scope or revert the entire dependency change cleanly. Record deferred upgrades with the blocker and evidence; do not leave a half-migrated graph.
