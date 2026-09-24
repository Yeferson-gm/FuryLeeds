# Deployment with Dokploy

## Accepted deployment model

FuryLeeds is deployed as a **Dokploy Application** using the **Dockerfile** build type. Docker Compose is not part of this deployment path.

The repository provides:

- `Dockerfile`: multi-stage Bun production image;
- `.dockerignore`: deny-by-default build context containing only application/build inputs;
- `GET|HEAD /health`: non-cacheable container health endpoint;
- `server.ts`: mandatory production entry point for Next.js and Socket.IO.

Official Dokploy references:

- [Application build types](https://docs.dokploy.com/docs/core/applications/build-type)
- [Going to production](https://docs.dokploy.com/docs/core/applications/going-production)
- [Zero-downtime deployments](https://docs.dokploy.com/docs/core/applications/zero-downtime)
- [Environment variables](https://docs.dokploy.com/docs/core/variables)
- [Application domains](https://docs.dokploy.com/docs/core/domains)

## Runtime topology

A supported production baseline consists of:

1. Dokploy and its Traefik ingress on the VPS.
2. One FuryLeeds application replica built from the repository `Dockerfile`.
3. PostgreSQL reachable over a private/restricted network.
4. External HTTPS access to Meta, ChatSend, Imgora, Google when enabled, AI providers, and configured customer webhooks.
5. Dokploy scheduled jobs or another authorized scheduler for automation/flow cron routes when enabled.

The FuryLeeds container listens on `0.0.0.0:3000`. Dokploy routes the configured HTTPS domain to container port `3000`; the port does not need to be published directly to the Internet.

Keep **one replica** until horizontal scaling is deliberately implemented. Rate limits and Socket.IO rooms are process-local, and the Socket.IO adapter is in memory.

## Dokploy application configuration

Create an Application from the authorized Git repository and use these settings:

| Dokploy field | Value |
|---|---|
| Source type | Git provider/repository |
| Build type | `Dockerfile` |
| Dockerfile path | `Dockerfile` |
| Docker context path | `.` |
| Docker build stage | `runner` (optional because it is already the final stage) |
| Container port for the domain | `3000` |
| Replicas | `1` |

Do not select Nixpacks, Railpack, Buildpack, Static, or Docker Compose for this application. The Dockerfile is the deployment contract because FuryLeeds requires Bun, the custom `server.ts`, and explicit runtime contents.

### Domain

In Dokploy Domains:

1. attach the canonical production hostname;
2. use container port `3000`;
3. enable HTTPS with the intended certificate resolver;
4. route the root path without `Strip Path` or `Internal Path` rewriting;
5. set `BETTER_AUTH_URL` to the exact resulting external HTTPS origin.

Traefik must preserve WebSocket upgrades for `/socket.io`. Socket.IO is configured for WebSocket transport only and has no polling fallback.

## Docker image contract

The multi-stage `Dockerfile`:

- pins the official `oven/bun:1.4.0-slim` image line;
- installs from `bun.lock` with `--frozen-lockfile`;
- separates build dependencies from production dependencies;
- builds Next.js with `bun run build`;
- copies only `.next`, production dependencies, runtime source/config, public assets, migration assets, and the proprietary license;
- runs as the non-root `bun` user;
- exposes only port `3000` inside the image;
- starts with `bun run start`, which invokes `server.ts` rather than `next start`;
- handles `SIGTERM` through the application graceful-shutdown path;
- includes a Bun-based `/health` healthcheck and does not require `curl`;
- contains no `.env`, test suite, documentation corpus, Git metadata, editor state, or agent skills.

The build stage uses a non-secret localhost `BETTER_AUTH_URL` placeholder only because production server modules are evaluated during `next build`. Dokploy injects the real canonical URL at runtime. Never pass runtime credentials as Docker `ARG`; Dokploy's own documentation warns that build arguments and ordinary build variables are inappropriate for secrets.

`compose.yml` is intentionally absent. Adding one would create a second, conflicting deployment method.

Build the same final stage in any Docker-capable validation environment with:

```bash
docker build --target runner --tag furyleeds:local .
```

This command was not executable in the current development environment because Docker is not installed; a Dokploy staging build remains mandatory.

## Runtime environment in Dokploy

Configure runtime values in the Dokploy Environment tab or through an approved external secrets provider. Never commit values, add them as Docker build arguments, or print them in deployment logs.

### Core required

- `NODE_ENV=production`
- `DATABASE_URL`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_SECRET`
- `ENCRYPTION_KEY`

`PORT=3000` is the safe image default. In production `server.ts` binds internally to `0.0.0.0`; it does not consume the operating system/container `HOSTNAME`, because that value names the machine rather than the application's public origin. `BETTER_AUTH_URL` remains the canonical external HTTPS origin.

### Feature-required

- ChatSend: `CHATSEND_BASE_URL`, `CHATSEND_API_KEY`.
- Imgora: `IMGORA_API_URL`, `IMGORA_API_KEY`, `IMGORA_ORIGIN`, `IMGORA_BASE_FOLDER`.
- Meta: `META_APP_SECRET`; `META_APP_ID` for subscription/template media operations.
- Cron: `AUTOMATION_CRON_SECRET`.
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` together.
- Platform bootstrap: `SUPERADMIN_EMAILS` when intentionally used.

### Optional tuning

- `AI_REQUEST_TIMEOUT_MS`
- `AI_CONTEXT_MESSAGE_LIMIT`
- `WHATSAPP_TEMPLATES_DRY_RUN` only for deliberate non-production verification; it must be disabled for real template mutations.

Changing runtime environment variables requires a redeployment/restart so the Bun process receives the new values.

## Healthcheck and rollout

`GET /health` returns HTTP `200` with `{ "status": "ok" }`. `HEAD /health` returns `204`. Both responses are `no-store` and expose no dependency, version, host, or secret details.

`server.ts` begins listening only after Next.js is prepared and the PostgreSQL realtime `LISTEN` connection is established. Therefore a reachable health route proves successful startup initialization. It is not a per-request deep database diagnostic and does not replace database/provider monitoring.

The Dockerfile already declares:

- interval: 30 seconds;
- timeout: 10 seconds;
- start period: 30 seconds;
- retries: 3.

If Dokploy Swarm settings override the image healthcheck, use the equivalent command without assuming `curl` exists:

```json
{
  "Test": [
    "CMD",
    "bun",
    "-e",
    "const response = await fetch('http://127.0.0.1:3000/health'); if (!response.ok) process.exit(1);"
  ],
  "Interval": 30000000000,
  "Timeout": 10000000000,
  "StartPeriod": 30000000000,
  "Retries": 3
}
```

For start-first rollout and automatic rollback, Dokploy documents this update configuration:

```json
{
  "Parallelism": 1,
  "Delay": 10000000000,
  "FailureAction": "rollback",
  "Order": "start-first"
}
```

Apply and verify these settings in the actual Dokploy environment; repository files cannot configure Dokploy's Swarm UI on their own.

## Database release procedure

Migrations remain a controlled release action and are not run on container startup.

1. Create and verify a restorable PostgreSQL backup for high-risk migrations.
2. Test the migration against a disposable/non-production database.
3. Review locks, rewrites, indexes, backfills, and old/new application compatibility.
4. Run `bun run db:migrate` exactly once using the target image or another authorized Bun environment with the production `DATABASE_URL`.
5. Verify migration state and representative queries.
6. Deploy the application in the required compatibility order.

The runtime image includes `drizzle/`, `scripts/migrate.ts`, and production Drizzle dependencies so an authorized one-off Dokploy terminal/job can run the migration command. Never run concurrent migrators and never make every replica migrate during startup.

## Release sequence

1. Confirm the approved revision and lockfile.
2. Run Biome, TypeScript, tests, Next build, Drizzle check, and Docker build in a Docker-capable environment.
3. Confirm Dokploy runtime variables by name/presence without printing values.
4. Confirm backup/restore readiness for data-impacting releases.
5. Run the migration procedure when required.
6. Deploy the Dockerfile application.
7. Confirm `/health` becomes healthy before traffic switches.
8. Smoke-test HTTPS, login, database access, `/socket.io` WebSocket connection, inbox updates, and required providers.
9. Monitor container restarts, HTTP failures, PostgreSQL connections/listener, WebSocket connections, webhook intake, and provider failures.
10. Retain a known-good image/deployment for rollback.

Dokploy's production guide recommends building and publishing images in CI when on-server builds consume too much CPU/RAM. FuryLeeds currently uses Dokploy's Dockerfile build method as requested. Moving builds to a registry is a future delivery decision, not a silent second path.

## Rollback and recovery

- Application regression with compatible schema: use Dokploy rollback to the prior healthy deployment.
- Failed start-first rollout: healthcheck plus `FailureAction: rollback` should preserve the prior healthy task after the Dokploy settings are applied.
- Forward-only schema change: deploy a corrective application/migration; do not improvise destructive down SQL.
- Data corruption: stop writes, preserve evidence, restore through the tested database procedure, and reconcile external Meta/webhook effects.
- Secret exposure: revoke/rotate first, update Dokploy secrets, redeploy, and invalidate affected sessions/credentials.

## Remaining production obligations

Repository deployment configuration does not resolve these operational responsibilities:

- PostgreSQL off-host backups, retention, encryption, RPO/RTO, and restore drills;
- VPS/Dokploy hardening and patching;
- trusted proxy/client-IP policy;
- secret-provider access control and rotation ownership;
- CI image build/signing/scanning and artifact retention;
- metrics, log retention, alerting, tracing, and incident response;
- durable queues and safe horizontal scaling.

A staging deployment must still prove Docker build, non-root runtime, health transition, migration execution, HTTPS, WebSocket upgrades, graceful shutdown, and rollback before production is declared ready.
