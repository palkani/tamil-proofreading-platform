# Google Sign-In via Supabase (Migration Without Breaking Existing Users)

This doc describes how Google sign-in works with Supabase and how existing users are preserved.

## Existing users are not broken

- **Backend** uses `EnsureOAuthUser(email, name)`: it **looks up by email first**. If a user with that email already exists (from email/password sign-up or from the old Google OAuth flow), that same user is returned and a session is issued—**no duplicate account is created**.
- **New users** are created only when the email from the Supabase JWT is not found in the `users` table.
- So all existing registered users keep the same account and data when they sign in with Google via Supabase (same email → same user row).

## Flow (Express frontend on Vercel)

1. **Frontend (Express/EJS):** User clicks "Sign in with Google" on `/login` or "Continue with Google" on `/register`. If `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, the app uses the Supabase client: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://www.prooftamil.com/auth/callback' } })`. Otherwise it falls back to the legacy backend OAuth flow (`/auth/google` → backend callback).
2. **Supabase:** Redirects to Google; after consent, Google redirects back to Supabase, which then redirects to your `redirectTo` URL with the session in the URL hash (`#access_token=...&refresh_token=...`).
3. **Frontend callback (`/auth/callback`):** The callback page parses the hash for `access_token`, then sends it to the backend via `POST /auth/supabase-token` (proxied to `POST /api/v1/auth/supabase-token`) with body `{ "access_token": "<supabase JWT>" }`.
4. **Backend:** Verifies the Supabase JWT using `SUPABASE_JWT_SECRET`, extracts `email` and optional `name` from the payload, then calls `EnsureOAuthUser(email, name)`. That finds an existing user by email or creates a new one. The backend issues app access/refresh tokens, sets cookies, and returns JSON. The callback page stores the token and redirects to `/drafts` (or `?redirect=`).

Result: **Existing users are matched by email.** No duplicate accounts; submissions and data stay tied to the same user ID.

## Setup

### 1. Supabase Dashboard

- **Authentication > Providers:** Enable **Google**. Enter your Google OAuth client ID and secret (same as or new from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)).
- **Authentication > URL Configuration > Redirect URLs:** Add:
  - `https://www.prooftamil.com/auth/callback` (production)
  - `https://prooftamil.com/auth/callback` (if you use apex domain)
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

### 3. Frontend env (Express on Vercel)

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
# Or with NEXT_PUBLIC_ prefix (both work)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Set these in Vercel (or your deployment env). When both are set, the login and register pages use Supabase for "Sign in with Google" / "Continue with Google". Otherwise they fall back to the legacy backend OAuth flow.

### 4. Google Cloud Console (if using new OAuth client for Supabase)

- Create OAuth 2.0 credentials (Web application).
- **Authorized redirect URIs:** Add Supabase’s callback, e.g. `https://<project-ref>.supabase.co/auth/v1/callback`.
- Use the same Client ID and Secret in Supabase > Authentication > Providers > Google.

## Existing 40 Users

- They are already in your `users` table (migrated to Supabase DB).
- When they sign in with Google via Supabase, Supabase returns a JWT whose `email` claim matches their Google email.
- The backend’s `EnsureOAuthUser(email, name)` looks up by email; it finds the existing row and does not create a duplicate. Your app then issues tokens for that same user ID, so all existing data (submissions, etc.) remains intact.

## Optional: Keep Old Google OAuth

The previous backend Google OAuth flow (`/auth/google` → backend `/api/v1/auth/google/callback`) is still in place. When Supabase env vars are not set, the Express frontend uses that legacy flow. Once `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, the Express login/register pages use Supabase for Google sign-in; callback is `/auth/callback` → `POST /auth/supabase-token` → app tokens and redirect to `/drafts`. You can keep the old flow during transition. You can keep it during transition or remove it once all users are on Supabase Google sign-in. The new flow is purely “Sign in with Google” on the Next.js login page → Supabase → `/auth/callback` → `POST /auth/supabase-token` → app tokens.
