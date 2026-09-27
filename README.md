# FuryLeeds

FuryLeeds is a multi-tenant WhatsApp CRM for teams. It combines a shared inbox, contacts, tags and custom fields, pipelines and deals, broadcasts, WhatsApp templates, automations, interactive flows, AI-assisted replies, notifications, presence, account administration, and a scoped public API.

Each customer account is an isolated tenant. Account roles are `owner`, `admin`, `agent`, and `viewer`; `superadmin` is a separate system-level role for the SaaS operator.

## Architecture summary

| Concern | Implementation |
|---|---|
| Runtime and package manager | Bun 1.4+ |
| Web application | Next.js 16 App Router and React 19 |
| Database | Self-managed PostgreSQL |
| SQL and ORM | Bun native `Bun.SQL` through `drizzle-orm/bun-sql`; Drizzle ORM/Kit |
| Human authentication | Better Auth with email/password and optional Google OAuth |
| Authentication email | ChatSend, called only from server-side code |
| Persistent files | Imgora; user files are not stored on the VPS filesystem |
| WhatsApp | Meta WhatsApp Cloud API |
| Realtime | Socket.IO over WebSocket, driven by PostgreSQL `LISTEN/NOTIFY` |
| Styling | Tailwind CSS v4 |
| Quality | Strict TypeScript, Biome, and Bun test |

PostgreSQL is the only application database. Supabase, InsForge, Firebase, SQLite, and hosted database abstractions are not part of the active architecture.

## Prerequisites

- Bun `>=1.4.0`.
- PostgreSQL reachable from the application and authorized for schema migrations.
- Credentials for each optional integration you intend to enable.
- A reverse proxy with WebSocket upgrade support for production.

## Local setup

1. Install dependencies without replacing Bun or the lockfile:

   ```bash
   bun install --frozen-lockfile
   ```

2. Create a local environment file from the tracked placeholder inventory:

   ```bash
   cp .env.example .env
   ```

3. Fill only the variables required by the features you will use. Never commit `.env` or publish real values.

4. Apply the checked-in Drizzle migrations to an authorized non-production PostgreSQL database:

   ```bash
   bun run db:migrate
   ```

5. Start the application and realtime gateway together:

   ```bash
   bun run dev
   ```

6. Open the canonical local URL configured by `BETTER_AUTH_URL`.

Application startup does not apply migrations automatically. Review generated SQL before applying it.

## Environment variables

Names are documented here without values. See [`docs/arquitecture/integrations.md`](docs/arquitecture/integrations.md) and [`docs/process/deployment.md`](docs/process/deployment.md) for detailed contracts and production requirements.

### Core production configuration

| Variable | Purpose | Sensitive |
|---|---|---:|
| `DATABASE_URL` | PostgreSQL connection used by Drizzle, migrations, and the realtime listener | yes |
| `BETTER_AUTH_URL` | Canonical external application origin for auth links, trusted origin, and Socket.IO checks | no |
| `BETTER_AUTH_SECRET` | Better Auth signing/session secret | yes |
| `ENCRYPTION_KEY` | Server-only AES-256-GCM key: exactly 64 hexadecimal characters (32 bytes); never reuse it as a webhook verify token | yes |
| `NODE_ENV` | Runtime mode; the production start script sets `production` | no |
| `PORT` | Server port when the default is unsuitable | no |

Use one canonical URL variable: `BETTER_AUTH_URL`. There is no separate public site URL or development-origin allow-list in the active contract. The server binds internally to `127.0.0.1` in development and `0.0.0.0` in production; it intentionally ignores the operating system's `HOSTNAME`, which is a machine/container name rather than the public application URL.

### Authentication and email

| Variable | Purpose | Sensitive |
|---|---|---:|
| `GOOGLE_CLIENT_ID` | Enables Google OAuth when supplied with its secret | identifier |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | yes |
| `SUPERADMIN_EMAILS` | Comma-separated emails promoted to the system role when users are created | operationally sensitive |
| `CHATSEND_BASE_URL` | ChatSend API base URL | no |
| `CHATSEND_API_KEY` | Server-side key exchanged for a short-lived ChatSend bearer token | yes |

Email/password authentication remains available alongside Google OAuth. ChatSend sends verification links, password-reset OTPs, welcome messages, and password-change confirmations. ChatSend keys and bearer tokens must never reach browser code.

### Files, WhatsApp, AI, and scheduled work

| Variable | Purpose | Sensitive |
|---|---|---:|
| `IMGORA_API_URL` | Imgora API base URL | no |
| `IMGORA_API_KEY` | Imgora server credential | yes |
| `IMGORA_ORIGIN` | Origin sent to Imgora after URL normalization | no |
| `IMGORA_BASE_FOLDER` | Safe remote namespace prefix | no |
| `META_APP_ID` | Meta app identifier for diagnostics and template media operations | identifier |
| `META_APP_SECRET` | Meta webhook HMAC secret; rotation candidates may be comma-separated | yes |
| `WHATSAPP_TEMPLATES_DRY_RUN` | Optional template mutation dry-run flag | no |
| `AUTOMATION_CRON_SECRET` | Shared secret for automation and flow scheduler routes | yes |
| `AI_REQUEST_TIMEOUT_MS` | Optional AI provider timeout override | no |
| `AI_CONTEXT_MESSAGE_LIMIT` | Optional recent-message context limit | no |

