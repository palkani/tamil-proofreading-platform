# Local Testing Guide

Use one `.env` at the **project root** for local testing. The Express app loads it automatically via `dotenv`. The backend reads `backend/.env` (copy or symlink from root) or you can export the root `.env` into the shell before starting the backend (see Run steps below).

---

## 1. Create your local config

Copy the example and edit:

```bash
cp .env.example .env
```

Then set the variables below. **Required** = needed for the app to start or for that feature. **Optional** = feature works with defaults or is disabled.

---

## 2. Config by feature

### Required for backend to start

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/prooftamil_local?sslmode=disable` | Postgres connection. Backend will not become ready without this. |
| `JWT_SECRET` | `local-dev-jwt-secret` | Any non-empty string for local. |
| `REFRESH_TOKEN_SECRET` | `local-dev-refresh-secret` | Any non-empty string for local. |

### Required for Express (frontend) to talk to backend

| Variable | Example | Description |
|----------|---------|-------------|
| `BACKEND_URL` | `http://localhost:8080` | Backend base URL (no `/api/v1`). Express appends `/api/v1` when proxying. |
| `PORT` | `5000` or `3000` | Port for the Express server (default 3000). |
| `FRONTEND_URL` | `http://localhost:5000` | Origin where you open the app (for CORS). Match the port you use. |

### Auth (Google Sign-In)

| Variable | Example | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | From Google Cloud Console → APIs & Services → Credentials. |
| `GOOGLE_CLIENT_SECRET` | `xxx` | Same credential. |
| `GOOGLE_OAUTH_REDIRECT_DOMAIN` | `http://localhost:5000` | Must match where you run the frontend. |
| `BACKEND_URL` | `http://localhost:8080` | Backend URL; callback is `BACKEND_URL/api/v1/auth/google/callback`. |

**Google Console:** Add authorized redirect URI:

- `http://localhost:8080/api/v1/auth/google/callback` (if backend handles callback on 8080), or whatever your backend base URL is + `/api/v1/auth/google/callback`.

### AI proofreading (Grammar check / corrections)

| Variable | Example | Description |
|----------|---------|-------------|
| `GOOGLE_GENAI_API_KEY` | `AIza...` | Gemini API key (Express uses this for `/api/corrections`). |
| `OPENAI_API_KEY` | `sk-...` | Optional fallback if Gemini is rate-limited. |

Backend also uses `GOOGLE_GENAI_API_KEY` / `OPENAI_GENAI_API_KEY` for AI. **`POST /api/corrections`**: Express first proxies to the backend (Cloud Run) as `POST /api/v1/submit` with `save_draft: false` when `BACKEND_URL` is set, so you see the request in **Cloud Run logs**. If the proxy fails or `BACKEND_URL` is unset, Express falls back to calling Gemini directly (check **Vercel function logs** for that path). Ensure `BACKEND_URL` points to your Cloud Run URL (e.g. `https://prooftamil-backend-xxx.run.app/api/v1`) in Vercel so corrections hit Cloud Run.

### Suggestions (IME / transliteration)

No extra config required for basic use. Backend uses in-memory/built-in suggestions; Express has a built-in fallback when the backend is down or returns empty.

Optional:

| Variable | Example | Description |
|----------|---------|-------------|
| `LEXICON_FILE` | `./data/lexicon.json` | Backend: path to lexicon JSON for richer suggestions. |
| `REDIS_URL` | `redis://localhost:6379` | Backend: optional Redis for suggest cache. |

### Optional services (tools)

| Variable | Example | Description |
|----------|---------|-------------|
| `HANDWRITING_OCR_URL` | `http://localhost:8000` | Tamil Handwriting OCR service (Python). Omit to disable the tool. |
| `CONVERTER_API_URL` | `http://localhost:5001` | Document converter (e.g. DOCX). Used by Express. |
| `AI_WRITER_API_URL` | `http://localhost:5002` | AI Content Writer service. |

### Payments (optional for local)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key for payments. |
| `STRIPE_WEBHOOK_SECRET` | For Stripe webhooks. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | For Razorpay. |

### DB architecture migration (suggest: phonetic_variants, RPCs)

**Run from local only** (not from Cloud Run or CI). Ensures `phonetic_variants`, RPCs, and data exist so `SUGGEST_USE_DB` works.

From **backend** directory (with `DATABASE_URL` in `backend/.env` or in your shell):

```bash
cd backend && go run ./cmd/migrate
```

Or from project root: `set -a && source .env && set +a && cd backend && go run ./cmd/migrate`

### Other (optional)

