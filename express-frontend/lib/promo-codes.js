/**
 * Static promo-code registry.
 *
 * Simple MVP for code-gated pricing: each entry maps an activation
 * code to a Dodo Payments checkout URL + metadata for the pricing
 * page's plan summary card. When a customer types a code, the
 * frontend validates against this list and redirects them directly
 * to Dodo's hosted checkout.
 *
 * TRADE-OFF vs the fuller backend contract in PROMO_CODES_BACKEND_CONTRACT.md
 * ─────────────────────────────────────────────────────────────────────────
 *   Static link approach (this file):
 *     ✓ Zero backend work — every code is a JSON row here
 *     ✓ Ships today
 *     ✗ Dodo webhook doesn't know which code was used, so ops must
 *       manually match a paid user to the right entitlements
 *     ✗ Adding a code requires editing this file + redeploy (or use
 *       the env-var override below for hot-add)
 *     ✗ No per-code max-redemption / expiry enforcement — Dodo will
 *       accept the payment even if you meant to retire the code
 *
 *   Full backend system (contract doc):
 *     Dynamic per-code price/entitlements/expiry, automatic
 *     entitlement assignment on webhook, admin CRUD. Ship when the
 *     manual-ops burden of the static approach becomes real (~10+
 *     custom customers is my rule of thumb).
 *
 * HOT-ADD WITHOUT REDEPLOY
 * ────────────────────────
 * Set env var `PROMO_CODES_JSON` on Vercel to a JSON array of extra
 * entries (same shape as STATIC_CODES below). They merge on top of
 * this file at boot. Useful for one-off codes without a code push.
 * The env-var codes override same-code entries in STATIC_CODES.
 */

// Keys are UPPER-CASE for lookup. Codes are case-insensitive on the
// wire — the validator upper-cases the input before lookup.
// One Dodo checkout URL is shared across all three codes below (the
// single ₹600/month "ProofTamil Pro Lite" product created 2026-08-29).
// Each code specifies distinct plan LABEL + ENTITLEMENTS so the
// pricing page's plan-summary card shows the right message, but the
// underlying charge is the same ₹600 for now.
//
// When you're ready to actually enforce different feature access:
//   1. Create 2 more Dodo products (e.g., "Proofreading Pro Lite"
//      and "OCR Pro Lite") at whatever prices you want
//   2. Paste their checkout URLs into the two entries below
//   3. Ship the dynamic backend system per PROMO_CODES_BACKEND_CONTRACT.md
//      so entitlements auto-attach on Dodo webhook
// Until then, all Lite customers get Full Pro via the backend BC path
// (see lib/entitlements.js). Acceptable for the first ~10 customers.
const SHARED_LITE_CHECKOUT = 'https://checkout.dodopayments.com/buy/pdt_0NmSZ8Clcj8nUjpvixwq2?quantity=1';

const STATIC_CODES = {
  // ── Proofreading-only Pro Lite ────────────────────────────────────
  'PROOFPROLITE': {
    plan_code:        'PRO_PROOFREAD_LITE',
    label:            'Proofreading Pro Lite',
    price_cents:      60000,             // ₹600.00
    display_price:    '600',
    currency:         'INR',
    billing_interval: 'month',
    entitlements:     ['proofreading', 'export', 'ai_writer'],
    recurring_terms:  'Billed monthly. Unlimited proofreading, no OCR. Cancel anytime — access continues until the end of your current period.',
    checkout_url:     SHARED_LITE_CHECKOUT,
  },

  // ── OCR-only Pro Lite ─────────────────────────────────────────────
  'OCRPROLITE': {
    plan_code:        'PRO_OCR_LITE',
    label:            'OCR Pro Lite',
    price_cents:      60000,             // ₹600.00
    display_price:    '600',
    currency:         'INR',
    billing_interval: 'month',
    entitlements:     ['ocr'],
    recurring_terms:  'Billed monthly. 20 Handwriting-OCR conversions per month. Cancel anytime — access continues until the end of your current period.',
    checkout_url:     SHARED_LITE_CHECKOUT,
  },

  // ── Original catch-all Pro Lite (kept for backward compat) ────────
  //     Delete this entry once no in-flight customer conversations
  //     reference the PROOFTAMIL-LITE code.
  'PROOFTAMIL-LITE': {
    plan_code:        'PRO_LITE',
    label:            'ProofTamil Pro Lite',
    price_cents:      60000,             // ₹600.00
    display_price:    '600',
    currency:         'INR',
    billing_interval: 'month',
    entitlements:     ['proofreading', 'export', 'ai_writer'],
    recurring_terms:  'Billed monthly. Cancel anytime — access continues until the end of your current period.',
    checkout_url:     SHARED_LITE_CHECKOUT,
  },
};

/**
 * Look up a code (case-insensitive). Returns the entry or null.
 * Includes env-var overrides from PROMO_CODES_JSON if set.
 */
function findCode(code) {
  const key = String(code || '').trim().toUpperCase();
  if (!key) return null;

  // Env-var overrides win over the static list — lets ops hot-add
  // or override a code by redeploying with a new env value.
  const envRaw = process.env.PROMO_CODES_JSON || '';
  if (envRaw) {
    try {
      const envMap = JSON.parse(envRaw);
      if (envMap && typeof envMap === 'object' && envMap[key]) {
        return envMap[key];
      }
    } catch (err) {
      console.warn('[promo-codes] PROMO_CODES_JSON is not valid JSON — ignoring:', err.message);
    }
  }
  return STATIC_CODES[key] || null;
}

/**
 * List of all known code slugs — for admin visibility / debugging.
 * Never expose the full registry over the wire; codes are meant to
 * be shared out-of-band with specific customers.
 */
function knownCodes() {
  return Object.keys(STATIC_CODES);
}

module.exports = { findCode, knownCodes };
