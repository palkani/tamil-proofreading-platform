-- Migration: expand admin_user_entitlement_overrides for full subscription lifecycle
-- + add processed_webhook_events table for idempotency.
-- Run once in Supabase SQL Editor. Idempotent — all changes gated by IF NOT EXISTS.
--
-- Context: PR #190 shipped the webhook receiver. This migration adds the
-- fields we need to handle the full lifecycle (cancellation, dunning,
-- auto-renew status, renewal reminders, reconciliation) without
-- overloading `expires_at` as the only signal.

-- ── 1. New columns on the overrides table ─────────────────────────────
-- Semantics:
--   auto_renew            true when Dodo will charge again at expires_at
--   payment_status        rich state — 'active' | 'past_due' | 'cancelled'
--                         | 'refunded' | 'disputed' | 'expired'
--   cancelled_at          when the CUSTOMER cancelled (subscription still
--                         active until expires_at — do NOT confuse with
--                         "premium was revoked"). Distinct from
--                         payment_status='cancelled' which reflects the
--                         subscription-level cancellation flag.
--   last_reminder_sent_at set by the T-3 renewal reminder cron so the
--                         same reminder isn't sent twice
--   dodo_customer_id      for portal deep-linking + reconciliation
--   dodo_subscription_id  for Dodo API operations (cancel, update card…)
--   currency              INR / USD — powers renewal-amount emails
--   amount_cents          for reminder emails ("your ₹350 charge on X")
--   next_renewal_at       decouples "when premium ends" (expires_at) from
--                         "when next auto-charge will happen"

ALTER TABLE admin_user_entitlement_overrides
  ADD COLUMN IF NOT EXISTS auto_renew             BOOLEAN     DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payment_status         TEXT        DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dodo_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS dodo_subscription_id   TEXT,
  ADD COLUMN IF NOT EXISTS currency               TEXT,
  ADD COLUMN IF NOT EXISTS amount_cents           INTEGER,
  ADD COLUMN IF NOT EXISTS next_renewal_at        TIMESTAMPTZ;

-- Indexes for the two access patterns the cron jobs care about.
CREATE INDEX IF NOT EXISTS idx_overrides_expires_at_active
  ON admin_user_entitlement_overrides (expires_at)
  WHERE expires_at IS NOT NULL AND is_premium = TRUE;

CREATE INDEX IF NOT EXISTS idx_overrides_dodo_subscription_id
  ON admin_user_entitlement_overrides (dodo_subscription_id)
  WHERE dodo_subscription_id IS NOT NULL;

-- ── 2. Processed-webhook idempotency table ───────────────────────────
-- Every Dodo webhook carries a unique event id. Dodo will retry an event
-- until it gets a 200 response — that means the same event id can arrive
-- multiple times if a previous 200 was lost in transit. We record every
-- event id we've fully processed here and skip re-processing on repeat.
-- The 30-day retention (via periodic cleanup or a Supabase TTL policy)
-- is way beyond Dodo's retry window (max ~72h).
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  event_id      TEXT        PRIMARY KEY,   -- Dodo's event id (webhook-id header / raw.id)
  event_type    TEXT,                       -- for observability
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome       TEXT,                       -- 'granted' | 'revoked' | 'noop' | 'error'
  detail        JSONB                       -- full parsed event for forensics
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON processed_webhook_events (processed_at DESC);

-- ── 3. Grants + RLS (same pattern as before — see PR #186 for context) ─
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_user_entitlement_overrides TO anon, authenticated;
GRANT SELECT, INSERT                  ON processed_webhook_events          TO anon, authenticated;

ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS processed_webhook_events_all ON processed_webhook_events;
CREATE POLICY processed_webhook_events_all
  ON processed_webhook_events
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
