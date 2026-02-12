# Adding More English-to-Tamil Words

This guide explains **where to gather** English-to-Tamil word data and **how to add it** so the suggest/IME uses it.

**Gathering from corpora (Wikipedia, news, web):** See **`GATHERING_WORDS_FROM_CORPORA.md`** for step-by-step use of Wikipedia (Tamil/English), news, and web sources.

## Data flow

- Words live in the **`tamil_words`** table (Postgres): `tamil_text` (Tamil), `transliteration` (Latin/English spelling), `frequency`, etc.
- The **lexicon file** (`data/lexicon.json`) is built from `tamil_words` in CI (`build_lexicon`). The backend loads that file into the **in-memory cache** at startup.
- To add more words: **add them to `tamil_words`**, then **rebuild the lexicon** (or run `build_lexicon` and redeploy).

---

## 1. Where to gather words

### A. Tamil Wikipedia (titles)

- **What**: Tamil Wikipedia article titles (Tamil + transliteration).
- **Where**: [Tamil Wikipedia dumps](https://dumps.wikimedia.org/tawiki/latest/) → e.g. `tawiki-latest-all-titles-in-ns0.gz`.
- **How to add**: Use **load-tamil-words-dir** (see below).

### B. English Wikipedia (Tamil in articles)

- **What**: Tamil words that appear inside English Wikipedia articles.
- **Where**: [English Wikipedia dumps](https://dumps.wikimedia.org/enwiki/latest/) → e.g. `enwiki-*-pages-articles-multistream.xml.bz2`.
- **How to add**: Use **extract-tamil-from-wikipedia** (see below).

### C. Your own list (CSV / JSON / TXT)

- **What**: Curated pairs: English/Latin spelling → Tamil word.
- **Format**: CSV with columns e.g. `tamil_text`, `transliteration`, `frequency`, `category`, `meaning`.
- **How to add**: Use **import-tamil-words** (see below).

### D. Wiktionary / other dictionaries

- **What**: Tamil headwords + Roman transliteration (and optionally meaning).
- **Where**: [Wiktionary dumps](https://dumps.wikimedia.org/enwiktionary/latest/) or other TSV/JSON exports. You may need a small script to convert to the format below.
- **How to add**: Convert to CSV/JSON/JSONL and use **import-tamil-words**.

### E. In-app (single words)

- **What**: One word at a time from your app.
- **How**: `POST /api/v1/tamil-words` with `tamil_text`, `transliteration`, optional `frequency`, `category`, `meaning`, `source`.

---

## 2. How to add them

### Option 1: Bulk import from a file (recommended for large lists)

**Tool:** `backend/cmd/import-tamil-words`

**Formats:** CSV, JSON, JSONL, TXT (tab- or space-separated), SQL.

**Example CSV** (`words.csv`):

```csv
tamil_text,transliteration,frequency,category,meaning
வணக்கம்,vanakkam,1000,common,hello
நன்றி,nandri,990,common,thank you
சரி,sari,980,common,ok
```

**Run:**

```bash
cd backend
export DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"

go run ./cmd/import-tamil-words -file=words.csv -format=csv -batch=2000
```

**Example JSONL** (one object per line):

```jsonl
{"tamil": "வணக்கம்", "transliteration": "vanakkam", "frequency": 1000}
{"tamil": "நன்றி", "transliteration": "nandri", "frequency": 990}
```

```bash
go run ./cmd/import-tamil-words -file=words.jsonl -format=jsonl
```

See `backend/cmd/import-tamil-words/README.md` for all options and formats.

---

### Option 2: Tamil Wikipedia titles

**Tool:** `backend/cmd/load-tamil-words-dir`

**Gather:** Download from [Tamil Wikipedia dumps](https://dumps.wikimedia.org/tawiki/latest/), e.g. `tawiki-latest-all-titles-in-ns0.gz`. Put it in a folder.

**Run:**

```bash
cd backend
export DATABASE_URL="postgres://..."

go run ./cmd/load-tamil-words-dir -dir=/path/to/folder/with/tawiki-*-all-titles*.gz
```

See `backend/cmd/load-tamil-words-dir/README.md` for details.

---

### Option 3: Extract Tamil from English Wikipedia

**Tool:** `backend/cmd/extract-tamil-from-wikipedia`

**Gather:** [English Wikipedia dump](https://dumps.wikimedia.org/enwiki/latest/) (e.g. `enwiki-*-pages-articles-multistream.xml.bz2`).

**Run:**

```bash
cd backend/cmd/extract-tamil-from-wikipedia
go run main.go -file=/path/to/enwiki-*-pages-articles-multistream.xml.bz2 -batch=2000 -min-freq=2
```

Optionally export to JSONL first, then import with `import-tamil-words`. See `backend/cmd/extract-tamil-from-wikipedia/README.md`.

---

### Option 4: Add one word via API

From your app or any client:

```bash
curl -X POST https://your-api/api/v1/tamil-words \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"tamil_text":"வணக்கம்","transliteration":"vanakkam","frequency":100,"category":"common","meaning":"hello","source":"manual"}'
```

Requires authentication. Used by the “Add Tamil word” flow in the app.

---

## 3. After adding to the database

1. **Rebuild the lexicon file** so the backend cache includes the new words:

   ```bash
   cd backend
   DATABASE_URL="postgres://..." go run ./cmd/build_lexicon -output=../data/lexicon.json -limit=0 -batch=10000
   ```

2. **Redeploy** (or ensure your CI runs `build_lexicon` with `-limit=0` and bakes `data/lexicon.json` into the image). The backend loads the entire file into cache at startup.

3. **Verify:** Check logs for e.g. `[SUGGEST] Lexicon load complete: N words in cache`, or call `GET /api/v1/suggest?q=vanakkam` and check that suggestions include your new words.

---

## 4. Quick reference: table columns

| Column               | Description                          | Example        |
|----------------------|--------------------------------------|----------------|
| `tamil_text`         | Tamil word (Unicode)                 | வணக்கம்       |
| `transliteration`    | Latin/English spelling (unique key)  | vanakkam       |
| `alternate_spellings`| JSON array of other spellings        | ["vanakam"]    |
| `frequency`          | Higher = more common in suggestions  | 1000           |
| `category`           | common, noun, verb, etc.             | common         |
| `meaning`            | English meaning (optional)           | hello          |
| `source`             | manual, tawiki_titles, dump_import…  | manual         |

---

## 5. Suggested workflow for “more English-to-Tamil words”

1. **Gather** a list (CSV/JSON/JSONL) with at least `tamil_text` and `transliteration`. Add `frequency` and `meaning` if you have them.
2. **Import** with `import-tamil-words` (Option 1).
3. **Rebuild lexicon** with `build_lexicon -limit=0` and redeploy so the full list is in cache.

For very large sources (Wikipedia dumps), use **load-tamil-words-dir** or **extract-tamil-from-wikipedia** as above, then run **build_lexicon** and redeploy.
