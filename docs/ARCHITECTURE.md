# ProofTamil — Architecture & User Flows

**Scope:** Every user-facing scenario. Admin console covered separately in `docs/INFRA_LOAD_BALANCER_DESIGN.md` + `docs/PROOFREAD_ACCURACY.md`.

**Last updated:** 2026-07-11 · reflects head of `main`.

---

## 1. One-paragraph summary

ProofTamil is an AI-powered Tamil writing platform. A Node/Express+EJS frontend runs on Vercel (`www.prooftamil.com`); a Go/Gin backend runs on Google Cloud Run in two regions (`asia-south1` primary, `us-central1` warm standby); Postgres lives on Supabase; Gemini 2.5 (flash-lite / flash / pro tiers) handles proofreading with per-tier model routing. Free-tier users get flash-lite/flash with a 30/day AI-check quota; Pro users get flash/pro with unlimited checks and DOCX/PDF/TXT export. Anonymous demo works without login. Payments run through Dodo Payments with webhook-driven subscription lifecycle plus a 3-touch email drip for abandoned checkouts.

---

## 2. Tech stack

| Layer | Technology | Where |
|---|---|---|
| **Frontend host** | Vercel (Serverless Functions + Static) | `www.prooftamil.com` |
| **Frontend framework** | Express 4 + EJS templates | `express-frontend/` |
| **Frontend CSS** | Tailwind CSS 3 (`build:css` on deploy) | `express-frontend/public/css/` |
| **Client JS** | Vanilla ES6, no framework | `express-frontend/public/js/` |
| **Backend runtime** | Go 1.23 + Gin | `backend/cmd/server/` |
| **Backend host** | Google Cloud Run × 2 regions | `prooftamil-backend` / `prooftamil-backend-us` |
| **Database** | Supabase Postgres via pgBouncer pooler | GORM ORM |
| **AI** | Google Gemini 2.5 (flash-lite / flash / pro) | REST via `services/llm/gemini.go` |
| **OAuth** | Supabase Auth (Google identity provider) | Token exchange → app JWT |
| **App auth** | Custom JWT (HS256), access + refresh cookies | 15-min access / 7-day refresh |
| **Payments** | Dodo Payments (subscription billing) | Standard Webhooks + REST |
| **Email** | Resend (primary) + SendGrid (fallback) | `services/email/` |
| **OCR** | Tesseract — client (tesseract.js) + server (Python microservice) | Optional `OCR_SERVICE_URL` |
| **Observability** | Cloud Run logs + `ai_requests` + `activity_events` DB tables | Grep-friendly structured logs |
| **RUM** | Microsoft Clarity + Vercel Speed Insights | Client script tags |

---

## 3. Deployment topology

```
                      DNS: www.prooftamil.com
                            │
                            ▼
                ┌────────────────────────┐
                │  Vercel Edge / CDN     │  ── Serves static assets, edge fns
                │  (global anycast)      │      (/api/v1/suggest at edge)
                └───────────┬────────────┘
                            │
                            ▼
                ┌────────────────────────┐
                │  Express App           │  ── SSR EJS pages + /api/* proxies
                │  (Vercel serverless)   │      Geo-routes to nearest backend
                └────┬─────────────┬─────┘
                     │             │
     Asia users ─────┘             └───── Americas/EU users
                     │                    │
                     ▼                    ▼
      ┌──────────────────────┐   ┌──────────────────────┐
      │ Cloud Run            │   │ Cloud Run            │
      │ prooftamil-backend   │   │ prooftamil-backend-us│
      │ asia-south1 (Mumbai) │   │ us-central1 (Iowa)   │
      │ min=1, max=100       │   │ min=1, max=100       │
      └──────────┬───────────┘   └──────────┬───────────┘
                 │                          │
                 └───────────┬──────────────┘
                             │
                             ▼
              ┌───────────────────────────┐
              │  Supabase Postgres        │  ── Shared DB, connection pooled
              │  (pgBouncer transaction)  │
              └───────────────────────────┘

External APIs (from Cloud Run):
  ─→ Gemini API (generativelanguage.googleapis.com)
  ─→ Dodo Payments REST + webhook receiver
  ─→ Resend / SendGrid for transactional email
  ─→ (optional) Self-hosted Tesseract OCR service
```

