# Tooling Inventory and Policy

## Authoritative local tools

| Area | Verified tool | Source / command |
|---|---|---|
| Runtime/package manager | Bun 1.4.0 | `packageManager`, `engines`; local `bun --version` |
| Development/start | custom `server.ts` | `bun run dev`, `bun run start` |
| Build | Next.js 16.3.6 | `bun run build` |
| Language | TypeScript 7.0.2, strict | `bun run typecheck` |
| Lint/format | Biome 2.5.14 | `check`, `lint`, `format`, `format:check` |
| Tests | Bun test | `bun run test`, `bun run test:watch` |
| Data access | `Bun.SQL`, Drizzle ORM 0.45 | `src/lib/db` |
| Schema/migrations | Drizzle Kit 0.31, custom migrator | `db:generate`, `db:migrate`, `db:studio` |
| CSS | Tailwind CSS 4/PostCSS | `postcss.config.mjs`, app styles |
| Version control | Git | repository metadata |
| Remote host | GitHub | verified `origin` URL |

Use package scripts instead of undocumented global commands. Bun is the only approved package manager for this repository.

## Application architecture tooling

- Next.js App Router and route handlers provide UI/server HTTP surface.
- React 19 provides component rendering.
- `node:http` is used only to host Next plus Socket.IO under Bun.
- Socket.IO and Socket.IO Client provide WebSocket-only realtime.
- PostgreSQL triggers/`NOTIFY` and a dedicated `Bun.SQL.listen` connection bridge committed data to realtime invalidations.
- Better Auth uses the Drizzle PostgreSQL adapter and Next cookie plugin.
- UI/visualization packages: Base UI, Lucide, Recharts, dnd-kit, XYFlow, Dagre, Sileo, SweetAlert2, and Boneyard.
- Media/audio: `opus-recorder` plus local public assets excluded from Biome.

SweetAlert2 is dynamically imported only when an action alert opens. Boneyard geometry for protected routes is generated from an authenticated non-production Chrome session, for example `bunx boneyard-js build http://localhost:3000/dashboard --cdp 9222 --out ./src/bones --force`; never disable route protection or commit cookies to make capture easier.

Do not substitute a second server framework, ORM, auth stack, realtime stack, formatter, test runner, or package manager without an approved architecture change.

## External services

### PostgreSQL

Mandatory persistent system of record and realtime notification source. Deployment host/version/backup/monitoring are not verified.

### Meta WhatsApp Cloud API

Provides configuration, templates, media, outbound messaging, statuses, and signed inbound webhooks. Provider credentials are stored encrypted by application logic.

### ChatSend

Current transactional auth-email service. FuryLeeds exchanges an API key for an access token and expects `202` when email is enqueued.

### Imgora

Current media/file service. Server-side HTTP integration uses bearer credential, origin header, account/collection folder policy, and signed opaque references.

### Google OAuth

Optional Better Auth provider when both Google variables are present.

### AI providers

The code contains OpenAI and Anthropic adapters with account-configured credentials/features. Provider/model governance, allowed regions, cost limits, and data-processing approval must be decided operationally.

## Configuration files

- `package.json` / `bun.lock`: scripts and reproducible dependency graph.
- `tsconfig.json`: strict, bundler resolution, aliases `@/*` and `@test/*`.
- `biome.json`: 2-space/LF/80 columns, recommended lint rules, Tailwind parsing; several accessibility/security rules are warnings.
- `next.config.ts`: cache policy and security headers; CSP remains report-only.
- `drizzle.config.ts`: PostgreSQL schema glob and migration output.
- `postcss.config.mjs`: PostCSS loads the Tailwind CSS v4 `@tailwindcss/postcss` plugin.
- `Dockerfile`: multi-stage, non-root Bun image used by the Dokploy Dockerfile build method; production binding is fixed to `0.0.0.0` by `server.ts`.
- `.dockerignore`: deny-by-default context allow-list for build/runtime inputs.
- `.gitignore`: excludes local/generated/secrets while explicitly keeping `.agents/skills/**` trackable.
- `LICENCE.md`: proprietary license owned by CEDRUS TECHNOLOGY GROUP S.A.C.
- `compose.yml`: intentionally absent; Docker Compose is not an active deployment method.

## Database workflow

```bash
DATABASE_URL=... bun run db:generate
DATABASE_URL=... bun run db:migrate
DATABASE_URL=... bun run db:studio
```

Never put literal production URLs in shell history/docs. `db:studio` must use an explicitly authorized non-public connection. Generated SQL is reviewed before application. Migration execution is a controlled deploy action, not automatic app startup.

## Local workflow

```bash
bun install --frozen-lockfile
bun run dev
bun run check
bun run typecheck
bun run test
bun run build
```

`bun run check:write` and `bun run format` mutate files; use only with reviewed scope, especially in a dirty worktree.

## GitHub tooling

GitHub as remote hosting is verified. GitHub CLI, Actions, branch protection, Dependabot/Renovate, release automation, and required checks are not verified in the current working tree and are not automatically approved. Adopt/document them explicitly before relying on them.

## Deployment/operations gaps

The following tooling choices remain **pending decisions**:

- VPS OS hardening and patching;
- production verification of the accepted Dokploy Dockerfile deployment;
- Dokploy/VPS hardening, exact Traefik trusted-proxy policy and DNS ownership;
- external secret-provider adoption and rotation governance;
- PostgreSQL hosting, backup, restore, monitoring;
- scheduler for cron routes;
- log collection, metrics, alerting, tracing/error tracking;
- image registry/artifact retention and CI/CD;
- browser E2E and load-testing tools.

A tool is not “in use” merely because another project uses it or a deleted/historical file mentions it.

## Tool adoption rule

For every new tool, record problem, owner, data/credential access, cost, failure mode, maintenance burden, Bun compatibility, security/licensing, migration/exit plan, and documentation/validation changes. Prefer the smallest tool that closes a measured gap.
