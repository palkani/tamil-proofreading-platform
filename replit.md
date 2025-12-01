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
- **Phonetic Transliteration:** Real-time English-to-Tamil phonetic conversion using Gemini AI, offering 5 ranked suggestions.
- **Enhanced Autocomplete System:** Provides smart, priority-based word suggestions backed by a PostgreSQL dictionary for millions of Tamil words, supporting prefix-based lookup and frequency-based ranking. Includes client-side caching.
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
- **Authentication:** Session-based authentication with Express sessions and integrated Google OAuth 2.0. Includes a secure password reset system with token generation, hashing, expiration, and one-time use.
- **Analytics & Visitor Tracking:** Tracks page views and user activities in PostgreSQL, with an admin-only dashboard (`/analytics`) providing visualizations.
- **Backend API:** Provides endpoints for AI proofreading, draft persistence, and user management.
- **Frontend Controllers:** Vanilla JavaScript modules manage features.
- **CORS:** Configured for local development.
- **SEO Implementation:** Dynamic page-specific meta tags, centralized SEO configuration, `robots.txt`, dynamic XML sitemap, structured data (JSON-LD), and PWA support.
- **Smart AI Model Selection:** Uses `gemini-2.5-flash-lite` for short texts (<200 chars) and `gemini-2.5-flash` for longer texts.
- **Transliteration API:** Uses `gemini-2.0-flash-lite` for fast phonetic transliteration with comprehensive logging, proper error handling (400 for invalid input, 500 for API failures), and a 40-character input limit.

## External Dependencies
- **Database:** PostgreSQL (Neon)
- **Hosting:** Google Cloud Run
- **CI/CD:** GitHub Actions
- **Domain:** prooftamil.com (Namecheap DNS)
- **AI Services:** Google Gemini
- **Styling:** Tailwind CSS
- **Backend Framework:** Gin (Go 1.23)
- **ORM:** GORM (PostgreSQL driver)
- **Frontend Framework:** Express 4.18 with EJS Templates
- **Email Service:** Resend API (for password reset)