**Region selection** — Vercel's Express layer reads `x-vercel-ip-continent` and picks `BACKEND_URL_ASIA` vs `BACKEND_URL_US`. See `express-frontend/utils/regional-backend.js`. (Note: there's a design proposal in `docs/INFRA_LOAD_BALANCER_DESIGN.md` to replace this with a single GCP Global Load Balancer.)

---

## 4. Data model (key tables)

Only the tables that show up in user flows below.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Every account (free, pro, admin) | email, password_hash, subscription (`free`/`pro`/`basic`/`enterprise`), country_code, dodo_customer_id, premium_override, token_version, marketing_unsubscribed_at |
| `submissions` | Every proofread draft | user_id, title, original_text, original_html, proofread_text, suggestions (jsonb), status (pending/completed/failed), model_used, cost, archived |
| `draft_groups` | Folders for organizing drafts | user_id, name, sort_order |
| `subscriptions` | Dodo subscription records | user_id, provider_subscription_id, status, current_period_end, plan_code |
| `payments` / `invoices` | Payment history | user_id, amount_cents, currency, provider |
| `checkout_attempts` | Every Dodo checkout intent | user_id, plan_code, provider_subscription_id, started_at, completed_at, reminder1_sent_at, reminder2_sent_at, reminder3_sent_at |
| `usage` | Per-request token/cost tracking | user_id, submission_id, word_count, token_count, date |
| `ai_requests` | Per-Gemini-call observability | user_id, model, status, latency_ms, cost_micros, tokens |
| `activity_events` | Per-user timeline for audit | user_id, event_type, metadata (jsonb), occurred_at |
| `refresh_tokens` | Server-side refresh token records | user_id, token_hash, expires_at, revoked_at |
| `password_reset_tokens` | Password reset flow | user_id, token_hash, expires_at, used |
| `blog_posts` | AI-generated + hand-crafted blog content | user_id, title, slug, content_html, content_text, status (draft/published), language |
| `plans` / `fx_rates` | Pricing config | code, base_price_usd, india_multiplier, currency |

---

## 5. Auth architecture

Two identity paths land users at the same JWT session.

### 5.1 Email + password
```
Client → POST /api/v1/auth/register {email, password, name}
       ← 200 {access_token cookie + refresh_token cookie + JSON tokens}

Client → POST /api/v1/auth/login {email, password}
       ← 200 {access_token cookie + refresh_token cookie}
```

Backend hashes with bcrypt, stores in `users.password_hash`, issues:
- **Access token** — HS256 JWT, 15-min TTL, encodes `user_id`, `email`, `role`, `token_version`
- **Refresh token** — random 48-byte value, hashed & stored in `refresh_tokens` table, wrapped in an encrypted cookie (`proof_refresh_token`, 7-day TTL, `HttpOnly + Secure + SameSite=None`)

### 5.2 Google OAuth via Supabase
```
Client → Supabase Auth UI (Google button)
       → Google OAuth → Supabase issues access_token
       → Redirect to /auth/callback with token in hash
Client → POST /auth/supabase-token {access_token}
       → Backend verifies via JWKS (or SUPABASE_JWT_SECRET fallback)
       → EnsureOAuthUser(email, name) — looks up by email, creates if missing
       ← 200 {app JWT cookies}
```

### 5.3 Refresh flow
```
Client's access_token expires (15 min)
Any /api/v1/* request → 401
Auth-utils.js intercepts, calls POST /api/v1/auth/refresh with refresh cookie
Backend validates hash against refresh_tokens, issues new access + refresh pair
Rotates refresh token (old one revoked)
```

**Anonymous** users have no cookie, no session. Backend endpoints that accept anonymous (demo submit, blog, suggest) don't require auth.

---

## 6. Tier + model routing

```
                     User submits text
                            │
                            ▼
                   backend/handlers/submission_handlers.go
                            │
                            ▼
              billing.IsUserPro(db, userID)  ← single source of truth
              (respects PremiumOverride + email allowlist + paid sub)
                            │
                            ▼
              llm/llm_service.go: selectOptimalModel(text, wordCount, isPro)
                            │
              ┌─────────────┴──────────────┐
              │                            │
       Free tier                       Pro tier
              │                            │
    ┌─────────┴──────────┐       ┌────────┴─────────┐
    │  short (<250w)     │       │  short (<250w)   │
    │  → flash-lite       │       │  → flash          │
    │  ($0.075/M in)     │       │  ($0.30/M in)    │
    │                    │       │                  │
    │  long (≥250w)      │       │  long (≥250w)    │
    │  → flash            │       │  → pro            │
    │  ($0.30/M in)      │       │  ($1.25/M in)    │
    └────────────────────┘       └──────────────────┘
```

