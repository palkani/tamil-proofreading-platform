#!/bin/bash
# Deploy prooftamil-runner to US Central region
# Run this from Google Cloud Shell or with gcloud CLI authenticated

set -e

PROJECT_ID="prooftamil"
REGION_US="us-central1"
REGION_ASIA="asia-south1"
SERVICE_NAME="prooftamil-runner-us"
IMAGE_NAME="prooftamil-runner"

echo "=== Deploying prooftamil-runner to US Central ==="

# Step 1: Get the current image from Asia deployment
echo "Step 1: Getting current runner image from Asia..."
CURRENT_IMAGE=$(gcloud run services describe prooftamil-runner \
  --region=$REGION_ASIA \
  --project=$PROJECT_ID \
  --format='value(spec.template.spec.containers[0].image)')

if [ -z "$CURRENT_IMAGE" ]; then
  echo "ERROR: Could not find prooftamil-runner in asia-south1"
  echo "Please deploy the runner to asia-south1 first"
  exit 1
fi

echo "Current image: $CURRENT_IMAGE"

# Step 2: Get environment variables from Asia deployment
echo "Step 2: Getting environment variables..."
ENV_VARS=$(gcloud run services describe prooftamil-runner \
  --region=$REGION_ASIA \
  --project=$PROJECT_ID \
  --format='value(spec.template.spec.containers[0].env)')

# Step 3: Deploy to US Central
echo "Step 3: Deploying to us-central1..."
gcloud run deploy $SERVICE_NAME \
  --image=$CURRENT_IMAGE \
  --region=$REGION_US \
  --project=$PROJECT_ID \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --min-instances=1 \
  --max-instances=100 \
  --port=8080

# Step 4: Verify deployment
echo "Step 4: Verifying deployment..."
US_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION_US \
  --project=$PROJECT_ID \
  --format='value(status.url)')

echo ""
echo "=== Deployment Complete ==="
echo "US Runner URL: $US_URL"
echo ""
echo "Test with: curl $US_URL/health"
echo ""
echo "Update your frontend to use this URL for US users:"
echo "  window.TRANSLITERATOR_URLS.us = '$US_URL'"
