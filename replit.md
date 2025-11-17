# Tamil AI Proofreading Platform - Replit Migration

## Project Overview
A full-stack Tamil AI proofreading platform migrated from Vercel to Replit. The platform uses Go (backend) and Next.js (frontend) to provide AI-powered Tamil text proofreading with a tiered model workflow.

## Recent Changes (November 17, 2025)

### Latest Updates: Fixed Draft Navigation + Google-Style Tamil Typing ✅
- **Fixed Draft Click Navigation**: Dashboard draft links now properly open drafts in workspace
  - No more 404 errors when clicking on draft messages
  - Dashboard drafts use JavaScript click handlers instead of broken href links
  - Clicking any draft row in the dashboard opens it in the workspace editor
  - URL hash system (`#draft-{id}`) for reliable draft loading
  - Auto-clears hash after loading to prevent reload loops

### Previous Updates: Google-Style Tamil Typing + Paste Conversion ✅
- **Google-Style Tamil Typing**: Type English, press Space → auto-converts to Tamil!
  - Type "vanakkam" + Space → "வணக்கம் "
  - Type "hello" + Space → "வணக்கம் "
  - Type "good morning" + Space after each word → "நல்ல காலை "
  - Real-time phonetic transliteration as you type
  - Works exactly like Google Tamil Input Tools
- **Paste English Paragraph → Auto-Convert to Tamil**:
  - Copy English text from anywhere
  - Paste into editor → automatically converts to Tamil
  - Preserves punctuation and formatting
  - Example: Paste "hello how are you today" → "வணக்கம் எப்படி நீ இன்று"
- **Expanded Dictionary**: 130+ common Tamil words with English mappings
  - Greetings: vanakkam, nandri, welcome, sorry, please, hello, thanks
  - Question words: how, when, where, what, who, why
  - Pronouns: I, you, he, she, they, we, this, that
  - Time words: today, yesterday, tomorrow, morning, evening, night
  - Adjectives: good, big, small, new, old, beautiful, very
  - Common verbs: come, go, see, say, do, eat, drink, read, write
  - Common nouns: house, school, work, food, water, mother, father
  - Numbers: one through ten
- **Beautiful Highlighting**: Blue theme color on hover with smooth transitions
- **Auto-Selection**: First suggestion pre-highlighted with light blue
- **Proper Replacement**: Fixed cursor position tracking - English words correctly replaced with Tamil
- **Smart Autocomplete**: Type in English, get relevant Tamil word suggestions
- **Phonetic Transliteration**: Converts English phonetics to Tamil script in real-time
- **Dual Language Support**: Works with both Tamil script and English romanization

### Previous Updates: Draft Loading and Auto AI Analysis ✅
- **Fixed Draft Navigation**: Changed "My Drafts" from URL-based to SPA-style view switching
- **Removed 404 Errors**: No longer using URL parameters to avoid Replit proxy issues
- **Auto AI Analysis**: Opening a draft automatically triggers AI grammar checking after 500ms
- **Enhanced Debugging**: Added comprehensive console logging for draft operations
- **Improved Error Handling**: Better error messages and response tracking for draft loading
- **Click Event Handling**: Added preventDefault/stopPropagation to prevent navigation conflicts

### Previous Updates: Reliable Tamil AI Grammar Checking ✅
- **Fixed AI Reliability**: Implemented sentence-level chunking (<=120 chars) for consistent error detection
- **System Instructions**: Separated prompt instructions from text analysis using `systemInstruction`
- **JSON Output Mode**: Enforced `responseMimeType: "application/json"` for structured responses
- **Maximum Accuracy**: Set `temperature: 0` and `topP: 0.1` for deterministic results
- **Tamil Explanations**: All error titles and descriptions provided in Tamil language
- **Verified Working**: Successfully detects errors like "அளியுங்கள" and "பதிவபுதுப்பித்தல்" in real-world text
- **Paste Support**: Fixed paste events to trigger auto-analysis after 1-second debounce

