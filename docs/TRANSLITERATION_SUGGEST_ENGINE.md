# Tamil Transliteration Suggestion Engine

Real-time, letter-by-letter Tamil word suggestions as users type English/romanized input. Integrated with ProofTamil’s existing cache and APIs.

## Architecture (as implemented)

```
┌─────────────────┐
│  Text Editor    │  (Frontend: TamilIME, workspace)
│  (Frontend)     │
└────────┬────────┘
         │ Debounced keystroke (e.g. 200ms)
         ▼
┌─────────────────┐
│ GET /api/v1/suggest   (or /ime/suggest, /transliterate/suggest)
│  (API Layer)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Suggestion Engine (Go)           │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ Trie Index  │  │ Transliteration  │  │
│  │ (from cache)│  │ Fallback (IME)   │  │
│  └──────┬──────┘  └────────┬─────────┘  │
│         │                  │             │
│         ▼                  ▼             │
│  ┌─────────────────────────────────┐    │
│  │  Merge + Score (0–1) + Rank     │    │
│  └─────────────────────────────────┘    │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│  Lexicon cache (JSON/binary, ~260K+)     │
│  IDTables + Trie, loaded at startup     │
└─────────────────────────────────────────┘
```

## What’s already in place

- **Trie from cache** – Lexicon (tamil_words / pre-built file) is loaded into **IDTables** (Tamil/latin by ID, frequency, boost) and a **Trie** keyed by normalized Roman. Built once at startup (or from file), no separate store.
- **Letter-by-letter** – Prefix lookup: `t` → `th` → `thu` → … via `Trie.Lookup(prefix, limit)`. O(m) in prefix length. Single-character suggestions are supported (default `SUGGEST_MIN_LEN=1`).
- **Normalization / fuzzy-style rules** – Roman input is normalized before trie lookup: `th`/`dh`→`t`, `zh`→`l`, consonant variants (e.g. d→t, b→p, g→k), optional vowel collapse. So “nadagam” and “natakam” can match the same entry.
- **Scoring** – Combines frequency, user-confirmed boost, and optional Redis/local selection. Scores in the API response are **normalized to 0–1** (top suggestion = 1.0).
- **Transliteration fallback** – If the trie returns no suggestions, the handler can call the **IME service** (corpus + Aksharamukha) and return those with `type: "transliteration"`.
- **APIs** – `GET /api/v1/suggest?q={input}&limit={5}` and related endpoints return the spec-style payload below.

## API: GET /api/v1/suggest

**Query params**

| Param  | Description                    | Default |
|--------|--------------------------------|--------|
| `q`    | User input (romanized)         | required |
| `limit`| Max suggestions (1–10)         | 5      |
| `uid`  | Optional user id for personalization | - |

**Response (spec-aligned)**

```json
{
  "success": true,
  "input": "thu",
  "q": "thu",
  "normalized": "tu",
  "suggestions": [
    { "word": "து", "text": "து", "score": 1.0, "type": "dictionary" },
    { "word": "த்து", "text": "த்து", "score": 0.9, "type": "dictionary" },
    { "word": "தூ", "text": "தூ", "score": 0.8, "type": "dictionary" }
  ],
  "latency_ms": 2.5,
  "source": "trie",
  "timing": { "total_ms": 2.5, "trie_ms": 0.5 },
  "meta": { "lexicon_count": 495000, "trie_version": "file:..." }
}
```

- **word** / **text** – Tamil word (same value).
- **score** – 0–1, relative to the top suggestion.
- **type** – `"dictionary"` (trie/cache), `"transliteration"` (IME fallback), or `"fuzzy"` if added later.
- **latency_ms** – Total response time in ms.

## Performance

- **Target** – &lt; 20 ms typical; LRU response cache and in-memory trie keep most requests in single-digit ms when the lexicon is loaded.
- **Concurrency** – In-memory trie + cache; scale by adding instances.
- **Memory** – One copy of IDTables + Trie per process (lexicon file or DB load at startup).

## Configuration (env)

| Variable           | Description                          | Default |
|--------------------|--------------------------------------|--------|
| `SUGGEST_MIN_LEN`  | Min prefix length (1 = letter-by-letter) | 1   |
| `SUGGEST_TOP_K`    | Default suggestion count              | 5      |
| `LEXICON_FILE`     | Pre-built lexicon path (`.json` or `.bin`) | -  |
| `SUGGEST_LOAD_LIMIT` | Max rows to load from DB (0 = all) | 0      |

## Which editor uses which API

| Editor | App | API used | With our changes |
|--------|-----|----------|------------------|
| **Home page editor** (prooftamil.com) | express-frontend | `GET /api/v1/suggest` (via transliterator-runner.js) | Yes: letter-by-letter, trie + transliteration fallback |
| **Workspace editor** (prooftamil.com) | express-frontend | `GET /api/v1/suggest` (workspace.js) | Yes: same as above |
| **Home page editor** (Next.js app) | frontend (Next.js) | `GET /api/v1/ime/suggest` (TamilIME.ts) | Yes: IME or suggest-engine fallback, 200 during startup |

So the **text editor on the home page and inside the workspace** (on the live site) both call **/api/v1/suggest**. Our changes ensure that endpoint returns letter-by-letter suggestions from the trie and, when the trie has no match, from the IME (transliteration) fallback. The Next.js editor (if deployed) uses **/api/v1/ime/suggest**, which we also fixed to fall back to the suggest engine when IME is disabled or returns empty.

## Frontend integration

- **Reusable component** – `frontend/components/TransliterationSuggestDropdown.tsx`:
  - Controlled input/textarea with `value` / `onChange`.
  - 50 ms debounced fetch to `GET /api/v1/suggest?q=...&limit=5`.
  - Dropdown with keyboard nav (↑↓ Enter Tab Escape), score as percentage, and `type` badge (dictionary/transliteration/fuzzy).
  - `onSelect(word)` when user selects a suggestion.
- **Demo page** – `/tools/transliteration-suggest` uses the dropdown; select inserts the Tamil word and a space.
- **TamilIME** – Editor extension already uses `/api/v1/ime/suggest` with the same trie; same keyboard behavior.

## Build and deploy

- Lexicon is built from `tamil_words` (or existing cache) via `cmd/build_lexicon` and baked into the image as JSON or binary (`.bin` for faster load).
- Set `LEXICON_FILE` to that path (e.g. `/root/data/lexicon.json` or `/root/data/lexicon.bin`). Engine loads it at startup and serves suggestions from memory.

## Testing

- **Unit** – `go test ./backend/internal/suggest/...`
- **Manual** –  
  `curl "http://localhost:8080/api/v1/suggest?q=t&limit=5"`  
  `curl "http://localhost:8080/api/v1/suggest?q=thu&limit=5"`  
  `curl "http://localhost:8080/api/v1/suggest?q=vanakkam&limit=5"`

## Optional / future

- **Fuzzy type** – Mark suggestions that came from normalized/fuzzy match (e.g. alternate spelling) as `type: "fuzzy"`.
- **Learning** – `POST /api/v1/select` (or equivalent) already records selection for personalization (Redis or DB); can be used to boost chosen words over time.
- **Context** – Use previous word or sentence for context-aware ranking (not implemented yet).
