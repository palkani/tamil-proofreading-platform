# ProofTamil Google Cloud Run Deployment Plan

## Overview
Complete deployment plan for ProofTamil (Tamil AI Proofreading Platform) on Google Cloud Run with custom domain prooftamil.com (managed via Namecheap). This guide covers frontend (Express.js), backend (Go), and database (Neon PostgreSQL).

---

## Phase 1: Prerequisites & Setup

### 1.1 Prerequisites
- [ ] Google Cloud account with billing enabled
- [ ] Docker installed locally (for testing)
- [ ] gcloud CLI installed and configured
- [ ] Git repository pushed to GitHub
- [ ] Domain: prooftamil.com (registered on Namecheap)
- [ ] Database: Neon PostgreSQL (already set up)

### 1.2 Google Cloud Project Setup

```bash
# Create a new project
gcloud projects create prooftamil-prod --name="ProofTamil Production"

# Set the project
gcloud config set project prooftamil-prod

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable domains.googleapis.com
```

### 1.3 Create Service Account for Deployment
```bash
# Create service account
gcloud iam service-accounts create prooftamil-deployer \
  --display-name="ProofTamil Deployer"

# Grant permissions
gcloud projects add-iam-policy-binding prooftamil-prod \
  --member=serviceAccount:prooftamil-deployer@prooftamil-prod.iam.gserviceaccount.com \
  --role=roles/run.admin

gcloud projects add-iam-policy-binding prooftamil-prod \
  --member=serviceAccount:prooftamil-deployer@prooftamil-prod.iam.gserviceaccount.com \
  --role=roles/storage.admin

# Create key
gcloud iam service-accounts keys create ~/prooftamil-key.json \
  --iam-account=prooftamil-deployer@prooftamil-prod.iam.gserviceaccount.com
```

---

## Phase 2: Backend Deployment (Go)

### 2.1 Create Backend Dockerfile
Already exists at `backend/Dockerfile`. Update if needed:

```dockerfile
# Multi-stage build
FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY backend/go.* ./
RUN go mod download

COPY backend/. .
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/server

# Final stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/

COPY --from=builder /app/main .

EXPOSE 8080
CMD ["./main"]
```

### 2.2 Build and Push Backend Image

```bash
# Set variables
PROJECT_ID=prooftamil-prod
BACKEND_IMAGE=gcr.io/${PROJECT_ID}/prooftamil-backend
REGION=us-central1

# Build and push
gcloud builds submit --tag ${BACKEND_IMAGE} \
  --dockerfile=backend/Dockerfile \
  ./

# Or build locally and push
docker build -f backend/Dockerfile -t ${BACKEND_IMAGE}:latest ./
docker push ${BACKEND_IMAGE}:latest
```

### 2.3 Deploy Backend to Cloud Run

```bash
gcloud run deploy prooftamil-backend \
  --image=${BACKEND_IMAGE}:latest \
  --platform managed \
  --region=${REGION} \
  --memory=512Mi \
  --cpu=1 \
  --timeout=3600 \
  --allow-unauthenticated \
  --set-env-vars=\
DATABASE_URL=${DATABASE_URL},\
GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY},\
OPENAI_API_KEY=${OPENAI_API_KEY},\
GIN_MODE=release
```

**Get Backend URL:**
```bash
gcloud run services describe prooftamil-backend \
  --platform managed \
  --region=${REGION} \
  --format='value(status.url)'
# Output: https://prooftamil-backend-xxxxx.a.run.app
```

---

## Phase 3: Frontend Deployment (Express.js)

### 3.1 Create Frontend Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY express-frontend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY express-frontend/ .

# Copy public assets
COPY express-frontend/public ./public

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["npm", "start"]
```

### 3.2 Create start.sh for Cloud Run

Create `express-frontend/start-prod.sh`:

```bash
#!/bin/bash
set -e

