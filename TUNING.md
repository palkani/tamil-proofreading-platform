# DB and cache tuning

Tuning env vars and tips when DB calls or cache load take too long.

## Why DB calls were slow (and what we did)

1. **OFFSET pagination** — Batches used `OFFSET N LIMIT 10000`. With 227k rows, later batches (e.g. OFFSET 200000) force Postgres to scan and discard 200k rows, so each batch gets slower.  
   **Fix:** Keyset pagination: `WHERE (frequency, user_confirmed, id) < (last_f, last_uc, last_id) ORDER BY ... LIMIT N`. Each batch is O(limit), not O(offset). Requires index `idx_tamil_words_freq_uc_id`.

2. **Missing indexes** — Prefix lookups (`transliteration ILIKE 'prefix%'`) and batch ordering need indexes.  
   **Fix:** `idx_tamil_words_transliteration_prefix` (text_pattern_ops), `idx_tamil_words_lower_trans` (LOWER(transliteration) for case-insensitive), `idx_tamil_words_freq_uc_id` (frequency DESC, user_confirmed DESC, id).

3. **No request timeout on suggestFromDB** — One slow query could hang the suggest API.  
   **Fix:** 5s timeout per suggestFromDB request; query uses `LOWER(transliteration) LIKE` so the expression index is used.

## Env vars (all optional)

| Env | Default | Use |
|-----|--------|-----|
| **Suggest lexicon load** | | |
| `SUGGEST_LOAD_BATCH_SIZE` | 10000 | Rows per DB batch. Lower (e.g. 5000) if each query hits statement timeout. |
| `SUGGEST_LOAD_LIMIT` | 100000 | Max rows to load into suggest trie. |
| `SUGGEST_BATCH_TIMEOUT_SEC` | 30 | Per-batch deadline (seconds). Failing batch is retried. |
| **Tamil word cache load** | | |
| `TAMIL_CACHE_BATCH_SIZE` | 10000 | Rows per batch for Tamil word cache. |
| `TAMIL_CACHE_LOAD_LIMIT` | 500000 | Max rows to load into Tamil word cache. |
| `TAMIL_CACHE_BATCH_TIMEOUT_SEC` | 30 | Per-batch timeout (seconds). |
| **Response cache** | | |
| `SUGGEST_CACHE_ENTRIES` | 3000 | LRU response cache size (suggest API). Increase for higher hit rate. |
| `SUGGEST_CACHE_TTL_MS` | 300000 | TTL in ms (5 min). Increase to keep responses longer. |

## Quick fixes

- **Statement timeout / unexpected EOF during load**  
  - Reduce batch size: `SUGGEST_LOAD_BATCH_SIZE=5000`, `TAMIL_CACHE_BATCH_SIZE=5000`.  
  - Ensure DB pool is tuned (see `main.go`: `SetConnMaxLifetime`, `SetConnMaxIdleTime`).  
  - Use **transaction mode** (port 6543) in `DATABASE_URL` if you use Supabase pooler.

- **Load takes too long**  
  - Lower `SUGGEST_LOAD_LIMIT` or `TAMIL_CACHE_LOAD_LIMIT` for faster first load (fewer rows).  
  - Keep per-batch timeout reasonable (e.g. 30s) so slow batches fail fast and retry.

- **Suggest API still slow after load**  
  - Increase `SUGGEST_CACHE_ENTRIES` and `SUGGEST_CACHE_TTL_MS` so more requests are served from LRU.  
  - Add DB index for prefix lookups (see below) if suggest falls back to DB.

## DB index for suggest fallback

When the suggest engine falls back to DB (e.g. before lexicon is loaded), it runs:

```sql
SELECT ... FROM tamil_words WHERE transliteration ILIKE 'prefix%' ORDER BY frequency DESC ...
```

To speed that up (e.g. on Postgres):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tamil_words_transliteration_prefix
ON tamil_words (transliteration text_pattern_ops);
```

`text_pattern_ops` helps for `ILIKE 'prefix%'`-style queries.

## Summary

- **Smaller batches** (5k) + **per-batch timeout** (30s) = fewer timeouts and clearer failures.  
- **Larger LRU** (`SUGGEST_CACHE_ENTRIES`, `SUGGEST_CACHE_TTL_MS`) = more suggest requests served from memory.  
- **Index** on `transliteration` (with `text_pattern_ops`) = faster DB fallback for suggest.
