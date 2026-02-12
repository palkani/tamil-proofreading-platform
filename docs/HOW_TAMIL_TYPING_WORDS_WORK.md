# How Tamil Typing & Word Suggestions Work

This doc explains **how Google Tamil typing works** (and where it gets words) and **how our platform’s Tamil typing works** (and where we gather words).

---

## 1. How Google Tamil typing works (Google’s product)

### What we know from the API

- **Google Input Tools** (and similar products like Google Indic Keyboard) expose a **free, public API** for transliteration:
  - **URL:** `https://inputtools.google.com/request`
  - **Params:** e.g. `text=vanakkam`, `itc=ta-t-i0-und` (Tamil), `num=8`
  - **Response:** A list of Tamil word suggestions for the given Roman/Latin input.

- Our codebase uses this in **ProofTamilRunner** (`backend/prooftamil-runner/app/services/google_transliteration.py`): the `GoogleTransliterationClient` calls this API and can be used as one source of suggestions.

### Where Google likely gets its words (not officially documented)

Google does **not** publish how they build their Tamil vocabulary. In general, products like this use a mix of:

1. **Large text corpora** – Wikipedia (Tamil + English with Tamil words), news, books, web crawl.
2. **Dictionaries & lexicons** – Licensed or open dictionaries (e.g. Wiktionary-style data).
3. **Transliteration rules** – Roman-to-Tamil mapping (similar to our consonant/vowel tables).
4. **User behavior** – Which suggestion users pick (implicit feedback) to rank and refine.
5. **ML models** – Language models trained on the above to suggest context-aware and colloquial forms.

So **Google Tamil typing “gathers” words** from: corpora, dictionaries, rules, and user signals, combined by their internal systems. We cannot see or reuse their internal word list; we can only **call their API** and get suggestions per query.

---

## 2. How our platform’s Tamil typing works

Our app does **not** rely on Google for the main suggest path. We have our own **in-process suggest engine** and our own **word list**.

### Main flow (production)

```
User types Roman text (e.g. "vanakkam")
    ↓
Frontend calls GET /api/v1/suggest?q=vanakkam&limit=8
    ↓
Go backend suggest engine (in-process)
    ↓
Lookup in in-memory TRIE built from lexicon file
    ↓
Lexicon file = data/lexicon.json (baked in image)
    ↓
Lexicon file is built from DB table: tamil_words
```

So **our words** come from:

1. **`tamil_words` table** (Postgres) – single source of truth.
2. **`data/lexicon.json`** – export of `tamil_words` built by `build_lexicon` (in CI or manually). The backend loads this **entire file** into memory at startup (trie + ID tables).
3. **No live Google dependency** for the main suggest path – we use our own lexicon so we control quality and latency.

### Where we gather words for `tamil_words`

We **add** English-to-Tamil (Roman-to-Tamil) entries into `tamil_words`; then we **rebuild** the lexicon file so the engine sees them. Sources we use:

| Source | How we add | Tool / flow |
|--------|------------|-------------|
| **Our own CSV/JSON list** | Bulk import | `backend/cmd/import-tamil-words` |
| **Tamil Wikipedia titles** | Load from dump | `backend/cmd/load-tamil-words-dir` |
| **English Wikipedia** (Tamil in articles) | Extract + import | `backend/cmd/extract-tamil-from-wikipedia` |
| **User adds one word** | API | `POST /api/v1/tamil-words` |
| **Seed files** | SQL/scripts | e.g. `seed_common_words.sql`, corpus scripts |

So we **gather** words by: building or downloading lists (Wikipedia, dictionaries, your own lists), importing them into `tamil_words`, then building `lexicon.json` from that table. See **`docs/ADDING_ENGLISH_TAMIL_WORDS.md`** for step-by-step.

### Optional: Google as a fallback (ProofTamilRunner)

In the **ProofTamilRunner** (Python) service we have:

- **Google Input Tools API** – `GoogleTransliterationClient.get_suggestions(text)` calls `inputtools.google.com` to get Google’s suggestions for a given Roman string.
- **Local fallback** – `TamilTransliterator` with a small `COMMON_WORDS` dict and consonant/vowel transliteration rules (no API).

That runner path is **not** the primary suggest path in production; the **Go backend + baked lexicon file** is. So “how our Tamil typing works” in practice = **our lexicon** (from `tamil_words` → `lexicon.json`), not Google’s internal list.

---

## 3. Summary

| | Google Tamil typing | Our platform |
|--|---------------------|--------------|
| **How it works** | API + internal models/corpora (proprietary) | In-process trie built from our lexicon file |
| **Where words come from** | Not public; typically corpora, dictionaries, rules, user feedback, ML | Our DB table `tamil_words` → exported to `data/lexicon.json` → loaded into cache |
| **How words are gathered** | We cannot see or replicate; we can only call the API | Import (CSV/JSON, Wikipedia dumps, user adds) into `tamil_words`, then run `build_lexicon` |

To **add more English-to-Tamil words** in our app: add rows to `tamil_words` (via import or API), then rebuild the lexicon and redeploy. See **`docs/ADDING_ENGLISH_TAMIL_WORDS.md`**.
