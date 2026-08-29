/**
 * Handwriting OCR access + usage quota.
 *
 * Policy (2026-08-20 change: free tier moved from lifetime → monthly):
 *   - Anonymous:                    NO access — 401 login_required.
 *   - Admin allowlist / JWT admin:  unlimited.
 *   - Free (logged in):             1 extraction per calendar MONTH (resets 1st, UTC).
 *   - Paid (backend is_premium):    20 extractions per MONTH (resets 1st, UTC).
 *
 * Paid status source of truth: the Go backend `GET /api/v1/billing/me`
 * (-> billing.is_premium) — the JWT in req.user carries no subscription field.
 *
 * Quota storage: reuses the existing `increment_ocr_usage(p_ip, p_date)` Supabase RPC
 * and the handwriting_ocr_usage table (PK ip+usage_date) with NO schema change. The
 * `p_ip` column is used as a generic key:
 *   - Paid monthly:   p_ip = "user:<email>",       p_date = first day of the month.
 *   - Free monthly:   p_ip = "usermofree:<email>", p_date = first day of the month.
 * The `usermofree:` namespace is deliberately new — the old `userfree:` counter used
 * a fixed 2000-01-01 bucket for lifetime tracking; switching namespace gives every
 * existing free user a clean slate at 0/1 for the current month.
 *
 * The quota is CHECKED here (a read) and only INCREMENTED on a successful extraction
 * (handler calls recordSuccess), so a failed upload never burns a credit.
 *
 * Failure posture:
 *   - Supabase unreachable → fail OPEN on the quota (never block over a counter hiccup).
 *   - Backend billing unreachable → treat as FREE tier (still usable, just the lower
 *     limit) rather than locking a paying user out entirely.
 */

const axios = require('axios');

const MONTHLY_LIMIT = 20;      // paid, per calendar month
const FREE_MONTHLY_LIMIT = 1;  // free, per calendar month

// Delegate to the shared admin allowlist (middleware/admin.js reads
// ADMIN_ALLOWED_EMAILS env var). Previously this file kept its own
// hard-coded copy — one of six places in the Express layer that had
// to be updated in lockstep, and drifted twice.
const { isAdminEmail } = require('./admin');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function backendUrl() {
  return (process.env.BACKEND_URL_US || process.env.BACKEND_URL || 'https://api.prooftamil.com').replace(/\/$/, '');
}

/** First day of the current month, 'YYYY-MM-01' (UTC). */
function monthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function isAdmin(req) {
  return isAdminEmail(req.user?.email) || req.user?.isAdmin === true;
}

/**
 * Ask the backend whether this user has the OCR entitlement. { premium, ok }.
 *
 * "premium" here means "has premium OCR quota" — 20/month instead of 1.
 * Under the new tier system (2026-08-29):
 *   Full Pro                → hasFeature(billing, 'ocr') → true  → 20/mo
 *   Pro Proofreading Lite   → hasFeature(billing, 'ocr') → false → 1/mo
 *   Pro OCR Lite            → hasFeature(billing, 'ocr') → true  → 20/mo
 *   Free                    → hasFeature(billing, 'ocr') → false → 1/mo
 *
 * Backward-compat: existing subscribers have is_premium:true and no
 * entitlements field; hasFeature() returns true for them so they keep
 * their 20/mo quota until backend populates entitlements.
 */
async function verifyPremium(req) {
  const token = req.cookies && req.cookies.access_token;
  if (!token) return { premium: false, ok: true };
  try {
    const resp = await axios.get(backendUrl() + '/api/v1/billing/me', {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 5000,
      validateStatus: () => true,
    });
    if (resp.status === 200 && resp.data && resp.data.billing) {
      const { hasFeature, FEATURES } = require('../lib/entitlements');
      return { premium: hasFeature(resp.data.billing, FEATURES.OCR), ok: true };
    }
    if (resp.status === 200 || resp.status === 401 || resp.status === 403) {
      return { premium: false, ok: true };
    }
    return { premium: false, ok: false };
  } catch (err) {
    console.error('[OCR-LIMIT] billing/me check failed:', err.message);
    return { premium: false, ok: false };
  }
}

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

