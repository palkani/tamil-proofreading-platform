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
 * render (with a small in-memory cache) and stashes:
 *   res.locals.billing          — raw billing object (or null)
 *   res.locals.hasFeature       — (feature) => boolean, from lib/entitlements
 *   res.locals.planLabel        — "Free" | "Pro" | "Pro · OCR Lite" | …
 *   req.billing                 — same object, for downstream API handlers
 *   req.hasFeature              — same function
 *
 * Templates can then do:
 *   <% if (hasFeature('ocr')) { %> …OCR nav link… <% } %>
 *
 * Perf notes
 * ──────────
 * - Uses a keep-alive HTTP agent (like axiosWithPool in routes/*) so
 *   authenticated pages don't pay a fresh TCP+TLS handshake each time.
 * - Caches billing/me per user for 30 s in memory to short-circuit
 *   repeat renders in the same nav burst.
 *
 * Failure posture
 * ───────────────
 * If billing/me fails (network, backend down, 5xx), hasFeature() falls
 * back to `undefined billing` → returns false for everything → user sees
 * the free-tier experience. That's the safe direction: never grant a
 * paid feature on an inference from a failed fetch.
 */

const axios = require('axios');
const http = require('node:http');
const https = require('node:https');
const { hasFeature, planLabel } = require('../lib/entitlements');

const httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 25, timeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 25, timeout: 30000 });
const pooledAxios = axios.create({ httpAgent, httpsAgent, timeout: 3000 });

// Small in-memory per-user cache. Keyed by user id (or email as fallback).
// 30-second TTL — long enough to absorb a nav burst, short enough that
// a plan change is picked up before the user notices. Bounded LRU via
// simple size cap; enough for a single-instance workload.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 500;
const billingCache = new Map();  // key -> { billing, expiresAt }

function cacheGet(key) {
  const entry = billingCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    billingCache.delete(key);
    return null;
  }
  return entry.billing;
}

function cacheSet(key, billing) {
  if (billingCache.size >= CACHE_MAX) {
    // Simple eviction — drop the oldest entry (Map preserves insertion order).
    const oldest = billingCache.keys().next().value;
    if (oldest) billingCache.delete(oldest);
  }
  billingCache.set(key, { billing, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Resolve the backend URL the same way every OTHER billing consumer does
// (ocrMonthlyLimit.js, routes/index.js pricing route, etc.). Reading
// req._backendUrl here does NOT work — attachEntitlements is registered
// at app-scope, before the router-scope middleware that stamps that field.
function resolveBackendUrl() {
  const raw = process.env.BACKEND_URL_US
    || process.env.BACKEND_URL_ASIA
    || process.env.BACKEND_URL
    || '';
  return raw.replace(/\/$/, '');
}

async function attachEntitlements(req, res, next) {
  // Defaults — templates and downstream API handlers can always call
  // hasFeature() safely, whether the user is anon, backend is down, or
  // entitlements aren't populated. Set BOTH req.* and res.locals.* up
  // front so error paths can't leave req.hasFeature undefined.
  const noFeature = () => false;
  res.locals.billing = null;
  res.locals.hasFeature = noFeature;
  res.locals.planLabel = 'Free';
  req.billing = null;
  req.hasFeature = noFeature;

  if (!req.user || !req.cookies?.access_token) return next();

  const backend = resolveBackendUrl();
  if (!backend) return next();

  const cacheKey = req.user.id || req.user.email;
  const cached = cacheKey && cacheGet(cacheKey);
  if (cached) {
    res.locals.billing    = cached;
    res.locals.hasFeature = (feature) => hasFeature(cached, feature);
    res.locals.planLabel  = planLabel(cached);
    req.billing           = cached;
    req.hasFeature        = res.locals.hasFeature;
    return next();
  }

  try {
    const resp = await pooledAxios.get(backend + '/api/v1/billing/me', {
      headers: { Authorization: 'Bearer ' + req.cookies.access_token },
      validateStatus: () => true,
    });
    if (resp.status === 200 && resp.data && resp.data.billing) {
      const billing = resp.data.billing;
      res.locals.billing    = billing;
      res.locals.hasFeature = (feature) => hasFeature(billing, feature);
      res.locals.planLabel  = planLabel(billing);
      req.billing           = billing;
      req.hasFeature        = res.locals.hasFeature;
      if (cacheKey) cacheSet(cacheKey, billing);
    }
  } catch (err) {
    // Fail-quiet — defaults above stand.
    console.warn('[attachEntitlements] billing/me fetch failed:', err.message);
  }
  return next();
}

module.exports = { attachEntitlements };
