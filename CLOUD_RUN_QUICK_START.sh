#!/bin/bash

# ProofTamil Cloud Run Deployment Script
# Quick start guide for deploying to Google Cloud Run

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ProofTamil Cloud Run Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Step 1: Check prerequisites
echo -e "\n${YELLOW}[Step 1/5] Checking prerequisites...${NC}"
command -v gcloud >/dev/null 2>&1 || { echo -e "${RED}gcloud CLI not found. Please install it.${NC}"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker not found. Please install it.${NC}"; exit 1; }
echo -e "${GREEN}✓ Prerequisites check passed${NC}"

# Step 2: Get project details
echo -e "\n${YELLOW}[Step 2/5] Setting up Google Cloud project...${NC}"
read -p "Enter Google Cloud Project ID: " PROJECT_ID
read -p "Enter region (default: asia-south1): " REGION
REGION=${REGION:-asia-south1}

gcloud config set project $PROJECT_ID
echo -e "${GREEN}✓ Project set to $PROJECT_ID${NC}"

# Step 3: Enable APIs
echo -e "\n${YELLOW}[Step 3/5] Enabling required APIs...${NC}"
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
echo -e "${GREEN}✓ APIs enabled${NC}"

# Step 4: Create Artifact Registry
echo -e "\n${YELLOW}[Step 4/5] Creating Artifact Registry...${NC}"
gcloud artifacts repositories create docker-repo \
  --repository-format=docker \
  --location=$REGION \
  --description="Docker images for ProofTamil" || echo -e "${YELLOW}Repository may already exist${NC}"
echo -e "${GREEN}✓ Artifact Registry ready${NC}"

# Step 5: Build and push images
echo -e "\n${YELLOW}[Step 5/5] Building and pushing Docker images...${NC}"
gcloud auth configure-docker $REGION-docker.pkg.dev

# Backend
echo "Building backend image..."
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/docker-repo/backend:latest -f backend/Dockerfile backend/
docker push $REGION-docker.pkg.dev/$PROJECT_ID/docker-repo/backend:latest

# Frontend
echo "Building frontend image..."
docker build -t $REGION-docker.pkg.dev/$PROJECT_ID/docker-repo/frontend:latest -f Dockerfile .
docker push $REGION-docker.pkg.dev/$PROJECT_ID/docker-repo/frontend:latest

echo -e "${GREEN}✓ Images built and pushed${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\nNext steps:"
echo "1. Set up Cloud SQL: gcloud sql instances create prooftamil-db --database-version=POSTGRES_15 --tier=db-f1-micro --region=$REGION"
echo "2. Create database: gcloud sql databases create prooftamil_prod --instance=prooftamil-db"
echo "3. Deploy services: gcloud run deploy prooftamil-backend --image=$REGION-docker.pkg.dev/$PROJECT_ID/docker-repo/backend:latest --region=$REGION"
echo "4. See DEPLOYMENT_PLAN.md for detailed instructions"
