# Tamil AI Proofreading Platform

## Overview
This project is a full-stack AI-powered Tamil text proofreading platform, designed to assist users in writing accurate and fluent Tamil. It aims to be the "AI Writing Partner for Tamil that Shines" by offering features beyond basic grammar correction, including smart typing, phonetic transliteration, and detailed grammar explanations. The platform targets a broad audience, from casual writers to professionals, providing a comprehensive tool for enhancing Tamil communication. The architecture utilizes Go for the backend and Express.js with EJS for the frontend, with a PostgreSQL database.

## User Preferences
- User requested removal of login requirement for easier testing
- Focus on workspace page enhancement

## System Architecture
The platform is built with a Go backend (port 8080) and an Express.js frontend with EJS templates (port 5000), configured to run concurrently via `start.sh`.

**UI/UX Decisions:**
- **Professional Homepage Design:** Features a redesigned landing page with a hero section ("Your AI Writing Partner for Tamil that Shines"), a feature grid (Tamil-First AI, Beyond Grammar, Smart Typing, Access Anywhere), interactive examples, a "Learn as you write" section with Tamil grammar explanations, and an FAQ.
- **Consistent Blue Theme:** Utilizes `#3b82f6` for a professional and consistent look across all sections.
- **Responsive Design:** Implemented with Tailwind CSS for optimal viewing on various devices.
- **AI Assistant Panel:** Displays AI suggestions in a professional panel with suggestion cards.
- **Tamil Editor:** A rich text editor with a unified header, simplified toolbar, and a footer status bar showing word count and accepted suggestions.

**Technical Implementations & Feature Specifications:**
- **Tiered Model Workflow:** Supports advanced AI proofreading capabilities.
- **Phonetic Transliteration:** Google Input Tools-style phonetic transliteration allows typing English and getting multiple Tamil variations in real-time (e.g., "thendral" → தென்றல், தென்றால்). It handles ambiguous characters and vowel length variations.
- **Enhanced Autocomplete System:** Provides smart, priority-based word suggestions (exact, partial, phonetic matches) with real-time feedback, disappearing on backspace/delete.
- **Google-Style Tamil Typing:** Auto-converts English phonetic input to Tamil script upon pressing space (e.g., "vanakkam" + Space → "வணக்கம்").
- **Paste Conversion:** Automatically converts pasted English paragraphs into Tamil while preserving punctuation and formatting.
- **Scalable Autocomplete System (NEW - Nov 17, 2025):**
    - **Database-Backed Dictionary:** Created `tamil_words` PostgreSQL table to store millions of Tamil words with transliterations, frequencies, categories, and metadata.
    - **Server-Side API:** Added `/api/v1/autocomplete` endpoint for fast prefix-based word lookup using indexed queries.
    - **100+ Words Seeded:** Database populated with 100 high-frequency Tamil words covering common phrases, names, food, nature, animals, colors, body parts, verbs, deities, places, transportation, and emotions.
    - **Frequency-Based Ranking:** Results sorted by word frequency (1000=very common, 500=common) for most relevant suggestions first.
    - **Client-Side Cache:** Includes 500+ common Tamil words in browser for instant autocomplete without API calls.
    - **Future-Ready:** Architecture supports millions of words via open-source datasets (Wiktionary, Tamil NLP Catalog, Open-Tamil 40K dictionary).
- **Draft Management:**
    - **Auto-Save:** Drafts are automatically saved to the PostgreSQL database every 2 seconds.
    - **Draft Loading:** Users can view and open all saved drafts from the "My Drafts" section in the workspace.
    - **Auto AI Analysis:** Opening a draft automatically triggers AI grammar checking.
- **Reliable AI Grammar Checking:**
    - Uses sentence-level chunking (<=120 chars) for consistent error detection.
    - Employs `systemInstruction` for prompt instructions and `responseMimeType: "application/json"` for structured output.
    - Configured with `temperature: 0` and `topP: 0.1` for deterministic results.
    - Provides error titles and descriptions exclusively in Tamil.
- **Authentication:** Currently uses mock authentication for testing (user_id=1) with JWT authentication commented out for development ease; this needs to be re-enabled for production.
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