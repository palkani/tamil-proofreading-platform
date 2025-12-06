# Tamil AI Proofreading Platform

## Overview
This project is a full-stack AI-powered Tamil text proofreading platform designed to assist users in writing accurate and fluent Tamil. It offers features such as smart typing, phonetic transliteration, and detailed grammar explanations, aiming to be an "AI Writing Partner for Tamil that Shines." The platform targets a broad audience, providing a comprehensive solution for Tamil text refinement and correction.

## User Preferences
- Focus on workspace page enhancement
- **Authentication System:** Implemented two-version system:
  - **Without Login:** Only homepage accessible with Sign Up/Login buttons
  - **With Login:** Full access to Dashboard, Workspace, Archive, Account pages

## System Architecture
The platform utilizes a Go backend (port 8080) and an Express.js frontend with EJS templates (port 5000), designed for concurrent operation. API routes are prefixed with `/api`, with the backend proxying requests to the Go service.

**UI/UX Decisions:**
- **Professional Homepage Design:** Features a hero section, feature grid, interactive examples, grammar explanations, and an FAQ. An interactive editor with a 200-character limit is available for non-logged-in users.
- **Warm Orange/Coral Theme:** A consistent color scheme (`#ea580c`, `#f97316`, `#fb923c`) is applied across all UI elements.
- **Custom Tamil Logo:** A "தமிழ்" text logo is used throughout the site.
- **Responsive Design:** Implemented using Tailwind CSS.
- **AI Assistant Panel:** Displays AI suggestions.
- **Tamil Editor:** A rich text editor with a unified header, simplified toolbar, and a footer status bar.

**Technical Implementations & Feature Specifications:**
- **Tiered AI Model Workflow:** Supports advanced AI proofreading.
- **Phonetic Transliteration (In-Memory):** Fast English-to-Tamil transliteration using an in-memory lexicon with no external API calls. Response time <1ms. Returns up to 5 ranked suggestions with phonetic similarity and frequency-based scoring (70% similarity, 30% frequency weighting).
- **Lexicon-Based Lookup:** Loads Tamil lexicon from `data/tamil_lexicon.json` at startup with exact and prefix matching for instant lookups. Supports concurrent HTTP requests with thread-safe map access.
- **Enhanced Autocomplete System:** Provides smart, priority-based word suggestions backed by a PostgreSQL dictionary for millions of Tamil words, supporting prefix-based lookup and frequency-based ranking. Includes client-side caching with 300ms debounce.
- **Google-Style Tamil Typing:** Auto-converts English phonetic input to Tamil upon pressing the space bar.
- **Paste Conversion:** Automatically converts pasted English paragraphs to Tamil.
- **Draft Management:** Auto-saves drafts every 2 seconds to PostgreSQL and allows users to manage them from "My Drafts."
- **Reliable AI Grammar Checking:**
    - Catches specific Tamil grammar errors.
    - Optimized for performance with parallel processing, sentence-level chunking, and token optimization.
    - Uses Gemini 2.5 Flash model with `systemInstruction` and `responseMimeType: "application/json"`.
    - Configured for deterministic results (`temperature: 0`, `topP: 0.1`).
    - Provides error titles and descriptions exclusively in Tamil.
    - Spelling mistakes are underlined in the editor.
- **Authentication (Supabase):** Migrated from session-based auth to Supabase Auth with SSR support using `@supabase/ssr`. Features:
    - Email/password signup and login via Supabase
    - Google OAuth integration via Supabase
    - JWT-based authentication with automatic token refresh
    - Secure cookie-based session management
    - Password reset flow with email verification
    - Go backend JWT verification middleware using JWKS from Supabase
    - Session cleanup when Supabase tokens expire (security enhancement)
- **Analytics & Visitor Tracking:** Tracks page views and user activities in PostgreSQL, with an admin-only dashboard (`/analytics`) providing visualizations.
- **Backend API:** Provides endpoints for AI proofreading, draft persistence, and user management.
- **Frontend Controllers:** Vanilla JavaScript modules manage features.
- **CORS:** Configured for local development.
- **SEO Implementation:** Dynamic page-specific meta tags, centralized SEO configuration, `robots.txt`, dynamic XML sitemap, structured data (JSON-LD), and PWA support.
- **Smart AI Model Selection:** Uses `gemini-2.5-flash-lite` for short texts (<200 chars) and `gemini-2.5-flash` for longer texts.

## External Dependencies
- **Database:** PostgreSQL (Neon)
- **Hosting:** Google Cloud Run
- **CI/CD:** GitHub Actions
- **Domain:** prooftamil.com (Namecheap DNS)
- **AI Services:** Google Gemini (only for proofreading; transliteration is in-memory)
- **Styling:** Tailwind CSS
- **Backend Framework:** Gin (Go 1.23)
- **ORM:** GORM (PostgreSQL driver)
- **Frontend Framework:** Express 4.18 with EJS Templates
- **Email Service:** Resend API (for password reset)
- **Authentication Provider:** Supabase Auth (email/password + Google OAuth)