# Set environment variables
export NODE_ENV=production
export BACKEND_URL=${BACKEND_URL:-https://prooftamil-backend-xxxxx.a.run.app}
export PORT=5000

# Start the Express server
exec npm start
```

Make it executable:
```bash
chmod +x express-frontend/start-prod.sh
```

### 3.3 Update package.json start script

Ensure `express-frontend/package.json` has:
```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

### 3.4 Build and Push Frontend Image

```bash
FRONTEND_IMAGE=gcr.io/${PROJECT_ID}/prooftamil-frontend

# Build and push
gcloud builds submit --tag ${FRONTEND_IMAGE} \
  --dockerfile=express-frontend/Dockerfile \
  ./

# Or build locally
docker build -f express-frontend/Dockerfile -t ${FRONTEND_IMAGE}:latest ./
docker push ${FRONTEND_IMAGE}:latest
```

### 3.5 Deploy Frontend to Cloud Run

```bash
# Get backend URL from previous deployment
BACKEND_SERVICE_URL=$(gcloud run services describe prooftamil-backend \
  --platform managed \
  --region=${REGION} \
  --format='value(status.url)')

gcloud run deploy prooftamil-frontend \
  --image=${FRONTEND_IMAGE}:latest \
  --platform managed \
  --region=${REGION} \
  --memory=512Mi \
  --cpu=1 \
  --timeout=3600 \
  --allow-unauthenticated \
  --set-env-vars=\
NODE_ENV=production,\
BACKEND_URL=${BACKEND_SERVICE_URL},\
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},\
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET},\
SESSION_SECRET=${SESSION_SECRET},\
DATABASE_URL=${DATABASE_URL},\
JWT_SECRET=${JWT_SECRET}
```

**Get Frontend URL:**
```bash
gcloud run services describe prooftamil-frontend \
  --platform managed \
  --region=${REGION} \
  --format='value(status.url)'
# Output: https://prooftamil-frontend-xxxxx.a.run.app
```

---

## Phase 4: Domain Configuration

### 4.1 Set Up Cloud Load Balancer

Create a load balancer to point to the frontend service:

```bash
# Create a network endpoint group
gcloud compute network-endpoint-groups create prooftamil-backend-neg \
  --region=${REGION} \
  --network-endpoint-type=SERVERLESS \
  --cloud-run-service=prooftamil-frontend

# Create backend service
gcloud compute backend-services create prooftamil-backend-service \
  --global \
  --protocol=HTTPS \
  --health-checks=... (optional)

# Create URL map
gcloud compute url-maps create prooftamil-url-map \
  --default-service=prooftamil-backend-service

# Create HTTPS proxy
gcloud compute target-https-proxies create prooftamil-https-proxy \
  --url-map=prooftamil-url-map \
  --ssl-certificates=prooftamil-cert

# Create forwarding rule
gcloud compute forwarding-rules create prooftamil-https-rule \
  --global \
  --target-https-proxy=prooftamil-https-proxy \
  --address=prooftamil-ip \
  --ports=443
```

### 4.2 Set Up Custom Domain with Namecheap

#### Step 1: Get Load Balancer IP
```bash
gcloud compute forwarding-rules describe prooftamil-https-rule \
  --global \
  --format='value(IPAddress)'
# Output: 35.201.xxx.xxx (example)
```

#### Step 2: Configure DNS on Namecheap
1. Log into Namecheap account
2. Go to Dashboard → prooftamil.com → Manage
3. Go to Advanced DNS tab
4. Add DNS records:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 35.201.xxx.xxx | 3600 |
| A | www | 35.201.xxx.xxx | 3600 |
| CNAME | api | prooftamil-backend-xxxxx.a.run.app | 3600 |

#### Step 3: Configure Nameservers (Optional)
If you want to use Google Cloud DNS instead:

1. Create Cloud DNS zone:
```bash
gcloud dns managed-zones create prooftamil-zone \
  --dns-name=prooftamil.com. \
  --description="ProofTamil Zone"
```

2. Get Cloud DNS nameservers:
```bash
gcloud dns managed-zones describe prooftamil-zone \
  --format='value(nameServers[])'
```

3. Update nameservers on Namecheap dashboard with the Cloud DNS nameservers

### 4.3 SSL/TLS Certificate

Google Cloud Run automatically provisions SSL certificates when you use a custom domain.

For custom domains via load balancer, create a certificate:
```bash
gcloud compute ssl-certificates create prooftamil-cert \
  --certificate=path/to/cert.pem \
  --private-key=path/to/key.pem
```

Or use Google-managed certificates:
```bash
gcloud compute ssl-certificates create prooftamil-cert \
  --domains=prooftamil.com,www.prooftamil.com
```

---

## Phase 5: Environment Variables & Secrets Management

### 5.1 Store Secrets in Google Secret Manager

```bash
# Create secrets
echo -n ${DATABASE_URL} | gcloud secrets create DATABASE_URL --data-file=-
echo -n ${GOOGLE_CLIENT_ID} | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
echo -n ${GOOGLE_CLIENT_SECRET} | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
echo -n ${GOOGLE_GENAI_API_KEY} | gcloud secrets create GOOGLE_GENAI_API_KEY --data-file=-
echo -n ${OPENAI_API_KEY} | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n ${SESSION_SECRET} | gcloud secrets create SESSION_SECRET --data-file=-
echo -n ${JWT_SECRET} | gcloud secrets create JWT_SECRET --data-file=-

# Grant Cloud Run service access to secrets
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### 5.2 Update Cloud Run Deployments to Use Secrets

```bash
gcloud run services update prooftamil-backend \
  --update-secrets=\
DATABASE_URL=DATABASE_URL:latest,\
GOOGLE_GENAI_API_KEY=GOOGLE_GENAI_API_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest

gcloud run services update prooftamil-frontend \
  --update-secrets=\
DATABASE_URL=DATABASE_URL:latest,\
GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,\
GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,\
SESSION_SECRET=SESSION_SECRET:latest,\
JWT_SECRET=JWT_SECRET:latest
```

---

## Phase 6: Database Configuration

### 6.1 Neon PostgreSQL Setup
Database is already configured. Ensure connection string is stored in Secret Manager:

```bash
# Verify database connection
psql ${DATABASE_URL} -c "SELECT version();"
```

### 6.2 Run Database Migrations

```bash
# Backend can auto-migrate using GORM on startup
# Ensure migration is enabled in backend/internal/database/init.go
```

---

## Phase 7: CI/CD Pipeline (GitHub Actions)

### 7.1 Create GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches:
      - main

env:
  PROJECT_ID: prooftamil-prod
  REGION: us-central1
  BACKEND_IMAGE: gcr.io/prooftamil-prod/prooftamil-backend
  FRONTEND_IMAGE: gcr.io/prooftamil-prod/prooftamil-frontend

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v1
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: ${{ env.PROJECT_ID }}
          export_default_credentials: true

      - name: Configure Docker for GCR
        run: |
          gcloud auth configure-docker

      - name: Build and push backend
        run: |
          docker build -f backend/Dockerfile -t ${{ env.BACKEND_IMAGE }}:latest .
          docker push ${{ env.BACKEND_IMAGE }}:latest

      - name: Build and push frontend
        run: |
          docker build -f express-frontend/Dockerfile -t ${{ env.FRONTEND_IMAGE }}:latest .
          docker push ${{ env.FRONTEND_IMAGE }}:latest

      - name: Deploy backend to Cloud Run
        run: |
          gcloud run deploy prooftamil-backend \
            --image=${{ env.BACKEND_IMAGE }}:latest \
            --platform managed \
            --region=${{ env.REGION }} \
            --no-allow-unauthenticated \
            --memory=512Mi \
            --cpu=1

      - name: Deploy frontend to Cloud Run
        run: |
          gcloud run deploy prooftamil-frontend \
            --image=${{ env.FRONTEND_IMAGE }}:latest \
            --platform managed \
            --region=${{ env.REGION }} \
            --allow-unauthenticated \
            --memory=512Mi \
            --cpu=1
```

### 7.2 Add GitHub Secrets
Go to GitHub repo → Settings → Secrets and add:
- `GCP_SA_KEY`: Content of `~/prooftamil-key.json`

---

## Phase 8: Monitoring & Scaling

### 8.1 Set Up Cloud Monitoring

```bash
# View logs
gcloud run services logs read prooftamil-backend --limit 50
gcloud run services logs read prooftamil-frontend --limit 50

# Set up error reporting
gcloud services enable clouderrorreporting.googleapis.com
```

### 8.2 Configure Auto-scaling

```bash
# Update backend with auto-scaling
gcloud run services update prooftamil-backend \
  --min-instances=1 \
  --max-instances=10

# Update frontend with auto-scaling
gcloud run services update prooftamil-frontend \
  --min-instances=1 \
  --max-instances=10
```

### 8.3 Set Up Alerts

```bash
# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="ProofTamil High Error Rate"
```

---

## Phase 9: Testing & Verification

### 9.1 Test Endpoints

```bash
# Test backend health
curl https://api.prooftamil.com/api/v1/auth/me

# Test frontend
curl https://prooftamil.com/

# Test contact form
curl -X POST https://api.prooftamil.com/api/v1/contact \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "subject": "Test",
    "message": "Test message"
  }'
```

### 9.2 SSL Certificate Verification

```bash
# Check certificate
gcloud compute ssl-certificates describe prooftamil-cert --format="value(certificate)"

# Verify domain
openssl s_client -connect prooftamil.com:443 -servername prooftamil.com
```

### 9.3 Performance Testing

```bash
# Load test using Apache Bench or similar
ab -n 1000 -c 10 https://prooftamil.com/
```

---

## Phase 10: Post-Deployment

### 10.1 Update Documentation
- [ ] Update README with production URLs
- [ ] Document deployment process
- [ ] Create runbook for common issues

### 10.2 Set Up Backups

```bash
# Schedule daily database backups with Neon
# Configure in Neon dashboard
```

### 10.3 Monitoring Checklist
- [ ] Set up uptime monitoring (e.g., Uptime Robot)
- [ ] Configure error notifications
- [ ] Set up performance monitoring
- [ ] Enable Cloud Audit Logs

---

## Cost Estimation

### Monthly Cost Breakdown
- **Cloud Run (Frontend)**: ~$5-15/month (with auto-scaling)
- **Cloud Run (Backend)**: ~$5-15/month (with auto-scaling)
- **Cloud Load Balancer**: ~$0.035/hour ≈ $25/month
- **Storage**: ~$0.26/month
- **Database (Neon)**: $0-29/month (depending on plan)
- **SSL Certificate**: Included

**Total Estimated Cost**: $50-80/month

---

## Troubleshooting

### Issue: Backend not connecting to frontend
**Solution**: Verify BACKEND_URL environment variable in frontend deployment

### Issue: Certificate not issued
**Solution**: Wait 15-30 minutes for Google-managed certificate provisioning

### Issue: Domain not resolving
**Solution**: 
1. Verify DNS records on Namecheap
2. Check with: `nslookup prooftamil.com`
3. Wait for DNS propagation (24-48 hours)

### Issue: High latency
**Solution**: 
1. Increase memory allocation
2. Check Cloud Run metrics in Console
3. Consider regional deployment

---

## Rollback Procedure

```bash
# Rollback frontend to previous version
gcloud run services update-traffic prooftamil-frontend \
  --to-revisions LATEST=100

# Rollback backend
gcloud run services update-traffic prooftamil-backend \
  --to-revisions LATEST=100

# View revision history
gcloud run revisions list --service=prooftamil-frontend
```

---

## Next Steps

1. **Week 1**: Complete Phase 1-2 (Setup & Backend)
2. **Week 2**: Complete Phase 3-4 (Frontend & Domain)
3. **Week 3**: Complete Phase 5-7 (Secrets, CI/CD)
4. **Week 4**: Complete Phase 8-10 (Monitoring & Testing)

---

## Support & Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Google Cloud DNS Documentation](https://cloud.google.com/dns/docs)
- [Namecheap DNS Management](https://www.namecheap.com/support/knowledgebase/)
- [Go Container Best Practices](https://cloud.google.com/go/docs/reference)
- [Node.js Production Deployment](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)

---

**Last Updated**: Nov 22, 2025  
**Version**: 1.0
