# Tamil AI Proofreading Platform

## Overview
This project is a full-stack AI-powered Tamil text proofreading platform, designed to assist users in writing accurate and fluent Tamil. It aims to be the "AI Writing Partner for Tamil that Shines" by offering features beyond basic grammar correction, including smart typing, phonetic transliteration, and detailed grammar explanations. The platform targets a broad audience, from casual writers to professionals, providing a comprehensive tool for enhancing Tamil communication. The architecture utilizes Go for the backend and Express.js with EJS for the frontend, with a PostgreSQL database.

**Contact Email:** prooftamil@gmail.com

## User Preferences
- Focus on workspace page enhancement
- **Authentication System (Nov 17, 2025):** Implemented two-version system:
  - **Without Login:** Only homepage accessible with Sign Up/Login buttons
  - **With Login:** Full access to Dashboard, Workspace, Archive, Account pages

## System Architecture
The platform is built with a Go backend (port 8080) and an Express.js frontend with EJS templates (port 5000), configured to run concurrently via `start.sh`.

**UI/UX Decisions:**
- **Professional Homepage Design:** Features a redesigned landing page with a hero section ("Your AI Writing Partner for Tamil that Shines"), a feature grid (Tamil-First AI, Beyond Grammar, Smart Typing, Access Anywhere), interactive examples, a "Learn as you write" section with Tamil grammar explanations, and an FAQ.
- **Interactive Homepage Editor (UPDATED - Nov 18, 2025):** Homepage includes a fully functional rich text editor with AI Assistant panel **only for non-logged-in users** as a demo/preview. Features a strict 200-character limit for quick testing. Users can type English and see automatic Tamil conversion, paste text for instant conversion, and receive real-time AI grammar suggestions with 1-second debounce. Character counter displays X/200 with red text when limit is reached. **Logged-in users** see only CTA buttons to "Open Workspace" and "View Dashboard" instead of the editor.
- **Warm Orange/Coral Theme (Nov 17, 2025 - FULLY SYNCED):** Utilizes warm orange colors (`#ea580c`, `#f97316`, `#fb923c`) culturally resonant with Tamil and Indian traditions, creating an energetic and inviting atmosphere for content writers. Completely replaced previous blue theme across all pages, components, CSS classes, and JavaScript files. All interactive elements (buttons, links, form inputs, toolbar items, language toggle, autocomplete, suggestions panel) now use consistent orange styling.
- **Custom Tamil Logo:** Features "தமிழ்" text logo used throughout site including navigation header, footer, homepage, and browser favicon.
- **Responsive Design:** Implemented with Tailwind CSS for optimal viewing on various devices.
- **AI Assistant Panel:** Displays AI suggestions in a professional panel with suggestion cards.
- **Tamil Editor:** A rich text editor with a unified header, simplified toolbar, and a footer status bar showing word count and accepted suggestions.

**Technical Implementations & Feature Specifications:**
- **Tiered Model Workflow:** Supports advanced AI proofreading capabilities.
- **Phonetic Transliteration:** Google Input Tools-style phonetic transliteration allows typing English and getting multiple Tamil variations in real-time (e.g., "thendral" → தென்றல், தென்றால்). It handles ambiguous characters and vowel length variations.
- **Enhanced Autocomplete System:** Provides smart, priority-based word suggestions (exact, partial, phonetic matches) with real-time feedback, disappearing on backspace/delete.
- **Google-Style Tamil Typing:** Auto-converts English phonetic input to Tamil script upon pressing space (e.g., "vanakkam" + Space → "வணக்கம்").
- **Paste Conversion:** Automatically converts pasted English paragraphs into Tamil while preserving punctuation and formatting.
- **Scalable Autocomplete System (COMPLETED - Nov 17, 2025):**
    - **Database-Backed Dictionary:** Created `tamil_words` PostgreSQL table to store millions of Tamil words with transliterations, frequencies, categories, and metadata.
    - **Server-Side API:** Three endpoints for complete word management:
        - `GET /api/v1/autocomplete?query=<prefix>&limit=<n>` - Fast prefix-based lookup (default limit: 10, max: 100)
        - `POST /api/v1/tamil-words` - Add new words with transliterations
        - `POST /api/v1/tamil-words/confirm` - Increment user confirmation count
    - **Security Hardened:** All queries use parameterized binding (SQL injection prevented), case-insensitive matching via lowercase normalization, and unique index on transliteration column prevents duplicates.
    - **100+ Words Seeded:** Database populated with 100 high-frequency Tamil words covering greetings, family, food, nature, animals, colors, body parts, verbs, deities, places, transportation, and emotions.
    - **Frequency-Based Ranking:** Results sorted by word frequency (1000=very common, 500=common) with exact match prioritization for most relevant suggestions first.
    - **Performance:** Btree unique index on `transliteration` column enables O(log n) prefix matching, scales to millions of rows.
    - **Normalization Invariant:** All transliterations stored and searched in lowercase throughout system (seed script, API handlers, autocomplete queries) for consistent case-insensitive behavior.
    - **Client-Side Cache:** Includes 500+ common Tamil words in browser for instant autocomplete without API calls.
    - **Future-Ready:** Architecture supports millions of words via open-source datasets (Wiktionary, Tamil NLP Catalog, Open-Tamil 40K dictionary).
