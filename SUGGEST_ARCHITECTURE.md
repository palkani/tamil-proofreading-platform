# Auto-Suggest Architecture (English → Tamil Transliteration)

This document describes how **English-to-Tamil transliteration suggestions** work in the ProofTamil workspace, from typing in the editor to the dropdown and why you might see **no suggestions** (e.g. for "tamil") when the API returns `{"success":true,"suggestions":[]}`.

---

## 1. High-level flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Workspace)                                                             │
│  ┌──────────────┐    input/keyup     ┌─────────────────────┐                      │
│  │ #editor      │ ─────────────────► │ handleEditorChange │                      │
│  │ (contenteditable)                  │ (debounce ~150ms)   │                      │
│  └──────────────┘                    └─────────┬─────────┘                      │
│                                                 │                                │
│                                                 ▼                                │
│                                      ┌─────────────────────┐                     │
│                                      │ Token at cursor     │                     │
│                                      │ (Latin word, e.g.   │                     │
│                                      │  "tamil")           │                     │
│                                      └─────────┬─────────┘                      │
│                                                │                                │
│                                                ▼                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │ fetchRunnerSuggestions({ q: token, limit: 8, mode })                     │   │
│  │   GET /api/v1/suggest?q=tamil&limit=8&mode=spoken                        │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  NETWORK                                                                         │
│  • Production (prooftamil.com):  /api/v1/suggest  → Vercel Edge → Go backend     │
│  • Local Express:               /api/v1/suggest  → proxied to Go backend       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Go)  GET /api/v1/suggest                                               │
│  handlers.Suggest()                                                              │
│                                                                                  │
│  1) Suggest engine (trie + lexicon)                                              │
│     engine.Suggest(ctx, { Query: q, Limit: limit })                               │
│     • Data: trie built from tamil_words DB or lexicon file                        │
│     • If trie not loaded / no match → suggestions = []                            │
│                                                                                  │
│  2) IME fallback (if engine returned empty)                                      │
│     h.imeSvc.Suggest(ctx, q, "spoken", limit)                                     │
│     • Corpus + Aksharamukha; only if IME enabled                                  │
│                                                                                  │
│  3) Translit fallback (if still empty)                                           │
│     translit.GetSuggestions(q)                                                    │
│     • In-memory translit lexicon (prefix/fuzzy match)                             │
│     • Same data used by GET /api/v1/transliterate/suggest                         │
│                                                                                  │
│  Response: { "success": true, "suggestions": [ { "word": "தமிழ்", "score": 1 } ] }│
└─────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Workspace)                                                             │
│  • fetchRunnerSuggestions receives response                                      │
│  • cleanTamilSuggestions / rankTamilCandidates (if present)                       │
│  • displaySuggestions(suggestions)                                               │
│    → If suggestions.length > 0: build #tamil-suggestions-dropdown and show       │
│    → If suggestions.length === 0: hide dropdown (no UI)                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component roles

| Layer | Component | Role |
|-------|-----------|------|
| **Frontend** | `workspace.js` | TamilEditor + contenteditable; input/keyup → handleEditorChange → token extraction → fetchRunnerSuggestions |
| **Frontend** | `fetchRunnerSuggestions()` | GET `/api/v1/suggest?q=...&limit=8`; maps `data.suggestions` to `{ text, score }`; caches; calls displaySuggestions |
| **Frontend** | `displaySuggestions(suggestions)` | Builds/hides `#tamil-suggestions-dropdown`; only shows dropdown when `suggestions.length > 0` |
| **API** | Vercel Edge `api/v1/suggest.js` (prod) | Proxies to Go backend; returns backend JSON as-is |
| **Backend** | `handlers.Suggest()` | GET /api/v1/suggest; tries (1) suggest engine, (2) IME fallback, (3) translit fallback; returns `{ success, suggestions }` |
| **Backend** | `suggest.Engine` | Trie + lexicon (DB or file); Lookup(norm) → buildSuggestions |
| **Backend** | `translit.GetSuggestions(q)` | In-memory translit lexicon; prefix/fuzzy match; used when trie/IME return empty |

---

## 3. Why suggestions can be empty

The API can return `{"success":true,"suggestions":[]}` in these cases:

1. **Suggest engine not ready**  
   Trie/lexicon not loaded yet (e.g. startup, or no lexicon file/DB rows). Engine returns empty; IME/translit fallbacks may still fill suggestions.

2. **No match in trie**  
   Query (e.g. "tamil") has no prefix match in the suggest engine’s lexicon (e.g. `tamil_words` or built lexicon). Again, fallbacks can provide results.

3. **IME fallback disabled or empty**  
   IME service not configured or returns no candidates for the query.

4. **No translit fallback (fixed)**  
   Previously, GET /api/v1/suggest did not use the translit lexicon when engine and IME were empty. The translit lexicon (same as `/api/v1/transliterate/suggest`) is now used as a final fallback so queries like "tamil" get Tamil suggestions even when the trie/IME do not.

---

## 4. API contracts

- **Client request:**  
  `GET /api/v1/suggest?q={query}&limit=8&mode=spoken`

- **Response:**  
  `{ "success": true, "suggestions": [ { "word": "<Tamil>", "score": 0–1 } ] }`  
  If there are no suggestions, `suggestions` is `[]` (array length 0).

- **Frontend:**  
  `workspace.js` expects `data.suggestions` to be an array of objects with at least `word` or `text` and optional `score`. It only shows the dropdown when this array has length > 0.

---

## 5. Files reference

| Purpose | File(s) |
|--------|---------|
| Editor + suggest pipeline | `express-frontend/public/js/workspace.js` (TamilEditor, handleEditorChange, fetchRunnerSuggestions, displaySuggestions) |
| Suggest API (prod proxy) | `express-frontend/api/v1/suggest.js` (Vercel Edge → Go) |
| Backend suggest handler | `backend/internal/handlers/suggest_handlers.go` (Suggest) |
| Suggest engine (trie/lexicon) | `backend/internal/suggest/engine.go`, loader, trie |
| Translit fallback | `backend/internal/translit/search.go` (GetSuggestions) |
| Transliterate suggest (other route) | `backend/internal/handlers/transliteration_handlers.go` (TransliterateSuggest) |

---

## 6. Testing

- **Type "tamil" in workspace editor**  
  Expect: request to `/api/v1/suggest?q=tamil&limit=8&mode=spoken` and, if backend returns non-empty `suggestions`, the Tamil suggestions dropdown appears.

- **If dropdown still does not show**  
  - In Network tab, confirm the suggest request returns 200 and inspect response body.  
  - If `suggestions` is `[]`, the issue is backend (engine + IME + translit).  
  - If `suggestions` has items but dropdown does not appear, the issue is frontend (displaySuggestions or DOM).
