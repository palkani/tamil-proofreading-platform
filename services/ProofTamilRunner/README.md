# ProofTamilRunner (Aksharamukha IME Service)

Clean-architecture FastAPI service providing transliteration for the Go IME adapter with strict security.

## Security model
- Requires headers on all endpoints (except `/health`):
  - `X-API-Key`
  - `X-Client-Id`
- API keys are HMAC-SHA256 hashed with `API_KEY_SECRET` and stored in-memory.
- No API keys are logged. Request IDs are propagated and logged.
- Per-client rate limiting (in-memory) with HTTP 429 on violation.

## Project structure
```
app/
  main.py
  api/
    routes.py
    schemas.py
  core/
    config.py
    security.py
    rate_limit.py
    logging.py
  middleware/
    auth.py
    request_id.py
    metrics.py
  services/
    transliteration.py
  adapters/
    aksharamukha.py
```

## API

### Health Check
- `GET /health` (no auth needed)
  - Returns service health and cache statistics

### Transliteration
- `POST /transliterate`
  - Request: `{"text":"enathu","mode":"spoken","limit":8}`
  - Response: `{"success": true, "suggestions":[{"word":"எனது","ta":"எனது","score":1.0}]}`
  - Backward compatible with existing Go backend (suggestions array, word/ta/score).

### Enhanced Suggest Endpoint (NEW)
- `GET /transliterate/suggest`

Enhanced suggest endpoint with layered algorithm for context-aware Tamil suggestions.

#### Parameters
- `q` (required): Roman input fragment (1-40 characters)
- `limit` (optional, default: 8): Maximum number of suggestions (1-20)
- `mode` (optional, default: "smart"): Either "smart" or "strict"
  - `smart`: Includes heuristic neighbors and context-aware suggestions
  - `strict`: Only strict transliteration and minimal expansions
- `context` (optional, max 5000 chars): Full text around cursor for context-aware suggestions
- `cursor` (optional): Cursor position within context (default: end of context)
- `lang` (optional): Language code (reserved for future use)
- `client_id` (optional): Client ID for logging/metrics
- `project_id` (optional): Project ID for logging/metrics

#### Response Format
```json
{
  "success": true,
  "suggestions": [
    {"word": "ம்", "score": 0.95},
    {"word": "ம", "score": 0.90},
    {"word": "மா", "score": 0.85},
    {"word": "மே", "score": 0.80}
  ],
  "meta": {
    "algorithm_version": "1.0.0",
    "layers_used": ["A", "B", "D", "F"],
    "timings_ms": {
      "core": 12.5,
      "vowel": 2.1,
      "frequency": 0.8,
      "final_rank": 1.2
    },
    "total_time_ms": 16.6,
    "cache_hits": {"core": false, "final": false},
    "runner_error": false,
    "mode": "smart",
    "limit": 8,
    "context_present": false
  }
}
```

#### Algorithm Layers

The suggest endpoint uses a layered algorithm:

1. **Layer A - Core Transliteration**: Uses existing transliteration mechanism (Aksharamukha or external runner). For single consonants, ensures both base consonant and consonant + pulli forms.

2. **Layer B - Tamil Vowel Expansion**: Generates syllabic expansions using dependent vowel markers (ா, ி, ீ, ு, ூ, ெ, ே, ை, ொ, ோ, ௌ).

3. **Layer C - Context-Aware Completion**: If context is provided, detects word boundaries and applies joining rules. Prefers candidates that can join with existing Tamil text.

4. **Layer D - Frequency Ranking**: Boosts common Tamil words using a local frequency dictionary (`data/ta_frequency_min.json`). Maximum boost: +0.12.

5. **Layer E - Heuristic Neighbors** (smart mode only): Adds phonetic/orthographic neighbors (e.g., for "m" includes "ன்"). Configurable and unit-tested.

6. **Layer F - Dedup + Final Ranker**: Normalizes Unicode (NFC), deduplicates, applies penalties for unlikely matches, and sorts by:
   - Score (descending)
   - Word length (ascending)
   - Unicode codepoint (ascending)