/** Read the usage count for a (key, period) bucket. 0 if none / on error (fail open). */
async function readCount(pIp, pDate) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/handwriting_ocr_usage` +
      `?ip=eq.${encodeURIComponent(pIp)}&usage_date=eq.${pDate}&select=count`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    return Array.isArray(resp.data) && resp.data[0] ? Number(resp.data[0].count) || 0 : 0;
  } catch (err) {
    console.error('[OCR-LIMIT] usage read error (failing open):', err.message);
    return 0;
  }
}

/** Atomically add one to a (key, period) bucket; returns the new count. */
async function increment(pIp, pDate) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  try {
    const resp = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/increment_ocr_usage`,
      { p_ip: pIp, p_date: pDate },
      { headers: supabaseHeaders(), timeout: 3000 }
    );
    return Number(resp.data) || 0;
  } catch (err) {
    console.error('[OCR-LIMIT] usage increment error:', err.message);
    return 0;
  }
}

/**
 * Express middleware: gate access + check (not consume) the tier quota.
 */
function ocrMonthlyLimit() {
  return async (req, res, next) => {
    const email = String(req.user?.email || '').toLowerCase().trim();

    // Anonymous: must sign in. (The page route redirects first; this guards the API.)
    if (!email) {
      return res.status(401).json({
        success: false,
        error: 'login_required',
        message: 'Please sign in to convert handwritten notes to text.',
        login_url: '/login',
      });
    }

    // Admins: unlimited.
    if (isAdmin(req)) {
      req.ocrUnlimited = true;
      return next();
    }

    const { premium } = await verifyPremium(req);

    // Tier → (namespace, bucket, limit). A billing hiccup degrades to the free tier
    // rather than locking anyone out.
    //   pro  → 20 per calendar month (resets the 1st, UTC)
    //   free → 1  per calendar month (resets the 1st, UTC)
    const tier = premium ? 'pro' : 'free';
    const pIp = premium ? `user:${email}` : `usermofree:${email}`;
    const pDate = monthKey();
    const limit = premium ? MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;

    const used = await readCount(pIp, pDate);
    if (used >= limit) {
      if (tier === 'free') {
        return res.status(429).json({
          success: false,
          upgrade_required: true, // shows the upgrade card in the tool UI
          error: `You've used your ${FREE_MONTHLY_LIMIT} free conversion this month. Upgrade to Pro for ${MONTHLY_LIMIT} per month, or wait until the 1st.`,
          limit: { tier: 'free', monthly_limit: FREE_MONTHLY_LIMIT, used, remaining: 0, resets_at: 'the 1st of next month (UTC)' },
        });
      }
      return res.status(429).json({
        success: false,
        upgrade_required: false,
        error: `You've used all ${MONTHLY_LIMIT} conversions for this month.`,
        limit: { tier: 'pro', monthly_limit: MONTHLY_LIMIT, used, remaining: 0, resets_at: 'the 1st of next month (UTC)' },
      });
    }

    // Under the cap — let it through. The credit is consumed only on success.
    req.ocrQuota = { pIp, pDate, limit, tier };
    next();
  };
}

/**
 * Consume one credit — call ONLY after a successful extraction. No-op for admins
 * and when there is no quota context.
 */
async function recordSuccess(req) {
  if (req.ocrUnlimited || !req.ocrQuota) return;
  const { pIp, pDate, limit, tier } = req.ocrQuota;
  const count = await increment(pIp, pDate);
  console.log(`[OCR-LIMIT] ${tier} ${pIp} consumed 1 → ${count}/${limit} (${pDate})`);
}

/**
 * Read-only usage snapshot for the current user — powers the "N/3 uploads left"
 * badge. Does NOT consume anything. Returns:
 *   { loggedIn:false }                                   (anonymous)
 *   { loggedIn:true, tier:'admin', unlimited:true }      (admin)
 *   { loggedIn:true, tier, used, limit, remaining, unlimited:false, period }
 */
async function getUsage(req) {
  const email = String(req.user?.email || '').toLowerCase().trim();
  if (!email) return { loggedIn: false };
  if (isAdmin(req)) return { loggedIn: true, tier: 'admin', unlimited: true };

  const { premium } = await verifyPremium(req);
  const tier = premium ? 'pro' : 'free';
  const pIp = premium ? `user:${email}` : `usermofree:${email}`;
  const pDate = monthKey();
  const limit = premium ? MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
  const used = await readCount(pIp, pDate);
  return {
    loggedIn: true,
    tier,
    unlimited: false,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    period: 'month',
  };
}

module.exports = ocrMonthlyLimit;
module.exports.recordSuccess = recordSuccess;
module.exports.getUsage = getUsage;
module.exports.MONTHLY_LIMIT = MONTHLY_LIMIT;
module.exports.FREE_MONTHLY_LIMIT = FREE_MONTHLY_LIMIT;
