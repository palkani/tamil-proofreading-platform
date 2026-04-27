-- ProofTamil — update India pricing to ₹999/month and ₹9599/year.
-- Run in Supabase Dashboard → SQL Editor.
--
-- Why this is needed:
--   The Go AutoMigrate seed only INSERTs plan rows when count == 0; since
--   PRO_MONTHLY/PRO_YEARLY rows already exist in production, code changes
--   to billing_migration.go don't update them. We update via SQL directly.
--
-- Pricing model: backend stores India override in `india_fixed_price_inr_cents`.
-- When > 0 it overrides the USD × multiplier × FX calc. We are setting:
--   PRO_MONTHLY: 999 INR  → 99900 cents
--   PRO_YEARLY:  9599 INR → 959900 cents (~20% off ₹999×12)

BEGIN;

UPDATE plans
SET india_fixed_price_inr_cents = 99900,
    updated_at = NOW()
WHERE code = 'PRO_MONTHLY';

UPDATE plans
SET india_fixed_price_inr_cents = 959900,
    updated_at = NOW()
WHERE code = 'PRO_YEARLY';

-- Sanity check after running. Should return 2 rows with the new values.
SELECT code, name, india_fixed_price_inr_cents, billing_interval, active
FROM plans
WHERE code IN ('PRO_MONTHLY', 'PRO_YEARLY')
ORDER BY code;

COMMIT;
