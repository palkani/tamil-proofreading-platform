# Caching (Redis / Upstash)

The backend uses Redis for suggestion and optional Tamil word cache when `REDIS_URL` is set. This reduces latency and load on the database and external services.

## Current usage

- **Suggest engine** ([backend/internal/suggest/redis.go](backend/internal/suggest/redis.go)): When `REDIS_URL` is set in [backend/internal/config/config.go](backend/internal/config/config.go), the in-process suggest engine uses Redis for lexicon metadata and optional response caching. Config keys: `REDIS_URL`, `SuggestRedisTimeoutMS`.
- **Tamil word cache**: The Tamil word cache service can use Redis when `REDIS_URL` is set.

## Setup (e.g. Upstash free tier)

1. Create a Redis instance at [upstash.com](https://upstash.com) (free tier: 10K requests/day).
2. Copy the Redis URL (e.g. `rediss://default:xxx@xxx.upstash.io:6379`).
3. Set in your deployment environment:
   ```bash
   REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379
   ```
4. Restart the Go backend. The suggest engine and Tamil word cache will use Redis when the URL is non-empty.

## Optional: IME / transliteration response cache

The plan suggests caching transliteration/IME responses (e.g. 7-day TTL) to reduce calls to ProofTamil Runner or Akshara. This is **not** implemented yet. To add it:

1. In [backend/internal/ime](backend/internal/ime) (e.g. in the client or service that calls the runner), before calling the external API:
   - Build a cache key from `(query, mode, limit)` (and optional `prev`).
   - Check Redis for that key; on hit return cached result.
2. On miss, call the transliteration/IME service and store the result in Redis with a TTL (e.g. 7 days).
3. Use the same `REDIS_URL` and a key prefix such as `ime:translit:` to avoid collisions.

No code changes are required for the existing suggest + Tamil word cache; setting `REDIS_URL` is enough for those.