## Recent Updates (Dec 6, 2025)
- **Production Fixes & Node.js 20 Upgrade:**
  - Upgraded frontend Dockerfile from Node.js 18 to Node.js 20 (fixes Supabase deprecation warning)
  - Fixed PostgreSQL SSL certificate verification issues
  - Improved production environment detection in Supabase client
  - Added cookie domain configuration for `prooftamil.com`
  - Fixed API routing: Added explicit `/api/v1/transliterate` and `/api/proofread` endpoints
  - Added missing secrets to frontend deployment (GOOGLE_GENAI_API_KEY, DATABASE_URL)
  - Set `NODE_ENV=production` in Cloud Run deployment
  - Fixed session persistence across Cloud Run instances

## Previous Updates (Dec 4, 2025)
- **Enhanced Transliteration System:** Major improvements to transliteration autocomplete and word replacement:
  - Created shared `TransliterationHelper` class for consistent behavior across HomeEditor and TamilEditor
  - Implemented 300ms debouncing to prevent excessive API calls during rapid typing
  - Added request versioning with `fromCache` flag to prevent stale API responses from overwriting newer suggestions
  - Fixed caret handling for empty editors and non-text nodes (bold/italic formatted spans)
  - Implemented `execCommand`-based word replacement to preserve HTML formatting
  - Added fallback to local text node manipulation when global text search fails
  - Fresh caret info is now re-read after fetch to ensure proper dropdown positioning
  - Keyboard navigation (↑↓ arrows, Enter, Escape) and spacebar-to-commit functionality
  - Client-side caching reduces redundant API calls
- **Files Modified:**
  - `express-frontend/public/js/transliteration-helper.js` - Shared transliteration logic
  - `express-frontend/public/js/home-editor.js` - Enhanced with new helper integration
  - `express-frontend/public/js/editor.js` - Enhanced with new helper integration

## Previous Updates (Dec 3, 2025)
- **Supabase Auth Integration:** Complete migration from session-based auth to Supabase Auth with SSR support.
  - Added `@supabase/supabase-js` and `@supabase/ssr` packages
  - Created Express.js Supabase client helper (`express-frontend/lib/supabase.js`)
  - Created auth module with signup/login/logout/password reset (`express-frontend/lib/auth.js`)
  - Created Cloud Run API client with JWT token forwarding (`express-frontend/lib/cloudrunClient.js`)
  - Updated auth middleware for Supabase session validation with automatic cleanup on token expiry
  - Created Supabase JWT verification middleware for Go backend (`backend/internal/middleware/supabase_jwt.go`)
  - Updated login/register/reset-password pages to use Supabase auth
  - Created client-side Supabase helper (`express-frontend/public/js/supabaseClient.js`)
  - Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env.local`

## Previous Updates (Dec 1, 2025)
- **Fixed API Endpoint Mismatch:** Updated frontend API calls from `/api/transliterate` to `/api/v1/transliterate` in home-editor.js and editor.js (5 total occurrences) to match backend routes and eliminate 404 errors.
- **Fixed [object Object] Bug:** Corrected suggestion handling in frontend - API returns `{word: "...", score: ...}` objects, not strings. Updated renderSuggestions, insertSuggestion, transliterateFromInput, and transliterateFromKeypress to properly extract `.word` property.
- **Replaced Gemini Transliteration with In-Memory Lexicon:** Transliteration API now uses a local JSON lexicon for instant lookups (~0.3ms response time) instead of making expensive Gemini API calls (16-23s latency). Supports exact matching, prefix-based matching, and fuzzy matching with Levenshtein distance for typos and unknown words.
- **Fuzzy Matching Algorithm:** Implemented Levenshtein distance-based fuzzy matching as fallback when exact/prefix matches fail. Allows up to 2 edits for short words (≤6 chars) and 3 for longer words. Users now get suggestions even for typos or words not exactly in the lexicon.
- **Fixed Autocomplete Dropdown UI:** Enhanced editor to full-screen height (700px minimum on desktop) with larger text (2xl), improved autocomplete dropdown positioning, better error handling, and debug logging.
- **Expanded Tamil Lexicon:** Grew from 20 to 269 Tamil-English phonetic mappings with frequency scoring for relevance ranking.
- **Files Created:** 
  - `data/tamil_lexicon.json` - In-memory Tamil lexicon (269 entries with frequency weighting)
  - `backend/internal/translit/lexicon.go` - Lexicon loading and normalization
  - `backend/internal/translit/search.go` - Suggestion search algorithm (exact, prefix, and fuzzy matching)
  - `backend/internal/translit/handler.go` - HTTP handler for transliteration
- **Files Modified:**
  - `backend/cmd/server/main.go` - Added lexicon loading at startup
  - `backend/internal/handlers/transliteration_handlers.go` - Replaced Gemini calls with in-memory lookups
  - `express-frontend/views/pages/home.ejs` - Enlarged editor layout
  - `express-frontend/public/js/home-editor.js` - Fixed API endpoints, corrected object/string handling, and added better error handling
  - `express-frontend/public/js/editor.js` - Fixed API endpoint from /api/transliterate to /api/v1/transliterate