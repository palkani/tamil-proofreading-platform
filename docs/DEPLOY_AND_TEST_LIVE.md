# Deploy to Live and Test

## How deployment works

- **Push to `main`** (or run the workflow manually) triggers the GitHub Actions workflow **Deploy to Cloud Run + Vercel**.
- **Backend (Go)** is built and deployed to **Google Cloud Run**:
  - **Asia:** `prooftamil-backend` in `asia-south1` (Mumbai)
  - **US:** `prooftamil-backend-us` in `us-central1`
- **Frontend:** **express-frontend** is deployed to **Vercel** (prooftamil.com).

## Deploy steps

1. **Commit and push** all changes to `main`:
   ```bash
   git add -A
   git status   # review; exclude backend/build_lexicon if present
   git commit -m "Suggest engine: binary cache, fuzzy type, API shape, transliteration dropdown; TypeScript fixes; SUGGEST_MIN_LEN=1"
   git push origin main
   ```

2. **Watch the workflow:** GitHub → Actions → "Deploy to Cloud Run + Vercel". Wait until it completes (backend build, Cloud Run deploy, Vercel deploy).

3. **Backend URLs** (from the workflow or Cloud Console):
   - Asia: `https://prooftamil-backend-<hash>-asia-south1.run.app`
   - US: `https://prooftamil-backend-us-<hash>-us-central1.run.app`

## Test live

### 1. Backend health

```bash
# Replace with your actual Cloud Run URL (from workflow log or gcloud)
BACKEND_ASIA="https://prooftamil-backend-991187041222.asia-south1.run.app"
curl -s "$BACKEND_ASIA/health" | jq .
```

### 2. Suggest API (letter-by-letter)

```bash
# Single char (t)
curl -s "$BACKEND_ASIA/api/v1/suggest?q=t&limit=5" | jq .

# Prefix (thu, vanakkam)
curl -s "$BACKEND_ASIA/api/v1/suggest?q=thu&limit=5" | jq .
curl -s "$BACKEND_ASIA/api/v1/suggest?q=vanakkam&limit=5" | jq .
```

Expect: `success: true`, `input`, `suggestions` (word, score 0–1, type), `latency_ms`.

### 3. IME suggest (used by editor)

```bash
curl -s "$BACKEND_ASIA/api/v1/ime/suggest?q=vanakkam&limit=5" | jq .
```

### 4. Frontend (prooftamil.com)

- The **express-frontend** on Vercel proxies `/api/v1/*` to the Asia backend (see express-frontend/vercel.json rewrites).
- **Editor / workspace:** Open the site, type in the Tamil editor; suggestions should appear as you type (letter-by-letter if lexicon is loaded).
- **Next.js app:** If you deploy the Next.js frontend (e.g. a separate Vercel project), the **transliteration suggest demo** is at `/tools/transliteration-suggest`.

### 5. Cold start

- First request after idle may take a few seconds while the lexicon loads (up to ~10 min wait on startup). After that, suggest and IME should respond in &lt; 100 ms.

## Rollback

- Redeploy a previous commit: push a revert to `main` or re-run the workflow from a previous commit.
- Cloud Run keeps previous revisions; you can switch traffic in the console if needed.
