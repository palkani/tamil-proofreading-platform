#!/bin/bash
# Quick corpus seeding script for Cloud Shell
# Run this in Google Cloud Shell to populate your corpus tables

set -e

echo "🔧 Tamil Corpus Seeder - Cloud Shell Edition"
echo "============================================="

# 1. Get DATABASE_URL from Secret Manager
echo "📝 Getting DATABASE_URL from Secret Manager..."
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=prooftamil 2>/dev/null || echo "")

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL secret not found!"
  echo "Please set it manually:"
  echo "  export DATABASE_URL='postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE'"
  exit 1
fi

echo "✅ DATABASE_URL retrieved"

# 2. Check if repo exists, if not clone it
if [ ! -d "tamil-proofreading-platform" ]; then
  echo "📦 Cloning repository..."
  git clone https://github.com/palkani/tamil-proofreading-platform.git
fi

cd tamil-proofreading-platform/backend

# 3. Check current corpus counts
echo ""
echo "📊 Current corpus table counts:"
psql "$DATABASE_URL" -c "SELECT 'tamil_words' as table_name, COUNT(*) as count FROM tamil_words UNION ALL SELECT 'tamil_phrases', COUNT(*) FROM tamil_phrases UNION ALL SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams;" 2>/dev/null || echo "Could not connect to database"

echo ""
echo "🚀 Running corpus seeder..."

# 4. Copy comprehensive seed files to expected locations
cp ../data/seed_words_comprehensive.tsv ../data/seed_words.tsv
cp ../data/seed_phrases_comprehensive.tsv ../data/seed_phrases.tsv
cp ../data/seed_bigrams_comprehensive.tsv ../data/seed_bigrams.tsv

# 5. Run the seeder
export SEED_DIR="../data"
go run cmd/seed_ime_corpus/main.go

echo ""
echo "✅ Seeding complete!"
echo ""
echo "📊 Updated corpus table counts:"
psql "$DATABASE_URL" -c "SELECT 'tamil_words' as table_name, COUNT(*) as count FROM tamil_words UNION ALL SELECT 'tamil_phrases', COUNT(*) FROM tamil_phrases UNION ALL SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams;"

echo ""
echo "🎉 Done! Your corpus is now populated with:"
echo "   - 189 Tamil words"
echo "   - 55 common phrases"
echo "   - 80 bigram patterns"
echo ""
echo "Next steps:"
echo "1. Verify ProofTamilRunner has DATABASE_URL set in Cloud Run"
echo "2. Redeploy ProofTamilRunner if needed"
echo "3. Test suggestions for: amma, padichiya, soru, nanban"
