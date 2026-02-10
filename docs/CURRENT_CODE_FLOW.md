# Current Code Flow

## 1. High-level architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Browser (www.prooftamil.com)                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Vercel (express-frontend)                                                   │
│  • Pages: EJS views (login, workspace, drafts, blog, tools, …)               │
│  • Static: /js, /css, /images                                                │
│  • API: rewrites below                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │                              │                              │
         │ /api/v1/suggest               │ /api/v1/auth/google/callback  │ /api/v1/:path*
         │ /api/v1/ime/:path*            │ /api/:path* (rest)            │ (other API)
         ▼                              ▼                              ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────────────┐
│ api/v1/suggest.js │    │ api/index.js     │    │ Cloud Run Backend (Go)            │
│ (Edge function)  │    │ (Express routes) │    │ prooftamil-backend (asia-south1)  │
│ → backend suggest│    │ OAuth callback   │    │ prooftamil-backend-us (us-central1)│
└──────────────────┘    │ proxy, blog, …   │    └──────────────────────────────────┘
         │              └──────────────────┘                     │
         │                        │                              │
         └────────────────────────┼──────────────────────────────┘
                                  ▼
         ┌───────────────────────────────────────────────────────┐
         │  Cloud Run Backend (Go / Gin)                          │
         │  • /health, /api/v1/* (auth, suggest, transliterate,   │
         │    blog, newsletter, billing, submissions, …)           │
         └───────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
         ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
         │  Supabase    │  │  Redis       │  │  OpenAI /     │
         │  (Postgres + │  │  (optional   │  │  Google GenAI │
         │   Auth)      │  │   suggest)   │  │  (LLM)        │
         └──────────────┘  └──────────────┘  └──────────────┘
```

---

## 2. Vercel request routing (vercel.json rewrites)

| Request path | Destination | Notes |
|--------------|-------------|--------|
| `/api/v1/suggest` | **api/v1/suggest.js** (Edge) | Suggest; Edge calls backend with retry on 503 |
| `/api/v1/auth/google/callback` | **api/index.js** (Express) | OAuth callback; Express proxies to backend with retry on 503 |
| `/api/v1/ime/:path*` | **Cloud Run** (asia-south1) | IME API direct to backend |
| `/api/v1/:path*` | **Cloud Run** (asia-south1) | All other API v1 (auth, transliterate, blog, etc.) |
| `/api/:path*` | **api/index.js** | Legacy /api routes (transliterate/suggest.js, etc.) |
| `/workspace` | **api/index.js** | Workspace page |
| Everything else `(?!api/v1/)` | **api/index.js** | All pages (login, drafts, home, …) |

So:

- **Suggest (IME):** Browser → Vercel Edge `api/v1/suggest.js` → Cloud Run `/api/v1/suggest` (with 503 retries).
- **Google login:** Browser → Google → `www.prooftamil.com/api/v1/auth/google/callback` → Vercel `api/index.js` → Cloud Run `/api/v1/auth/google/callback` (with 503 retries).
- **Other API:** Browser or server → Vercel → Cloud Run `/api/v1/:path*`.

---

## 3. Backend (Go) startup flow

**File:** `backend/cmd/server/main.go`

1. **Config**  
   Load config (`config.Load()`), set Gin mode from env.

2. **Listen first (for Cloud Run probe)**  
   - Start HTTP server in a **goroutine** on `PORT` (default 8080).  
   - Use a **wrapper handler**:  
     - If `readyHandler` is set → forward to full Gin router.  
     - If not set → return **503** and `{"status":"starting"}` for **all** paths (including `/health`).  
   - So the process **binds to 8080 immediately**; Cloud Run’s TCP probe can pass, but until “ready” every request gets 503.

3. **Init (main goroutine)**  
   - DB connect (Postgres, up to 5 retries, 2s backoff).  
   - `db.AutoMigrate(...)` (User, TamilWord, Submission, Usage, Payment, RefreshToken, SuggestionLimit, SuggestionAcceptEvent, TamilBigram, TamilPhrase, BlogPost).  
   - Custom migrations (newsletter, affiliates, billing, etc.).  
   - `handlers.New(db, cfg)` → auth, IME, suggest engine, Tamil word cache, billing, etc.  
   - `initBillingHandlers(db, cfg)`.  
   - Build Gin router (CORS, security, routes).  
   - `readyHandler.Store(r)` → traffic is now served by the full app.  
   - `select {}` to block.

4. **Important**  
   Until `readyHandler` is set, **every** request (including GET `/health` and GET `/api/v1/health`) gets **503**. So if Cloud Run is configured with an **HTTP startup probe** on `/health`, the instance will not receive traffic until the app is ready.

---

## 4. Backend API routes (summary)

**Base:** `/api/v1` (e.g. `/api/v1/auth/login`, `/api/v1/suggest`).

| Group | Examples | Handler / purpose |
|-------|----------|-------------------|
| Health | `GET /health`, `GET /api/v1/health` | Always 200 when ready |
| Auth | `POST /auth/login`, `POST /auth/supabase-token`, `GET/POST /auth/google/callback`, refresh, whoami | auth_handlers |
| Suggest | `GET /suggest` | In-process suggest engine (handlers + internal/suggest) |
| Transliterate | `POST /transliterate`, `GET /transliterate/suggest` | transliteration_handlers |
| IME | `GET /ime/suggest` | ime_handlers (IME service + corpus) |
| Blog, newsletter, contact, analytics | Various | blog_handlers, newsletter_handlers, etc. |
| Submissions, payments, billing, admin, affiliate | Protected (JWT) or webhooks | submission_handlers, billing_handlers, etc. |

Suggest flow on backend:

- **GET /api/v1/suggest** → `h.Suggest` → `internal/suggest` (trie, ID tables, optional Redis, in-process).
- **GET /api/v1/transliterate/suggest** → `h.TransliterateSuggest` (transliteration suggest).
- **GET /api/v1/ime/suggest** → `h.IMESuggest` (IME service).

---

## 5. Frontend (Express) entry and routes

**Entry:** `express-frontend/app.js` → `server.js` (Vercel uses `api/index.js` for serverless).

- **ensureAppReadyMiddleware**  
  Waits for `initializeAppSecrets()` (e.g. GOOGLE_CLIENT_ID) except for OAuth callback and `/workspace` (they can run before ready).

- **Routers mounted in app.js / api:**  
  - `authRoutes` → `/auth/*` (login, logout, Google redirect).  
  - `indexRouter` → pages (home, login, drafts, blog, tools, …).  
  - `apiRouter` → `/api/*` (v1/suggest proxy, v1/auth/google/callback proxy, blog, newsletter, transliterate, etc.).  
  - `processRouter`, `workspaceRouter` → process and workspace.

**Important API proxies (routes/api.js):**

- **GET /v1/auth/google/callback**  
  Proxies to backend `BACKEND_URL/auth/google/callback` (with `x-oauth-handoff: json`). Retries on **503** (5 × 2s). On 200 JSON with `access_token`, forwards Set-Cookie and redirects to `/drafts?access_token=...`.

- **GET /v1/suggest**  
  Proxies to backend `BACKEND_URL/transliterate/suggest?...`. Retries on **503** (4 × 1s). If still 503, returns 200 with empty suggestions.

- **GET /ime/suggest**  
  Proxies to backend IME suggest (no 503 retry in the snippet; can be added similarly).

`BACKEND_URL` is derived from env `BACKEND_URL`: if it doesn’t end with `/api/v1`, `/api/v1` is appended (so backend paths are e.g. `.../api/v1/auth/google/callback`, `.../api/v1/transliterate/suggest`).

---

## 6. Suggest flow (end-to-end)

1. **Browser**  
   e.g. `workspace.js` or transliterator calls `GET /api/v1/suggest?q=na&limit=5&mode=spoken`.

2. **Vercel**  
   Rewrite sends this to **api/v1/suggest.js** (Edge).

3. **api/v1/suggest.js**  
   - Resolves backend by region (bom1 → asia-south1, iad1 → us-central1).  
   - Calls backend `GET .../api/v1/suggest?q=...&mode=...&limit=...`.  
   - On **503**: retries up to 4 times, 1s delay.  
   - If still 503: returns **200** with `{ success: true, suggestions: [], source: 'backend_starting' }`.  
   - Otherwise returns backend response (status and body).

4. **Backend**  
   When ready, **GET /api/v1/suggest** is handled by `h.Suggest` → in-process suggest engine (trie + ID tables, optional Redis).

So the “current flow” for suggest is: **Browser → Vercel Edge (suggest.js) → Cloud Run /api/v1/suggest**, with 503 retries and fallback to empty suggestions during backend startup.

---

## 7. Google OAuth flow

1. User clicks “Google” on **login** page.  
2. Frontend redirects to Google with `redirect_uri=https://www.prooftamil.com/api/v1/auth/google/callback`.  
3. User signs in; Google redirects to that URL with `?code=...`.  
4. **Vercel** rewrites to **api/index.js** (Express).  
5. **Express** route **GET /v1/auth/google/callback** proxies to backend `BACKEND_URL/auth/google/callback` (i.e. `.../api/v1/auth/google/callback`) with `x-oauth-handoff: json`, **retrying on 503** (5 × 2s).  
6. **Backend** exchanges `code` for tokens, creates/updates user, issues JWT pair, returns JSON `{ user, access_token, redirect: "/drafts" }` (and optionally Set-Cookie).  
7. **Express** forwards Set-Cookie and redirects browser to `/drafts?access_token=...`.

---

## 8. Deploy pipeline (GitHub Actions)

**File:** `.github/workflows/deploy.yml`

- **Trigger:** Push to `main` or `workflow_dispatch`.
- **Steps (single job):**
  1. Checkout, authenticate to GCP, configure Docker for Artifact Registry.  
  2. Go build precheck in `backend`.  
  3. Docker build backend image from `backend/Dockerfile`, push to `asia-south1` (and tag `latest`).  
  4. Deploy **prooftamil-backend** (Asia) and **prooftamil-backend-us** (US) to Cloud Run (env + secrets from repo / Secret Manager).  
  5. Verify backend health (both regions).  
  6. Optional: Python + corpus seed (Tamil Wikipedia).  
  7. Node, install frontend deps in `express-frontend`, build CSS.  
  8. Deploy **frontend** to **Vercel** (`vercel deploy --prod`).

So: **UI (Node/Express) → Vercel; OAuth & DB → Supabase; Backend (Go) → Cloud Run** (Asia + US). This is the current flow of code and deployment.