#### Example Requests

**Basic request (no context):**
```bash
curl "http://localhost:8088/transliterate/suggest?q=m&limit=5&mode=smart" \
  -H "X-API-Key: demo-key" \
  -H "X-Client-Id: demo-client"
```

**With context:**
```bash
curl "http://localhost:8088/transliterate/suggest?q=m&limit=5&context=என்&cursor=2" \
  -H "X-API-Key: demo-key" \
  -H "X-Client-Id: demo-client"
```

**Strict mode (no heuristics):**
```bash
curl "http://localhost:8088/transliterate/suggest?q=m&limit=5&mode=strict" \
  -H "X-API-Key: demo-key" \
  -H "X-Client-Id: demo-client"
```

#### Ranking and Scoring

Final scores are calculated as:
```
final_score = clamp(
  base_score
  + freq_boost(word)        # up to +0.12
  + context_boost(word, ...) # up to +0.10
  - penalty_for_unlikely(word, q)  # various penalties
, 0, 1)
```

#### Performance

- Target p95 latency: < 60ms locally for short inputs with warm cache
- Uses LRU caching for core transliteration and final results
- Cache size: 10,000 entries (configurable)
- Request-level timeouts for external runner calls

#### Frequency Dictionary

The frequency dictionary is loaded from `data/ta_frequency_min.json` at startup. To update:
1. Edit `data/ta_frequency_min.json`
2. Format: `{"word": frequency, ...}` where frequency is a positive number
3. Restart the service

#### Error Responses

Invalid requests return HTTP 400 with:
```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "q must be at most 40 characters"
  }
}
```

#### Response Headers

- `X-Algorithm-Version`: Algorithm version (e.g., "1.0.0")
- `X-Layers-Used`: Comma-separated list of layers used (e.g., "A,B,D,F")
- `X-Cache-Hit-Core`: "true" or "false"
- `X-Cache-Hit-Final`: "true" or "false"

## Local run
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export API_KEY_SECRET=change-me
export API_KEY=demo-key
export CLIENT_ID=demo-client
uvicorn app.main:app --host 0.0.0.0 --port 8088
```

## Authenticated curl example
```bash
curl -X POST http://localhost:8088/transliterate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: demo-key" \
  -H "X-Client-Id: demo-client" \
  -d '{"text":"enathu","mode":"spoken","limit":8}'
```

## Cloud Run deploy (example)
```bash
gcloud run deploy proof-tamil-runner \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars API_KEY_SECRET=change-me,API_KEY=demo-key,CLIENT_ID=demo-client
```

### GitHub Actions (auto-deploy)
This repo includes `.github/workflows/deploy.yml` which:
- Builds the Docker image with Cloud Build
- Deploys to Cloud Run

Required GitHub secrets:
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_SERVICE` (e.g., proof-tamil-runner)
- `GCP_SA_KEY` (JSON key for a deploy service account)
- `API_KEY_SECRET`, `API_KEY`, `CLIENT_ID`
- Optional: `RATE_LIMIT_PER_MIN` (default 60), `MAX_TEXT_LEN` (default 64)

## Pricing / plan notes
- Free vs paid plans can be enforced by expanding the in-memory client registry and rate-limit policy.
- Rate limits are per-client_id; adjust `RATE_LIMIT_PER_MIN` env.

## GitHub Actions (auto-deploy)
This repo includes `.github/workflows/deploy.yml` which:
- Builds the Docker image with Cloud Build
- Deploys to Cloud Run

Required GitHub secrets:
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCP_SERVICE` (e.g., proof-tamil-runner)
- `GCP_SA_KEY` (JSON key for a deploy service account)
- `API_KEY_SECRET`, `API_KEY`, `CLIENT_ID`
- Optional: `RATE_LIMIT_PER_MIN` (default 60), `MAX_TEXT_LEN` (default 64)

## Tests
```bash
pytest
```

