# Tamil Proofreading Platform – Architecture & Improvement Ideas

## Current Architecture Overview

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS (Browser)                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                    │                                    │
                    ▼                                    ▼
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Express Frontend (Node/EJS)  │         │  Next.js Frontend (React/TS)  │
│  Port 5000 • server.js       │         │  Port 3000 • App Router       │
│  - Home, workspace, editor   │         │  - Dashboard, submit, admin   │
│  - OCR, translit, auth proxy │         │  - Auth, payments, API client │
└──────────────────────────────┘         └──────────────────────────────┘
                    │                                    │
                    └────────────────┬───────────────────┘
                                     │ BACKEND_URL / api/v1
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Go Backend (Gin) – Port 8080                              │
│  - Auth (JWT, Google OAuth, refresh)                                            │
│  - Submissions, streaming, payments (Stripe/Razorpay), billing                    │
│  - IME/suggest (in-process + optional advanced service)                          │
│  - Transliteration, OCR proxy, blog, newsletter, contact, admin                  │
└─────────────────────────────────────────────────────────────────────────────────┘
        │                    │                    │                    │
        ▼                    ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │    │ Suggest Svc   │    │ ProofTamil   │    │ OCR Service  │
│  (GORM)      │    │ (Node/TS)    │    │ Runner       │    │ (Python/     │
│  Port 5432   │    │ Port 8081    │    │ (Python)      │    │  C++/Flask)  │
│  Users,      │    │ Optional     │    │ Translit/     │    │ Optional     │
│  submissions,│    │ ADVANCED_    │    │ IME API       │    │ OCR proxy    │
│  payments    │    │ SUGGEST      │    │ Cloud Run    │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### Components

| Component | Tech | Role |
|-----------|------|------|
| **Express frontend** | Node 18, Express, EJS | Main web UI: home, workspace, free editor, OCR tool page. Proxies API calls to Go backend. Can use Tesseract.js in-process or backend OCR proxy. |
| **Next.js frontend** | Next.js 14, React 19, TypeScript | Alternative app: dashboard, submit, payments, admin. Talks to same Go API. |
| **Go backend** | Go, Gin, GORM | Single API: auth, submissions (with streaming), payments/billing, IME/suggest, transliteration, OCR proxy, blog, newsletter, contact, admin. |
| **PostgreSQL** | Postgres 15 | Primary store: users, submissions, usage, payments, refresh tokens, Tamil words, suggestion limits, blog, newsletter, affiliates, billing. |
| **Suggest service** | Node/TypeScript | Optional microservice for advanced suggestions (trie, ranker, DB). Wired via `ADVANCED_SUGGEST_URL` and `USE_ADVANCED_SUGGEST`. |
| **ProofTamil Runner** | Python (FastAPI) | Transliteration + IME suggestions. Used when `AKSHARA_URL` / `TRANSLITERATOR_BASE_URL` is set. Often on Cloud Run. |
| **Aksharamukha runner** | Python | Alternative transliteration backend; can be used instead of or alongside ProofTamil Runner. |
| **OCR tool** | Python/Flask + C++ (pybind11) | Image/PDF → text (Tesseract). Can run standalone; Go backend can proxy uploads via `OCR_SERVICE_URL`. Express also has in-process Tesseract.js path. |

### Data Flow (Typical)

1. **User opens site** → Express (port 5000) or Next (port 3000).
2. **Auth** → Frontend calls `BACKEND_URL` (e.g. `/api/v1/auth/login`, Google callback). Go issues JWT + refresh cookie.
3. **Proofreading** → User submits text → `POST /api/v1/submit` → Go → LLM (Gemini primary, OpenAI fallback) → response streamed back; Go stores submission in Postgres.
4. **IME / suggestions** → Editor calls `GET /api/v1/ime/suggest` or `/transliterate/suggest` → Go uses in-process suggest engine + optional ProofTamil Runner (transliteration) and/or advanced suggest service.
5. **OCR** → User uploads image/PDF on OCR page → Express either uses Tesseract.js in-process or sends to backend → Go proxies to `OCR_SERVICE_URL` if set.
6. **Payments** → Stripe/Razorpay via Go; webhooks for verification; billing and usage in Postgres.

### Configuration (Important env vars)