**Per-user daily limits:**
- Anonymous: 10 AI checks
- Free (signed in): 30 AI checks
- Pro/Basic/Enterprise/Admin: unlimited

**Server-side retries** for Gemini (in `llm_service.go`): 2 attempts with 350ms→800ms backoff for `503` and network transients (EOF, connection reset). If both fail, falls back to OpenAI/Anthropic if configured, otherwise returns fallback inline corrections.

---

## 7. User flows

### 7.1 Anonymous demo (no login)

```
1. Visitor lands on www.prooftamil.com (SSR EJS page)
2. Pastes Tamil text into the homepage demo editor
3. Frontend POST /api/submit {text, save_draft:false}
   ← Vercel Express proxies to Cloud Run
4. Backend:
   - Word count ≤ 200 (free tier limit)
   - selectOptimalModel(text, wc, isPro=false) → flash-lite or flash
   - Calls Gemini directly, streams parsed corrections
   - Logs to ai_requests (user_id NULL — anonymous)
   - Records to anonymous_submission_events for admin analytics
5. Response: {success, request_id, corrections}
6. Client renders corrections inline in the demo editor
7. Localstorage counter bumps: pt_sug_anon.count++
   Anon daily limit: 10. Beyond that → "Sign up" upsell card.

Nothing persisted to submissions table for anonymous.
Draft/save/export CTAs prompt signup.
```

### 7.2 Signup (email/password) → email verification

```
1. Landing → /signup → email + password + name form
2. POST /api/v1/auth/register
   Backend:
   - Bcrypt hash password
   - INSERT users (subscription='free', email_verified=false)
   - Generate 6-digit OTP → INSERT email_verifications
   - Send verification email via Resend/SendGrid
   - Issue JWT cookies (immediately logged-in, will nag to verify)
   ← 200 + cookies
3. Client redirected to /verify-email
4. User types OTP → POST /api/v1/auth/verify-email {otp}
   Backend:
   - Compare hash, mark users.email_verified=true
   - Log activity_events (event_type=register)
5. Client redirected to /workspace

Google OAuth signup skips 2 & 4 — Google already verified email.
```

### 7.3 Workspace — the core proofreading flow

**The heart of the product.** User is logged in, opens `/workspace`.

```
1. Page load
   - Server-side: /workspace route renders workspace.ejs
     - Injects window.USER_LOGGED_IN, USER_EMAIL, USER_PLAN=free (default)
   - Client-side workspace.js:
     - _fetchUserPlan IIFE fires:
       - Admin allowlist fast-path: if USER_EMAIL is admin, _isProCache=true immediately
       - Else fetches /api/v1/billing/usage/today (with retry-on-503 backoff)
         → Sets _isProCache from usage.is_pro
     - Doc-export.js reads plan-pill text OR /billing/usage/today (mirrors)
     - Pro pill in header paints (green "Pro" or grey "Free · N/M used today")
     - Quota bar in AI Assistant hides for Pro users, shows "N AI checks left today" for Free

2. User types or pastes Tamil text
   - Paste event → queuePasteAnalyze():
     - Wait 300ms for DOM to settle
     - await this.autosave()         ← saves BEFORE analyze (data safety)
     - Extend pasteSuppressUntil for 3s (prevent race with subsequent edits)
     - Fire this.autoAnalyze({silent:true}) → SSE via Express proxy
     - PARALLEL: awaitSubmissionResult(submissionId) — subscribes to backend SSE

3. Autosave (POST /api/submit save_draft:true)
   - Frontend gates: text.length ≥ 5 AND wordCount ≥ 5
   - Sends {text, submission_id?, model, save_draft:true}
   - Backend:
     - Auth check (admin allowlist bypasses word-limit)
     - Reserves daily token quota
     - If submission_id: UPDATE existing row (with empty-overwrite guard)
     - Else: CREATE new row → returns 202 with submission_id
     - Background goroutine: processSubmission()
       - selectOptimalModel(text, wc, isPro) → flash-lite/flash/pro
       - Calls Gemini with retry (2 attempts, backoff)
       - Parses corrections, stores in submissions.suggestions (jsonb)
       - Marks status=completed
       - Broadcasts result via streamHub on /api/v1/submissions/{id}/stream
       - Logs to ai_requests (cost, latency, tokens)
       - Logs activity_events (event_type=ai_request)

4. Frontend receives corrections
   - Via SSE (Express /api/corrections/stream) — real-time
   - AND via backend SSE (/api/v1/submissions/{id}/stream) — from persistent job
   - Whichever arrives first renders in AI Assistant panel
   - Corrections mapped through _renderInlineCorrections helper (unified pipeline)

5. User accepts a suggestion
   - onApply() replaces `original` with `corrected` in editor text
   - Schedules autosave after 500ms
   - handleSuggestionAccepted() bumps accepted counter

6. Save-status indicator (top-right)
   - state machine: initial → draft → gated → saving → saved → partial | error
   - "Save failed" pill shows red with auto-retry after 3s
```

