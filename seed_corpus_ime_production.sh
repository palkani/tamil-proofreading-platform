#!/bin/bash
# seed_corpus_ime_production.sh
# Seeds the corpus database for IME suggestions in production

set -e

echo "=========================================="
echo "Seeding Corpus Database for IME"
echo "=========================================="
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_INSTANCE is set
if [ -z "$DATABASE_INSTANCE" ]; then
    echo "ERROR: DATABASE_INSTANCE environment variable not set"
    echo "Please set it to your Cloud SQL instance name (e.g., tamil-proofreading:us-central1:tamil-proofreading-db)"
    exit 1
fi

echo "Database Instance: $DATABASE_INSTANCE"
echo ""

# Check if seed file exists
SEED_FILE="backend/seed_corpus_ime.sql"
if [ ! -f "$SEED_FILE" ]; then
    echo "ERROR: Seed file not found: $SEED_FILE"
    exit 1
fi

echo "Seed file found: $SEED_FILE"
echo "Word count: $(grep -c "INSERT INTO corpus_words" $SEED_FILE || echo 0)"
echo "Phrase count: $(grep -c "INSERT INTO corpus_phrases" $SEED_FILE || echo 0)"
echo ""

# Prompt for confirmation
read -p "Ready to seed corpus database on $DATABASE_INSTANCE? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Connecting to database and seeding corpus..."
echo "(This may take 10-30 seconds)"
echo ""

# Execute SQL via gcloud
gcloud sql connect "$DATABASE_INSTANCE" --user=postgres < "$SEED_FILE"

echo ""
echo "=========================================="
echo "✅ Corpus Seeding Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify corpus data:"
echo "   gcloud sql connect $DATABASE_INSTANCE --user=postgres"
echo "   SELECT COUNT(*) FROM corpus_words;"
echo "   SELECT COUNT(*) FROM corpus_phrases;"
echo ""
echo "2. Test IME suggestions:"
echo "   curl \"https://YOUR_BACKEND_URL/api/v1/ime/suggest?q=saptiya&limit=5\""
echo ""
echo "3. Check backend logs for:"
echo "   \"[IME] Database connection available for corpus-first architecture ✓\""
echo "   \"[IME] Corpus hit: q=saptiya...\""
echo ""
echo "Done! 🎉"
