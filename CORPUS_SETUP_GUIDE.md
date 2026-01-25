# Tamil Corpus Setup Guide

## Overview
Your Tamil suggestion engine has **two data sources**:
1. **Static frequency dictionary** (`ProofTamilRunner/data/ta_freq.tsv`) - Currently used ✅
2. **Live Postgres corpus** (`tamil_words`, `tamil_phrases`, `tamil_bigrams` tables) - Currently **empty** ❌

## What You Have Now

### ✅ Built Infrastructure
- Database tables created (shown in your screenshot)
- Corpus seeder tool (`backend/cmd/seed_ime_corpus/main.go`)
- Learning system that captures user selections (`ime_learning_handlers.go`)
- ProofTamilRunner code configured to use corpus (`corpus_db.py`)

### ❌ Missing
- **Data in the tables** (they're empty)
- `DATABASE_URL` environment variable in ProofTamilRunner Cloud Run

## Why Corpus Matters

### Current Behavior (Algorithmic Only)
- ProofTamilRunner generates suggestions from Aksharamukha transliteration
- Uses local `ta_freq.tsv` file (static, ~5000 words)
- Limited to common words, no colloquial variants

### With Corpus Populated
- Real user-confirmed words and spellings
- Alternate transliterations (e.g., "padichchiya" → "படிச்சியா")
- Phrase completions (e.g., "எப்படி" → "எப்படி இருக்கீங்க")
- Context-aware suggestions (bigrams: "நான்" → "வர", "போ", "படிக்க")
- **Learning from user behavior** (gets better over time)

## Seed Data Created

I've created comprehensive seed files with **200+ entries**:

1. **`data/seed_words_comprehensive.tsv`** (~180 words)
   - Common nouns, verbs, adjectives
   - Kinship terms (அம்மா, அப்பா, etc.)
   - Food items (சோறு, இட்லி, தோசை, etc.)
   - Colloquial forms (படிச்சேன், வந்தேன், etc.)
   - Question words (என்ன, எப்படி, etc.)

2. **`data/seed_phrases_comprehensive.tsv`** (~50 phrases)
   - Common greetings and questions
   - Polite expressions
   - Daily conversation patterns

3. **`data/seed_bigrams_comprehensive.tsv`** (~80 bigrams)
   - Natural word pairs for context prediction
   - Subject-verb patterns
   - Time expressions + verbs
   - Location + action patterns

## How to Populate the Corpus

### Option 1: From Google Cloud Shell (Recommended)

```bash
# 1. Open Cloud Shell in your Google Cloud Console
# 2. Clone your repo (or use Cloud Source Repositories)
git clone https://github.com/palkani/tamil-proofreading-platform.git
cd tamil-proofreading-platform/backend

# 3. Set DATABASE_URL (get from your Cloud SQL instance)
# For Cloud SQL socket connection:
export DATABASE_URL='postgresql://user:password@/tamil_proofreading?host=/cloudsql/YOUR-PROJECT:asia-south1:YOUR-INSTANCE'

# 4. Run the seeder script
./seed_corpus.sh

# 5. Verify
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tamil_words;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tamil_phrases;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tamil_bigrams;"
```

### Option 2: Direct SQL Import (Fastest)

If you have `psql` access to your database:

```bash
# Connect to your Cloud SQL instance
gcloud sql connect YOUR-INSTANCE --user=postgres --database=tamil_proofreading

# Then run these SQL commands:

-- Import words (adjust path as needed)
\COPY tamil_words(tamil_text, transliteration, frequency, category, source) 
FROM '/path/to/seed_words_comprehensive.tsv' 
WITH (FORMAT csv, DELIMITER E'\t', HEADER true);

-- Or use the seeder tool as shown in Option 1
```

### Option 3: From Local (if VPN/Proxy Configured)

```bash
cd backend

# Set your Cloud SQL connection string
export DATABASE_URL='postgresql://user:pass@YOUR-CLOUD-SQL-IP:5432/tamil_proofreading'

# Run seeder
./seed_corpus.sh
```

## After Seeding: Configure ProofTamilRunner

### 1. Add DATABASE_URL to Cloud Run

Go to your ProofTamilRunner service in Cloud Run:
```bash
gcloud run services update prooftamil-runner \
  --region=asia-south1 \
  --set-env-vars="DATABASE_URL=postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE"
```

**IMPORTANT**: Use Cloud SQL Unix socket connection for Cloud Run:
```
DATABASE_URL=postgresql://user:password@/tamil_proofreading?host=/cloudsql/PROJECT-ID:asia-south1:INSTANCE-NAME
```

### 2. Verify Corpus Loading

After redeploying ProofTamilRunner, check logs:
```bash
gcloud run logs read prooftamil-runner --region=asia-south1 --limit=50 | grep CORPUS
```

You should see:
```
[CORPUS] loaded 180 words, 50 phrases, 80 bigrams from Postgres
```

## Testing the Corpus

### 1. Test Basic Suggestions
Type in your frontend editor:
- `amma` → should show "அம்மா" + variants
- `padichiya` → should show "படிச்சியா" + variants
- `soru` → should show "சோறு" + variants

### 2. Test Phrase Completion
Type:
- `எப்படி` → should suggest "எப்படி இருக்கீங்க"

### 3. Test Bigram Context
Type:
- `நான்` [space] → should suggest "வர", "போ", "படிக்க"

## Learning System (Already Built!)

Your backend has an **automatic learning endpoint** (`/api/internal/aggregate-ime`) that:
1. Collects user-accepted suggestions (`suggestion_accept_events` table)
2. Aggregates them into frequency tables
3. Runs periodically (you mentioned scheduling earlier)

**This means**: Every time a user accepts a suggestion, it gets recorded and will boost that word/phrase/bigram in future suggestions!

## Current Status Summary

| Component | Status | Action Needed |
|-----------|--------|---------------|
| Database tables | ✅ Created | None |
| Seed data files | ✅ Created (200+ entries) | None |
| Seeder tool | ✅ Built | Run it |
| Learning system | ✅ Built | None |
| ProofTamilRunner code | ✅ Ready | Add DATABASE_URL env var |
| **Actual data in DB** | ❌ **EMPTY** | **Run seeder** |
| **Runner DATABASE_URL** | ❌ **Not set** | **Add env var** |

## Quick Start (TL;DR)

```bash
# 1. Open Google Cloud Shell
# 2. Clone repo and go to backend directory
# 3. Export DATABASE_URL
export DATABASE_URL='your-cloud-sql-connection-string'

# 4. Run seeder
./seed_corpus.sh

# 5. Update ProofTamilRunner Cloud Run env vars
gcloud run services update prooftamil-runner \
  --region=asia-south1 \
  --set-env-vars="DATABASE_URL=$DATABASE_URL"

# 6. Test in frontend
# Type: padichiya → expect "படிச்சியா" as top suggestion
```

## Next Steps After This Works

1. **Monitor learning**: Check `suggestion_accept_events` table growth
2. **Expand corpus**: Add more seed data from Tamil dictionaries/corpora
3. **Tune frequencies**: Run aggregation job regularly to boost popular words
4. **Consider web scraping**: Automated corpus expansion from Tamil websites (you mentioned this earlier)

---

**Bottom line**: Your architecture is excellent, but the corpus tables are empty. Run the seeder once, set DATABASE_URL in ProofTamilRunner, and you'll have a self-learning, high-quality IME system!
