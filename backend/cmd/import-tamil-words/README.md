# Tamil Words Import Tool

A high-performance tool for importing large Tamil word dumps (25GB+) into the database.

## Features

- **Multiple Format Support**: SQL, CSV, JSON, JSONL, and plain text
- **Auto-detection**: Automatically detects file format
- **Streaming**: Processes files without loading entire file into memory
- **Batch Processing**: Efficient batch inserts with configurable batch size
- **Progress Tracking**: Real-time progress updates
- **Duplicate Handling**: Skips existing words by default
- **Gzip Support**: Handles compressed files
- **Resumable**: Can be interrupted and resumed (skip-existing mode)

## Usage

### Basic Usage

```bash
cd backend/cmd/import-tamil-words
go run main.go -file=/path/to/tamil-words-dump.sql
```

### Options

```
-file string
    Path to input file (required)

-format string
    File format: auto, sql, csv, json, jsonl, txt (default: "auto")

-batch int
    Batch size for inserts (default: 1000)

-workers int
    Number of worker goroutines (default: 4)

-source string
    Source identifier for imported words (default: "dump_import")

-skip-existing
    Skip words that already exist (default: true)

-progress
    Show progress updates (default: true)

-gzip
    Input file is gzip compressed (default: false, auto-detected from .gz extension)
```

### Examples

#### Import SQL Dump

```bash
go run main.go -file=/path/to/dump.sql -format=sql -batch=2000
```

#### Import CSV File

```bash
go run main.go -file=/path/to/words.csv -format=csv -batch=1000
```

#### Import Compressed JSONL

```bash
go run main.go -file=/path/to/words.jsonl.gz -format=jsonl -gzip=true
```

#### Import with Custom Source

```bash
go run main.go -file=/path/to/dump.txt -source=wiktionary_dump -batch=5000
```

## File Formats

### SQL Format

Supports PostgreSQL COPY format:

```sql
COPY tamil_words (tamil_text, transliteration, alternate_spellings, frequency, category, meaning, example, is_verified, source, user_confirmed, created_at, updated_at, deleted_at) FROM stdin;
வணக்கம்	vanakkam	["vanakam"]	1000	common	hello	t	manual	0	2025-01-01 00:00:00	2025-01-01 00:00:00	\N
\.
```

### CSV Format

```csv
tamil_text,transliteration,frequency,category,meaning
வணக்கம்,vanakkam,1000,common,hello
நன்றி,nandri,990,common,thank you
```

### JSON Format

```json
[
  {
    "tamil": "வணக்கம்",
    "transliteration": "vanakkam",
    "frequency": 1000,
    "category": "common",
    "meaning": "hello"
  }
]
```

### JSONL Format (One JSON object per line)

```jsonl
{"tamil": "வணக்கம்", "transliteration": "vanakkam", "frequency": 1000}
{"tamil": "நன்றி", "transliteration": "nandri", "frequency": 990}
```

### Plain Text Format

Tab-separated or space-separated:

```
வணக்கம்	vanakkam	1000	common
நன்றி	nandri	990	common
```

Or single word per line (Tamil text only):

```
வணக்கம்
நன்றி
சரி
```

## Performance Tips

1. **Batch Size**: Increase `-batch` for faster imports (try 2000-5000)
2. **Workers**: Adjust `-workers` based on your database connection limits
3. **Skip Existing**: Use `-skip-existing=true` to avoid duplicate checks (faster)
4. **Database Tuning**: 
   - Increase `max_connections` in PostgreSQL
   - Disable synchronous commits temporarily: `SET synchronous_commit = OFF;`
   - Increase `shared_buffers` and `work_mem`

## Database Connection

The tool uses the `DATABASE_URL` environment variable from your `.env` file or config.

Example:
```
DATABASE_URL=postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable
```

## Troubleshooting

### Out of Memory

- Reduce batch size: `-batch=500`
- Process file in chunks
- Use streaming formats (JSONL, TXT) instead of loading entire JSON arrays

### Slow Import

- Increase batch size: `-batch=5000`
- Check database indexes (may slow down inserts)
- Consider temporarily dropping indexes and recreating after import
- Use `-skip-existing=false` if you're sure there are no duplicates

### Connection Errors

- Reduce workers: `-workers=2`
- Check database connection pool settings
- Ensure database can handle concurrent connections

## Expected Output

```
Starting import from: /path/to/dump.sql
Format: sql, Batch size: 1000, Workers: 4
Reading file...
[Progress] Processed: 10000 | Inserted: 8500 | Skipped: 1500 | Errors: 0 | Rate: 2000 records/sec
[Progress] Processed: 20000 | Inserted: 17000 | Skipped: 3000 | Errors: 0 | Rate: 2100 records/sec
...

=== Import Complete ===
Total processed: 1000000
Total inserted: 850000
Total skipped: 150000
Total errors: 0
Time taken: 8m32s
```
