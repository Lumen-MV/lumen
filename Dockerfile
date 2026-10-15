# syntax=docker/dockerfile:1
# Multi-stage build: deps -> builder (standalone output) -> slim runner with ffmpeg (Phase 5 subtitle extraction).
# The runner is the image's `node` user (uid 1000 = the first Ubuntu user): the bind-mounted ./data on the VM must be
# owned by 1000:1000 (infra/deploy.sh, cloud-init and the compose `data-init` step make it so).

FROM node:22-alpine AS deps
WORKDIR /app
# better-sqlite3 has no musl prebuilt; compile from source against the headers shipped in the image
RUN apk add --no-cache python3 make g++
ENV npm_config_nodedir=/usr/local npm_config_build_from_source=true
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No secrets at build time: env is validated lazily at server start, never during `next build`
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache ffmpeg
# Next standalone listens on HOSTNAME (Docker would otherwise inject the container id); HOST stays for our env schema
ENV NODE_ENV=production HOSTNAME=0.0.0.0 HOST=0.0.0.0 PORT=3000 DATA_DIR=/data NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# public/ is tracked via public/.gitkeep so this COPY also works on a fresh clone
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
# one-off migration runner used by infra/deploy.sh before the new container takes over (drizzle-orm is bundled into the
# server chunks by Next, so the standalone node_modules lacks it — copy the package for the runner; it has no dependencies)
COPY --from=deps --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --chown=node:node infra/migrate.cjs ./migrate.cjs
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
