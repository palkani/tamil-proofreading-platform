# Gathering Words from Corpora (Wikipedia, News, Web)

Yes — you can use **Wikipedia (Tamil/English), news, and web** to gather English-to-Tamil words. This guide shows what we already support and how to add more sources.

---

## 1. Wikipedia (Tamil + English) — already supported

We have tools to load words from both Tamil and English Wikipedia.

### A. Tamil Wikipedia (article titles)

**What you get:** Tamil article titles with Roman transliteration (one form per title). Good for proper nouns, common terms, and spelling variants.

**Where to get the dump:**

- **Tamil Wikipedia dumps:** https://dumps.wikimedia.org/tawiki/latest/
- **File to download:** `tawiki-latest-all-titles-in-ns0.gz` (small, ~few MB)  
  Or: `tawiki-latest-all-titles.gz` (tab-separated `namespace\tpage_title`)

**How to add to our DB:**

```bash
# 1. Download (example)
# https://dumps.wikimedia.org/tawiki/latest/tawiki-latest-all-titles-in-ns0.gz
# Save to a folder, e.g. ~/Downloads/tawiki

# 2. Load into tamil_words
cd backend
export DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"
go run ./cmd/load-tamil-words-dir -dir=~/Downloads/tawiki
```

**Tool:** `backend/cmd/load-tamil-words-dir`  
**Details:** `backend/cmd/load-tamil-words-dir/README.md`

---

### B. English Wikipedia (Tamil words inside articles)

**What you get:** Tamil words that appear inside English Wikipedia articles, with frequency. Good for common Tamil terms used in English context and for frequency-ranked vocabulary.

**Where to get the dump:**

- **English Wikipedia dumps:** https://dumps.wikimedia.org/enwiki/latest/
- **File to download:** `enwiki-YYYYMMDD-pages-articles-multistream.xml.bz2` (large, ~20GB+ compressed)

**How to add to our DB:**

```bash
cd backend/cmd/extract-tamil-from-wikipedia

# Option 1: Extract and import in one go (needs DATABASE_URL)
go run main.go -file=/path/to/enwiki-*-pages-articles-multistream.xml.bz2 -batch=2000 -min-freq=2

# Option 2: Extract to JSONL first, then import
go run main.go -file=/path/to/enwiki-*.xml.bz2 -output=tamil-words.jsonl -min-freq=2
cd ../import-tamil-words
go run main.go -file=../extract-tamil-from-wikipedia/tamil-words.jsonl -format=jsonl
```

**Tool:** `backend/cmd/extract-tamil-from-wikipedia`  
**Details:** `backend/cmd/extract-tamil-from-wikipedia/README.md`

---

### C. Optional: Tamil Wikipedia full text (script)

For more than just titles (e.g. full article text to extract more words):

- **Script:** `scripts/build_tamil_wiki_corpus.py` — builds a corpus from Tamil Wikipedia dump data and can output SQL/TSV for `tamil_words`.
- Run with Python 3; adjust paths and DB connection as needed. Output can be imported via `import-tamil-words` if you export to CSV/JSONL.

---

## 2. News and web — use your own corpus, then import

We don’t ship a dedicated “news” or “web” crawler. You **gather** text from news/web into a corpus, then **convert to our format** and **import** with the same tools.

### General flow

1. **Obtain text:** News sites, RSS, Common Crawl, or any Tamil/Roman-Tamil text.
2. **Extract Tamil + Roman pairs:**  
   - Either: Tamil words only → generate transliteration (e.g. with a Romanizer or our `build_tamil_wiki_corpus`-style logic).  
   - Or: If your source already has Roman transliteration (e.g. subtitles, dictionaries), keep those as `transliteration`.
3. **Export to CSV or JSONL** with at least: `tamil_text`, `transliteration` (and optionally `frequency`, `category`, `meaning`, `source`).
4. **Import into `tamil_words`** with `import-tamil-words`.

### Example: Tamil news / web text

- **Sources (examples):** Tamil news sites, blogs, or public datasets that contain Tamil (and optionally Roman) text.
- **Steps:**
  1. Download or scrape text (respect robots.txt and terms of use).
  2. Run a script to:
     - Detect Tamil words (e.g. Unicode range `\u0B80-\u0BFF`).
     - Count frequency.
     - Generate Roman transliteration (reuse logic from `scripts/build_tamil_wiki_corpus.py` or similar).
  3. Write CSV or JSONL (e.g. `tamil_text`, `transliteration`, `frequency`, `source=news`).
  4. Import:
     ```bash
     cd backend
     go run ./cmd/import-tamil-words -file=news_words.csv -format=csv -source=news
     ```

### Example: Common Crawl or web corpus

- **Common Crawl:** https://commoncrawl.org/ — you can filter by language (Tamil) and process WET/HTML to extract Tamil text, then word-frequency + transliteration as above.
- **Output:** Again, CSV or JSONL with `tamil_text`, `transliteration`, optional `frequency`, then:
  ```bash
  go run ./cmd/import-tamil-words -file=web_tamil.jsonl -format=jsonl -source=commoncrawl
  ```

### Format for import (reminder)

**CSV:**

```csv
tamil_text,transliteration,frequency,category,meaning,source
வணக்கம்,vanakkam,1000,common,hello,news
செய்தி,seyidhi,800,common,news,news
```

**JSONL:**

```jsonl
{"tamil_text":"வணக்கம்","transliteration":"vanakkam","frequency":1000,"source":"news"}
{"tamil_text":"செய்தி","transliteration":"seyidhi","frequency":800,"source":"news"}
```

---

## 3. After gathering: rebuild lexicon and deploy

Once `tamil_words` has more rows (from Wikipedia, news, or web):

```bash
cd backend
export DATABASE_URL="postgres://..."
go run ./cmd/build_lexicon -output=../data/lexicon.json -limit=0 -batch=10000
```

Then redeploy (or let CI bake `data/lexicon.json` into the image). The backend loads the full file into cache at startup.

---

## 4. Summary

| Corpus type      | Supported? | How |
|------------------|------------|-----|
| **Tamil Wikipedia** (titles) | Yes       | Download `tawiki-*-all-titles-in-ns0.gz` → `load-tamil-words-dir` |
| **English Wikipedia** (Tamil in articles) | Yes | Download `enwiki-*-pages-articles-multistream.xml.bz2` → `extract-tamil-from-wikipedia` |
| **News / web**   | Yes (you gather) | Get Tamil (or Tamil+Roman) text → script to CSV/JSONL → `import-tamil-words` |

So you **can** use corpora like Wikipedia (Tamil/English), news, and web: use the existing Wikipedia tools, and for news/web, produce a CSV or JSONL from your corpus and import with `import-tamil-words`. See **`docs/ADDING_ENGLISH_TAMIL_WORDS.md`** for import options and formats.
