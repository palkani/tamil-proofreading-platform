# Multi-stage build for the OCR v2 Cloud Run service.
#
# Stage 1 (builder):  install deps + compile TypeScript to JS.
# Stage 2 (runtime):  slim node image with only production deps +
#                     compiled output. sharp needs its native binaries
#                     — we install them fresh in the runtime stage
#                     against the correct arch (linux/amd64 on Cloud Run).
#
# Image size target: ~200MB (sharp binaries + node modules dominate).
# Cold start target: <3s on Cloud Run min-instances=0 config.

# ── Stage 1 · Builder ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install build deps for sharp's native module compile
RUN apk add --no-cache python3 make g++ vips-dev

# Copy manifests first for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --include=dev --no-audit --no-fund

# Copy source + compile
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# ── Stage 2 · Runtime ────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# libvips runtime — sharp needs this at import time
RUN apk add --no-cache vips

# Copy manifests + install ONLY production deps against alpine/amd64
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy compiled JS from builder stage
COPY --from=builder /app/dist ./dist

# Cloud Run sets $PORT dynamically; server.ts reads OCR_V2_PORT so
# wire it here. Default 8080 for local Docker runs.
ENV NODE_ENV=production
ENV OCR_V2_PORT=8080
EXPOSE 8080

# Non-root user — Cloud Run runs containers as UID 1000 by default,
# and this makes local behavior match prod.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs && chown -R nodejs:nodejs /app
USER nodejs

# Direct node exec — no npm intermediary, faster cold start
CMD ["node", "dist/server.js"]
