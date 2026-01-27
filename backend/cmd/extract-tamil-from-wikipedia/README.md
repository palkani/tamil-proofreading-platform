# Extract Tamil Words from Wikipedia Dump

This tool extracts Tamil words from English Wikipedia XML dumps and imports them into the database.

## Features

- **Wikipedia XML Parser**: Handles multistream Wikipedia dumps
- **Bzip2 Support**: Automatically handles compressed dumps
- **Tamil Text Detection**: Identifies Tamil text using Unicode ranges
- **Frequency Counting**: Tracks word frequency across articles
- **Batch Import**: Efficient database insertion
- **Progress Tracking**: Real-time progress updates
- **Optional Output**: Can save extracted words to JSONL file

## Usage

### Basic Usage

```bash
cd backend/cmd/extract-tamil-from-wikipedia
go run main.go -file=/path/to/enwiki-20260101-pages-articles-multistream.xml.bz2
```

### Options

```
-file string
    Path to Wikipedia XML dump file (required)

-batch int
    Batch size for database inserts (default: 1000)

-workers int
    Number of worker goroutines (default: 4)

-min-freq int
    Minimum word frequency to import (default: 2)

-progress
    Show progress updates (default: true)

-output string
    Optional: Save extracted words to JSONL file before importing
```

### Examples

#### Extract and Import Directly

```bash
go run main.go \
  -file=/Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2 \
  -batch=2000 \
  -workers=6 \
  -min-freq=3
```

#### Extract to File First, Then Import

```bash
# Step 1: Extract to file
go run main.go \
  -file=/path/to/wikipedia-dump.xml.bz2 \
  -output=tamil-words.jsonl \
  -min-freq=2

# Step 2: Import using the regular import tool
cd ../import-tamil-words
go run main.go -file=../extract-tamil-from-wikipedia/tamil-words.jsonl -format=jsonl
```

## How It Works

1. **Parse XML**: Reads the Wikipedia XML dump line by line
2. **Extract Text**: Extracts article text from `<text>` tags
3. **Clean Markup**: Removes MediaWiki markup (templates, links, HTML)
4. **Find Tamil Words**: Uses regex to find Tamil Unicode characters
5. **Normalize**: Normalizes words and removes duplicates
6. **Count Frequency**: Tracks how often each word appears
7. **Generate Transliteration**: Creates basic transliteration
8. **Import**: Batch inserts into database

## Performance

For a typical Wikipedia dump (~20GB compressed):

- **Processing Speed**: ~100-500 articles/second (depends on article size)
- **Tamil Word Extraction**: ~1000-5000 words/second
- **Database Import**: ~2000-5000 inserts/second

**Expected Time**: 4-8 hours for full dump

## Output Format

When using `-output`, the tool creates a JSONL file with entries like:

```jsonl
{"TamilText":"வணக்கம்","Transliteration":"vanakkam","Frequency":150,"Category":"common","Source":"wikipedia_en"}
{"TamilText":"நன்றி","Transliteration":"nandri","Frequency":120,"Category":"common","Source":"wikipedia_en"}
```

## Notes

- The tool processes articles sequentially but imports words in parallel
- Words are deduplicated per article
- Frequency is counted across all articles
- Only words with frequency >= `-min-freq` are imported
- Transliteration is basic - you may want to improve it using a proper library

## Troubleshooting

### Out of Memory

- Reduce batch size: `-batch=500`
- Reduce workers: `-workers=2`

### Slow Processing

- Increase batch size: `-batch=5000`
- Increase workers: `-workers=8`
- Use `-output` to extract first, then import separately

### Too Many Words

- Increase `-min-freq` to filter rare words: `-min-freq=10`

## Database Connection

Uses `DATABASE_URL` from `.env` file or environment variable.