- **Backend:** `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `GOOGLE_GENAI_API_KEY`, `AKSHARA_URL` / `TRANSLITERATOR_BASE_URL`, `OCR_SERVICE_URL`, `ADVANCED_SUGGEST_URL`, `USE_ADVANCED_SUGGEST`, `REDIS_URL` (optional).
- **Express frontend:** `BACKEND_URL` (Go API base, often with `/api/v1`), `SESSION_SECRET`, Google OAuth client IDs.
- **Docker Compose:** Single stack: `frontend` (Express), `backend` (Go), `suggest-service`, `db` (Postgres). OCR and ProofTamil Runner are not in this compose file.

---

## Improvement Ideas

### 1. **Unify or clearly split the two frontends**

- **Current:** Express (EJS) and Next.js (React) both exist; README and deployment focus on one “frontend” but Dockerfile builds Express.
- **Improve:** Either:
  - **Option A:** Pick one primary frontend (e.g. Express for prooftamil.com) and document Next.js as “dashboard/app” or deprecate it, **or**
  - **Option B:** Migrate all pages to Next.js and retire Express, so one stack (React, one API client, one deployment).
- Reduces confusion, duplicate auth flows, and duplicate maintenance (e.g. two places that call `/api/v1`).

### 2. **API versioning and OpenAPI**

- **Current:** Routes under `/api/v1`; no formal API spec.
- **Improve:** Add OpenAPI (Swagger) spec generated from Go (e.g. swaggo) or maintained by hand. Publish at e.g. `/api/v1/openapi.json`. Use it for:
  - Client codegen for frontend and mobile.
  - Contract tests and clearer onboarding for new devs.

### 3. **Backend: structure and dependencies**

- **Current:** Handlers are large (e.g. `process.go`, `transliteration_handlers.go`); some logic lives in handlers instead of services.
- **Improve:**
  - Move business logic into `internal/services/` and keep handlers thin (parse request → call service → write response).
  - Consider splitting by domain (e.g. `handlers/submission.go`, `handlers/ime.go`) and inject services via constructors for easier testing and reuse.

### 4. **Suggest and IME: clarify roles**

- **Current:** In-process suggest engine in Go, optional Node “suggest-service,” optional ProofTamil Runner (Python) for transliteration/IME. Multiple env flags (`AKSHARA_URL`, `ADVANCED_SUGGEST_URL`, `USE_ADVANCED_SUGGEST`).
- **Improve:**
  - Document when to use which (e.g. “Production IME: set TRANSLITERATOR_BASE_URL to ProofTamil Runner”).
  - If both Go trie and suggest-service exist, define a single “source of truth” (e.g. suggest-service for advanced, Go for fallback) and document the fallback order.
  - Optionally expose a small “capabilities” or “config” endpoint (e.g. `GET /api/v1/config`) that returns `{ ime: true, advancedSuggest: true, ocr: true }` so the frontend can toggle features without hardcoding.

### 5. **OCR: single path and ops**

- **Current:** Express can use Tesseract.js in-process or backend proxy to Python OCR service; Python service has C++ (pybind11) for heavy work. OCR not in main docker-compose.
- **Improve:**
  - Standardize on one production path: either “always backend proxy” or “always Express Tesseract.js,” and document the other as dev/fallback.
  - Add OCR service to docker-compose (and optional backend env) so local/prod parity is clear.
  - Keep the C++/pybind11 path for performance where the Python OCR service is used.

### 6. **Observability**

- **Current:** Logging and ad-hoc checks; health endpoints on backend and suggest-service.
- **Improve:**
  - Structured logging (e.g. JSON with request ID, user ID, duration) and one consistent log level (e.g. `LOG_LEVEL=info`).
  - Metrics: request count/latency per route (e.g. Prometheus middleware in Go), and optionally DB pool/Redis usage.
  - Tracing: add a simple request ID from gateway/frontend through backend and log it everywhere (you have `X-Request-ID` in CORS; ensure it’s used in logs and error responses).

### 7. **Security and robustness**

- **Current:** JWT, refresh cookies, rate limiting, CORS, body limit, sanitization. Secrets via env.
- **Improve:**
  - Rate limit by user ID (or API key) for authenticated routes, not only by IP.
  - Ensure all user-controlled input (file uploads, text) is validated and size-limited before calling external services (LLM, OCR).
  - Prefer a secrets manager (e.g. Google Secret Manager) over raw env in production, with env as fallback for local dev.

### 8. **Database and migrations**

- **Current:** GORM AutoMigrate plus custom migration helpers (blog, newsletter, affiliates, billing).
- **Improve:**
  - Move to versioned migrations (e.g. golang-migrate or Atlas) and run them in CI or on deploy; keep AutoMigrate only for local dev or phase it out.
  - Add read-only or read replicas for heavy read paths (e.g. submissions list, dashboard) if traffic grows.

### 9. **Deployment and environment**

- **Current:** Docker Compose for backend + suggest-service + db + Express frontend; Cloud Run (and similar) mentioned for backend/frontend.
- **Improve:**
  - Document one “recommended” production topology (e.g. Frontend → Backend → DB; optional Suggest, OCR, ProofTamil Runner as separate services).
  - Put sample env files (e.g. `.env.example`) in sync with `config.Load()` and document every variable (purpose, example, required/optional).
  - Consider a single `docker-compose.override.yml` or env file for local dev that includes OCR and ProofTamil Runner stubs or real services.

### 10. **Testing**

- **Current:** Some handler tests (e.g. IME), E2E and tool tests in express-frontend.
- **Improve:**
  - Unit tests for services (auth, billing, LLM response parsing, suggest normalization).
  - Integration tests for critical API flows (auth, submit, payment create/verify) against a test DB.
  - E2E smoke tests in CI for login → submit → view submission (using a test account and sandbox payments).

---

## Summary

- **Architecture:** Two frontends (Express + Next.js) → one Go backend → Postgres; optional suggest-service, ProofTamil Runner, and OCR service. Good separation of API vs UI; complexity is in multiple frontends and multiple optional backends (suggest, IME, OCR).
- **Improvements:** Unify or clearly split frontends, add OpenAPI and thinner handlers, clarify IME/suggest/OCR roles and config, improve observability and migrations, tighten security and testing. These can be done incrementally without a full rewrite.
