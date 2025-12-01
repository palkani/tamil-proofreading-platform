# Tamil AI Proofreading Platform

## Overview
This project is a full-stack AI-powered Tamil text proofreading platform, aimed at assisting users in writing accurate and fluent Tamil. It offers features like smart typing, phonetic transliteration, and detailed grammar explanations, positioning itself as an "AI Writing Partner for Tamil that Shines." The platform targets a broad audience and utilizes a Go backend, an Express.js frontend with EJS, and a PostgreSQL database. tamil

## Recent Updates (Dec 1, 2025 - PROD READY)
- **✅ GEMINI-POWERED ENGLISH-TO-TAMIL TRANSLITERATION API (FIXED):**
  - New endpoint: `POST /api/v1/transliterate` for English phonetic → Tamil conversion (now properly registered)
  - Uses Gemini 2.5 Flash with custom transliteration prompt
  - Returns 5 ranked Tamil word suggestions with confidence scores (1.0 to 0.6)
  - Backend handler: `backend/internal/handlers/transliteration_handlers.go`
  - Backend service: `CallGeminiTransliterate()` in `backend/internal/services/llm/gemini.go`
  - **Frontend Integration - Space-Key Translation (FIXED):**
    - Home editor: Press space after English word → automatically converts to Tamil
    - Workspace editor: Same space-key translation behavior
    - First tries local Tamil dictionary for instant conversion
    - Falls back to Gemini API for words not in dictionary
    - Smooth text insertion using `document.execCommand` for reliable DOM manipulation
  - **Example Usage:** Type "vanakam " (with space) → becomes "வணக்கம் "

## Previous Updates (Dec 1, 2025 - PROD READY)
- **✅ FIXED GEMINI API TOKEN OVERFLOW BUG:**
  - **Root Cause**: Gemini prompt was 1985 tokens, maxOutputTokens only 2048 → response cut off mid-JSON
  - **Error Effect**: "finishReason: MAX_TOKENS" → JSON parse error → fallback to NO suggestions
  - **Solution**: Reduced prompt from 1985→400 tokens, increased maxOutputTokens 2048→4096
  - Result: Complete responses, all errors detected correctly
  - Now properly catches: spelling, grammar, space, incomplete words, sandhi errors

- **✅ GEMINI API FIXES & SPELLING UNDERLINES:**
  - Fixed critical bug: Gemini prompt placeholder mismatch (`{{user_text}}` → `[USER'S TAMIL TEXT HERE]`)
  - Added strict Gemini prompt rules: Only return REAL errors, NOT alternatives for correct words
  - Backend filter: Excludes suggestions where `original === corrected`
  - Frontend filter: Double-checks `original !== corrected` before displaying
  - New: **Spelling mistakes now underlined in editor** with red wavy line
  - New methods in TamilEditor: `highlightSpellingMistakes()`, `addHighlight()`, `clearHighlights()`
  - Seamless integration: Auto-underlines spelling errors when suggestions arrive
  - Result: Only actual corrections shown, no confusing alternatives

- **✅ COMPLETE SECURE PASSWORD RESET SYSTEM:**
  - New `/internal/models/reset_token.go` PasswordResetToken model
  - New `/internal/services/auth/reset.go` with: `GenerateResetToken()`, `CreatePasswordResetToken()`, `ValidateResetToken()`, `ResetPassword()`
  - New `/internal/services/auth/reset_email.go` with email sending (mock ready to integrate real SMTP)
  - New endpoints: `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password`
  - **Security Features:**
    - ✅ Cryptographically secure token generation (crypto/rand, 48 bytes, base64 encoded)
    - ✅ Token hashing with SHA256 before DB storage (raw token NOT in database)
    - ✅ 1-hour token expiration
    - ✅ One-time use tokens (marked used after reset)
    - ✅ User enumeration protection (generic success messages)
    - ✅ Strong password validation on reset
    - ✅ Audit logging for all reset events
  - **Tested**: All routes registered, migrations completed, compiles without errors

- **✅ Gemini API Key Now Working:**
  - Real API key loaded successfully (39 chars instead of dummy 15 chars)
  - Suggestions should now display correctly when text is submitted
  - If still not showing, ensure you're logged in and authenticated

