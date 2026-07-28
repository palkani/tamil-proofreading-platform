/**
 * Handwriting OCR access + usage quota.
 *
 * Policy:
 *   - Anonymous:            NO access — 401 login_required (the page route also
 *                           redirects to /login before the tool ever renders).
 *   - Admin allowlist / JWT admin: unlimited.
 *   - Free (logged in):     3 extractions TOTAL (lifetime, until upgrade — never resets).
 *   - Paid (backend is_premium): 20 extractions per MONTH (resets the 1st, UTC).
 *
 * Paid status source of truth: the Go backend `GET /api/v1/billing/me`
 * (-> billing.is_premium) — the JWT in req.user carries no subscription field.
 *
 * Quota storage: reuses the existing `increment_ocr_usage(p_ip, p_date)` Supabase RPC
 * and the handwriting_ocr_usage table (PK ip+usage_date) with NO schema change. The
 * `p_ip` column is used as a generic key:
 *   - Paid monthly:  p_ip = "user:<email>",   p_date = first day of the month.
 *   - Free weekly:   p_ip = "userwk:<email>", p_date = Monday of the week.
 * A new row per period = automatic reset; the two namespaces never collide.
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

const MONTHLY_LIMIT = 20;    // paid, per calendar month
const FREE_TOTAL_LIMIT = 3;  // free, LIFETIME (until upgrade) — not a periodic reset
// Fixed bucket "date" so the free counter never rolls over: one row per user, forever.
const FREE_LIFETIME_KEY = '2000-01-01';

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

/** First day of the current month, 'YYYY-MM-01' (UTC). */
function monthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function isAdmin(req) {
  const email = String(req.user?.email || '').toLowerCase().trim();
  return (!!email && ADMIN_ALLOWLIST.includes(email)) || req.user?.isAdmin === true;
}

/** Ask the backend whether this user is premium. { premium, ok }. */
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
      return { premium: !!resp.data.billing.is_premium, ok: true };
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
    //   pro  → 20 per calendar month (resets the 1st)
    //   free → 3 LIFETIME, until they upgrade (fixed bucket key = never resets)
    const tier = premium ? 'pro' : 'free';
    const pIp = premium ? `user:${email}` : `userfree:${email}`;
    const pDate = premium ? monthKey() : FREE_LIFETIME_KEY;
    const limit = premium ? MONTHLY_LIMIT : FREE_TOTAL_LIMIT;

    const used = await readCount(pIp, pDate);
    if (used >= limit) {
      if (tier === 'free') {
        return res.status(429).json({
          success: false,
          upgrade_required: true, // shows the upgrade card in the tool UI
          error: `You've used all ${FREE_TOTAL_LIMIT} free conversions. Upgrade to Pro for ${MONTHLY_LIMIT} per month.`,
          limit: { tier: 'free', total_limit: FREE_TOTAL_LIMIT, used, remaining: 0, resets_at: 'never (one-time free allowance)' },
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

module.exports = ocrMonthlyLimit;
module.exports.recordSuccess = recordSuccess;
module.exports.MONTHLY_LIMIT = MONTHLY_LIMIT;
module.exports.FREE_TOTAL_LIMIT = FREE_TOTAL_LIMIT;
