# Current Architecture & Where to Deploy the Backend

## Current Architecture (After Optimization)

```
                    Browser
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (single app)                                  │
│  Port 5000 • Vercel / Docker / Node                              │
│  Home, login, submit, dashboard, blog, OCR, tools, admin         │
│  Calls backend via NEXT_PUBLIC_API_URL (e.g. https://api.../api/v1) │
└─────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Go Backend (Gin) – Port 8080                                    │
│  Auth (JWT, Supabase Google, refresh), submissions, payments,   │
│  IME/suggest (in-process), transliteration, OCR proxy, blog      │
└─────────────────────────────────────────────────────────────────┘
        │                    │
        ▼                    ▼
┌──────────────┐    ┌──────────────────┐
│  Supabase    │    │  Optional        │
│  (Postgres)  │    │  ProofTamil / OCR │
│  + Auth      │    │  (Cloud Run etc.) │
└──────────────┘    └──────────────────┘
```

- **Frontend:** One Next.js app (root `Dockerfile` builds it). Deploy to **Vercel** (recommended) or any Node host; or run via Docker (e.g. `docker-compose`).
- **Backend:** Single Go API. All app logic and DB access live here. **You deploy this one service** (see below).
- **Database:** Supabase Postgres (you migrated). `DATABASE_URL` in the backend points to Supabase.
- **Optional:** ProofTamil Runner (IME/transliteration) via `AKSHARA_URL`; OCR service via `OCR_SERVICE_URL`. Not required for core flows.

The old Express frontend and Node suggest-service are no longer in the main path; the backend does not depend on them.

---

## Where to Deploy the Backend

You only need to deploy **one** backend (the Go app). Pick one of these.

### 1. Fly.io (recommended for cost)

- **Config:** `fly.toml` at repo root (builds from `backend/Dockerfile`).
- **Deploy from repo root:**
  ```bash
  fly launch   # first time: pick app name, region
  fly secrets set DATABASE_URL="postgresql://..." JWT_SECRET="..." \
    OPENAI_API_KEY="..." GOOGLE_GENAI_API_KEY="..." \
    SUPABASE_URL="https://....supabase.co" SUPABASE_JWT_SECRET="..."
  fly deploy
  ```
- **URL:** `https://<app-name>.fly.dev`. Set your frontend’s `NEXT_PUBLIC_API_URL` to `https://<app-name>.fly.dev/api/v1`.
- **Cost:** Free tier or low cost; good for pre-revenue.

**Deploy via GitHub Actions:** A workflow in `.github/workflows/deploy-fly.yml` deploys the backend to Fly on every push to `main` (when `backend/`, `fly.toml`, or the workflow file change), or on manual run. One-time setup:

1. Create the Fly app: `fly launch --no-deploy` (or `fly apps create tamil-api`).
2. Create a deploy token: `fly tokens create deploy -x 999999h` and copy the token (including the `FlyV1` prefix).
3. In GitHub: **Settings → Secrets and variables → Actions** → add secret **`FLY_API_TOKEN`** with that token.
4. Set Fly secrets on the app (e.g. `fly secrets set DATABASE_URL=...`); the workflow only runs `fly deploy`, it does not set secrets.

### 2. Google Cloud Run

- Build the backend image (e.g. from `backend/Dockerfile`), push to Artifact Registry, deploy as a Cloud Run service.
- Set env vars in the service: `DATABASE_URL` (Supabase), `JWT_SECRET`, `OPENAI_API_KEY`, `GOOGLE_GENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, etc.
- **URL:** e.g. `https://tamil-api-xxx.run.app`. Point `NEXT_PUBLIC_API_URL` to `https://tamil-api-xxx.run.app/api/v1`.

### 3. Railway / Render

- Connect repo, set **root** or **backend** as the service that runs the Go app (or use `backend/Dockerfile`).
- Add env vars in the dashboard (same as above).
- Use the generated URL for `NEXT_PUBLIC_API_URL` (e.g. `https://xxx.railway.app/api/v1` or Render URL).

### 4. Single server (VPS) with Docker Compose

- Use the repo’s `docker-compose.yml`: it runs **frontend** (Next.js), **backend** (Go), and **db** (Postgres). For production with Supabase, you can remove the `db` service and set `DATABASE_URL` to Supabase for the backend.
- Deploy the stack on one VM; backend is the `backend` service.

---

## Summary

| What            | Where it runs / deploys to                          |
|-----------------|-----------------------------------------------------|
| **Backend (Go)**| Deploy to **one** of: Fly.io, Cloud Run, Railway, Render, or your own server (e.g. Docker Compose). |
| **Frontend**    | Usually **Vercel** (Next.js); or same host via Docker. |
| **Database**    | **Supabase** (already migrated).                    |
| **Auth**        | Handled by **backend** (JWT + Supabase Google exchange). |

Backend env vars to set wherever you deploy: `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `GOOGLE_GENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`; plus Stripe/Razorpay and optional `AKSHARA_URL`, `OCR_SERVICE_URL`, `REDIS_URL` as needed.
