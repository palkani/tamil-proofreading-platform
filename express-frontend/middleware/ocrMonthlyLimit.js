/**
 * Handwriting OCR access + monthly quota (paid-only).
 *
 * Policy:
 *   - Free / anonymous users:  NO access — 402 pro_required.
 *   - Admin allowlist / JWT admin: unlimited (support/ops).
 *   - Paid users (backend is_premium): 15 extractions per calendar month,
 *     tracked PER ACCOUNT, resetting on the 1st (UTC).
 *
 * Paid status source of truth: the Go backend `GET /api/v1/billing/me`
 * (-> billing.is_premium) — the SAME signal the billing page and the client
 * `_isProUser()` use. The JWT in req.user carries NO subscription field, so we must
 * ask the backend; we forward the user's access_token cookie exactly like the other
 * billing calls in routes/index.js.
 *
 * Quota storage: reuses the existing `increment_ocr_usage(p_ip, p_date)` Supabase RPC
 * and the handwriting_ocr_usage table (PK ip+usage_date) with NO schema change:
 *   - p_ip   = "user:<email>"                 (namespaced so it never collides with a
 *                                              real IP row from the old daily limiter)
 *   - p_date = first day of the current month → a new row per month = automatic reset.
 * The quota is CHECKED here (a read) and only INCREMENTED on a successful extraction
 * (handler calls recordSuccess), so a failed upload never burns one of the 15 credits.
 *
 * Failure posture:
 *   - Supabase unreachable → fail OPEN on the quota (never block a paying customer
 *     over a counter hiccup).
 *   - Backend billing unreachable → fail CLOSED with a retryable 503 (don't hand a
 *     paid feature to unverified users), except admins, who are verified from the JWT
 *     alone and keep working during an outage.
 */

const axios = require('axios');

const MONTHLY_LIMIT = 15;
// Kept in sync with the allowlist in routes/api.js (docx export, blog publish).
const ADMIN_ALLOWLIST = [
  'palkani.r@gmail.com',
  'prooftamil@gmail.com',
  'banu.palkani@gmail.com',
  'contact@prooftamil.com',
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function backendUrl() {
  return (process.env.BACKEND_URL_US || process.env.BACKEND_URL || 'https://api.prooftamil.com').replace(/\/$/, '');
}

/** Current month bucket as 'YYYY-MM-01' (UTC) — the p_date we key rows by. */
function monthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function isAdmin(req) {
  const email = String(req.user?.email || '').toLowerCase().trim();
  return (!!email && ADMIN_ALLOWLIST.includes(email)) || req.user?.isAdmin === true;
}

/**
 * Ask the backend whether this user is premium. Returns { premium, ok } — ok:false
 * means we couldn't verify (network/backend error), which the caller treats as
 * fail-closed-but-retryable.
 */
async function verifyPremium(req) {
  const token = req.cookies && req.cookies.access_token;
  if (!token) return { premium: false, ok: true }; // not logged in → not premium (verified)
  try {
    const resp = await axios.get(backendUrl() + '/api/v1/billing/me', {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 5000,
      validateStatus: () => true,
    });
    if (resp.status === 200 && resp.data && resp.data.billing) {
      return { premium: !!resp.data.billing.is_premium, ok: true };
    }
    // A well-formed non-premium / unauthorized answer is still a verified "no".
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

/** Read this account's usage count for the current month (0 if none / on error). */
async function readMonthlyCount(userKey) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  try {
    const url =
      `${SUPABASE_URL}/rest/v1/handwriting_ocr_usage` +
      `?ip=eq.${encodeURIComponent('user:' + userKey)}` +
      `&usage_date=eq.${monthKey()}&select=count`;
    const resp = await axios.get(url, { headers: supabaseHeaders(), timeout: 3000 });
    return Array.isArray(resp.data) && resp.data[0] ? Number(resp.data[0].count) || 0 : 0;
  } catch (err) {
    console.error('[OCR-LIMIT] monthly read error (failing open):', err.message);
    return 0; // fail open for paying users
  }
}

/** Atomically add one to this account's month bucket; returns the new count. */
async function incrementMonthly(userKey) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  try {
    const resp = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/increment_ocr_usage`,
      { p_ip: `user:${userKey}`, p_date: monthKey() },
      { headers: supabaseHeaders(), timeout: 3000 }
    );
    return Number(resp.data) || 0;
  } catch (err) {
    console.error('[OCR-LIMIT] monthly increment error:', err.message);
    return 0;
  }
}

/**
 * Express middleware: gate access (paid-only) + check (not consume) the monthly quota.
 */
function ocrMonthlyLimit() {
  return async (req, res, next) => {
    // Admins: unlimited, verified from the JWT alone (works during a backend outage).
    if (isAdmin(req)) {
      req.ocrUnlimited = true;
      return next();
    }

    const { premium, ok } = await verifyPremium(req);

    if (!ok) {
      // Couldn't verify subscription — don't hand out a paid feature; ask to retry.
      return res.status(503).json({
        success: false,
        error: 'verify_failed',
        message: 'Could not verify your subscription right now. Please try again in a moment.',
      });
    }

    if (!premium) {
      return res.status(402).json({
        success: false,
        upgrade_required: true, // tells the tool UI to show the upgrade card
        error: 'Handwriting OCR is a Pro feature. Upgrade to extract text from your images.',
        message: 'Handwriting OCR is a Pro feature. Upgrade at /pricing to extract text from your images.',
        upgrade_url: '/pricing',
      });
    }

    // Paid: enforce 15 / month per account.
    const email = String(req.user?.email || '').toLowerCase().trim();
    const userKey = email || String(req.user?.id || req.user?.sub || 'unknown');
    const used = await readMonthlyCount(userKey);
    if (used >= MONTHLY_LIMIT) {
      return res.status(429).json({
        success: false,
        upgrade_required: false,
        error: `You've used all ${MONTHLY_LIMIT} handwriting OCR extractions for this month.`,
        limit: {
          monthly_limit: MONTHLY_LIMIT,
          used,
          remaining: 0,
          resets_at: 'the 1st of next month (UTC)',
        },
      });
    }

    // Under the cap — let it through. The credit is consumed only on success.
    req.ocrQuota = { userKey, used, limit: MONTHLY_LIMIT };
    next();
  };
}

/**
 * Consume one credit — call ONLY after a successful extraction. No-op for admins
 * (unlimited) and when there is no quota context (free users never get this far).
 */
async function recordSuccess(req) {
  if (req.ocrUnlimited || !req.ocrQuota) return;
  const count = await incrementMonthly(req.ocrQuota.userKey);
  console.log(`[OCR-LIMIT] paid ${req.ocrQuota.userKey} consumed 1 → ${count}/${MONTHLY_LIMIT} this month`);
}

module.exports = ocrMonthlyLimit;
module.exports.recordSuccess = recordSuccess;
module.exports.MONTHLY_LIMIT = MONTHLY_LIMIT;