### 7.4 Export flow (Pro-gated)

```
1. User clicks Export button (top-right of workspace header)
2. Dropdown opens showing:
   - EXPORT AS label
   - Pro Feature banner (Free tier only)
   - 3 format rows: Word (.docx), PDF (.pdf), Plain Text (.txt)
     - Free tier: lock icons + muted labels
     - Pro tier: unlocked, clickable
   - Upgrade to Pro CTA (Free tier only)

3. Pre-export check (ensureDraftPersisted):
   - Fire one final autosave() to make sure DB has latest content
   - Read #save-status[data-state]
   - If not saved: confirm() "draft not saved to My Drafts, download anyway?"

4. Free tier click → redirect to /pricing
   Pro tier click → format-specific handler:

   Word: POST /api/document/export-docx {html, text, title, plan}
         Backend: validates Pro tier (402 if not), builds DOCX via docx lib
                  Streams .docx blob back
         Client: creates <a download> and clicks it

   PDF:  Opens hidden iframe → sets HTML → window.print()
         User picks "Save as PDF" in browser dialog
         Rendering via native browser fonts — Tamil renders perfectly

   TXT:  Pure client-side. Blob([text], {type:'text/plain'}) → download
         Zero server round-trip.
```

### 7.5 Draft management

**Drafts page** (`/drafts`) — lists all `submissions` where `user_id = current AND archived = false`.

```
1. GET /drafts
   - Express renders drafts.ejs with `requireAuth` gate (redirects to /login)
   - Client fetches GET /api/v1/submissions?limit=1000&offset=0
   - fetchSubmissionsWithRetry — up to 5 attempts with exponential backoff
     to bridge Cloud Run cold-starts
2. User clicks a draft row → GET /workspace?draft={id}
   - workspace.js loads that submission via GET /api/v1/submissions/{id}
   - Prefills editor + title, subscribes to SSE for latest suggestions
3. User can rename inline (PATCH /api/v1/submissions/{id} {title})
4. User can move to a draft-group (PATCH /api/v1/submissions/{id} {group_id})
5. Archive: PUT /api/v1/submissions/{id}/archive
   - Sets archived=true, archived_at=now()
   - 7-day retention, then cleaned up by hourly cron
6. Restore: PUT /api/v1/submissions/{id}/unarchive
7. Permanent delete: DELETE /api/v1/submissions/{id}
   - Nullifies FK in usage table, then Unscoped().Delete()
```

### 7.6 Upgrade to Pro — Dodo Payments flow

