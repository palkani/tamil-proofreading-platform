# ProofTamil Cloud Run Deployment Plan

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Preparation](#phase-1-preparation)
4. [Phase 2: Database Setup](#phase-2-database-setup)
5. [Phase 3: Containerization](#phase-3-containerization)
6. [Phase 4: Google Cloud Setup](#phase-4-google-cloud-setup)
7. [Phase 5: Deployment](#phase-5-deployment)
8. [Phase 6: Post-Deployment](#phase-6-post-deployment)

---

## Architecture Overview

### Current Setup
- **Frontend:** Express.js + EJS templates (port 5000)
- **Backend:** Go + Gin framework (port 8080)
- **Database:** PostgreSQL (Neon)
- **Assets:** Tailwind CSS, vanilla JavaScript

### Cloud Run Deployment Architecture
```
┌─────────────────────────────────────────┐
│         Google Cloud Run                 │
├──────────────────────┬──────────────────┤
│  Frontend Container  │  Backend Container│
│  (Express.js)        │  (Go + Gin)      │
│  Port 5000           │  Port 8080       │
└──────────┬───────────┴──────────┬───────┘
           │                      │
           └──────────┬───────────┘
                      │
          ┌───────────▼────────────┐
          │  Cloud SQL PostgreSQL  │
          │  (Managed Database)    │
          └───────────────────────┘
```

### Deployment Options

#### Option A: Separate Containers (Recommended)
- Frontend and backend as separate Cloud Run services
- Frontend service calls backend via internal Cloud Run networking
- Better scalability and independent deployment
- **Cost:** ~$10-30/month (depends on traffic)

#### Option B: Single Container (Monolithic)
- Both services in one container
- Simpler deployment but less flexible
- Limited independent scaling
- **Cost:** ~$5-15/month (depends on traffic)

**Recommendation:** Option A (Separate Containers) for production

---

## Prerequisites

Before starting, ensure you have:

1. **Google Cloud Account** with active billing
2. **Required SDKs:**
   - `gcloud` CLI installed
   - Docker installed locally (for testing)
   - Node.js 18+ and Go 1.21+

3. **Environment Variables File** (`.env.production`):
```env
# Database
DATABASE_URL=postgresql://user:password@cloudsql-proxy-ip/dbname
PGHOST=cloudsql-proxy-ip
PGPORT=5432
PGUSER=prooftamil
PGPASSWORD=secure-password
PGDATABASE=prooftamil_prod

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_GENAI_API_KEY=your-gemini-api-key

# Backend API Keys
OPENAI_API_KEY=sk-...
JWT_SECRET=your-jwt-secret-key

# Frontend Configuration
NODE_ENV=production
BACKEND_URL=https://api.prooftamil.com
SESSION_SECRET=your-session-secret

# Application Settings
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
```

---

## Phase 1: Preparation

### Step 1.1: Set Up Google Cloud Project
```bash
# Create a new project
gcloud projects create prooftamil --name="ProofTamil"

# Set as active project
gcloud config set project prooftamil

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com \
  artifactregistry.googleapis.com
```

### Step 1.2: Create Service Account
```bash
# Create service account
gcloud iam service-accounts create prooftamil-sa \
  --display-name="ProofTamil Service Account"

# Grant Cloud Run permissions
gcloud projects add-iam-policy-binding prooftamil \
  --member=serviceAccount:prooftamil-sa@prooftamil.iam.gserviceaccount.com \
  --role=roles/run.admin

# Grant Cloud SQL permissions
gcloud projects add-iam-policy-binding prooftamil \
  --member=serviceAccount:prooftamil-sa@prooftamil.iam.gserviceaccount.com \
  --role=roles/cloudsql.client
```

### Step 1.3: Set Region
```bash
# Set default region (choose based on users' location)
gcloud config set run/region us-central1  # or asia-south1 for India, eu-west1 for EU

# Or use: asia-south1 (Mumbai) for best India performance
gcloud config set run/region asia-south1
```

---

## Phase 2: Database Setup

### Step 2.1: Create Cloud SQL Instance
```bash
# Create PostgreSQL 15 instance
gcloud sql instances create prooftamil-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-south1 \
  --availability-type=REGIONAL \
  --backup-start-time=03:00 \
  --enable-bin-log

# Wait for instance creation (5-10 minutes)
gcloud sql instances describe prooftamil-db
```

### Step 2.2: Create Database and User
```bash
# Create main database
gcloud sql databases create prooftamil_prod \
  --instance=prooftamil-db \
  --charset=UTF8

# Create database user
gcloud sql users create prooftamil \
  --instance=prooftamil-db \
  --password=SECURE_PASSWORD_HERE
```

### Step 2.3: Configure Cloud SQL Proxy
```bash
# Get instance connection name
gcloud sql instances describe prooftamil-db \
  --format='value(connectionName)'

# Save this connection name (format: project:region:instance-name)
# You'll need it for Cloud Run environment variables
```

### Step 2.4: Configure Cloud SQL Network
```bash
# Authorize Cloud Run to access Cloud SQL
gcloud sql instances patch prooftamil-db \
  --require-ssl=false

# Create Cloud SQL Auth proxy token for local development
gcloud sql connect prooftamil-db --user=prooftamil
```

### Step 2.5: Run Database Migrations
```bash
# Connect to cloud database and run migrations
# From your local machine:

# Set DATABASE_URL for production
export DATABASE_URL="postgresql://prooftamil:PASSWORD@PROXY_IP/prooftamil_prod"

# Push schema changes
npm run db:push --force

# Seed initial data if needed
# (Create a seed script in backend/scripts/seed.go)
```

---

## Phase 3: Containerization

### Step 3.1: Create Backend Dockerfile

Create `backend/Dockerfile`:
```dockerfile
# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Copy go mod files
COPY backend/go.mod backend/go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY backend/ .

# Build application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o server ./cmd/server

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk --no-cache add ca-certificates libc6-compat

WORKDIR /root/

# Copy built binary from builder
COPY --from=builder /app/server .

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Run server
CMD ["./server"]
```

### Step 3.2: Create Frontend Dockerfile

Create `Dockerfile` (in root):
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY express-frontend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend code
COPY express-frontend/ .

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Copy node_modules and app from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app .

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/ || exit 1

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Run server
CMD ["node", "server.js"]
```

### Step 3.3: Create docker-compose.yml (for local testing)

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - BACKEND_URL=http://backend:8080
      - DATABASE_URL=${DATABASE_URL}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY}
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      - backend
    networks:
      - prooftamil

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - PORT=8080
      - GIN_MODE=release
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - GOOGLE_GENAI_API_KEY=${GOOGLE_GENAI_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
    depends_on:
      - db
    networks:
      - prooftamil

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=prooftamil
      - POSTGRES_PASSWORD=localdev123
      - POSTGRES_DB=prooftamil_local
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - prooftamil

volumes:
  postgres_data:

networks:
  prooftamil:
    driver: bridge
```

### Step 3.4: Create .dockerignore

Create `.dockerignore`:
```
node_modules
npm-debug.log
dist
build
.git
.github
.env
.env.local
.env.*.local
*.log
.DS_Store
coverage
.next
out
```

---

## Phase 4: Google Cloud Setup

### Step 4.1: Create Artifact Registry

```bash
# Create Docker repository
gcloud artifacts repositories create docker-repo \
  --repository-format=docker \
  --location=asia-south1 \
  --description="Docker images for ProofTamil"

# Configure Docker authentication
gcloud auth configure-docker asia-south1-docker.pkg.dev
```

### Step 4.2: Create Cloud Secret Manager Secrets

```bash
# Store sensitive variables in Secret Manager
echo -n "postgresql://prooftamil:PASSWORD@PROXY/prooftamil_prod" | \
  gcloud secrets create DATABASE_URL --data-file=-

echo -n "your-client-id.apps.googleusercontent.com" | \
  gcloud secrets create GOOGLE_CLIENT_ID --data-file=-

echo -n "your-client-secret" | \
  gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

echo -n "your-gemini-api-key" | \
  gcloud secrets create GOOGLE_GENAI_API_KEY --data-file=-

echo -n "sk-..." | \
  gcloud secrets create OPENAI_API_KEY --data-file=-

echo -n "your-jwt-secret" | \
  gcloud secrets create JWT_SECRET --data-file=-

# Grant service account access to secrets
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member=serviceAccount:prooftamil-sa@prooftamil.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

### Step 4.3: Configure Cloud Run Service

```bash
# Backend service configuration
gcloud run deploy prooftamil-backend \
  --image=asia-south1-docker.pkg.dev/prooftamil/docker-repo/backend:latest \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=3600s \
  --max-instances=100 \
  --allow-unauthenticated \
  --service-account=prooftamil-sa@prooftamil.iam.gserviceaccount.com \
  --region=asia-south1 \
  --no-gen2 \
  --set-env-vars="GIN_MODE=release" \
  --set-cloudsql-instances=prooftamil:asia-south1:prooftamil-db

# Frontend service configuration
gcloud run deploy prooftamil-frontend \
  --image=asia-south1-docker.pkg.dev/prooftamil/docker-repo/frontend:latest \
  --port=5000 \
  --memory=256Mi \
  --cpu=1 \
  --timeout=3600s \
  --max-instances=100 \
  --allow-unauthenticated \
  --service-account=prooftamil-sa@prooftamil.iam.gserviceaccount.com \
  --region=asia-south1 \
  --no-gen2
```

---

## Phase 5: Deployment

### Step 5.1: Build and Push Backend Image

```bash
# Navigate to backend directory
cd backend

# Build Docker image
docker build -t asia-south1-docker.pkg.dev/prooftamil/docker-repo/backend:latest .

# Push to Artifact Registry
docker push asia-south1-docker.pkg.dev/prooftamil/docker-repo/backend:latest
```

### Step 5.2: Build and Push Frontend Image

```bash
# Navigate to root directory
cd ..

# Build Docker image
docker build -t asia-south1-docker.pkg.dev/prooftamil/docker-repo/frontend:latest .

# Push to Artifact Registry
docker push asia-south1-docker.pkg.dev/prooftamil/docker-repo/frontend:latest
```

### Step 5.3: Deploy to Cloud Run

```bash
# Deploy backend
gcloud run deploy prooftamil-backend \
  --image=asia-south1-docker.pkg.dev/prooftamil/docker-repo/backend:latest \
  --region=asia-south1 \
  --set-cloudsql-instances=prooftamil:asia-south1:prooftamil-db \
  --update-env-vars DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL)",\
GOOGLE_GENAI_API_KEY="$(gcloud secrets versions access latest --secret=GOOGLE_GENAI_API_KEY)",\
OPENAI_API_KEY="$(gcloud secrets versions access latest --secret=OPENAI_API_KEY)"

# Deploy frontend
gcloud run deploy prooftamil-frontend \
  --image=asia-south1-docker.pkg.dev/prooftamil/docker-repo/frontend:latest \
  --region=asia-south1 \
  --update-env-vars BACKEND_URL="https://prooftamil-backend-xxxxx.run.app"
```

### Step 5.4: Verify Deployment

```bash
# Check service status
gcloud run services list --region=asia-south1

# View logs
gcloud run services logs read prooftamil-frontend --region=asia-south1 --limit=50
gcloud run services logs read prooftamil-backend --region=asia-south1 --limit=50

# Test endpoints
curl https://prooftamil-frontend-xxxxx.run.app/
curl https://prooftamil-backend-xxxxx.run.app/health
```

---

## Phase 6: Post-Deployment

### Step 6.1: Set Up Custom Domain

```bash
# Map custom domain to frontend
gcloud run domain-mappings create \
  --service=prooftamil-frontend \
  --domain=prooftamil.com \
  --region=asia-south1

# Add DNS records (CNAME or A record) as shown in Cloud Run console
```

### Step 6.2: Set Up SSL/TLS

```bash
# Cloud Run automatically provides SSL certificates
# For custom domains, manage via Cloud Armor and SSL policies

# Enable Cloud Armor security policies
gcloud compute security-policies create prooftamil-policy \
  --description="Security policy for ProofTamil"
```

### Step 6.3: Set Up Monitoring

```bash
# Create uptime check
gcloud monitoring uptime create prooftamil-check \
  --display-name="ProofTamil Frontend Uptime" \
  --resource-type=uptime-url \
  --monitored-resource-path=/

# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=YOUR_CHANNEL_ID \
  --display-name="ProofTamil High Error Rate" \
  --condition-display-name="Error rate > 5%"
```

### Step 6.4: Set Up CI/CD Pipeline

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [main, production]

env:
  PROJECT_ID: prooftamil
  REGION: asia-south1

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Authenticate to Google Cloud
      uses: google-github-actions/auth@v1
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}

    - name: Set up Cloud SDK
      uses: google-github-actions/setup-gcloud@v1

    - name: Configure Docker
      run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

    - name: Build and Push Backend
      run: |
        docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/docker-repo/backend:latest backend/
        docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/docker-repo/backend:latest

    - name: Build and Push Frontend
      run: |
        docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/docker-repo/frontend:latest .
        docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/docker-repo/frontend:latest

    - name: Deploy Backend to Cloud Run
      run: |
        gcloud run deploy prooftamil-backend \
          --image=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/docker-repo/backend:latest \
          --region=${{ env.REGION }}

    - name: Deploy Frontend to Cloud Run
      run: |
        gcloud run deploy prooftamil-frontend \
          --image=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/docker-repo/frontend:latest \
          --region=${{ env.REGION }}
```

---

## Estimated Costs

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Cloud Run (Frontend) | $2-10 |
| Cloud Run (Backend) | $5-15 |
| Cloud SQL (db-f1-micro) | $15-25 |
| Artifact Registry | ~$0.10 GB/month |
| Cloud SQL Backups | $5-10 |
| Cloud Storage (logs) | ~$1-5 |
| **Total Estimate** | **$25-65/month** |

*Costs will vary based on traffic, with the free tier covering initial requests*

---

## Security Checklist

- [ ] Enable VPC for Cloud SQL
- [ ] Use Cloud SQL Auth proxy for secure connections
- [ ] Store all secrets in Secret Manager (not in code)
- [ ] Configure Cloud Armor with DDoS protection
- [ ] Enable Cloud Audit Logs
- [ ] Set up HTTPS only (automatic with Cloud Run)
- [ ] Implement rate limiting at API gateway level
- [ ] Regular security scanning with Artifact Registry scanning
- [ ] Rotate secrets quarterly
- [ ] Enable binary authorization for container deployment

---

## Troubleshooting

### Issue: "Permission denied" when accessing Cloud SQL
**Solution:** Ensure service account has Cloud SQL client role and Cloud SQL Auth proxy is running

### Issue: Frontend cannot reach backend
**Solution:** 
1. Verify backend Cloud Run service URL
2. Update BACKEND_URL environment variable in frontend
3. Check CORS configuration in Go backend

### Issue: Database migration fails
**Solution:** 
1. Verify DATABASE_URL format
2. Ensure Cloud SQL user has proper permissions
3. Run `npm run db:push --force` from local machine with proper proxy

### Issue: High costs
**Solution:**
1. Reduce max-instances settings
2. Use smaller memory allocation (256Mi for frontend, 512Mi for backend)
3. Enable Cloud Run automatic scaling policies

---

## Maintenance Plan

### Daily
- Monitor error rates via Cloud Logging
- Check application performance metrics

### Weekly
- Review Cloud SQL backup status
- Check for security updates in container images

### Monthly
- Rotate secrets
- Review and optimize costs
- Update dependencies and patch security vulnerabilities

### Quarterly
- Full security audit
- Disaster recovery test
- Performance optimization review

---

## Rollback Plan

### Quick Rollback
```bash
# Deploy previous image version
gcloud run deploy prooftamil-backend \
  --image=asia-south1-docker.pkg.dev/prooftamil/docker-repo/backend:v1.0.0 \
  --region=asia-south1
```

### Database Rollback
```bash
# Restore from Cloud SQL backup
gcloud sql backups restore BACKUP_ID \
  --backup-instance=prooftamil-db
```

---

## Next Steps

1. **Immediate (Day 1):**
   - Set up Google Cloud project
   - Create service accounts
   - Configure Cloud SQL

2. **Short-term (Week 1):**
   - Build and push Docker images
   - Deploy to Cloud Run
   - Configure custom domain

3. **Medium-term (Month 1):**
   - Set up CI/CD pipeline
   - Implement monitoring and alerting
   - Security hardening

4. **Ongoing:**
   - Regular backups and maintenance
   - Performance optimization
   - Cost management

---

## Support & Documentation

- Google Cloud Documentation: https://cloud.google.com/docs
- Cloud Run Documentation: https://cloud.google.com/run/docs
- Cloud SQL Documentation: https://cloud.google.com/sql/docs
- PostgreSQL Documentation: https://www.postgresql.org/docs/

---

**Plan Created:** November 21, 2025
**Last Updated:** November 21, 2025
**Status:** Ready for Implementation