| Variable | Example | Description |
|----------|---------|-------------|
| `RUN_MIGRATIONS` | `true` | Set to `true` on first run or after schema changes (backend). |
| `RUN_DB_ARCHITECTURE_MIGRATIONS` | `false` | Leave false; run DB architecture from local via `go run ./cmd/migrate` only. |
| `SUPABASE_URL` / `SUPABASE_JWT_SECRET` | — | Only if using Supabase Auth for Google sign-in. |

---

## 3. Minimal `.env` for local (copy-paste)

Save as `.env` in the **project root** and adjust DB and ports as needed:

```env
# ----- Required: Database (backend won't start without this) -----
DATABASE_URL=postgresql://prooftamil:localdev123@localhost:5432/prooftamil_local?sslmode=disable

# ----- Required: Backend + Frontend URLs -----
PORT=8080
FRONTEND_URL=http://localhost:5000
BACKEND_URL=http://localhost:8080

# ----- Required: Auth secrets (use any non-empty string for local) -----
JWT_SECRET=local-dev-jwt-secret-change-me
REFRESH_TOKEN_SECRET=local-dev-refresh-secret-change-me

# ----- Optional: Google Sign-In (leave empty to disable) -----
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_DOMAIN=http://localhost:5000

# ----- Optional: AI (needed for Grammar check / corrections) -----
GOOGLE_GENAI_API_KEY=
OPENAI_API_KEY=

# ----- Optional: Backend behaviour -----
RUN_MIGRATIONS=true
REDIS_URL=
LEXICON_FILE=

# ----- Optional: Extra tools -----
HANDWRITING_OCR_URL=http://localhost:8000
```

---

## 4. Run backend and frontend

### Option A: One `.env` at project root (recommended)

1. Create `.env` at the project root (as above).
2. **Backend** (must have Postgres running; first time set `RUN_MIGRATIONS=true`):

   The Go backend loads `.env` from its **current working directory** (`backend/.env`). So either:

   - **Copy root `.env` into backend:**  
     `cp .env backend/.env`  
     Then from **backend** directory:  
     `cd backend && go run ./cmd/server/main.go`

   - **Or** export root `.env` into the shell, then run backend (no copy):  
     From **project root**:  
     `set -a && source .env && set +a && cd backend && go run ./cmd/server/main.go`  
     (Backend will use the exported variables.)

   Backend will listen on `http://localhost:8080`.

3. **Express frontend** (in another terminal):

   From **project root**:

   ```bash
   cd express-frontend
   npm install
   node server.js
   ```

   The Express app loads `../.env` (project root) via `dotenv`, so one `.env` at root is enough. Set `PORT=5000` in `.env` if you want the app on port 5000.

### Option B: Separate env files

- **Backend:** Copy `.env` to `backend/.env` and run from `backend/`:

  ```bash
  cd backend && go run ./cmd/server/main.go
  ```

- **Express:** Copy `.env` to `express-frontend/.env` (or rely on loading `../.env`; see Option A). Then:

  ```bash
  cd express-frontend && node server.js
  ```

---

## 5. Database (Postgres) for local

If you use Docker:

```bash
docker run -d --name prooftamil-db \
  -e POSTGRES_USER=prooftamil \
  -e POSTGRES_PASSWORD=localdev123 \
  -e POSTGRES_DB=prooftamil_local \
  -p 5432:5432 \
  postgres:15-alpine
```

Then in `.env`:

```env
DATABASE_URL=postgresql://prooftamil:localdev123@localhost:5432/prooftamil_local?sslmode=disable
RUN_MIGRATIONS=true
```

---

## 6. Quick checklist

| Goal | Config / step |
|------|----------------|
| Backend starts | `DATABASE_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`; Postgres running; run from `backend/` with env loaded. |
| Open app in browser | `BACKEND_URL=http://localhost:8080`, `FRONTEND_URL=http://localhost:5000` (or your port), start Express. |
| Suggestions work | No extra config; backend or Express fallback. |
| Grammar check / corrections | `GOOGLE_GENAI_API_KEY` set (in `.env` used by Express). |
| Google Sign-In | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_DOMAIN`, redirect URI in Google Console. |
| Handwriting OCR tool | `HANDWRITING_OCR_URL=http://localhost:8000` and run the Python service. |

---

## 7. Ports summary

| Service | Default port | Env |
|---------|--------------|-----|
| Backend (Go) | 8080 | `PORT` |
| Express frontend | 3000 | `PORT` (in Express process) |
| Postgres | 5432 | In `DATABASE_URL` |
| Handwriting OCR | 8000 | `HANDWRITING_OCR_URL` |
| Document converter | 5001 | `CONVERTER_API_URL` |
| AI Content Writer | 5002 | `AI_WRITER_API_URL` |

Use `http://localhost:5000` (or whatever port you set for Express) to test all features locally.
