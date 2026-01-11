# OCR Tool Setup Guide

## Current Status
The OCR tool is integrated into the ProofTamil platform, but requires the OCR service to be running separately.

## Issue
The OCR service URL (`OCR_SERVICE_URL`) defaults to `http://localhost:5000`, which is not available in production (Vercel). This causes the upload endpoint to return HTML error pages instead of JSON.

## Solutions

### Option 1: Deploy OCR Service to Cloud Run (Recommended)

1. **Build and deploy OCR service:**
```bash
cd services/ocr-tool
gcloud builds submit --tag asia-south1-docker.pkg.dev/prooftamil/docker-repo/ocr-service
gcloud run deploy ocr-service \
  --image asia-south1-docker.pkg.dev/prooftamil/docker-repo/ocr-service \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --port=5000
```

2. **Set environment variable in Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add: `OCR_SERVICE_URL=https://ocr-service-xxx.asia-south1.run.app`

### Option 2: Run OCR Service Locally (Development)

1. **Install dependencies:**
```bash
cd services/ocr-tool
pip install -r requirements.txt
```

2. **Install system dependencies:**
```bash
# Ubuntu/Debian
sudo apt-get install -y tesseract-ocr tesseract-ocr-tam tesseract-ocr-eng poppler-utils

# macOS
brew install tesseract poppler tesseract-lang
```

3. **Run the service:**
```bash
python ocr_web_app.py
```

4. **Set environment variable:**
```bash
export OCR_SERVICE_URL=http://localhost:5000
```

### Option 3: Implement OCR Directly in Express (Future)

For a simpler deployment, we could integrate OCR processing directly into the Express app using a Node.js OCR library, eliminating the need for a separate Python service.

## Testing

1. Navigate to `/tools/ocr`
2. Upload an image or PDF
3. Select language (English + Tamil recommended)
4. Click "Extract Text"
5. Verify text extraction works

## Troubleshooting

### Error: "OCR service is not available"
- **Cause**: `OCR_SERVICE_URL` is not set or service is not running
- **Fix**: Deploy OCR service and set `OCR_SERVICE_URL` environment variable

### Error: "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"
- **Cause**: OCR service returned HTML error page instead of JSON
- **Fix**: Check OCR service is running and `OCR_SERVICE_URL` is correct

### Error: "Cannot connect to OCR service"
- **Cause**: OCR service is down or URL is incorrect
- **Fix**: Verify service is running and URL is accessible

## Environment Variables

Required in Vercel/Production:
- `OCR_SERVICE_URL`: URL of the OCR service (e.g., `https://ocr-service-xxx.run.app`)

Optional:
- `NODE_ENV`: Set to `production` for production environment

