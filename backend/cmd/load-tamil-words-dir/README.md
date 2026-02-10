# Load Tamil words from local folder to Postgres

Scans a folder for Tamil Wikipedia title files (`*all-titles*.gz`) and loads them into the `tamil_words` table.

## Folder contents (e.g. `/Users/palkanirajendran/Downloads/words`)

- `tawiki-latest-all-titles-in-ns0.gz` — one title per line (header: `page_title`)
- `tawiki-latest-all-titles.gz` — tab-separated `page_namespace\tpage_title` (only namespace 0)
- Other `*.sql.gz` (e.g. categorylinks, externallinks) are **skipped**

## Usage

**With connection string in env:**

```bash
cd backend
export DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=require"
go run ./cmd/load-tamil-words-dir -dir=/Users/palkanirajendran/Downloads/words
```

**With connection string on the command line:**

```bash
go run ./cmd/load-tamil-words-dir \
  -dir=/Users/palkanirajendran/Downloads/words \
  -db="postgres://user:password@host:5432/dbname?sslmode=require"
```

**Flags:**

- `-dir` — folder containing `*all-titles*.gz` (default: `/Users/palkanirajendran/Downloads/words`)
- `-db` — Postgres URL (default: `DATABASE_URL` env)
- `-skip-no-tamil` — skip lines with no Tamil script (default: true)

## Output

- **Processed** — lines read from files (after header and filters)
- **Inserted** — new rows in `tamil_words`
- **Skipped** — already present (by `transliteration`)
- **Errors** — insert failures

Rows are inserted with `source = "tawiki_titles"`, `tamil_text` = title with underscores replaced by spaces, `transliteration` = title (lowercase, unique).
