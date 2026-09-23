/**
 * fetchMergedBilling — the authoritative billing lookup for /api handlers.
 *
 * BACKGROUND
 * ──────────
 * Premium state in this system lives in two places:
 *
 *   1. Go backend (users.subscription, users.premium_override,
 *      subscriptions table). Exposed via GET /api/v1/billing/me.
 *
 *   2. Supabase admin_user_entitlement_overrides. Populated by the
 *      Express Dodo webhook receiver + the admin "Grant Lite" button.
 *      Read via lib/user-entitlement-overrides-db.findOverrideByEmail.
 *
 * Every read that consults ONE of these misses the other half of users:
 * a Lite subscriber whose Pro state lives only in the override table
 * looks like "free" to backend-only readers, and gets misgated. This
 * has been the same class of bug across four PRs now (#195, #200, #201,
 * #202, #203).
 *
 * The page-render layer solves this in middleware/attachEntitlements.js
 * — it fetches both and merges them into res.locals.billing. But that
 * middleware is skipped on /api/* paths (see create-app.js:174) because
 * it would add a billing/me fetch to every keystroke-triggered API call.
 *
 * This helper is the /api/* equivalent: any handler that needs to gate
 * on premium state calls fetchMergedBilling(req) and gets the same
 * merged shape attachEntitlements produces for page renders. Same merge
 * semantics (override.is_premium / entitlements / plan_code REPLACE
 * corresponding backend fields; other backend fields preserved).
 *
 * WHY THIS ISN'T IN attachEntitlements.js
 * ───────────────────────────────────────
 * attachEntitlements owns page-render lifecycle and holds a per-user
 * cache. The /api/* handlers are called less often but need the same
 * merge; extracting keeps both files honest and short. If in future
 * we want /api/* handlers to reuse the attachEntitlements cache,
 * that's a future refactor — this helper's contract stays the same.
 *
 * RESILIENCE
 * ──────────
 * Both fetches run in parallel and each has its own error boundary.
 * If backend billing is unreachable but the override exists, we still
 * return the merged shape (override alone is enough for is_premium /
 * entitlements). If both fail, we return null and the caller falls
 * back to Free-tier semantics — never grant premium on a network hiccup.
 */

const axios = require('axios');
const { findOverrideByEmail } = require('./user-entitlement-overrides-db');

function backendBaseUrl() {
  // Single-region as of 2026-09-22 — the US replica was retired after
  // traffic analysis found 0 real users on it. BACKEND_URL_US /
  // BACKEND_URL_ASIA fallbacks removed. See routes/auth.js header.
  return (process.env.BACKEND_URL || 'https://api.prooftamil.com').replace(/\/$/, '');
}

/**
 * Fetch backend billing/me AND the Supabase entitlement override, merge,
 * return the merged billing shape (same shape backend returns, with
 * override fields overlaid).
 *
 * Returns null if there's no access_token on the request, or if both
 * sources failed to yield data. Callers should treat null as "cannot
 * confirm premium" and gate accordingly.
 *
 * The `email` fallback is important for anonymous flows and for JWT
 * shapes that don't include user.email (belt-and-suspenders — the
 * current backend does put email on the JWT).
 */
async function fetchMergedBilling(req) {
  const token = req.cookies && req.cookies.access_token;
  if (!token) return null;

  const email = String((req.user && req.user.email) || '').toLowerCase().trim();

  const [billingResp, override] = await Promise.all([
    axios.get(backendBaseUrl() + '/api/v1/billing/me', {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 5000,
      validateStatus: () => true,
    }).catch((err) => {
      console.warn('[billing-merge] backend billing/me fetch error:', err.message);
      return null;
    }),
    email
      ? findOverrideByEmail(email).catch(() => null)
      : Promise.resolve(null),
  ]);

  let backendBilling = null;
  if (
    billingResp &&
    billingResp.status === 200 &&
    billingResp.data &&
    billingResp.data.billing
  ) {
    backendBilling = billingResp.data.billing;
  }

  // Merge — override REPLACES is_premium / entitlements / plan_code,
  // preserves everything else on the backend billing shape.
  if (override) {
    return {
      ...(backendBilling || {}),
      is_premium: override.is_premium,
      entitlements: override.entitlements,
      ...(override.plan_code  ? { plan_code:  override.plan_code  } : {}),
      ...(override.plan_label ? { _override_plan_label: override.plan_label } : {}),
    };
  }

  return backendBilling;
}

module.exports = { fetchMergedBilling };