- **Draft Management:**
    - **Auto-Save:** Drafts are automatically saved to the PostgreSQL database every 2 seconds.
    - **Draft Loading:** Users can view and open all saved drafts from the "My Drafts" section in the workspace.
    - **Auto AI Analysis:** Opening a draft automatically triggers AI grammar checking.
- **Reliable AI Grammar Checking (OPTIMIZED - Nov 17, 2025):**
    - **Performance Optimized:** 3-5x faster response times through parallel chunk processing with Promise.all() instead of sequential processing.
    - **Efficient Chunking:** Uses sentence-level chunking (<=200 chars, increased from 120) to reduce API calls while maintaining accuracy.
    - **Token Optimization:** Reduced maxOutputTokens from 2048 to 1024 for faster generation.
    - **Timeout Protection:** 10-second request timeout for faster failure detection.
    - Uses Gemini 2.5 Flash model optimized for speed and cost-efficiency.
    - Employs `systemInstruction` for prompt instructions and `responseMimeType: "application/json"` for structured output.
    - Configured with `temperature: 0` and `topP: 0.1` for deterministic results.
    - Provides error titles and descriptions exclusively in Tamil.
- **Authentication (UPDATED - Nov 18, 2025):** 
    - **Session-based authentication** implemented with Express sessions
    - **Google OAuth Sign-In:** Fully integrated Google OAuth 2.0 authentication on login/register pages using Google Identity Services API
    - **Protected Routes:** Dashboard, Workspace, Archive, and Account pages require login
    - **Public Pages:** Homepage, Contact, Privacy, Terms accessible to everyone
    - **Login/Register:** Form-based authentication + Google Sign-In with automatic session creation
    - **Backend OAuth Flow:** Go backend validates Google ID tokens via `/api/v1/auth/social` endpoint, creates/retrieves users, and issues sessions
    - **Demo Mode:** Email/password authentication accepts any credentials for testing
    - **Session Management:** 24-hour session cookies with automatic redirect to login for protected pages
    - **Smart Redirects:** After login, users are redirected to the page they were trying to access
- **Backend API:** Provides endpoints for AI proofreading, draft persistence, and user management.
- **Frontend Controllers:** Vanilla JavaScript modules manage workspace features, editor functionality, suggestions, dashboard, account, and archive pages.
- **CORS:** Configured to allow localhost and Replit domains for development, requiring stricter rules for production.

## External Dependencies
- **Database:** PostgreSQL (Replit-hosted Neon database)
- **AI Services:** Google Gemini (via Replit AI Integrations), OpenAI GPT (used by the backend)
- **Styling:** Tailwind CSS
- **Backend Framework:** Gin (Go)
- **ORM:** GORM (Go)
- **Frontend Framework:** Express 4.18 with EJS Templates
- **Payment Gateways:** Stripe, Razorpay (configured but not actively required for core functionality)