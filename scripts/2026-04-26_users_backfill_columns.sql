-- ProofTamil — backfill missing User columns on Supabase Postgres.
-- Safe to run multiple times: every statement uses IF NOT EXISTS / IF EXISTS.
-- Why: Cloud Run runs with RUN_MIGRATIONS=false to reduce cold-start latency,
-- so recent schema additions to the Go User struct never reached the DB and
-- EnsureOAuthUser fails with "Failed to ensure user" during Google sign-in.
--
-- How to apply: Supabase Dashboard → SQL Editor → New query → paste → Run.

BEGIN;

-- Referral / affiliate tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id ON users(referred_by_user_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_code_used VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_users_affiliate_code_used ON users(affiliate_code_used);

-- Billing / geo
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
CREATE INDEX IF NOT EXISTS idx_users_country_code ON users(country_code);

ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_country_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_customer_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_users_razorpay_customer_id ON users(razorpay_customer_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS dodo_customer_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_users_dodo_customer_id ON users(dodo_customer_id);

-- Admin-controlled premium override
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_override         BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_override_reason  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_override_by_admin BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_override_at      TIMESTAMPTZ;

-- Token version (used to invalidate old JWTs after entitlement changes)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;

-- Soft delete index used by GORM
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

COMMIT;

-- Sanity check after running: this should list every column above.
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'users'
-- ORDER BY ordinal_position;
