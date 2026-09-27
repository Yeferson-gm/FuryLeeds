ARG BUN_VERSION=1.4.0

FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json next.config.ts postcss.config.mjs ./
COPY server.ts ./server.ts
COPY src ./src
COPY public ./public

ENV NODE_ENV=production
ENV BETTER_AUTH_URL=http://localhost:3000
RUN bun run build

FROM base AS runner
LABEL org.opencontainers.image.title="FuryLeeds" \
      org.opencontainers.image.vendor="CEDRUS TECHNOLOGY GROUP S.A.C." \
      org.opencontainers.image.licenses="LicenseRef-Proprietary"

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/.next ./.next
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/src ./src
COPY --from=builder --chown=bun:bun /app/server.ts ./server.ts
COPY --from=builder --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=builder --chown=bun:bun /app/tsconfig.json /app/next.config.ts ./
COPY --chown=bun:bun LICENCE.md ./LICENCE.md

USER bun
EXPOSE 3000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3000/health'); if (!response.ok) process.exit(1);"]

CMD ["bun", "run", "start"]