### Previous Updates: Next.js to Express Conversion ✅
- **Frontend Framework Change**: Converted from Next.js 16 (React) to Express 4.18 + EJS templates
- **Essential Pages Converted** (All Working):
  - ✅ **Homepage** (`/`) - Beautiful landing page with gradient branding, hero section, and features
  - ✅ **Login** (`/login`) - Authentication page with email/password form
  - ✅ **Register** (`/register`) - Sign-up page with Google OAuth option
  - ✅ **Workspace** (`/workspace`) - Tamil editor with AI proofreading
  - ✅ **Dashboard** (`/dashboard`) - User overview with recent submissions
  - ✅ **Account** (`/account`) - Profile and settings management
  - ✅ **Archive** (`/archive`) - Archived/deleted submissions (15-day retention)
- **Vanilla JavaScript Implementation**: 
  - TamilEditor class with contenteditable and autocomplete
  - SuggestionsPanel class with type-based grouping
  - WorkspaceController coordinating all features
  - Complete Tamil utilities ported for browser use (220+ word dictionary)
  - Dashboard, Account, and Archive page controllers
- **UI Preserved**: 
  - Clean navigation bar with ProofTamil branding
  - Unified header across all authenticated pages
  - Simplified toolbar with formatting controls (workspace)
  - Professional AI Assistant panel with suggestion cards (workspace)
  - Footer status bar with word count and accepted suggestions counter
- **All Features Working**:
  - Rich text editor with Tamil autocomplete
  - Gemini AI grammar checking via server-side proxy
  - Suggestion application and tracking
  - **Drafts List View**: Click "My Drafts" to see all previously edited submissions
  - **Draft Loading**: Click any draft to open it in the editor
  - **Draft Management**: Create new drafts, view submission history
  - User navigation between all pages
  - Clean, professional design with Tailwind CSS

### Vercel to Replit Migration + Express Conversion ✅
- **Backend**: Go 1.24 server running on port 8080
- **Frontend**: Express 4.18 + EJS running on port 5000 (converted from Next.js)  
- **Database**: PostgreSQL (Replit-hosted Neon database)
- **Workflow**: Configured to run both services concurrently via `start.sh`
- **Status**: Fully functional and accessible

### Configuration Updates
1. **Next.js Configuration** (`frontend/next.config.ts`):
   - Added Turbopack configuration for Replit compatibility
   - Configured server actions with allowed origins
   - API proxy routes all `/api/v1/*` requests to backend on port 8080

2. **Package Scripts** (`frontend/package.json`):
   - Updated dev/start commands to bind to `0.0.0.0:5000`
   - Ensures accessibility through Replit's iframe proxy

3. **CORS Configuration** (`backend/internal/middleware/cors.go`):
   - Updated to allow localhost/127.0.0.1 origins for development
   - Added Replit domain support for cross-origin requests
   - Maintains security while supporting Replit's environment

4. **Authentication Bypass** (⚠️ TESTING ONLY - REMOVE BEFORE PRODUCTION):
   - Mock auth middleware injecting test user (ID=1, email: test@example.com)
   - Real JWT authentication middleware commented out in `backend/cmd/server/main.go` (line 79)
   - Frontend auth checks disabled for all protected routes
   - Google OAuth integration removed from login UI
   - Test user created in database with ID=1
   - **CRITICAL**: Must re-enable authentication before production deployment

### Environment Variables Setup
**Backend** (via Replit Secrets):
- `DATABASE_URL` - PostgreSQL connection (configured automatically)
- `OPENAI_API_KEY` - Required for AI proofreading
- `JWT_SECRET` - Authentication token signing (has default, change for production)
- `FRONTEND_URL` - Set to Replit domain automatically

**Frontend** (`frontend/.env.local`):
- `NEXT_PUBLIC_API_URL` - Points to localhost:8080/api/v1
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - For Google OAuth

### Deployment Configuration
- **Target**: VM deployment (stateful, always running)
- **Build**: Compiles Go backend and builds Next.js frontend
- **Run**: Starts both services concurrently

