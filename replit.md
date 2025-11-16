# Tamil AI Proofreading Platform - Replit Migration

## Project Overview
A full-stack Tamil AI proofreading platform migrated from Vercel to Replit. The platform uses Go (backend) and Next.js (frontend) to provide AI-powered Tamil text proofreading with a tiered model workflow.

## Recent Changes (November 16, 2025)

### Latest Updates: Next.js to Express Conversion ✅
- **Frontend Framework Change**: Converted from Next.js 16 (React) to Express 4.18 + EJS templates
- **Vanilla JavaScript Implementation**: 
  - TamilEditor class with contenteditable and autocomplete
  - SuggestionsPanel class with type-based grouping
  - WorkspaceController coordinating all features
  - Complete Tamil utilities ported for browser use (220+ word dictionary)
- **UI Preserved**: 
  - Clean three-region header with navigation and title editing
  - Simplified toolbar with formatting controls
  - Professional AI Assistant panel with suggestion cards
  - Footer status bar with word count and accepted suggestions counter
- **All Features Working**:
  - Rich text editor with Tamil autocomplete
  - Gemini AI grammar checking via server-side proxy
  - Suggestion application and tracking
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
│   ├── routes/            # Express routes (index, workspace, API proxy)
│   ├── views/             # EJS templates (pages, partials)
│   ├── public/
│   │   ├── css/          # Tailwind CSS (compiled)
│   │   └── js/           # Client-side JavaScript modules
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

## Known Limitations (Express Version)
- **Draft Persistence**: Autosave currently simulates saving (not integrated with Go backend)
- **Draft Loading**: Workspace doesn't load existing drafts from database
- **Authentication**: Mock auth in place (same as Next.js version for testing)
- **Backend Integration**: Gemini proxy works, but other backend features need wiring

To add full backend integration:
1. Wire autosave to Go backend `/api/v1/submit` endpoint
2. Load user drafts in workspace controller from `/api/v1/submissions`
3. Implement session/token management for authenticated requests
4. Add proper authentication middleware to workspace routes

## Development Workflow
1. Start: Workflow runs automatically via `start.sh`
2. Frontend accessible at: https://[REPLIT_DOMAINS]
3. Backend API at: http://localhost:8080/api/v1
4. Database: Managed via Replit's PostgreSQL integration

## Security Notes
- JWT secret should be changed before production
- CORS currently allows localhost for development - restrict in production
- Authentication bypass is temporary for testing only