```
1. User on Free plan clicks Upgrade (from workspace pill, from export CTA,
   from /pricing page)
2. Client → GET /pricing → pricing.ejs
   - Reads plans, shows India-localized pricing (INR fixed price) or USD
3. User picks Pro Monthly → POST /api/v1/billing/checkout-session {plan_code, success_url, cancel_url}
   Backend:
   - Refuses if user already has active/trialing subscription on same plan
     (avoids double-billing)
   - Calls Dodo REST to create subscription checkout
   - INSERT checkout_attempts (user_id, plan_code, provider_subscription_id, started_at)
   - Returns {checkout_url}
4. Client redirects to Dodo hosted checkout
5. User completes payment on Dodo's page
6. Dodo webhook → POST /api/v1/billing/webhook (Standard Webhooks HMAC verified)
   Backend:
   - Records PaymentEvent for idempotency
   - subscription.active event:
     - Creates/updates subscriptions row
     - Updates users.subscription='pro', users.subscription_end
     - Marks checkout_attempts.completed_at (stops drip)
     - Bumps users.token_version → invalidates existing JWTs
   - payment.succeeded event:
     - Creates invoice + payment row
     - Fetches Dodo tax invoice PDF (via Dodo REST)
     - First-time Pro users: sends bilingual welcome email with invoice PDF attached
       (sets users.pro_welcomed_at to prevent re-send on renewals)
7. Client redirected to success_url (typically /workspace with a success flash)
8. Next request: old JWT rejected due to token_version mismatch → refresh → new Pro JWT
```

### 7.7 Abandoned checkout — 3-touch email drip

```
User creates a checkout attempt but never completes payment.

Every 15 minutes, checkout_followup_service.RunHourlyLoop:
  Touch 1 (~1h after start):
    Query checkout_attempts WHERE started_at BETWEEN 1h AND 6h ago
      AND completed_at IS NULL
      AND reminder1_sent_at IS NULL
    For each row:
      - Skip if user has active subscription (converted via another checkout)
      - Skip if user.marketing_unsubscribed_at set
      - Skip if user email empty
      - Send bilingual Tamil-first "warm nudge" email (touch1 template)
      - Include one-click resume link (HMAC-signed 14-day token)
      - Include one-click unsubscribe link (HMAC-signed 1-year token)
      - Stamp reminder1_sent_at = now()

  Touch 2 (~24h): same pattern with reminder1 as prerequisite, "social proof" copy
  Touch 3 (~72h): same pattern with reminder2 as prerequisite, "no pressure" copy

User clicks Resume link → GET /checkout/resume?token=<HMAC>
  Backend verifies token → recreates fresh Dodo session → redirects to Dodo

User clicks Unsubscribe link → GET /email/unsubscribe?token=<HMAC>
  Backend verifies token → sets users.marketing_unsubscribed_at = now()
  Renders confirmation page

Runs only on one region (RECONCILIATION_ENABLED=true env var gates it)
to avoid duplicate sends across the two Cloud Run regions.
```

### 7.8 Login → password reset

```
Forgot password link → /forgot-password
Client → POST /api/v1/auth/forgot-password {email}
Backend:
  - Generate random 48-byte token
  - INSERT password_reset_tokens with SHA-256 hash
  - Email link https://.../reset-password?token=<raw>
  - Rate-limit: 1 per email per 5 min

User clicks link → /reset-password?token=X (renders form)
Client → POST /api/v1/auth/reset-password {token, new_password}
Backend:
  - Validate hash matches, not expired, not used
  - Bcrypt hash new password → UPDATE users
  - Mark token used
  - Bump token_version → invalidates all existing JWTs
  - Log activity_events (event_type=password_reset)
Client redirected to /login
```

### 7.9 Voice typing

```
1. User clicks mic button in workspace toolbar
2. Client uses browser SpeechRecognition API (webkit) with language=ta-IN
3. Continuous listening, streams interim + final results
4. Final results appended to editor via TamilEditor.setText or insertText
5. autosave() debounces just like typed input

No backend involvement — 100% client-side Web Speech API.
```

### 7.10 OCR — image to text

```
1. User clicks Import → picks image (PNG/JPG/PDF)
2. Two paths depending on env config:

   Server-side (when OCR_SERVICE_URL is set):
     Client → POST /api/v1/ocr/upload {file}
     Vercel Express proxies to Go backend /api/v1/ocr/upload
     Go backend proxies to $OCR_SERVICE_URL/upload
       (self-hosted Python + Tesseract + poppler on Cloud Run)
     Returns {text, confidence, language}
     Client injects text into editor

   Client-side fallback (when OCR_SERVICE_URL empty):
     Tesseract.js runs entirely in browser (WASM, 5-10s for typical image)
     Uses eng+tam language pack (loaded from CDN once, cached)
     Same output shape
```

