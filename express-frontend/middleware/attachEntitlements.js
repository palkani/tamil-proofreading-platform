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

// ── Admin tier preview ───────────────────────────────────────────────
// Admins can preview any plan tier by adding `?preview_tier=X` to any URL:
//
//   ?preview_tier=free                 → is_premium:false, entitlements:[]
//   ?preview_tier=proofreading_lite    → is_premium:true, no OCR
//   ?preview_tier=ocr_lite             → is_premium:true, ONLY ocr
//   ?preview_tier=full_pro             → is_premium:true, all four
//   ?preview_entitlements=proofreading,export  → arbitrary custom set
//   ?preview_tier=off                  → clear preview mode
//
// The tier is persisted in a signed cookie so it survives navigation
// without needing the query param on every URL. Only fires for signed-in
// admins (req.user.isAdmin) — other users are unaffected. Safe in prod:
// even if a non-admin adds ?preview_tier=X the middleware ignores it.
//
// The banner is set on res.locals.previewBanner so templates can surface
// "You are previewing Proofreading Lite" — makes it impossible to
// forget which tier you're testing as.
const PREVIEW_COOKIE = 'preview_tier';
const PREVIEW_TIERS = {
  free:               { is_premium: false, entitlements: [], plan_code: 'FREE',                       label: 'Free' },
  full_pro:           { is_premium: true,  entitlements: ['proofreading', 'ocr', 'export', 'ai_writer'], plan_code: 'PRO_MONTHLY',     label: 'Pro (full)' },
  proofreading_lite:  { is_premium: true,  entitlements: ['proofreading', 'export', 'ai_writer'],       plan_code: 'PRO_PROOFREAD_LITE', label: 'Pro · Proofreading Lite' },
  ocr_lite:           { is_premium: true,  entitlements: ['ocr'],                                        plan_code: 'PRO_OCR_LITE',       label: 'Pro · OCR Lite' },
};

function resolvePreviewBilling(req, res) {
  if (!req.user?.isAdmin) return null;

  const q = req.query || {};
  const rawTier = String(q.preview_tier || '').trim().toLowerCase();
  const rawEnts = String(q.preview_entitlements || '').trim();

  // Explicit clear.
  if (rawTier === 'off' || rawTier === 'none' || rawTier === 'clear') {
    res.clearCookie(PREVIEW_COOKIE);
    return null;
  }

  // Query param wins over cookie. When either is present, refresh the
  // cookie so the preview persists across page navigations.
  let source = null;
  let billing = null;

  if (rawEnts) {
    const ents = rawEnts.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    billing = { is_premium: true, entitlements: ents, plan_code: 'PREVIEW_CUSTOM' };
    source = 'ents:' + ents.join(',');
  } else if (rawTier && PREVIEW_TIERS[rawTier]) {
    billing = { ...PREVIEW_TIERS[rawTier] };
    source = rawTier;
  } else if (rawTier) {
    // Unknown tier name — ignore, don't override.
    return null;
  } else {
    // No query param — try the cookie.
    const cookieTier = req.cookies && req.cookies[PREVIEW_COOKIE];
    if (!cookieTier) return null;
    if (cookieTier.startsWith('ents:')) {
      const ents = cookieTier.slice(5).split(',').filter(Boolean);
      billing = { is_premium: true, entitlements: ents, plan_code: 'PREVIEW_CUSTOM' };
    } else if (PREVIEW_TIERS[cookieTier]) {
      billing = { ...PREVIEW_TIERS[cookieTier] };
    } else {
      // Cookie carries a value we don't recognise — clear it.
      res.clearCookie(PREVIEW_COOKIE);
      return null;
    }
    source = cookieTier;
  }

  // Refresh the cookie (30 min TTL — short so a forgotten preview
  // doesn't linger for days). httpOnly so a compromised page script
  // can't read it; SameSite=lax so it survives normal navigations.
  if (source) {
    res.cookie(PREVIEW_COOKIE, source, {
      maxAge: 30 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.locals.previewBanner = 'Previewing tier: ' + (billing.label || source) + ' — add ?preview_tier=off to clear';
    console.log(`[attachEntitlements] preview mode active for admin ${req.user?.email}: ${source}`);
  }
  return billing;
}

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

function applyBilling(req, res, billing) {
  res.locals.billing    = billing;
  res.locals.hasFeature = (feature) => hasFeature(billing, feature);
  res.locals.planLabel  = planLabel(billing);
  req.billing           = billing;
  req.hasFeature        = res.locals.hasFeature;
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
  res.locals.previewBanner = null;
  req.billing = null;
  req.hasFeature = noFeature;

  if (!req.user || !req.cookies?.access_token) return next();

  // Admin preview override — if this signed-in user is an admin and
  // ?preview_tier=X (or a saved cookie) is present, use the simulated
  // billing shape INSTEAD of hitting the real backend. Bypasses the
  // cache too so toggling tier is instant. Non-admins can't trigger this.
  const previewBilling = resolvePreviewBilling(req, res);
  if (previewBilling) {
    applyBilling(req, res, previewBilling);
    return next();
  }

  const backend = resolveBackendUrl();
  if (!backend) return next();

  const cacheKey = req.user.id || req.user.email;
  const cached = cacheKey && cacheGet(cacheKey);
  if (cached) {
    applyBilling(req, res, cached);
    return next();
  }

  try {
    const resp = await pooledAxios.get(backend + '/api/v1/billing/me', {
      headers: { Authorization: 'Bearer ' + req.cookies.access_token },
      validateStatus: () => true,
    });
    if (resp.status === 200 && resp.data && resp.data.billing) {
      const billing = resp.data.billing;
      applyBilling(req, res, billing);
      if (cacheKey) cacheSet(cacheKey, billing);
    }
  } catch (err) {
    // Fail-quiet — defaults above stand.
    console.warn('[attachEntitlements] billing/me fetch failed:', err.message);
  }
  return next();
}

module.exports = { attachEntitlements };
