# Admin user-actions — backend contract

Frontend commit adds four new user-management actions to
/admin/users/:id. They proxy through /admin/api/* → /api/v1/admin/*
on the Go backend. If a backend endpoint doesn't exist yet, the UI
button will surface a clean error message; nothing else breaks.

Every mutation must audit-log (actor email + IP + UA + before/after
where applicable) and check the caller's admin role at the API layer
— the Express-side requireAdmin is defence-in-depth, not authority.

## 1. `POST /api/v1/admin/users/:id/sessions/revoke` — force logout

Purpose: invalidate every active session (access token + refresh
token) for the user, without touching account state. They can log
in again immediately with valid credentials.

Request: empty body.

Response 200:
```json
{ "ok": true, "revoked_count": 3 }
```

Behaviour:
- Rotate the user's refresh-token secret (Supabase Auth) OR delete
  every row from your `refresh_tokens` table for this user.
- Optionally push a "revoked" flag into a short-lived cache so
  in-flight access tokens can be checked on their next request.
- Audit-log: `admin.session_revoke {actor, target_user_id, count}`.

Failure modes:
- 404 `user_not_found`
- 409 `cannot_revoke_admin` — refuse to force-logout another admin
  unless the caller is a super-admin (optional; nice-to-have).

## 2. `PATCH /api/v1/admin/users/:id/blocked` — block / unblock

Purpose: soft-suspend an account. Data preserved; the user cannot
sign in. Reason string surfaces to the user at the login screen and
is stored in the audit log.

Request body:
```json
{ "blocked": true, "reason": "Spam signups from this address" }
```

Response 200: return the updated profile row (same shape as
`GET /api/v1/admin/users/:id` → `profile`) so the UI can re-render
without another fetch.

Behaviour:
- Set `users.is_blocked = ?` (add the column if it doesn't exist)
  OR reuse `is_active` (set to false when blocked, true when
  unblocking). The frontend accepts either signal.
- Store `blocked_reason` + `blocked_at` + `blocked_by_user_id` for
  the audit trail. On unblock, clear those three fields.
- On block: automatically revoke every active session (call the
  same code path as endpoint 1 above).
- On the login endpoint, when a blocked user tries to sign in,
  return 403 `{ error: "account_blocked", reason: "..." }` so the
  frontend can display the reason.

Failure modes:
- 404 `user_not_found`
- 409 `cannot_block_self` — the admin cannot block their own account.
- 409 `cannot_block_admin` — same defence for other admins.

## 3. `DELETE /api/v1/admin/users/:id` — hard delete

Purpose: permanent account removal. Called only after the admin
types the target email as a double-confirm.

Request: empty body.

Response 200:
```json
{ "ok": true, "deleted": {
    "user_id": "uuid",
    "email": "user@example.com",
    "drafts_removed": 12,
    "ai_content_removed": 3,
    "ocr_events_removed": 7,
    "subscription_cancelled": true
} }
```

Behaviour:
- Cancel any active Dodo subscription (best-effort; if the vendor
  call fails, log and continue — don't block deletion on an
  external outage).
- Delete or hard-anonymise: `drafts`, `ai_content_drafts`,
  `handwriting_ocr_events`, `refresh_tokens`, `checkout_attempts`
  for the user. Payment records (invoices) should be RETAINED with
  the user_id foreign-key nulled but stored as a snapshot — you
  need the financial trail for accounting even after deletion.
- Remove the row from `users` last (or set a `deleted_at` if you
  prefer soft-delete — the frontend doesn't care as long as
  subsequent `GET /users/:id` returns 404).
- Revoke every session (endpoint 1).
- Audit-log: `admin.user_delete {actor, target_email, snapshot_counts}`.

Failure modes:
- 404 `user_not_found`
- 409 `cannot_delete_self`
- 409 `cannot_delete_admin` — same guard.
- 502 `subscription_cancel_failed` — return a "please cancel in
  Dodo dashboard first, then retry" message.

## 4. `POST /admin/api/users/audit-suspicious` (Express-side, done)

Already shipped — no backend work needed. Runs each of a batch of
emails through the existing email validator (syntax + disposable +
MX check) and returns the ones that would fail today's validator.

Used by the /admin/users list "Suspicious" filter and the dashboard
"Suspicious signups · 7d" tile. Bounded to 200 emails per request
to prevent DNS-lookup abuse.

## 5. Audit log — persistent history (nice-to-have)

The current `middleware/adminAudit.js` writes to stdout (captured by
Vercel logs) and pushes into a per-instance ring buffer. That's fine
for spot-checks but limited: each serverless instance has its own
buffer, and the buffer is wiped on cold start.

If you want full history queryable from `/admin/audit`, add:

```sql
CREATE TABLE admin_audit_events (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email     TEXT,
  actor_user_id   UUID,
  event           TEXT NOT NULL,          -- 'page' | 'api'
  method          TEXT,
  path            TEXT NOT NULL,
  query           JSONB,
  status          INT,
  duration_ms     INT,
  ip              INET,
  ua              TEXT
);
CREATE INDEX ON admin_audit_events (ts DESC);
CREATE INDEX ON admin_audit_events (actor_email, ts DESC);
CREATE INDEX ON admin_audit_events (path, ts DESC);
```

Ship a Go endpoint `GET /api/v1/admin/audit/events?limit&offset&actor&event&path&method`
and the /admin/audit page will swap from ring-buffer to full-history
with no UI change (I'll make the swap in a follow-up: it's one fetch
URL change in `audit.ejs`).

## Rollout order

1. Endpoint 1 (`sessions/revoke`) — smallest, unlocks Force-logout button.
2. Endpoint 2 (`blocked` PATCH) — unlocks Block/Unblock buttons.
3. Endpoint 3 (`DELETE /users/:id`) — unlocks Delete button.
4. Endpoint 5 (`admin_audit_events` table + list endpoint) — upgrade the
   /admin/audit page from ring-buffer to full history.

Each is independent; ship in whatever order is easiest.