## Project Structure
```
tamil-proofreading-platform/
├── backend/                 # Go API server (port 8080)
│   ├── cmd/server/         # Application entry point
│   ├── internal/
│   │   ├── config/         # Configuration management
│   │   ├── handlers/       # HTTP route handlers
│   │   ├── middleware/     # CORS, auth, security
│   │   ├── models/         # Database models (GORM)
│   │   └── services/       # Business logic (LLM, payment, NLP)
├── express-frontend/       # Express + EJS app (port 5000) **ACTIVE**
│   ├── server.js          # Express server entry point
│   ├── routes/
│   │   ├── index.js      # Main routes (login, register, dashboard, account, archive)
│   │   ├── workspace.js  # Workspace routes
│   │   └── api.js        # API proxy to backend
│   ├── views/
│   │   ├── pages/        # EJS page templates
│   │   │   ├── home.ejs       # Landing page
│   │   │   ├── login.ejs
│   │   │   ├── register.ejs
│   │   │   ├── workspace.ejs
│   │   │   ├── dashboard.ejs
│   │   │   ├── account.ejs
│   │   │   └── archive.ejs
│   │   └── partials/     # Reusable EJS components (header, footer, nav)
│   ├── public/
│   │   ├── css/          # Tailwind CSS (compiled)
│   │   └── js/           # Client-side JavaScript modules
│   │       ├── workspace.js      # Workspace controller
│   │       ├── editor.js         # Tamil editor
│   │       ├── suggestions.js    # Suggestions panel
│   │       ├── tamilDictionary.js # Tamil word dictionary
│   │       ├── dashboard.js      # Dashboard controller
│   │       ├── account.js        # Account page controller
│   │       ├── archive.js        # Archive page controller
│   │       └── register.js       # Register page controller
│   └── package.json      # Dependencies
├── frontend/              # Next.js app (DEPRECATED - use express-frontend)
└── start.sh              # Startup script for both services
```

## Known Issues & Todo

### Critical Security Items (Before Production)
1. **Re-enable Authentication**:
   - Uncomment `protected.Use(middleware.AuthMiddleware(cfg.JWTSecret))` in `backend/cmd/server/main.go` (line 79)
   - Remove mock auth middleware (lines 81-86)
   - Re-enable frontend auth checks in protected pages
   - Remove test user from database or secure it properly

2. **API Configuration**:
   - Add OPENAI_API_KEY to Replit Secrets for AI proofreading to work
   - Consider adding payment gateway secrets (STRIPE_*, RAZORPAY_*) if needed

3. **Security Hardening**:
   - Change JWT_SECRET from default value
   - Update CORS allowed origins to production domains only
   - Review and test all authentication flows

## User Preferences
- User requested removal of login requirement for easier testing
- Focus on workspace page enhancement

## Tech Stack
- **Backend**: Go 1.24, Gin, GORM, PostgreSQL
- **Frontend**: Express 4.18, EJS Templates, Vanilla JavaScript, Tailwind CSS
- **AI**: Google Gemini (via Replit AI Integrations), OpenAI GPT (backend)
- **Payments**: Stripe, Razorpay (configured but not required)

## Features Fully Integrated ✅
- **Draft Persistence**: Auto-saves drafts to PostgreSQL database every 2 seconds
- **Draft Loading**: Loads all user drafts from database in "My Drafts" view
- **Draft Management**: View, open, and edit previous submissions
- **Authentication**: Mock auth in place (user_id=1 for testing)
- **Backend Integration**: Complete integration with Go backend API

## How Drafts Work
1. **Auto-Save**: Type Tamil text in the editor - it auto-saves every 2 seconds
2. **View Drafts**: Click "My Drafts" (top left) to see all saved drafts
3. **Open Draft**: Click any draft card to load it into the editor
4. **New Draft**: Click "New Draft" to start fresh

## Development Workflow
1. Start: Workflow runs automatically via `start.sh`
2. Frontend accessible at: https://[REPLIT_DOMAINS]
3. Backend API at: http://localhost:8080/api/v1
4. Database: Managed via Replit's PostgreSQL integration

## Security Notes
- JWT secret should be changed before production
- CORS currently allows localhost for development - restrict in production
- Authentication bypass is temporary for testing only