### 7.11 Document import (Word/PDF/TXT)

```
1. User clicks Import → picks .docx / .pdf / .txt
2. Client parses in-browser:
   - .docx: mammoth.js → HTML → editor
   - .pdf: pdf.js → per-page text extraction → editor
   - .txt: direct FileReader → editor
3. Triggers autosave() once text lands in editor
```

### 7.12 Blog reading (public)

```
GET /blog (public)
  Express reads:
    - File-based posts from express-frontend/data/blog/*.md (YAML frontmatter)
    - DB-backed posts from GET backend /blog/posts (status=published)
  Merges + sorts by date DESC
  Renders blog-index.ejs

GET /blog/:slug (public)
  1. Check file-based posts first (fileBlog.getPostBySlug)
  2. If not found, fetch DB post from backend GET /blog/posts/:slug
  3. Render blog-post.ejs with content_html + OG tags

GET /blog/rss.xml (public)
  Same merge, renders RSS 2.0 XML

Cached by Vercel edge (Cache-Control: public, max-age=300).
```

### 7.13 AI content writer (public)

```
1. User visits /ai-content-writer (public — no login required)
2. Fills prompt + language + tone + word count
3. Client → POST /api/ai-content-writer/generate-content {prompt, language, ...}
   Express proxies to Go backend
   Backend calls Gemini with content-writer prompt (different from proofread)
   Returns {content, meta_description, keywords}
4. Client renders generated content in preview
5. Logged-in admin users can click "Publish as blog" — routes to /api/blog/publish
6. Anonymous users can copy the content or share
```

### 7.14 Cancel subscription

```
1. User → /account/billing → shows current plan + Cancel button
2. POST /api/v1/billing/cancel
3. Backend calls Dodo REST cancel-at-period-end
4. Dodo webhook subscription.updated arrives → status='canceled', current_period_end kept
5. User retains Pro access until current_period_end
6. Cron / next login after that date: subscription flips to 'free'
7. renewal_service.RunDailyLoop sends 7-days-before-expiry reminder email
```

---

## 8. Backend request lifecycle (any authenticated endpoint)

```
Browser
  │ [access_token cookie + Authorization: Bearer <access_token>]
  ▼
Vercel Express router
  │ (auth middleware: decodes JWT for req.user, non-blocking)
  │ (regional-backend middleware: picks req._backendUrl from geo header)
  ▼
axios POST to https://<cloud-run>/api/v1/<endpoint>
  │ (forwards cookies + Authorization header verbatim)
  ▼
Cloud Run (Go/Gin)
  │ AuthMiddleware(JWTSecret): validates HS256 signature,
  │   checks token_version matches users row, populates c.user_id
  ▼
Handler
  │ 1. Read c.user_id
  │ 2. billing.IsUserPro(db, userID) if plan-gated
  │ 3. Fire-and-forget goroutines:
  │      h.activityLogger.Log(userID, event_type, metadata)
  │      h.aiLogger.Log(observability.AIRequestLog{...})
  ▼
GORM → pgBouncer → Supabase Postgres
```

**Key global middleware:**
- CORS: currently `AllowOrigins: ["*"]` (see design doc for LB migration proposal to tighten)
- Rate limiter: per-IP for public endpoints
- Request-ID injection: every request gets a `X-Request-ID` (or generated one) that threads into all logs
- Audit log: structured JSON to stderr for auth/billing events

---

## 9. Client-side data-flow (workspace paste example)

