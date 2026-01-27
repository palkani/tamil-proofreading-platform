# Quick Start - Extract Tamil Words from Wikipedia

## Your File

You have: `/Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2`

This is an English Wikipedia dump that may contain Tamil words in articles.

## Step 1: Run the Extraction

```bash
cd backend/cmd/extract-tamil-from-wikipedia

go run main.go \
  -file=/Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2 \
  -batch=2000 \
  -workers=6 \
  -min-freq=3 \
  -progress=true
```

## Step 2: Monitor Progress

You'll see output like:

```
Starting Wikipedia dump processing: /Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2
Reading bzip2 compressed file...
[Progress] Articles: 1000 (50/sec) | Tamil words: 5000 | Inserted: 4500 | Skipped: 500 | Errors: 0
```

## Recommended Settings for Large Dumps

For a 25GB Wikipedia dump:

```bash
go run main.go \
  -file=/Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2 \
  -batch=5000 \        # Larger batches for better performance
  -workers=8 \         # More workers for parallel processing
  -min-freq=5 \        # Only import words that appear 5+ times
  -progress=true
```

## Two-Step Process (Recommended for Very Large Dumps)

### Step 1: Extract to File

```bash
go run main.go \
  -file=/Users/palkanirajendran/Downloads/enwiki-20260101-pages-articles-multistream.xml.bz2 \
  -output=tamil-words-from-wikipedia.jsonl \
  -min-freq=2 \
  -progress=true
```

This will:
- Parse the Wikipedia dump
- Extract Tamil words
- Save to `tamil-words-from-wikipedia.jsonl`
- **No database writes** (faster)

### Step 2: Import to Database

```bash
cd ../import-tamil-words
go run main.go \
  -file=../extract-tamil-from-wikipedia/tamil-words-from-wikipedia.jsonl \
  -format=jsonl \
  -batch=5000 \
  -workers=8
```

## Expected Results

From an English Wikipedia dump, you might find:
- Tamil words in articles about Tamil culture, language, history
- Tamil words in transliteration examples
- Tamil words in quotes or references
- Tamil words in multilingual articles

**Typical extraction**: 10,000 - 100,000 unique Tamil words (depending on dump size)

## Performance

- **Processing**: ~50-200 articles/second
- **Tamil word extraction**: ~500-2000 words/second
- **Total time**: 6-12 hours for full dump

## Filtering Options

### Only Common Words

```bash
-min-freq=10  # Only words appearing 10+ times
```

### All Words

```bash
-min-freq=1   # Import all words (even if seen once)
```

## Troubleshooting

### Out of Memory

```bash
-batch=500 -workers=2
```

### Too Slow

```bash
-batch=5000 -workers=8
```

### Too Many Rare Words

```bash
-min-freq=10  # Increase minimum frequency
```

## Check Results

After import, check the database:

```sql
-- Count words from Wikipedia
SELECT COUNT(*) FROM tamil_words WHERE source = 'wikipedia_en';

-- Top words by frequency
SELECT tamil_text, transliteration, frequency 
FROM tamil_words 
WHERE source = 'wikipedia_en' 
ORDER BY frequency DESC 
LIMIT 100;
```