WhatsApp access and verification tokens and AI provider keys are configured per account through the application rather than global environment variables.

## Authentication bootstrap

- Email/password signup creates a Better Auth user, an account, and an owner profile.
- Email verification links and six-digit password-reset codes are delivered through ChatSend; successful activation/reset also trigger welcome/security confirmation messages.
- Google sign-in is enabled only when both Google variables are configured.
- `SUPERADMIN_EMAILS` affects only users created after the matching address is configured; it does not replace tenant account context.
- Browser authentication uses cookies. Public `/api/v1` clients use separate account-bound API keys and scopes.

See [`docs/modules/auth-and-accounts.md`](docs/modules/auth-and-accounts.md) and [`docs/arquitecture/security.md`](docs/arquitecture/security.md).

## Integration setup pointers

- **ChatSend:** configure the API base and API key. FuryLeeds exchanges the key at `/oauth/token`, then enqueues direct HTML/text email through `/api/v1/client/emails` with an idempotency key.
- **Imgora:** configure all four Imgora variables. Uploads pass through authenticated FuryLeeds routes and are stored in account-partitioned remote folders; no persistent local storage path is used.
- **Meta:** configure the app identifiers/secrets globally, then connect each account's phone number, WABA, access token, verify token, and optional registration PIN through account settings.
- **Google OAuth:** configure the provider callback for the canonical `BETTER_AUTH_URL` according to Better Auth's generated callback path.
- **AI:** customers bring their own supported provider keys. Review privacy, retention, region, and cost implications before enabling AI features.

## Database workflow

Schema definitions live under `src/lib/db/`; ordered SQL migrations live under `drizzle/`.

```bash
bun run db:generate   # generate a migration after an intentional schema change
bun run db:migrate    # apply pending migrations to the configured database
bun run db:studio     # inspect an explicitly authorized database
bunx drizzle-kit check
```

Do not rewrite released migrations, run concurrent migrators, or place a production connection string in documentation or shell examples. Tenant isolation is currently enforced in application queries using `account_id`; PostgreSQL Row Level Security is not implemented.

## Development and validation

```bash
bun run check
bun run typecheck
bun run test
bun run build
bunx drizzle-kit check
git diff --check
```

Useful mutation commands:

```bash
bun run check:write
bun run format
```

Review the resulting diff after either mutation command, especially in a working tree with existing changes.

### External API examples and smoke test

Root [`api.http`](api.http) contains Spanish-commented examples for every endpoint intended for machine-to-machine use. Requests marked `EFECTO REAL` can create data, call Meta, process callbacks, or run scheduled work; use them only with placeholder values replaced in a controlled test account.

To route-check the complete external surface safely, start FuryLeeds against a non-production database, export a non-production API key with all seven public scopes without storing it in the repository, and run:

```bash
bun run test:external
```

The script defaults to `http://localhost:3000`; set `BASE_URL` when needed. It intentionally exercises side-effecting routes with invalid input or credentials, suppresses response bodies and secrets, and therefore does not send messages, launch broadcasts, create persistent test records, process Meta callbacks, or execute cron jobs. It is separate from `bun run test` because it requires a live application and API key. See [`docs/process/testing-strategy.md`](docs/process/testing-strategy.md#external-api-smoke-suite).

## Production runtime warning

Production must start through the custom server:

```bash
bun run start
```

Do **not** deploy with `next start` alone. `server.ts` owns both Next.js and Socket.IO; bypassing it removes application realtime. The reverse proxy must support WebSocket upgrades at `/socket.io`.

Production deployment uses a Dokploy **Application** with build type `Dockerfile`, Dockerfile path `Dockerfile`, context `.`, final stage `runner`, and domain container port `3000`. Configure all secrets as Dokploy runtime environment variables—never Docker build arguments. The image runs as a non-root user and exposes `/health` for rollout healthchecks. Read [`docs/process/deployment.md`](docs/process/deployment.md) for the exact fields, Swarm health/update settings, migrations, smoke tests, and remaining backup/operations obligations.

## Documentation

Start with [`AGENTS.md`](AGENTS.md) when working as an agent or contributor. The main documentation index is [`docs/README.md`](docs/README.md).

- [`SYSTEM.md`](SYSTEM.md) — full system map and cross-cutting contracts.
- [`MEMORY.md`](MEMORY.md) — current project state, blockers, and next actions.
- [`docs/arquitecture/`](docs/arquitecture/) — architecture, database, API, security, realtime, integrations, frontend, design system, and decisions.
- [`docs/modules/`](docs/modules/) — functional domains plus exhaustive page/component/hook inventories.
- [`docs/process/`](docs/process/) — engineering, security, testing, dependency, deployment, and documentation policies.
- [`docs/TODO.md`](docs/TODO.md) — known debt and unresolved findings.


## License

FuryLeeds is private proprietary software owned by **CEDRUS TECHNOLOGY GROUP S.A.C.** It is not open source and is not licensed for copying, modification, distribution, hosting, resale, or disclosure without prior express written authorization. See [`LICENCE.md`](LICENCE.md).