```
Editor DOM: user pastes text
  │
  ▼
paste event → queuePasteAnalyze(source='paste')
  │
  │  (300ms wait for DOM to settle)
  │
  ▼
await this.autosave()
  │
  │  ┌── Local guard: text.length < 5? → set 'draft' pill, RETURN
  │  ├── Local guard: wc < MIN_SUBMIT_WORDS? → set 'gated' pill, RETURN
  │  ├── POST /api/submit {text, save_draft:true, submission_id?}
  │  │      (via authUtils.apiFetch with Bearer + cookie)
  │  ├── On 200: currentDraft = data.submission; pill='saved'
  │  ├── On backend fallback (message includes "temporarily unavailable"):
  │  │      pill='error'; _renderInlineCorrections(data.corrections)
  │  ├── On 401: pill='session-expired'; wait for auth refresh
  │  ├── On 503 or transient: silent auto-retry in 3s
  │  └── currentDraft.id now known
  │
  ▼
extend pasteSuppressUntil = now + 3s (prevent race with subsequent edits)
  │
  ├── awaitSubmissionResult(currentDraft.id, seq)  ← subscribes to backend SSE
  │      /api/v1/submissions/{id}/stream
  │      resolves with corrections when backend Gemini job completes
  │      → _renderInlineCorrections(corrections)
  │
  └── this.autoAnalyze({silent:true})  ← independent path
         /api/corrections/stream
         Express Gemini SSE proxy
         first path to arrive with corrections wins the render

AI Assistant panel:
  suggestionsPanel.clearSuggestions()
  suggestionsPanel.addSuggestions(dedupedCorrections)
  → renders sticky cards; user clicks Accept:
      onApply: replace all occurrences of `original` with `corrected` in editor
      _applySaveTimeout: 500ms → autosave() again with updated text
```

---

## 10. Observability

**Structured logs** (Cloud Run stderr, greppable):
- `[SUBMIT] Error creating submission: user_id=X word_count=Y err_class=Z ...`
- `[GEMINI-RETRY] attempt=N code=... backoff=350ms request_id=...`
- `[MODEL-SELECT] Pro/long → pro (chars=..., words=...)`
- `[AUTH] set refresh_token cookie domain=.prooftamil.com secure=true samesite=None`
- `[SUPABASE-AUTH] token_verify_failed err=...`

**Metrics tables** (Supabase):
- `ai_requests` — every Gemini call: model, cost_micros, latency_ms, tokens, status, error_type. Powers the admin dashboard.
- `activity_events` — every user action: login/logout/register/draft_create/draft_update/draft_delete/ai_request/suggestion_accept/suggestion_reject. Powers the admin activity page.

**Background crons** (only on one region, gated by `RECONCILIATION_ENABLED`):
- `renewal_service.RunDailyLoop` — sends pre-renewal emails 7 days before Pro expiry
- `reconciliation_service.RunHourlyLoop` — diffs users.subscription vs subscriptions.status, alerts on drift
- `checkout_followup_service.RunHourlyLoop` — 15-min ticker for the 3-touch abandoned-checkout drip

**Client-side telemetry:**
- Microsoft Clarity (session recording + heatmaps)
- Vercel Speed Insights (Core Web Vitals RUM)
- Console warnings/errors captured but not shipped to a service

---

## 11. Key files map

| Concern | File |
|---|---|
| Backend entry | `backend/cmd/server/main.go` |
| Auth handlers | `backend/internal/handlers/auth_handlers.go` |
| Submission flow | `backend/internal/handlers/submission_handlers.go` |
| Gemini prompt | `backend/internal/services/llm/gemini.go` |
| Model routing | `backend/internal/services/llm/llm_service.go` (selectOptimalModel) |
| Pro status | `backend/internal/services/billing/pro_status.go` |
| Dodo integration | `backend/internal/services/billing/dodo_adapter.go` |
| Drip emails | `backend/internal/services/billing/checkout_followup_service.go` |
| Schema safety | `backend/internal/migrations/ensure_core_schema.go` |
| Frontend entry | `express-frontend/create-app.js` + `server.js` |
| Workspace UI | `express-frontend/views/pages/workspace.ejs` |
| Workspace logic | `express-frontend/public/js/workspace.js` |
| Export dropdown | `express-frontend/public/js/doc-export.js` |
| Auth helpers | `express-frontend/public/js/auth-utils.js` |
| Regional routing | `express-frontend/utils/regional-backend.js` |
| File-based blog | `express-frontend/data/blog/*.md` + `utils/fileBlog.js` |

---

## 12. What lives outside this doc

- **Admin console** — `docs/INFRA_LOAD_BALANCER_DESIGN.md` (routing), earlier commits for individual admin pages
- **Accuracy methodology** — `docs/PROOFREAD_ACCURACY.md`
- **Team plan spec** — `docs/TEAM_PLAN_SPEC.md`
- **Blog cron generator** — `express-frontend/scripts/BLOG_CRON_README.md`
- **OCR setup** — `express-frontend/README_OCR_SETUP.md`
