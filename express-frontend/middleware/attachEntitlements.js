/**
 * attachEntitlements — page-render middleware that fetches billing state
 * for the signed-in user and exposes hasFeature() to EJS templates.
 *
 * Why it exists
 * ─────────────
 * The Pro Lite tiers + custom promo-coded plans mean every navigation
 * link, CTA, and tool page needs to check "does this user have this
 * feature enabled?". Previously the check happened inside individual
 * API handlers via a per-call fetch to /api/v1/billing/me. That works
 * fine for API endpoints but is awkward in EJS templates, where we'd
 * need a fetch per feature check.
 *
 * This middleware does one billing/me fetch per authenticated page
 * render and stashes:
 *   res.locals.billing          — raw billing object (or null)
 *   res.locals.hasFeature       — (feature) => boolean, from lib/entitlements
 *   res.locals.planLabel        — "Free" | "Pro" | "Pro · OCR Lite" | …
 *   req.billing                 — same object, for downstream API handlers
 *   req.hasFeature              — same function
 *
 * Templates can then do:
 *   <% if (hasFeature('ocr')) { %> …OCR nav link… <% } %>
 *
 * Perf caveats
 * ────────────
 * Adds one ~50-500ms HTTP hop to Cloud Run for every authenticated page
 * request. Acceptable at current scale; consider a per-user in-memory
 * cache (e.g. 30 s TTL keyed by user id) if page render P95 becomes an
 * issue. Anonymous requests skip the fetch entirely.
 *
 * Cache poisoning risk: none — we only cache in req/res scope, never
 * cross-request.
 *
 * Failure posture
 * ───────────────
 * If billing/me fails (network, backend down, 5xx), hasFeature() falls
 * back to `undefined billing` → returns false for everything → user sees
 * the free-tier experience. That's the safe direction: never grant a
 * paid feature on an inference from a failed fetch.
 */

const axios = require('axios');
const { hasFeature, planLabel } = require('../lib/entitlements');

async function attachEntitlements(req, res, next) {
  // Default: no entitlements. Templates should ALWAYS be able to call
  // res.locals.hasFeature() safely, whether the user is anon, the backend
  // is down, or entitlements simply aren't populated.
  res.locals.billing = null;
  res.locals.hasFeature = () => false;
  res.locals.planLabel = 'Free';

  if (!req.user || !req.cookies?.access_token) return next();

  const backend = (req._backendUrl || process.env.BACKEND_URL || '').replace(/\/$/, '');
  if (!backend) return next();

  try {
    const resp = await axios.get(backend + '/api/v1/billing/me', {
      headers: { Authorization: 'Bearer ' + req.cookies.access_token },
      timeout: 3000,
      validateStatus: () => true,
    });
    if (resp.status === 200 && resp.data && resp.data.billing) {
      const billing = resp.data.billing;
      res.locals.billing    = billing;
      res.locals.hasFeature = (feature) => hasFeature(billing, feature);
      res.locals.planLabel  = planLabel(billing);
      req.billing           = billing;
      req.hasFeature        = res.locals.hasFeature;
    }
  } catch (err) {
    // Fail-quiet — templates default to free-tier behaviour.
    console.warn('[attachEntitlements] billing/me fetch failed:', err.message);
  }
  return next();
}

module.exports = { attachEntitlements };
