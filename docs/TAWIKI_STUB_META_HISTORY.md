# Exploring tawiki-latest-stub-meta-history XML

## What is stub-meta-history?

**`tawiki-latest-stub-meta-history*.xml`** (or `.xml.gz`) is a **Tamil Wikipedia dump** that contains:

- **Page titles** (article names) — useful for vocabulary
- **Revision metadata** — revision ID, timestamp, contributor, comment, byte size
- **No article text** — that’s why it’s called “stub” (smaller than full dumps)

So you get **page titles** (Tamil + mixed) without the full article content. Good for building a word list from Tamil Wikipedia article names.

**Where to get it:**  
https://dumps.wikimedia.org/tawiki/latest/  
Look for files like: `tawiki-latest-stub-meta-history1.xml.gz`, `tawiki-latest-stub-meta-history2.xml.gz`, etc. (large wikis are split into parts.)

---

## How to explore your file

If you have the file locally (e.g. `tawiki-latest-stub-meta-history 2.xml` in Downloads):

### 1. Run the explorer script

From the project root:

```bash
# Replace with the actual path to your file (use quotes if the path has spaces)
python3 scripts/explore_tawiki_stub_meta_history.py "/path/to/tawiki-latest-stub-meta-history 2.xml"
```

**Options:**

- `--sample 50` — print 50 sample titles (default 20)
- `--main-namespace-only` — only main articles (namespace 0), skip Talk/User/etc.
- `--output titles.csv` — write titles to CSV for import into `tamil_words`
- `--limit 10000` — process only first 10,000 pages (for a quick test)

**Examples:**

```bash
# Quick look: first 20 titles and stats
python3 scripts/explore_tawiki_stub_meta_history.py "/Users/you/Downloads/tawiki-latest-stub-meta-history 2.xml"

# More samples, main namespace only
python3 scripts/explore_tawiki_stub_meta_history.py "/path/to/tawiki-*.xml.gz" --sample 50 --main-namespace-only

# Export to CSV and import into DB
python3 scripts/explore_tawiki_stub_meta_history.py "/path/to/tawiki-latest-stub-meta-history1.xml.gz" \
  --main-namespace-only --output data/tawiki_titles.csv

cd backend
go run ./cmd/import-tamil-words -file=../data/tawiki_titles.csv -format=csv -source=tawiki_stub
```

### 2. What the script prints

- **Total pages** in the file
- **Namespace counts** (0 = main, 1 = Talk, 2 = User, etc.)
- **How many titles contain Tamil script**
- **Sample titles** (first N)

If you use `--output titles.csv`, the script writes `tamil_text,transliteration` (title with spaces, and a simple transliteration) so you can import with `import-tamil-words`.

---

## File format (XML structure)

Rough structure of stub-meta-history:

```xml
<mediawiki>
  <siteinfo>...</siteinfo>
  <page>
    <title>பக்கம்_பெயர்</title>
    <ns>0</ns>
    <id>123</id>
    <revision>
      <id>456</id>
      <timestamp>...</timestamp>
      <contributor>...</contributor>
      <text id="..." bytes="..."/>   <!-- stub: no content -->
    </revision>
    ...
  </page>
  ...
</mediawiki>
```

So each `<page>` has a `<title>` (and optional `<ns>` for namespace). The script extracts these and optionally exports them for import.

---

## If the file is compressed

The script supports:

- **Plain XML:** `tawiki-latest-stub-meta-history 2.xml`
- **Gzip:** `tawiki-latest-stub-meta-history1.xml.gz`
- **Bzip2:** `tawiki-latest-stub-meta-history1.xml.bz2`

Use the full path to the file when you run the script.