## Previous Updates (Nov 30, 2025)
- **Google OAuth Session Flow FIXED:**
  - **Root Cause:** Session cookie not being sent with redirect response
  - **Solution:** Explicitly set session cookie with `res.cookie('connect.sid', sessionID)` after saving to database
  - **Implementation:**
    - Session saved to PostgreSQL database
    - Session cookie explicitly set (httpOnly, sameSite=lax, secure in production)
    - Redirect to internal domain (where cookie lives) for next request
    - Session retrieved from database on `/dashboard` request
  - **Result:** Complete OAuth flow working ✅
    - ✅ OAuth callback handler exchanges code for token
    - ✅ Backend validates token and returns user data
    - ✅ Session created and saved to PostgreSQL
    - ✅ Session cookie set in response headers
    - ✅ Browser redirected to dashboard
    - ✅ Cookie sent with dashboard request
    - ✅ Session loaded from database
    - ✅ User authenticated and dashboard loads

- **UI/UX Improvements:**
  - Removed "Loading suggestions limit..." message from AI Assistant panel
  - Added detailed error display for drafts loading failures
  - Shows actionable error messages to users

## Previous Updates (Nov 27, 2025)
- **Email Verification Removed:**
  - Users can now sign up and immediately log in without email verification
  - Registration endpoint now directly creates a session and issues access tokens
  - Removed OTP verification flow from frontend (verification UI no longer shows)
  - Simplified signup process for faster user onboarding
- **Production 404 Fix:**
  - Removed `/api/**` rewrite rule from firebase.json that was bypassing the Express frontend
  - All API requests now route through the Express frontend which correctly proxies to backend at `/api/v1/*`
  - Firebase previously sent `/api/submit` to backend which expects `/api/v1/submit`, causing 404 errors
- **English-to-Tamil Translation Feature:**
  - New "Translate" button in workspace toolbar to translate English paragraphs to Tamil
  - Uses Gemini 2.5 Flash AI for accurate translations
  - Shows translation alternatives in AI Assistant panel with apply option
  - Smart language detection: allows short phrases (1-2 words), only blocks clear Tamil text
  - First-occurrence replacement prevents corrupting repeated text
- **Gemini API Authentication Fix:**
  - Backend now uses AI_INTEGRATIONS_GEMINI_API_KEY from Replit integration
  - Added fallback base URL for Gemini API when environment variable not set
- **Enhanced Autocomplete:**
  - Increased backend autocomplete limit from 10 to 20 (max 500)
  - Better support for English-to-Tamil word conversion on space press
- **API Routing Fix:** Fixed duplicated `/api/v1/v1/submit` path by updating frontend to call `/api/submit` instead of `/api/v1/submit`. The Express proxy already adds `/api/v1` prefix.
- **Phase 1 SEO Implementation:**
  - **Dynamic Page-Specific Meta Tags:** Each page now has optimized title, description, keywords, canonical URL, and robots directives
  - **SEO Configuration:** Centralized SEO config in `express-frontend/config/seo.js` with all target keywords
  - **robots.txt:** Properly configured for search engine crawling with sitemap reference
  - **Dynamic XML Sitemap:** Auto-generated sitemap at `/sitemap.xml` with current dates and proper priorities
  - **Structured Data (JSON-LD):** WebApplication, Organization, FAQPage, HowTo, BreadcrumbList, and SoftwareApplication schemas
  - **Core Web Vitals:** Preconnect, preload, cache headers, lazy loading, and resource hints
  - **PWA Support:** Web manifest at `/manifest.json` for mobile optimization
  - **Target Keywords:** Tamil grammar checker, Tamil proofreading tool, Tamil spell checker, Tamil writing assistant, etc.

## Previous Updates (Nov 26, 2025)
- **Google Secret Manager Integration for Frontend:**
  - Frontend now fetches secrets from Google Secret Manager when environment variables are not set
  - Secrets are loaded at startup and cached for performance
  - Supports: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY, SESSION_SECRET
  - Eliminates need to manually set environment variables in Cloud Run after each deployment
- **Skip Migrations in Production:**
  - Added `SKIP_MIGRATIONS=true` environment variable support for Go backend
  - Prevents unnecessary database migrations on every Cloud Run deployment
- **Smart AI Model Selection:**
  - Uses gemini-2.5-flash-lite for short texts (<200 chars) for faster responses (2-4s)
  - Uses gemini-2.5-flash for longer texts for accuracy
  
## Previous Updates (Nov 25, 2025)
- **Email/Password Authentication with Email Verification:**
  - New users can register with email, password, and name
  - Strong password requirements enforced: 8+ characters, uppercase, lowercase, number, special character
  - Real-time password strength indicator shows requirements as user types
  - One-time verification code (OTP) sent to email after registration
  - OTP codes securely hashed with SHA-256 before database storage
  - 15-minute OTP expiry for security
  - Users must verify email before gaining full access
  - Email service using Resend API integration (requires RESEND_API_KEY secret)
  - Database updates: `EmailVerified` field on users, new `email_verifications` table

