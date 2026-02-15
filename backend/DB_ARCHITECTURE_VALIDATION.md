# DB Architecture Plan Validation

This document confirms that the codebase matches the **Implement ProofTamil DB Architecture** plan (prooftamil-db-architecture.md).

---

## 1. Schema and migrations (Supabase/Postgres)

| Plan requirement | Implementation | Status |
|------------------|----------------|--------|
| 1.1 Extensions pg_trgm, btree_gin | `backend/migrations/sql/01_db_architecture_schema.sql` | Done |
| 1.2 tamil_words: frequency_rank, translit_lower, translit_length, unique index on tamil_text | Same file, STEP 2 + DO blocks | Done |
| 1.3 phonetic_variants table (id, tamil_word_id, variant, tamil_text, frequency, variant_lower, variant_length, UNIQUE) | Same file, STEP 3 | Done |
| 1.4 tamil_bigrams: id if missing, UNIQUE(word, next_word) | Same file, STEP 4 (id BIGSERIAL + idx_bigrams_unique; no PK change to avoid breaking composite PK) | Done |
| 1.5 tamil_phrases: id if missing, UNIQUE(phrase) | Same file, STEP 5 | Done |
| 1.6 Indexes (idx_pv_*, idx_tw_*, idx_bigrams_*, idx_phrases_*) + ANALYZE | Same file, STEP 6 | Done |
| 1.7 mv_top_suggestions (1/2/3-letter prefixes, top 10), indexes | Same file, STEP 7 | Done |
| Migration artifact | `backend/internal/migrations/db_architecture.go` runs 01/02/03 when phonetic_variants missing; SQL is embedded (`sql/*.sql`) so migrations run in Cloud Run without filesystem | Done |
| alternate_spellings: JSON + comma/pipe | Handled in data migration (03) Step 2a (JSON) and 2b (CSV) | Done |

---

## 2. Postgres RPCs

| RPC | File | Status |
|-----|------|--------|
| suggest_tamil (4-tier: MV, prefix, translit, fuzzy) | `backend/migrations/sql/02_db_architecture_rpcs.sql` | Done |
| predict_next_word | Same file | Done |
| validate_tamil_words | Same file | Done |
| check_phrase_validity | Same file | Done |
| record_word_selected | Same file | Done |

---

## 3. Data migration (phonetic_variants)

| Step | Implementation | Status |
|------|----------------|--------|
| Step 1: Insert from tamil_words (transliteration) | `03_db_architecture_data.sql` | Done |
| Step 2: Expand alternate_spellings (JSON + comma/pipe) | Step 2a + 2b in same file | Done |
| Step 3: frequency_rank on tamil_words | WITH ranked + UPDATE | Done |
| Step 4: REFRESH MATERIALIZED VIEW CONCURRENTLY + ANALYZE | Same file | Done |

---

## 4. Go backend: repository and hot cache

| Plan requirement | Implementation | Status |
|------------------|----------------|--------|
| 4.1 SuggestRepo, Suggest(ctx, query, limit, prevWord), 50ms timeout | `backend/internal/repository/suggest.go` | Done |
| ScoredWord { TamilText, Score int64, MatchType } | Same file | Done |
| Optional ValidateWords, PredictNext | ValidateWords + PredictNext in same file | Done |
| 4.2 HotCache: top 5K by frequency_rank, 1–8 char prefix, top 10 per prefix, 30min refresh, 15s load | `backend/internal/cache/hotcache.go` | Done |
| Lookup(query) []ScoredWord | Same file | Done |
| 4.3 Response shape: normalize score to 0–1 | suggest_handlers.Suggest + normalizeScoredWordsToAPI | Done |

---

## 5. Wire new suggest path into GET /api/v1/suggest

