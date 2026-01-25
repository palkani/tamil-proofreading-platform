#!/bin/bash
# Seed Tamil corpus tables in production database
# Usage: ./seed_corpus.sh

set -e

echo "[CORPUS-SEED] Starting corpus population..."

# Check if we're in the right directory
if [ ! -f "go.mod" ]; then
    echo "Error: Must run from backend directory"
    exit 1
fi

# Check for comprehensive seed files
if [ ! -f "../data/seed_words_comprehensive.tsv" ]; then
    echo "Error: Comprehensive seed files not found in ../data/"
    exit 1
fi

# Use comprehensive files by setting SEED_DIR and renaming logic
export SEED_DIR="../data"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "[CORPUS-SEED] DATABASE_URL not set."
    echo "[CORPUS-SEED] For Cloud SQL, use:"
    echo "  export DATABASE_URL='postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE'"
    echo ""
    echo "[CORPUS-SEED] Or for direct connection:"
    echo "  export DATABASE_URL='postgresql://user:pass@host:port/dbname'"
    exit 1
fi

# Temporarily copy comprehensive files to expected names
echo "[CORPUS-SEED] Preparing seed files..."
cp ../data/seed_words_comprehensive.tsv ../data/seed_words.tsv.tmp
cp ../data/seed_phrases_comprehensive.tsv ../data/seed_phrases.tsv.tmp
cp ../data/seed_bigrams_comprehensive.tsv ../data/seed_bigrams.tsv.tmp

# Backup originals if they exist
[ -f ../data/seed_words.tsv ] && mv ../data/seed_words.tsv ../data/seed_words.tsv.bak
[ -f ../data/seed_phrases.tsv ] && mv ../data/seed_phrases.tsv ../data/seed_phrases.tsv.bak
[ -f ../data/seed_bigrams.tsv ] && mv ../data/seed_bigrams.tsv ../data/seed_bigrams.tsv.bak

# Use comprehensive files
mv ../data/seed_words.tsv.tmp ../data/seed_words.tsv
mv ../data/seed_phrases.tsv.tmp ../data/seed_phrases.tsv
mv ../data/seed_bigrams.tsv.tmp ../data/seed_bigrams.tsv

echo "[CORPUS-SEED] Running seeder..."
go run cmd/seed_ime_corpus/main.go

# Restore originals
echo "[CORPUS-SEED] Cleaning up..."
[ -f ../data/seed_words.tsv.bak ] && mv ../data/seed_words.tsv.bak ../data/seed_words.tsv || rm ../data/seed_words.tsv
[ -f ../data/seed_phrases.tsv.bak ] && mv ../data/seed_phrases.tsv.bak ../data/seed_phrases.tsv || rm ../data/seed_phrases.tsv
[ -f ../data/seed_bigrams.tsv.bak ] && mv ../data/seed_bigrams.tsv.bak ../data/seed_bigrams.tsv || rm ../data/seed_bigrams.tsv

echo "[CORPUS-SEED] ✓ Corpus populated successfully!"
echo "[CORPUS-SEED] Next steps:"
echo "  1. Verify data: SELECT COUNT(*) FROM tamil_words;"
echo "  2. Redeploy ProofTamilRunner with DATABASE_URL set"
echo "  3. Test suggestions in the frontend"
