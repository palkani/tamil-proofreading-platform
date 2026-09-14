-- Migration: Per-user entitlement overrides (admin-managed)
-- Run once in Supabase SQL Editor.
--
-- Purpose: grant a specific user a specific set of feature entitlements
-- WITHOUT waiting for the Go backend to populate `entitlements` on
-- /api/v1/billing/me. The attachEntitlements middleware checks this
-- table after loading real billing, and if a non-expired override
-- exists for the user's email, it REPLACES billing.entitlements +
-- billing.is_premium + billing.plan_code with the override values.
--
-- Use cases:
--   1. Customer paid for Pro Lite (proofreading only) via PROOFPROLITE
--      — grant proofreading + export + ai_writer, NOT ocr.
--   2. Beta tester needs OCR access on Free plan — grant just ['ocr'].
--   3. Refund without full account removal — set entitlements to [].
--
-- Precedence: override WINS over the real billing/me response.
-- Deprecate rows here as soon as the Go backend supports entitlements
-- natively (per PRO_TIERS_BACKEND_CONTRACT.md).

CREATE TABLE IF NOT EXISTS admin_user_entitlement_overrides (
  email             TEXT        PRIMARY KEY,   -- lowercase; middleware lowercases before lookup
  is_premium        BOOLEAN     NOT NULL DEFAULT TRUE,   -- default true; set false to REVOKE Pro
  entitlements      TEXT[]      NOT NULL DEFAULT '{}',
  plan_code         TEXT,                       -- e.g. PRO_PROOFREAD_LITE — appears on planLabel()
  plan_label        TEXT,                       -- optional custom display label
  expires_at        TIMESTAMPTZ,                -- optional auto-expiry (nulls = never expires)
  notes             TEXT,                       -- context: "PROOFPROLITE purchase 2026-09-14"
  granted_by_email  TEXT        NOT NULL,       -- admin who granted
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_entitlement_overrides_expires_at
  ON admin_user_entitlement_overrides (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── Grants + RLS (same pattern as admin_promo_codes to avoid the same
-- 401 gotchas we hit earlier — see PR #186 for context) ─────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_user_entitlement_overrides TO anon, authenticated;

ALTER TABLE admin_user_entitlement_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_user_entitlement_overrides_all ON admin_user_entitlement_overrides;
CREATE POLICY admin_user_entitlement_overrides_all
  ON admin_user_entitlement_overrides
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
