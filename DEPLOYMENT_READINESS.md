# ProofTamil - Deployment Readiness Checklist

**Status:** ✅ READY TO DEPLOY TO GOOGLE CLOUD RUN

---

## Quick Start (35 Minutes)

```bash
# Run the automated deployment script
./QUICK_DEPLOY_NEON.sh
```

This script will:
1. Create Google Cloud project
2. Enable required APIs
3. Build Docker images
4. Store secrets in Google Secret Manager
5. Deploy frontend and backend to Cloud Run
6. Return working URLs

---

## Files Prepared

### ✅ Deployment Automation
- **`QUICK_DEPLOY_NEON.sh`** - One-command deployment script (35 min)
- **`.github/workflows/deploy.yml`** - CI/CD pipeline for automatic deployments

### ✅ Containerization
- **`Dockerfile`** - Frontend Express.js container
- **`backend/Dockerfile`** - Backend Go container
- **`docker-compose.yml`** - Local development with all services
- **`.dockerignore`** - Optimized builds

### ✅ Documentation
- **`DEPLOYMENT_PLAN.md`** - Complete 6-phase guide with all details
- **`DEPLOYMENT_ALTERNATIVES.md`** - Database options comparison
- **`DEPLOYMENT_OPTIONS_SUMMARY.txt`** - Quick reference table

### ✅ Configuration
- **`.env.example`** - Environment variables template

---

## Prerequisites Before Deployment

Before running the deployment script, ensure you have:

### 1. Google Cloud Account
- [ ] Create free Google Cloud account at https://console.cloud.google.com
- [ ] Enable billing (required for Cloud Run)
- [ ] Install gcloud CLI: https://cloud.google.com/sdk/docs/install

### 2. Neon Database Credentials
- [ ] Get connection string from Neon dashboard: https://console.neon.tech
- [ ] Format: `postgresql://user:password@project.region.neon.tech/database?sslmode=require`

### 3. API Keys
- [ ] **GOOGLE_CLIENT_ID** & **GOOGLE_CLIENT_SECRET** from Google Cloud Console
- [ ] **GOOGLE_GENAI_API_KEY** from Google AI Studio
- [ ] **OPENAI_API_KEY** (if using OpenAI features)

### 4. Local Tools
- [ ] Docker installed
- [ ] gcloud CLI installed and authenticated
- [ ] Git (for CI/CD setup)

---

## Deployment Steps

### Step 1: Prepare (5 minutes)
```bash
# Install gcloud CLI (if not installed)
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init

# Authenticate
gcloud auth login
```

### Step 2: Run Deployment Script (30 minutes)
```bash
# Make script executable
chmod +x QUICK_DEPLOY_NEON.sh

# Run deployment
./QUICK_DEPLOY_NEON.sh
```

The script will prompt for:
- Google Cloud Project ID
- Region (default: asia-south1 for India)
- Neon connection string
- API keys (Google OAuth, Gemini, OpenAI, JWT secret)

### Step 3: Verify Deployment (5 minutes)
```bash
# Check services
gcloud run services list --region=asia-south1

# Get URLs
gcloud run services describe prooftamil-frontend --region=asia-south1 --format='value(status.url)'
gcloud run services describe prooftamil-backend --region=asia-south1 --format='value(status.url)'

# Test frontend
curl https://prooftamil-frontend-xxxxx.run.app/

# Test backend
curl https://prooftamil-backend-xxxxx.run.app/health
```

### Step 4: Custom Domain (Optional)
```bash
# Map your domain
gcloud run domain-mappings create \
  --service=prooftamil-frontend \
  --domain=prooftamil.com \
  --region=asia-south1

# Follow DNS setup instructions in Cloud Run console
```

---

## Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| Cloud Run (Frontend) | $2-10 |
| Cloud Run (Backend) | $5-15 |
| Neon Database | $0-9 |
| Artifact Registry | ~$0.10 |
| **Total** | **$7-35** |

Free tier covers initial traffic. Auto-scales as needed.

---

## Continuous Deployment (After Initial Setup)

Once deployed, automatic deployments are enabled via GitHub Actions:

1. Push to `main` or `production` branch
2. GitHub Actions automatically:
   - Builds Docker images
   - Pushes to Artifact Registry
   - Deploys to Cloud Run
3. New version live in ~5 minutes

---

## Production Checklist

- [ ] Custom domain configured
- [ ] SSL/TLS enabled (automatic with Cloud Run)
- [ ] Environment variables set in Secret Manager
- [ ] Database backups enabled in Neon
- [ ] Monitoring and alerting configured
- [ ] CORS settings verified
- [ ] Rate limiting active
- [ ] Admin user (prooftamil@gmail.com) created
- [ ] Analytics dashboard accessible
- [ ] Payment webhooks configured (if using Stripe/Razorpay)

---

## Troubleshooting

### Issue: "gcloud not found"
```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
```

### Issue: "Permission denied"
```bash
# Ensure gcloud is authenticated
gcloud auth login
gcloud auth application-default login
```

### Issue: Docker build fails
```bash
# Ensure Docker is running
docker ps

# Check Docker installation
docker --version
```

### Issue: Neon connection fails
```bash
# Verify connection string format
echo "postgresql://user:pass@host/db?sslmode=require"

# Test connection locally first
psql "postgresql://user:pass@host/db?sslmode=require"
```

### Issue: High costs
- [ ] Reduce max-instances in deployment script
- [ ] Use smaller memory (256Mi frontend, 512Mi backend)
- [ ] Set up auto-scaling policies
- [ ] Review Neon usage: https://console.neon.tech

---

## Next Steps After Deployment

1. **Test Application**
   - Visit your frontend URL
   - Test login with Google OAuth
   - Create a draft and verify AI suggestions work
   - Check analytics dashboard

2. **Monitor Performance**
   - Check Cloud Logging for errors
   - Monitor latency and error rates
   - Review Neon performance metrics

3. **Optimize**
   - Enable caching if needed
   - Fine-tune database indexes
   - Adjust Cloud Run memory/CPU as needed

4. **Scale**
   - Monitor usage patterns
   - Adjust auto-scaling policies
   - Plan for database growth

---

## Support Resources

- **Google Cloud Run:** https://cloud.google.com/run/docs
- **Neon Documentation:** https://neon.tech/docs
- **Deployment Plan:** See `DEPLOYMENT_PLAN.md`
- **Database Comparison:** See `DEPLOYMENT_ALTERNATIVES.md`

---

## Important Notes

✅ **Database:** Using Neon PostgreSQL (same as development)  
✅ **Frontend:** Containerized Express.js application  
✅ **Backend:** Containerized Go application with Gin framework  
✅ **Auto-scaling:** Both services auto-scale based on traffic  
✅ **CI/CD:** GitHub Actions automates future deployments  
✅ **Cost:** Minimal starting cost, scales with usage  

**You're all set! Run `./QUICK_DEPLOY_NEON.sh` to deploy now.**

---

**Prepared:** November 21, 2025  
**Status:** Ready for Production Deployment  
**Estimated Time to Live:** 40 minutes (including setup)
