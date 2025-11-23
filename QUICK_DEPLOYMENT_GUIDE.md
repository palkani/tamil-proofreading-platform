# ProofTamil Quick Deployment Guide for Google Cloud Run

## 🚀 Quick Start (10-15 minutes)

### Prerequisites Checklist
- [ ] Google Cloud account created (with billing enabled)
- [ ] gcloud CLI installed: `brew install google-cloud-sdk`
- [ ] Docker installed
- [ ] GitHub repository set up
- [ ] prooftamil.com purchased from Namecheap
- [ ] Neon PostgreSQL DATABASE_URL ready

---

## Step 1: Set Up Google Cloud Project (5 min)

```bash
# Set your project ID
PROJECT_ID="prooftamil-prod"
REGION="us-central1"

# Create project
gcloud projects create $PROJECT_ID --name="ProofTamil Production"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
  run.googleapis.com \
  containerregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com
```

---

## Step 2: Add Secrets to Google Secret Manager (3 min)

```bash
# Create all secrets
echo -n "$(echo $DATABASE_URL)" | gcloud secrets create DATABASE_URL --data-file=-
echo -n "$(echo $GOOGLE_CLIENT_ID)" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-
echo -n "$(echo $GOOGLE_CLIENT_SECRET)" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
echo -n "$(echo $GOOGLE_GENAI_API_KEY)" | gcloud secrets create GOOGLE_GENAI_API_KEY --data-file=-
echo -n "$(echo $OPENAI_API_KEY)" | gcloud secrets create OPENAI_API_KEY --data-file=-
echo -n "$(echo $SESSION_SECRET)" | gcloud secrets create SESSION_SECRET --data-file=-
echo -n "$(echo $JWT_SECRET)" | gcloud secrets create JWT_SECRET --data-file=-
```

---

## Step 3: Deploy Backend (3 min)

```bash
# Build and deploy backend
gcloud run deploy prooftamil-backend \
  --source . \
  --source-dir backend \
  --platform managed \
  --region $REGION \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated \
  --set-secrets=\
DATABASE_URL=DATABASE_URL:latest,\
GOOGLE_GENAI_API_KEY=GOOGLE_GENAI_API_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest

# Get backend URL
BACKEND_URL=$(gcloud run services describe prooftamil-backend \
  --platform managed --region $REGION --format='value(status.url)')
echo "Backend URL: $BACKEND_URL"
```

---

## Step 4: Deploy Frontend (3 min)

```bash
# Build and deploy frontend
gcloud run deploy prooftamil-frontend \
  --source . \
  --source-dir express-frontend \
  --platform managed \
  --region $REGION \
  --memory 512Mi \
  --cpu 1 \
  --allow-unauthenticated \
  --set-env-vars=BACKEND_URL=$BACKEND_URL,NODE_ENV=production \
  --set-secrets=\
DATABASE_URL=DATABASE_URL:latest,\
GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,\
GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,\
SESSION_SECRET=SESSION_SECRET:latest,\
JWT_SECRET=JWT_SECRET:latest

# Get frontend URL
FRONTEND_URL=$(gcloud run services describe prooftamil-frontend \
  --platform managed --region $REGION --format='value(status.url)')
echo "Frontend URL: $FRONTEND_URL"
```

---

## Step 5: Set Up Custom Domain - Namecheap DNS (2 min)

### Option A: Use Namecheap DNS (Simpler)

1. **Log into Namecheap account**
   - Go to Dashboard → prooftamil.com → Manage

2. **Go to Advanced DNS tab and add these records:**

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_FRONTEND_IP | 3600 |
| A | www | YOUR_FRONTEND_IP | 3600 |

3. **Get Frontend IP:**
```bash
# For now, use Cloud Run URL directly
# You'll get a permanent IP when setting up load balancer
echo $FRONTEND_URL
# Output: https://prooftamil-frontend-xxxxx.a.run.app
```

4. **Map domain to Cloud Run service:**
```bash
# Add custom domain mapping
gcloud run domain-mappings create \
  --service=prooftamil-frontend \
  --domain=prooftamil.com \
  --platform managed \
  --region $REGION

# Add www subdomain
gcloud run domain-mappings create \
  --service=prooftamil-frontend \
  --domain=www.prooftamil.com \
  --platform managed \
  --region $REGION
```