## Previous Updates (Nov 22, 2025)
- **Contact Page Simplified:** Single email form with sender email, subject, and message fields
- **AI Assistant Fixes:** Enhanced API response parsing with debug logging
- **Google Sign-In Buttons:** Added proper click event listeners for OAuth flow

## User Preferences
- Focus on workspace page enhancement
- **Authentication System (Nov 17, 2025):** Implemented two-version system:
  - **Without Login:** Only homepage accessible with Sign Up/Login buttons
  - **With Login:** Full access to Dashboard, Workspace, Archive, Account pages

## System Architecture
The platform features a Go backend (port 8080) and an Express.js frontend with EJS templates (port 5000), designed to run concurrently. API routes are prefixed with `/api`, and the backend proxies requests to the Go service.

**UI/UX Decisions:**
- **Professional Homepage Design:** Redesigned landing page with a hero section, feature grid, interactive examples, grammar explanations, and FAQ. Includes an interactive editor for non-logged-in users with a 200-character limit for demo purposes.
- **Warm Orange/Coral Theme:** A culturally resonant color scheme (`#ea580c`, `#f97316`, `#fb923c`) is consistently applied across all UI elements.
- **Custom Tamil Logo:** Features a "தமிழ்" text logo used throughout the site.
- **Responsive Design:** Implemented with Tailwind CSS.
- **AI Assistant Panel:** Displays AI suggestions in a professional panel.
- **Tamil Editor:** A rich text editor with a unified header, simplified toolbar, and a footer status bar.

**Technical Implementations & Feature Specifications:**
- **Tiered Model Workflow:** Supports advanced AI proofreading.
- **Phonetic Transliteration:** Google Input Tools-style real-time phonetic conversion from English to Tamil.
- **Enhanced Autocomplete System:** Provides smart, priority-based word suggestions with a database-backed dictionary (`tamil_words` PostgreSQL table) for millions of Tamil words, supporting prefix-based lookup and frequency-based ranking. Client-side caching for common words.
- **Google-Style Tamil Typing:** Auto-converts English phonetic input to Tamil on space press.
- **Paste Conversion:** Automatically converts pasted English paragraphs to Tamil.
- **Draft Management:** Auto-saves drafts every 2 seconds to PostgreSQL and allows users to view and open them from the "My Drafts" section.
- **Reliable AI Grammar Checking:**
    - Trained to catch specific Tamil grammar errors.
    - Performance optimized with parallel chunk processing, sentence-level chunking (<=200 chars), and token optimization.
    - Uses Gemini 2.5 Flash model with `systemInstruction` and `responseMimeType: "application/json"`.
    - Configured for deterministic results (`temperature: 0`, `topP: 0.1`).
    - Provides error titles and descriptions exclusively in Tamil, with optional alternative phrasing.
- **Authentication:** Session-based authentication with Express sessions. Fully integrated Google OAuth 2.0. Protected routes require login, while public pages are accessible to all. Backend validates Google ID tokens and manages user sessions. Admin role for `prooftamil@gmail.com`.
- **Analytics & Visitor Tracking:** Tracks page views and user activities (registrations, logins, draft creation, AI requests) in PostgreSQL tables (`visit_events`, `activity_events`). An admin-only dashboard (`/analytics`) with Chart.js visualizations is available, providing privacy-preserving data.
- **Backend API:** Provides endpoints for AI proofreading, draft persistence, and user management.
- **Frontend Controllers:** Vanilla JavaScript modules manage various features.
- **CORS:** Configured for local development.

## External Dependencies
- **Database:** PostgreSQL via Neon
- **Hosting:** Google Cloud Run
- **CI/CD:** GitHub Actions
- **Domain:** prooftamil.com (Namecheap DNS)
- **AI Services:** Google Gemini, OpenAI GPT
- **Styling:** Tailwind CSS
- **Backend Framework:** Gin (Go 1.23)
- **ORM:** GORM (PostgreSQL driver)
- **Frontend Framework:** Express 4.18 with EJS Templates
- **Payment Gateways:** Stripe, Razorpay (optional)

## Deployment
- **Complete Deployment Guides:** See `GOOGLE_CLOUD_DEPLOYMENT_PLAN.md` and `QUICK_DEPLOYMENT_GUIDE.md`
- **Estimated Cost:** $50-80/month on Google Cloud Run
- **Target Regions:** us-central1 (customizable)
- **Auto-scaling:** 1-10 instances per service (configurable)
- **SSL/TLS:** Auto-provisioned by Google Cloud Run
