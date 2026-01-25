# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY backend/go.mod backend/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY backend/ .

# Build application
# 1) Preflight build without optimizations to surface any compiler errors clearly
# 2) Final optimized build for Cloud Run (static, CGO disabled)
RUN go env && go version && \
    CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux go build -a -ldflags="-s -w" -o server ./cmd/server

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates libc6-compat curl

WORKDIR /root/

# Copy built binary from builder
COPY --from=builder /app/server .

# Copy lexicon/frequency data + seed SQL
COPY data ./data
COPY backend/seed_corpus_minimal.sql ./seed_corpus_minimal.sql

# Expose port
EXPOSE 8080

# Health check using curl instead of wget
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run server
CMD ["./server"]
