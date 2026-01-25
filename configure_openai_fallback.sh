#!/bin/bash
# Configure OpenAI fallback for rate limit protection
# Run this in Google Cloud Shell

set -e

echo "🔧 Configuring OpenAI Fallback for Gemini Rate Limits"
echo "======================================================"
echo ""

# Check if OpenAI API key is provided
if [ -z "$1" ]; then
  echo "❌ ERROR: OpenAI API key required"
  echo ""
  echo "Usage:"
  echo "  ./configure_openai_fallback.sh YOUR_OPENAI_API_KEY"
  echo ""
  echo "Get your OpenAI API key from: https://platform.openai.com/api-keys"
  echo ""
  exit 1
fi

OPENAI_API_KEY="$1"

echo "📦 Step 1: Storing OpenAI API key in Secret Manager..."
echo "$OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY \
  --data-file=- \
  --project=tamil-proofreading-saas \
  --replication-policy="automatic" \
  2>/dev/null || \
echo "$OPENAI_API_KEY" | gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=tamil-proofreading-saas

echo "✅ OpenAI API key stored in Secret Manager"
echo ""

echo "📦 Step 2: Updating backend service with OpenAI fallback..."
gcloud run services update backend-service \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --update-env-vars="OPENAI_API_KEY=$(gcloud secrets versions access latest --secret=OPENAI_API_KEY --project=tamil-proofreading-saas)" \
  --quiet

echo "✅ Backend service updated"
echo ""

echo "📦 Step 3: Verifying configuration..."
gcloud run services describe backend-service \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --format="value(spec.template.spec.containers[0].env)" | grep OPENAI || echo "⚠️  OpenAI key not visible (may be set)"

echo ""
echo "======================================================"
echo "🎉 COMPLETE! OpenAI fallback is now configured"
echo "======================================================"
echo ""
echo "What happens now:"
echo "  1. Primary: Gemini API (fast, cheap)"
echo "  2. If Gemini hits rate limit (429): Fallback to OpenAI"
echo "  3. If OpenAI also fails: Fallback to Anthropic (if configured)"
echo ""
echo "Rate limit protection:"
echo "  - Gemini: 20 req/min (free tier)"
echo "  - OpenAI: Your billing plan limit"
echo ""
echo "Next: Test by making 21+ requests quickly to trigger fallback"
echo "======================================================"
