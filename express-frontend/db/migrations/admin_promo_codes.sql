-- Migration: Admin-generated promo codes
-- Run once in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Idempotent — CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
--
-- After running, POST `NOTIFY pgrst, 'reload schema';` (also idempotent)
-- so PostgREST picks the new table up in its API cache.

-- ── 1. Codes table ───────────────────────────────────────────────────
-- One row per admin-generated code. `code` is uppercase for
-- case-insensitive lookup — the /promo-code/validate handler upper-
-- cases the input before hitting this table.
CREATE TABLE IF NOT EXISTS admin_promo_codes (
  code                TEXT        PRIMARY KEY,
  label               TEXT        NOT NULL,
  price_cents         INTEGER     NOT NULL CHECK (price_cents >= 0),
  currency            TEXT        NOT NULL DEFAULT 'INR',
  plan_code           TEXT        NOT NULL DEFAULT 'PRO_LITE',
  billing_interval    TEXT        NOT NULL DEFAULT 'month',
  entitlements        TEXT[]      NOT NULL DEFAULT '{}',
  checkout_url        TEXT        NOT NULL,   -- Dodo URL admin pasted
  recurring_terms     TEXT,
  target_email        TEXT,                   -- optional — restrict to this email
  single_use          BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Single-use state. redeemed_at is set on the /api/promo-code/redeem
  -- click; the row is not deleted so admin can see who used it.
  redeemed_at         TIMESTAMPTZ,
  redeemed_by_email   TEXT,
  -- Admin can disable a code without deleting it.
  revoked_at          TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_by_email    TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_promo_codes_target_email
  ON admin_promo_codes (LOWER(target_email))
  WHERE target_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_promo_codes_created_at
  ON admin_promo_codes (created_at DESC);

-- ── 2. Redemption audit log ──────────────────────────────────────────
-- Append-only. One row per successful /redeem hit. Useful for
-- forensics — WHO used a code, from what IP, when. Kept separate from
-- admin_promo_codes so we can query historical redemptions even after
-- a code is deleted.
CREATE TABLE IF NOT EXISTS admin_promo_code_redemptions (
  id           BIGSERIAL   PRIMARY KEY,
  code         TEXT        NOT NULL,
  user_email   TEXT        NOT NULL,
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address   TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_promo_code_redemptions_code
  ON admin_promo_code_redemptions (code);

CREATE INDEX IF NOT EXISTS idx_admin_promo_code_redemptions_user_email
  ON admin_promo_code_redemptions (LOWER(user_email));

-- ── 3. Atomic redeem RPC ─────────────────────────────────────────────
-- Called from the /api/promo-code/redeem handler when the user clicks
-- Continue to checkout. Returns the row that was just marked redeemed
-- (or a zero-row result on any failure so the caller can distinguish).
--
--   Failures (no row returned):
--     - code not found
--     - already redeemed (single_use=TRUE and redeemed_at IS NOT NULL)
--     - revoked (revoked_at IS NOT NULL)
--     - expired (expires_at < NOW())
--     - email restriction mismatch (target_email set and not equal
--       to p_user_email — case-insensitive)
--
-- Single UPDATE ... RETURNING inside a WHERE guard prevents the read-
-- then-write race that would let two concurrent clicks both mark the
-- same single-use code redeemed by different users.
CREATE OR REPLACE FUNCTION redeem_admin_promo_code(
  p_code       TEXT,
  p_user_email TEXT,
  p_ip         TEXT,
  p_user_agent TEXT
)
RETURNS TABLE (
  code             TEXT,
  label            TEXT,
  price_cents      INTEGER,
  currency         TEXT,
  checkout_url     TEXT,
  plan_code        TEXT,
  entitlements     TEXT[],
  billing_interval TEXT,
  recurring_terms  TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT := UPPER(TRIM(p_code));
  v_email TEXT := LOWER(TRIM(p_user_email));
BEGIN
  RETURN QUERY
  UPDATE admin_promo_codes c
     SET redeemed_at       = COALESCE(c.redeemed_at, NOW()),
         redeemed_by_email = COALESCE(c.redeemed_by_email, v_email)
   WHERE c.code = v_code
     AND c.revoked_at IS NULL
     AND (c.expires_at IS NULL OR c.expires_at > NOW())
     AND (c.single_use = FALSE OR c.redeemed_at IS NULL)
     AND (c.target_email IS NULL OR LOWER(c.target_email) = v_email)
  RETURNING c.code, c.label, c.price_cents, c.currency, c.checkout_url,
            c.plan_code, c.entitlements, c.billing_interval, c.recurring_terms;

  -- Append to the audit log ONLY if the update actually redeemed a row.
  -- FOUND is set by the RETURN QUERY above.
  IF FOUND THEN
    INSERT INTO admin_promo_code_redemptions (code, user_email, ip_address, user_agent)
    VALUES (v_code, v_email, p_ip, p_user_agent);
  END IF;
END;
$$;

-- ── 4. RLS ───────────────────────────────────────────────────────────
-- Disabled so the Express middleware can read/write with the
-- SUPABASE_ANON_KEY the app already uses (see middleware/ocrMonthlyLimit.js
-- for the same pattern). All write paths are already admin-gated in
-- Express — nothing in the browser talks to these tables directly.
ALTER TABLE admin_promo_codes             DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_promo_code_redemptions  DISABLE ROW LEVEL SECURITY;

-- ── 5. Grant table + RPC privileges ──────────────────────────────────
-- Disabling RLS is not enough — PostgREST also enforces classic Postgres
-- GRANTs before it even considers RLS. On newer Supabase projects
-- CREATE TABLE via the SQL Editor does NOT auto-grant CRUD to anon /
-- authenticated, so a bare `INSERT INTO admin_promo_codes` from the
-- middleware would return 401 unauthorized even with RLS off. These
-- grants are idempotent (GRANT is a no-op if already granted), safe
-- to re-run on an existing project.
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_promo_codes            TO anon, authenticated;
GRANT SELECT, INSERT                  ON admin_promo_code_redemptions TO anon, authenticated;
-- The redemptions.id is a BIGSERIAL — anon needs USAGE on the sequence
-- to consume next-values on INSERT.
GRANT USAGE, SELECT ON SEQUENCE admin_promo_code_redemptions_id_seq TO anon, authenticated;
-- The redemption RPC does both an UPDATE and an INSERT internally, so
-- executing it requires table grants above PLUS execute rights on the
-- function itself.
GRANT EXECUTE ON FUNCTION redeem_admin_promo_code(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ── 6. Refresh PostgREST schema cache ────────────────────────────────
NOTIFY pgrst, 'reload schema';