| Plan requirement | Implementation | Status |
|------------------|----------------|--------|
| 5.1 handlers.New: *sql.DB, create SuggestRepo + HotCache when flag | `handlers.go`: cfg.SuggestUseDB && sqlDB != nil | Done |
| Store suggestRepo, hotCache on Handlers | Same file | Done |
| 5.2 Suggest: (1) hotCache.Lookup; (2) repo.Suggest; (3) fallback engine/IME/translit; (4) map to word, score 0–1 | `suggest_handlers.go` | Done |
| 5.3 Config SUGGEST_USE_DB | `config.go`: SuggestUseDB from env | Done |

---

## 6. Optional: Grammar / validation (API 2)

| Plan requirement | Implementation | Status |
|------------------|----------------|--------|
| 6.1 Expose validate_tamil_words via POST /api/v1/validate/words | Not implemented (deferred per plan) | Deferred |
| 6.2 Call from submission / quick spell check | Not implemented | Deferred |

---

## 7. Cloud Run and ops

| Plan requirement | Implementation | Status |
|------------------|----------------|--------|
| 7.1 Memory 256 MB, pool max 10 conns | main.go already sets max 10 open conns; deploy.yml still 2Gi (can reduce to 256Mi when DB path is primary) | Configurable |
| 7.2 Single in-memory path; no full trie load when SUGGEST_USE_DB | Lexicon load removed; engine is empty; DB path + IME/translit only | Done |

---

## 8. Files summary

| Area | Files |
|------|--------|
| SQL | `backend/migrations/sql/01_db_architecture_schema.sql`, `02_db_architecture_rpcs.sql`, `03_db_architecture_data.sql` |
| Go | `backend/internal/repository/suggest.go`, `backend/internal/cache/hotcache.go` |
| Migrations | `backend/internal/migrations/db_architecture.go` |
| Handlers | `backend/internal/handlers/handlers.go`, `backend/internal/handlers/suggest_handlers.go` |
| Config | `backend/internal/config/config.go` (SuggestUseDB) |

---

## 9. Migrations plan validation

| Aspect | Plan | Implementation | Valid |
|--------|------|----------------|-------|
| **Default run** | DB architecture not run at startup | Server runs AutoMigrate + Newsletter/Affiliate/Billing when `RUN_MIGRATIONS=true`; DB architecture runs only when `RUN_DB_ARCHITECTURE_MIGRATIONS=true` (default false). Run from local: `go run ./cmd/migrate` | Yes |
| **Execution order** | Schema → RPCs → data | `db_architecture.go` runs `01_db_architecture_schema.sql` → `02_db_architecture_rpcs.sql` → `03_db_architecture_data.sql` in sequence | Yes |
| **Gate** | Run DB architecture only when needed | `MigrateDBArchitecture` runs only if `phonetic_variants` table does not exist; then runs all three SQL files | Yes |
| **Re-run safety** | Idempotent; IF NOT EXISTS / DO blocks | 01/02 use `CREATE IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS ... END $$`; 03 uses `ON CONFLICT DO NOTHING` and `REFRESH MATERIALIZED VIEW CONCURRENTLY` | Yes |
| **SQL location** | migrations/sql/ or embedded | Embedded `sql/*.sql` in migrations package used first (Cloud Run); fallback to `findMigrationsSQLDir()` on disk | Yes |
| **Integration** | After GORM connect; with other migrations | main.go: after DB connect, when `cfg.RunMigrations`: AutoMigrate → Newsletter/Affiliate/Billing (parallel) → MigrateDBArchitecture | Yes |
| **Error handling** | Non-fatal where appropriate | DB architecture failure is logged as Warning; server still starts; `isAlreadyExistsOrBind` skips "already exists" errors | Yes |

**Note:** DB architecture migrations are **not** run from Cloud Run or the workflow. They run **from local only** via: `go run ./cmd/migrate` (with `DATABASE_URL` in `.env` or env). The server only runs them when `RUN_DB_ARCHITECTURE_MIGRATIONS=true` (default false). SQL is embedded so the migrate command needs no extra files.

---

## 10. Response shape

GET /api/v1/suggest returns `{ "success": true, "suggestions": [ { "word": "<Tamil>", "score": 0–1 } ] }`. No frontend changes required.
