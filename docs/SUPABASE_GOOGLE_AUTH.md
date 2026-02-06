# Google Sign-In via Supabase (Migration Without Breaking Existing Users)

This doc describes how Google sign-in works with Supabase and how your 40 existing users are preserved.

## Flow

1. **Frontend (Next.js):** User clicks "Sign in with Google" on the login page. The app uses the Supabase client to start OAuth: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://yoursite.com/auth/callback' } })`.
2. **Supabase:** Redirects to Google; after consent, Google redirects back to Supabase, which then redirects to your `redirectTo` URL with the session in the URL hash.
3. **Frontend callback (`/auth/callback`):** The callback page reads the session from the Supabase client (which has parsed the hash), then sends `session.access_token` (Supabase JWT) to your backend: `POST /api/v1/auth/supabase-token` with body `{ "access_token": "<supabase JWT>" }`.
4. **Backend:** Verifies the Supabase JWT using `SUPABASE_JWT_SECRET`, extracts `email` and optional `name` from the payload, then calls `EnsureOAuthUser(email, name)`. That finds an existing user by email (your 40 migrated users) or creates a new one. The backend then issues its own access/refresh tokens and sets cookies, and returns the same JSON as the normal login endpoint.

Result: **Existing users are matched by email.** No duplicate accounts; submissions and data stay tied to the same user ID.

## Setup

### 1. Supabase Dashboard

- **Authentication > Providers:** Enable **Google**. Enter your Google OAuth client ID and secret (same as or new from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)).
- **Authentication > URL Configuration > Redirect URLs:** Add:
  - `https://yourdomain.com/auth/callback`
  - `http://localhost:3000/auth/callback` (for local dev)
- **Project Settings > API:** Copy:
  - **Project URL** → `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
  - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **JWT Secret** → `SUPABASE_JWT_SECRET` (backend only; do not expose to frontend)

### 2. Backend env

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
```

No code change required beyond what’s already implemented; just set these in your Go backend environment.

### 3. Frontend env

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Set these in `.env.local` (or your deployment env). The login page shows "Sign in with Google" only when both are set.

### 4. Google Cloud Console (if using new OAuth client for Supabase)

- Create OAuth 2.0 credentials (Web application).
- **Authorized redirect URIs:** Add Supabase’s callback, e.g. `https://<project-ref>.supabase.co/auth/v1/callback`.
- Use the same Client ID and Secret in Supabase > Authentication > Providers > Google.

## Existing 40 Users

- They are already in your `users` table (migrated to Supabase DB).
- When they sign in with Google via Supabase, Supabase returns a JWT whose `email` claim matches their Google email.
- The backend’s `EnsureOAuthUser(email, name)` looks up by email; it finds the existing row and does not create a duplicate. Your app then issues tokens for that same user ID, so all existing data (submissions, etc.) remains intact.

## Optional: Keep Old Google OAuth

The previous backend Google OAuth flow (redirect to backend, exchange code, etc.) is still in place. You can keep it during transition or remove it once all users are on Supabase Google sign-in. The new flow is purely “Sign in with Google” on the Next.js login page → Supabase → `/auth/callback` → `POST /auth/supabase-token` → app tokens.
