## Suggest Engine: Data Plane vs Control Plane

### Data Plane (Hot Path)
- Endpoint: `GET /api/v1/suggest`
- Strictly in-memory:
  - Hybrid Trie lookup (no Postgres)
  - LRU cache lookup
  - Optional Redis re-rank on top 25 IDs only
- No AI / LLM calls
- No Postgres calls
- Target: p95 < 170ms, p50 < 30ms

### Control Plane (Cold/Background)
- Boot-time lexicon load from Postgres
- Periodic refresh (`LEXICON_REFRESH_SEC`)
- Optional selection persistence (`/api/select` → Postgres)
- Optional Redis personalization (writes)

### Key Guarantee
**The serving path never touches the database.**
