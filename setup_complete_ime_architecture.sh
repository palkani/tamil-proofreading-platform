#!/bin/bash
# Complete Setup Script - Run this in Google Cloud Shell
# ========================================================

set -e

echo "🚀 Tamil IME Corpus-Based Architecture Setup"
echo "=============================================="
echo ""
echo "This script will:"
echo "  1. Seed corpus database with 189 words + 55 phrases + 80 bigrams"
echo "  2. Configure ProofTamilRunner to use corpus as PRIMARY source"
echo "  3. Verify the deployment"
echo ""
read -p "Press Enter to continue..."

# Step 1: Seed Corpus Database
echo ""
echo "📦 Step 1/3: Seeding Corpus Database"
echo "======================================"
./seed_corpus_cloudshell.sh

# Step 2: Configure ProofTamilRunner
echo ""
echo "⚙️  Step 2/3: Configuring ProofTamilRunner"
echo "=========================================="
./configure_prooftamil_corpus.sh

# Step 3: Verify Deployment
echo ""
echo "✅ Step 3/3: Verification"
echo "========================="
echo ""
echo "Checking corpus table counts..."
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=tamil-proofreading-saas)
psql "$DATABASE_URL" -c "SELECT 
  (SELECT COUNT(*) FROM tamil_words) as words_count,
  (SELECT COUNT(*) FROM tamil_phrases) as phrases_count,
  (SELECT COUNT(*) FROM tamil_bigrams) as bigrams_count;"

echo ""
echo "Checking ProofTamilRunner configuration..."
gcloud run services describe proof-tamil-runner \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --format="table(status.url,spec.template.spec.containers[0].env)" | head -20

echo ""
echo "=============================================="
echo "🎉 COMPLETE! Architecture is now:"
echo "=============================================="
echo ""
echo "Suggestion Flow:"
echo "  User Input → Corpus DB (PRIMARY) → Aksharamukha (FALLBACK)"
echo ""
echo "Next: Test in your app!"
echo "  Type: soru      → Should get: சோறு (from corpus_db)"
echo "  Type: sapadu    → Should get: சாப்பாடு (from corpus_db)"
echo "  Type: amma      → Should get: அம்மா (from corpus_db)"
echo "  Type: padichiya → Should get: படிச்சியா (from corpus_db)"
echo ""
echo "Check logs for 'suggest_corpus_hit' to confirm corpus is being used."
echo "=============================================="
