# Dependency Policy

## Objective

Keep FuryLeeds small, Bun-compatible, auditable, and aligned with its verified architecture. A dependency must solve a present problem more safely or economically than the runtime, platform, or packages already installed.

## Current stack

- Runtime/package manager/test runner: Bun 1.4 (`packageManager: bun@1.4.0`, engine `>=1.4.0`).
- Web application: Next.js 16.3, React 19.3, custom Bun HTTP server.
- Data: PostgreSQL, `Bun.SQL`, Drizzle ORM and Drizzle Kit.
- Identity: Better Auth with Drizzle adapter and cookie integration.
- Realtime: Socket.IO server/client plus PostgreSQL `LISTEN/NOTIFY`.
- UI: Base UI, Tailwind CSS 4, Lucide, Recharts, dnd-kit, XYFlow, Dagre, Sileo, lazily loaded SweetAlert2, and Boneyard.
- External HTTP services: Meta, ChatSend, Imgora, Google OAuth, user-configured OpenAI/Anthropic-compatible AI paths.
- Quality: TypeScript strict mode and Biome.

## Selection order

Before adding a package, evaluate in this order:

1. Web standards and built-ins (`fetch`, `URL`, `Headers`, `FormData`, `AbortSignal`, Web Crypto where suitable).
2. Bun APIs, including `Bun.SQL`, Bun test, and Bun package management.
3. Existing Next.js/React capabilities.
4. Existing Drizzle, Better Auth, Socket.IO, and current UI libraries.
5. A small local module with clear tests.
6. A new external dependency only after documenting why 1–5 are inadequate.

## Admission checklist

A new dependency requires all of the following in the change description:

- concrete use case and rejected alternatives;
- runtime location (server, client, build, test, or operations);
- verified Bun 1.4 and Next 16 compatibility;
- ESM/CJS and server/client boundary analysis;
- maintenance activity, license, provenance, release cadence, and security history;
- direct and transitive install/bundle impact;
- expected network, filesystem, native-build, and postinstall behavior;
- owner and removal/replacement plan;
- tests covering the integration boundary.

## Hard rules

- Use `bun add`, `bun add -d`, and `bun remove`; do not use npm, pnpm, or Yarn in this repository.
- Commit `package.json` and `bun.lock` together for dependency changes.
- Never hand-edit `bun.lock`.
- Production runtime packages belong in `dependencies`; build/test-only packages belong in `devDependencies`.
- No package may duplicate `fetch`, date formatting, general collection helpers, schema/query access, auth, logging, or WebSocket behavior without an approved rationale.
- Do not introduce a second ORM, auth system, realtime protocol, package manager, formatter, linter, or test runner.
- Avoid packages requiring Node-only native addons unless Bun compatibility is demonstrated in local and production-like builds.
- Browser dependencies must be imported narrowly and measured; never expose server packages, secrets, or provider SDKs to client components.
- Provider calls should use native `fetch` unless an official SDK provides material security/protocol value.
- Pin exact versions when reproducibility or a fragile peer/native relationship warrants it. Existing version style is mixed; do not normalize unrelated entries.

## Overrides and trusted dependencies

`package.json` currently contains security/compatibility overrides for `ip-address`, `fast-uri`, `hono`, `js-yaml`, `nanoid`, `@babel/core`, and two `brace-expansion` ranges. It also trusts install scripts for `@parcel/watcher` and `@swc/core`.

- Every override must retain a commentable rationale in the upgrade record/PR and be re-evaluated when direct parents update.
- Removing an override requires confirming the lockfile resolves a fixed compatible version.
- Adding a trusted dependency is security-sensitive: inspect its install scripts and package provenance first.
- Do not broaden trust to an umbrella package or unrelated transitive package.

## Provider and architecture constraints

- Database: use the process-wide `Bun.SQL`/Drizzle integration. Do not create per-request pools.
- Auth: extend Better Auth rather than adding parallel session/JWT libraries.
- Realtime: use existing Socket.IO contracts and PostgreSQL notifications; do not add `ws`, SSE, or another broker casually.
- Email: ChatSend is the current adapter. A second provider requires an explicit migration/fallback design, not scattered calls.
- Storage: Imgora is the current adapter. Preserve account-scoped signed references and server-side credentials.
- WhatsApp: use Meta Graph API through existing modules; protect raw webhook verification.

## Supply-chain controls

- Review lockfile diffs for unexpected packages, scripts, registries, or large dependency trees.
- Run the available Bun audit mechanism if supported by the pinned Bun version; document when no reliable audit is available.
- Treat typosquatting, abandoned packages, compromised maintainers, and install scripts as release blockers until investigated.
- Never install from arbitrary URLs, local developer paths, mutable Git branches, or unverified tarballs for production.
- Record license incompatibilities before merge.

## Current feedback/loading additions

- Sileo owns lightweight in-app success/error/warning/info feedback and is mounted once at the root.
- SweetAlert2 is a client-only dynamic import restricted to user-triggered confirmations and one-time secret reveals, keeping it out of the initial bundle path.
- Boneyard owns authenticated-shell skeleton capture/runtime rendering. Its CLI must use an authenticated non-production browser session; auth bypasses and committed cookies are prohibited.
- Sonner was removed after every application import moved to the local Sileo adapter.

## Removal

Unused dependencies must be removed in the same workstream. Remove imports, adapters, configuration, trusted-dependency entries, overrides that only served them, tests that test the package rather than behavior, and stale documentation. Reinstall and run all validation after removal.
