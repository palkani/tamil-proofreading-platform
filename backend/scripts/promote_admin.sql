-- One-shot admin promotion for the operator user.
--
-- Prereq: sign up at https://prooftamil.com with email contact@prooftamil.com
--         (any password — you can set it via password-reset later if needed),
--         and verify the email if the flow requires it.
--
-- What this script does:
--   1. Confirms the user exists.
--   2. Promotes them to role='admin'.
--   3. Marks them active + email-verified so the admin gate accepts them.
--   4. Bumps token_version so any existing JWT is invalidated (they will
--      log in again and the new JWT will carry role=admin).
--
-- After running: set ADMIN_ALLOWED_EMAILS=contact@prooftamil.com in Cloud
-- Run env vars on the backend services so AdminMiddleware admits them.
--
-- Idempotent: safe to run multiple times.

-- Sanity check first — should return exactly 1 row.
SELECT id, email, role, is_active, email_verified
FROM users
WHERE email = 'contact@prooftamil.com';

-- Promote. If the SELECT above returned zero rows, sign up first, then
-- re-run this file.
UPDATE users
SET
  role            = 'admin',
  is_active       = true,
  email_verified  = true,
  token_version   = COALESCE(token_version, 0) + 1,
  updated_at      = NOW()
WHERE email = 'contact@prooftamil.com';

-- Confirm the promotion took.
SELECT id, email, role, is_active, email_verified, token_version, updated_at
FROM users
WHERE email = 'contact@prooftamil.com';
