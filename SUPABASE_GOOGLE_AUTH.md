# Google Sign-In with Supabase

When **SUPABASE_URL** and **SUPABASE_ANON_KEY** are set, the app uses **Supabase** for Google sign-in/sign-up (not the backend’s direct OAuth). You only need to configure URLs in **Supabase** and **Google Cloud Console**; you do **not** need `BACKEND_URL` or the backend’s `/api/v1/auth/google/callback` for this flow.

---

## 1. Supabase Dashboard

### Authentication → URL Configuration

| Setting        | Value                                      |
|----------------|--------------------------------------------|
| **Site URL**   | Your app’s origin, e.g. `https://www.prooftamil.com` |
| **Redirect URLs** | Add the URL Supabase will redirect to after sign-in. Must include: |
|                | `https://www.prooftamil.com/auth/callback` |
|                | (Add `https://www.prooftamil.com/auth/callback?redirect=/drafts` if you use query params.) |

Supabase will only redirect to URLs listed here.

**If you see "requested path is invalid" or a URL like `https://YOUR_PROJECT.supabase.co/www.prooftamil.com`:** You entered a redirect URL **without** `https://`. In **Redirect URLs**, use the **full** URL: `https://www.prooftamil.com/auth/callback` (with `https://`). Remove any entry that is just `www.prooftamil.com` or `www.prooftamil.com/auth/callback`.

### Authentication → Providers → Google

1. Enable the **Google** provider.
2. **Client ID** and **Client Secret**: create an OAuth 2.0 Client in Google Cloud Console (see below) and paste them here.
3. Supabase will show the **Callback URL (for Google)** that you must add in Google Console (e.g. `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`). Copy it for the next step.

---

## 2. Google Cloud Console

1. Go to **APIs & Services → Credentials**.
2. Create an **OAuth 2.0 Client ID** (or use an existing one) with **Web application**.
3. **Authorized redirect URIs**: add **Supabase’s** callback URL from the Supabase Google provider step, e.g.  
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`  
   Do **not** add your backend URL or `https://www.prooftamil.com/auth/callback` here; Google redirects to Supabase, and Supabase then redirects to your app.

---

## 3. App environment variables

| Where        | Variable               | Purpose |
|-------------|------------------------|--------|
| **Frontend** (Express / Vercel) | `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| **Frontend** | `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (used by signInWithOAuth) |
| **Backend**  | `SUPABASE_JWT_SECRET`  | Used to verify the Supabase access_token when exchanging for your app session. **Must be set in the deployment environment** (e.g. Cloud Run env vars). Get it from Supabase Dashboard → **Project Settings → API** → **JWT Secret** (the long secret, not the anon key). |

You do **not** need `BACKEND_URL` or `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in the backend for the Supabase Google flow.

**If you see "Invalid or expired Supabase token" after Google sign-in:** The backend verifies the token in two ways: (1) **JWT Signing Keys (RS256/ES256)** — the backend fetches public keys from `SUPABASE_URL/auth/v1/.well-known/jwks.json`; ensure **SUPABASE_URL** is set in the backend. (2) **Legacy JWT secret (HS256)** — set **SUPABASE_JWT_SECRET** in the backend to the value from Supabase **Project Settings → API → JWT Secret**. If your project has migrated to JWT Signing Keys in the dashboard, (1) is used and you do not need the secret. Restart the backend after changing env vars.

---

## 4. Flow summary

1. User clicks “Sign in with Google” on your app.
2. Frontend calls Supabase `signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/auth/callback' } })`.
3. User is sent to Google, then back to **Supabase** (Supabase’s redirect URI in Google).
4. Supabase redirects to **your app** at `https://www.prooftamil.com/auth/callback#access_token=...`.
5. Your `/auth/callback` page sends the Supabase `access_token` to your backend `POST /auth/supabase-token`.
6. Backend verifies the token with `SUPABASE_JWT_SECRET`, finds/creates user by email, and issues your app’s session (cookies + access token).

---

## 5. If you use the legacy backend OAuth instead

If **SUPABASE_URL** / **SUPABASE_ANON_KEY** are not set, the app falls back to the backend’s Google OAuth (`/auth/google` → Google → `/api/v1/auth/google/callback`). In that case you **do** need:

- **Backend**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and (if the API is on Cloud Run) `BACKEND_URL`.
- **Google Console**: add `https://YOUR_BACKEND_URL/api/v1/auth/google/callback` as an authorized redirect URI.

For **Supabase** Google sign-in, only the URLs above (Supabase URL config + Supabase redirect URI in Google) need to be set; no backend callback URL in Google.
