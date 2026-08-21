# Backend contract — mandatory email verification on registration

**Shipped in frontend commit:** strict email validation + rewired register
flow so no user is auto-logged-in on `/auth/register`. The client now
requires an OTP verification round-trip before it stores the access token.

For this to actually enforce "one address, one account, verified email"
the Go backend must satisfy the contract below. If any endpoint diverges,
the corresponding failure mode is noted.

## 1. `POST /auth/register`

**Purpose:** create a new account with `email_verified=false`, dispatch
the verification OTP to the email, return WITHOUT logging the user in.

Request body:
```json
{ "name": "string", "email": "string", "password": "string" }
```

Recommended response body:
```json
{
  "ok": true,
  "verification_required": true,
  "email": "user@example.com"
}
```

**Do NOT return `access_token` or `refresh_token` in this response.**
If you do, the frontend explicitly discards them (see the comment above
`registeredEmail = email;` in [public/js/register.js](public/js/register.js)),
so nothing breaks — but the extra tokens are wasted.

Behaviour requirements:

- Create the user with `email_verified = false` (Supabase Auth calls this
  `email_confirmed_at IS NULL`).
- Send an OTP to the email using the existing OTP subsystem
  (`/auth/otp/send` machinery) with a `purpose = 'register'` marker so the
  code is namespaced and can be validated correctly at verify-time.
- Rate-limit: at most 3 registrations per IP per hour.
- If the email is already registered AND verified → 409 with
  `{ error: 'already_registered' }`.
- If the email is already registered AND unverified → resend OTP and
  return the same 200 response as a fresh registration (don't reveal
  whether an account exists — helps against enumeration).

## 2. `POST /auth/otp/send`

Already exists. Should:
- Accept `{ email, purpose: 'register' | 'login' | 'password_reset' }`.
- Rate-limit: at most 3 OTP sends per email per 15 minutes.
- Store the OTP hashed (bcrypt or HMAC), not plaintext.
- OTP TTL: 10 minutes.

## 3. `POST /auth/otp/verify`

**Purpose:** verify the OTP and, on success, mark the user verified AND
log them in by returning the tokens.

Request body:
```json
{ "email": "string", "otp": "6-digit string", "purpose": "register" }
```

Success response (this is what the client uses to log the user in):
```json
{
  "ok": true,
  "access_token": "eyJ...",
  "refresh_token": "opaque-token",
  "user": { "id": "uuid", "email": "user@example.com", "name": "..." }
}
```

Behaviour requirements:

- Compare the submitted OTP against the stored hash for this email.
- On success:
  - Set `email_verified = true` (`email_confirmed_at = now()` in Supabase).
  - Delete the OTP record (single-use).
  - Issue and return the JWT access token + refresh token (same shape as
    `/auth/login`).
  - Also `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=None`
    so the browser has the session for server-side page renders.
- On failure:
  - Increment a per-OTP attempt counter; after 5 wrong attempts,
    invalidate the OTP entirely and force a resend.
  - Return `{ error: 'invalid_otp', message: '...' }` with 400.
- If the OTP has expired: return `{ error: 'otp_expired' }` with 410.

## 4. Enforce `email_verified` on protected endpoints

The frontend prevents auto-login, but a user could still hold a stale
access token from before the change or bypass the frontend entirely
(direct API calls with valid credentials). The backend should treat
`email_verified = false` as a soft-blocked state:

- `/auth/login` on an unverified account → 200 with
  `{ ok: true, verification_required: true, email }` (no tokens) OR 403
  with the same payload. The frontend already knows to show the OTP
  step in that state.
- OCR uploads, AI content writer, payment checkout endpoints — return
  403 `{ error: 'email_not_verified' }` with a redirect hint to the
  verification page.
- Read-only endpoints (viewing drafts, /account/data export) can stay
  open to unverified users; being restrictive there just makes recovery
  harder.

## 5. Cleanup job

Add a nightly job that deletes unverified accounts older than 7 days.
Rationale: prevents the users table from filling with junk registrations
where the OTP was never confirmed.

## 6. Frontend fallback if the backend does NOT enforce this yet

If `/auth/register` still returns an access token today, the client-side
change alone is a partial fix:
- Legitimate users can't bypass the OTP because the client discards
  the token.
- A malicious user who calls `/auth/register` directly with curl would
  still receive a working token — the Express `/auth/register` proxy
  validates the email (syntax + disposable + MX), but the backend
  issues the token.

Closing that gap requires the backend change above. Ship the backend
change and this note becomes obsolete.

## 7. Signals for follow-up

- Add a `signup_email_domain` field to your analytics so you can see if
  the disposable-email blocklist misses anything. Any new disposable
  provider that shows up in the top 20 domains for signups is a
  candidate to add to `DISPOSABLE_EMAIL_DOMAINS`.
- Consider adding a "confidence score" to the validator that combines
  MX record freshness + presence of SPF/DMARC records; block only when
  score is very low. Currently we're binary.
