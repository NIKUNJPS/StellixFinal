# Stellix Labs frontend — production image (Batch 17).
#
# Multi-stage using Next.js standalone output (next.config.mjs `output: "standalone"`):
# a builder stage installs deps and compiles, and a slim runner stage copies ONLY
# the traced standalone server (.next/standalone), the static assets (.next/static),
# and public/ — not the full node_modules or source. Runs as a non-root user.
#
# NEXT_PUBLIC_* values are inlined at BUILD time, so the browser API base URL is a
# build arg (bake per environment) with a sensible default.
#
# Build (from the frontend/ directory):
#   docker build -t ghcr.io/stellix-labs/frontend:latest .

# ---- Stage 1: deps -----------------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app
# Install against the lockfile only — maximises Docker layer cache reuse.
COPY package.json package-lock.json* ./
RUN npm ci

# ---- Stage 2: builder --------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public, browser-inlined API base URL — override per environment at build time:
#   docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com ...
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build

# ---- Stage 3: runner ---------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# node:20-slim ships a non-root `node` user (uid 1000) — reuse it.
# The standalone build already contains its own minimal node_modules.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# server.js is emitted by Next's standalone output.
CMD ["node", "server.js"]
