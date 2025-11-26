# Tamil AI Proofreading Platform

## Overview
This project is a full-stack AI-powered Tamil text proofreading platform, aimed at assisting users in writing accurate and fluent Tamil. It offers features like smart typing, phonetic transliteration, and detailed grammar explanations, positioning itself as an "AI Writing Partner for Tamil that Shines." The platform targets a broad audience and utilizes a Go backend, an Express.js frontend with EJS, and a PostgreSQL database. tamil

## Recent Updates (Nov 25, 2025)
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
