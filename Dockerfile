# Build stage: Next.js (unified frontend)
FROM node:18-alpine AS builder

WORKDIR /app

# Optional: set at build time for client-side API URL (e.g. --build-arg NEXT_PUBLIC_API_URL=http://backend:8080/api/v1)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Copy frontend package files
COPY frontend/package*.json ./

# Install all deps (including dev for build)
RUN npm ci

# Copy frontend source
COPY frontend/ .

# Build Next.js (output: .next)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init wget

ENV NODE_ENV=production
ENV PORT=5000
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built app and node_modules from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/ || exit 1

ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["node", "server.js"]
