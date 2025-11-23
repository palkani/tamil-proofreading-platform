#!/bin/bash

# ProofTamil Quick Deploy to Cloud Run with Neon
# Simplified deployment in ~35 minutes

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔════════════════════════════════════════╗"
echo "║  ProofTamil Cloud Run Deployment       ║"
echo "║  with Neon Database                    ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

# Phase 1: Prepare
echo -e "\n${YELLOW}[Phase 1/4] Project Setup${NC}"
read -p "Enter Google Cloud Project ID: " PROJECT_ID
read -p "Enter region (default: asia-south1): " REGION
REGION=${REGION:-asia-south1}

echo "Setting up project: $PROJECT_ID (Region: $REGION)"
gcloud projects create $PROJECT_ID 2>/dev/null || echo "Project already exists"
gcloud config set project $PROJECT_ID

echo "Enabling required APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

echo "Creating service account..."
gcloud iam service-accounts create prooftamil-sa \
  --display-name="ProofTamil Service Account" 2>/dev/null || echo "Service account already exists"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:prooftamil-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/run.admin \
  --quiet

echo -e "${GREEN}✓ Project setup complete${NC}"

# Phase 2: Build Images
echo -e "\n${YELLOW}[Phase 2/4] Building Docker Images${NC}"

echo "Creating Artifact Registry..."
gcloud artifacts repositories create docker-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="ProofTamil Docker images" \
  --quiet 2>/dev/null || echo "Repository already exists"

echo "Configuring Docker authentication..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

echo "Building backend image..."
docker build \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/docker-repo/backend:latest \
  -f backend/Dockerfile \
  backend/

echo "Building frontend image..."
docker build \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/docker-repo/frontend:latest \
  -f Dockerfile \
  .

echo "Pushing images to registry..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/docker-repo/backend:latest
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/docker-repo/frontend:latest

echo -e "${GREEN}✓ Images built and pushed${NC}"

# Phase 3: Configure Secrets
echo -e "\n${YELLOW}[Phase 3/4] Storing Secrets${NC}"

read -p "Enter Neon DATABASE_URL (postgresql://...): " DATABASE_URL
echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=- 2>/dev/null || \
gcloud secrets versions add DATABASE_URL --data-file=<(echo -n "$DATABASE_URL")

read -p "Enter GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
echo -n "$GOOGLE_CLIENT_ID" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=- 2>/dev/null || \
gcloud secrets versions add GOOGLE_CLIENT_ID --data-file=<(echo -n "$GOOGLE_CLIENT_ID")

read -p "Enter GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
echo -n "$GOOGLE_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=- 2>/dev/null || \
gcloud secrets versions add GOOGLE_CLIENT_SECRET --data-file=<(echo -n "$GOOGLE_CLIENT_SECRET")

read -p "Enter GOOGLE_GENAI_API_KEY: " GOOGLE_GENAI_API_KEY
echo -n "$GOOGLE_GENAI_API_KEY" | gcloud secrets create GOOGLE_GENAI_API_KEY --data-file=- 2>/dev/null || \
gcloud secrets versions add GOOGLE_GENAI_API_KEY --data-file=<(echo -n "$GOOGLE_GENAI_API_KEY")

read -p "Enter OPENAI_API_KEY: " OPENAI_API_KEY
echo -n "$OPENAI_API_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=- 2>/dev/null || \
gcloud secrets versions add OPENAI_API_KEY --data-file=<(echo -n "$OPENAI_API_KEY")

read -p "Enter JWT_SECRET: " JWT_SECRET
echo -n "$JWT_SECRET" | gcloud secrets create JWT_SECRET --data-file=- 2>/dev/null || \
gcloud secrets versions add JWT_SECRET --data-file=<(echo -n "$JWT_SECRET")

# Grant service account access to secrets
echo "Granting service account access to secrets..."
for SECRET in DATABASE_URL GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_GENAI_API_KEY OPENAI_API_KEY JWT_SECRET; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member=serviceAccount:prooftamil-sa@${PROJECT_ID}.iam.gserviceaccount.com \
    --role=roles/secretmanager.secretAccessor \
    --quiet 2>/dev/null || true
done

echo -e "${GREEN}✓ Secrets stored securely${NC}"

# Phase 4: Deploy
echo -e "\n${YELLOW}[Phase 4/4] Deploying to Cloud Run${NC}"

echo "Deploying backend service..."
gcloud run deploy prooftamil-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/docker-repo/backend:latest \
  --region=$REGION \
  --memory=512Mi \
  --cpu=1 \
  --timeout=3600 \
  --max-instances=100 \
  --allow-unauthenticated \
  --service-account=prooftamil-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --update-env-vars DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL)",\
OPENAI_API_KEY="$(gcloud secrets versions access latest --secret=OPENAI_API_KEY)",\
GOOGLE_GENAI_API_KEY="$(gcloud secrets versions access latest --secret=GOOGLE_GENAI_API_KEY)",\
JWT_SECRET="$(gcloud secrets versions access latest --secret=JWT_SECRET)" \
  --quiet

BACKEND_URL=$(gcloud run services describe prooftamil-backend --region=$REGION --format='value(status.url)')

echo "Deploying frontend service..."
gcloud run deploy prooftamil-frontend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/docker-repo/frontend:latest \
  --region=$REGION \
  --memory=256Mi \
  --cpu=1 \
  --timeout=3600 \
  --max-instances=100 \
  --allow-unauthenticated \
  --service-account=prooftamil-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --update-env-vars BACKEND_URL="$BACKEND_URL",\
GOOGLE_CLIENT_ID="$(gcloud secrets versions access latest --secret=GOOGLE_CLIENT_ID)",\
GOOGLE_CLIENT_SECRET="$(gcloud secrets versions access latest --secret=GOOGLE_CLIENT_SECRET)" \
  --quiet

echo -e "${GREEN}✓ Services deployed${NC}"

# Summary
echo -e "\n${GREEN}"
echo "╔════════════════════════════════════════╗"
echo "║  ✓ Deployment Complete!               ║"
echo "╚════════════════════════════════════════╝"
echo -e "${NC}"

FRONTEND_URL=$(gcloud run services describe prooftamil-frontend --region=$REGION --format='value(status.url)')

echo -e "\n${BLUE}Service URLs:${NC}"
echo "Frontend: $FRONTEND_URL"
echo "Backend:  $BACKEND_URL"

echo -e "\n${BLUE}Next Steps:${NC}"
echo "1. Test your application at: $FRONTEND_URL"
echo "2. Set up custom domain:"
echo "   gcloud run domain-mappings create --service=prooftamil-frontend --domain=prooftamil.com --region=$REGION"
echo "3. Update DNS records as shown in Cloud Run console"
echo "4. Monitor logs: gcloud run services logs read prooftamil-frontend --region=$REGION"

echo -e "\n${BLUE}Cost Estimate:${NC}"
echo "Frontend:  \$2-10/month"
echo "Backend:   \$5-15/month"
echo "Neon DB:   \$0-9/month"
echo "─────────────────────"
echo "Total:     \$7-35/month"
echo -e ""
