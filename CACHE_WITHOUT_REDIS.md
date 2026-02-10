# Caching Without Redis (Best Alternative)

You can run the app **without Redis**. The recommended alternative is **in-memory caching**, which is already built in.

## How to disable Redis

- **Leave `REDIS_URL` empty** (or unset) in your environment or `.env`.
- No code changes are required.

## What happens without Redis

| Feature | With Redis | Without Redis (in-memory) |
|--------|------------|---------------------------|
| **Tamil word cache** | Optional Redis + in-memory | In-memory only (loaded from Postgres at init) |
| **Suggest lexicon** | Optional Redis cache for lexicon rows | Load from Postgres on startup/refresh |
| **Suggest response cache** | N/A (LRU is in-process) | In-process LRU (`SUGGEST_CACHE_ENTRIES`, `SUGGEST_CACHE_TTL_MS`) |
| **Suggest personalization** | User/global selection counts in Redis | In-memory selection cache (per instance) |

## When in-memory is a good fit

- **Single instance** (one server / one process): In-memory is ideal. No extra service to run.
- **Development / staging**: Simpler setup; no Redis to install or maintain.
- **Low-to-moderate traffic**: In-memory limits are sufficient (e.g. 500k words in Tamil cache, LRU for suggest).

## Limitations without Redis

- **Multiple instances**: Each instance has its own in-memory cache and personalization. No shared cache across instances.
- **Restarts**: In-memory caches are lost on restart. Use `PRELOAD_TAMIL_CACHE_AT_STARTUP=true` to warm the Tamil word cache at startup.

## Summary

**Best alternative to Redis:** leave `REDIS_URL` unset. The app uses in-memory caches and an in-memory selection store for suggest personalization. No Redis dependency.