5. **Get DNS records to add to Namecheap:**
```bash
# View the CNAME you need to add
gcloud run domain-mappings describe prooftamil.com \
  --platform managed \
  --region $REGION
```

---

## Step 6: Verify Deployment (2 min)

```bash
# Check backend
curl https://prooftamil.com/api/v1/auth/me

# Check frontend
curl https://prooftamil.com/

# View logs
gcloud run services logs read prooftamil-backend --limit 20
gcloud run services logs read prooftamil-frontend --limit 20
```

---

## 📊 Cost Summary

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Cloud Run Frontend | $5-15 | Auto-scaling 1-10 instances |
| Cloud Run Backend | $5-15 | Auto-scaling 1-10 instances |
| Storage | $0.26 | Container registry |
| Database | $0-29 | Neon PostgreSQL (varies by plan) |
| **Total** | **$50-80** | With current setup |

---

## 🔧 Common Commands

### View Logs
```bash
# Backend logs
gcloud run services logs read prooftamil-backend --limit 50

# Frontend logs
gcloud run services logs read prooftamil-frontend --limit 50
```

### Update Service
```bash
# Update backend only
gcloud run deploy prooftamil-backend \
  --source . \
  --source-dir backend \
  --region $REGION

# Update frontend only
gcloud run deploy prooftamil-frontend \
  --source . \
  --source-dir express-frontend \
  --region $REGION
```

### Auto-scaling Configuration
```bash
# Increase max instances
gcloud run services update prooftamil-backend \
  --max-instances 20 \
  --region $REGION

# Set minimum instances (to reduce cold starts)
gcloud run services update prooftamil-backend \
  --min-instances 2 \
  --region $REGION
```

### Monitor Services
```bash
# Get service details
gcloud run services describe prooftamil-frontend --region $REGION

# List all revisions
gcloud run revisions list --service=prooftamil-frontend --region $REGION
```

---

## 🐛 Troubleshooting

### Issue: "Failed to deploy" / Build errors
```bash
# Check build logs
gcloud builds log --stream

# Rebuild with verbose output
gcloud run deploy prooftamil-backend --source . --source-dir backend --region $REGION --verbosity=debug
```

### Issue: Frontend can't connect to backend
```bash
# Verify environment variables
gcloud run services describe prooftamil-frontend --region $REGION | grep -A 20 "env:"

# Update BACKEND_URL
gcloud run services update prooftamil-frontend \
  --set-env-vars=BACKEND_URL=$BACKEND_URL \
  --region $REGION
```

### Issue: Database connection errors
```bash
# Verify DATABASE_URL secret exists
gcloud secrets list | grep DATABASE_URL

# Test connection locally
psql $DATABASE_URL -c "SELECT 1;"
```

### Issue: Domain not resolving
```bash
# Check DNS propagation
nslookup prooftamil.com

# Verify domain mapping
gcloud run domain-mappings list --region $REGION
```

---

## 📋 CI/CD Setup (Optional)

To auto-deploy on git push:

1. Create `.github/workflows/deploy.yml` - See `GOOGLE_CLOUD_DEPLOYMENT_PLAN.md`
2. Add `GCP_SA_KEY` secret to GitHub
3. Push to main branch - automatic deployment!

---

## 🔒 Security Checklist

- [ ] All secrets stored in Secret Manager (not in code)
- [ ] Backend service set to `--no-allow-unauthenticated`
- [ ] Frontend service allows unauthenticated access
- [ ] SSL/TLS certificate auto-provisioned by Cloud Run
- [ ] Database backups configured
- [ ] Cloud Audit Logs enabled

---

## 📞 Support Resources

- **Google Cloud Run Docs**: https://cloud.google.com/run/docs
- **Namecheap DNS Guide**: https://www.namecheap.com/support/knowledgebase/
- **Neon Database**: https://neon.tech/docs
- **Cloud Run Pricing**: https://cloud.google.com/run/pricing

---

**Estimated Total Setup Time**: 20-30 minutes  
**Total Monthly Cost**: $50-80 (varies by usage)  
**Scale**: Supports 100-1000+ concurrent users

