#!/bin/bash
set -e

echo "🔧 Configuring ProofTamilRunner to use Corpus Database"
echo "======================================================="
echo ""

# Fetch DATABASE_URL from Secret Manager
echo "📦 Step 1: Fetching DATABASE_URL from Secret Manager..."
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=tamil-proofreading-saas)

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL secret not found in Secret Manager"
  echo "Please ensure the secret exists: gcloud secrets list --project=tamil-proofreading-saas"
  exit 1
fi

echo "✅ DATABASE_URL fetched successfully"
echo ""

# Update ProofTamilRunner Cloud Run service
echo "📦 Step 2: Updating ProofTamilRunner Cloud Run service..."
gcloud run services update proof-tamil-runner \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --update-env-vars="DATABASE_URL=$DATABASE_URL,CORPUS_ENABLED=true,CORPUS_TOP_K=5000,CORPUS_PHRASE_TOP_K=500,CORPUS_BIGRAM_TOP_K=1000" \
  --quiet

echo ""
echo "✅ ProofTamilRunner configured with:"
echo "   - DATABASE_URL (from Secret Manager)"
echo "   - CORPUS_ENABLED=true"
echo "   - CORPUS_TOP_K=5000"
echo "   - CORPUS_PHRASE_TOP_K=500"
echo "   - CORPUS_BIGRAM_TOP_K=1000"
echo ""

# Verify configuration
echo "📦 Step 3: Verifying configuration..."
gcloud run services describe proof-tamil-runner \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --format="value(spec.template.spec.containers[0].env)" | grep -E "(DATABASE_URL|CORPUS_ENABLED)" || true

echo ""
echo "======================================================="
echo "🎉 Configuration complete!"
echo ""
echo "Next: Deploy the updated suggest_service.py code:"
echo "   cd /path/to/ProofTamilRunner"
echo "   git push origin main"
echo ""
echo "The corpus will now be the PRIMARY source for suggestions!"
echo "======================================================="
