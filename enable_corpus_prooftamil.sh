#!/bin/bash
# Quick update to enable corpus in ProofTamilRunner
set -e

echo "⚙️  Enabling Corpus in ProofTamilRunner"
echo "======================================="

gcloud run services update proof-tamil-runner \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --update-env-vars="CORPUS_ENABLED=true,CORPUS_TOP_K=5000,CORPUS_PHRASE_TOP_K=500,CORPUS_BIGRAM_TOP_K=1000" \
  --quiet

echo ""
echo "✅ ProofTamilRunner updated with:"
echo "   - CORPUS_ENABLED=true"
echo "   - CORPUS_TOP_K=5000"
echo "   - CORPUS_PHRASE_TOP_K=500"
echo "   - CORPUS_BIGRAM_TOP_K=1000"
echo ""
echo "DATABASE_URL was already configured ✓"
echo ""
echo "Next: Verify corpus tables have data"
echo "Run: ./seed_corpus_cloudshell.sh (if tables are empty)"
