/**
 * Cross-instance daily Gemini rate limit for authenticated users.
 *
 * The existing in-memory rateLimiter is per Vercel serverless instance.
 * A caller with any concurrency at all trivially cycles between
 * instances and blows past the intended per-IP/minute cap — which is
 * exactly what happened in the 2026-09 abuse incident that burned
 * ~$200 of Gemini credit in ~12 days across the four anonymous
 * endpoints (/api/corrections, /api/corrections/stream,
 * /api/gemini/analyze, /api/gemini/translate). See PR restoring
 * authenticateJWT on those routes for the primary fix; this middleware
 * is the second-layer defense so a single signed-in user can't repeat
 * the same attack from behind a login.
 *
 * Implementation: reuses the handwriting_ocr_usage table +
 * increment_ocr_usage(p_ip, p_date) RPC as a generic per-day counter
 * under the "geminirl:<email>" namespace. Zero migrations — same
 * table + RPC already used by ocrMonthlyLimit under different
 * namespace prefixes ("user:", "usermofree:").
 *
 * Failure posture: fails OPEN when Supabase is unreachable — never
 * lock real users out over a counter hiccup. The primary defense
 * (authenticateJWT) still applies; a Supabase outage removes only
 * the second layer.
 */

const axios = require('axios');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function utcDayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
}

/**
 * Build the middleware. `limit` is the maximum successful *checks* per
 * user per UTC calendar day. Set generously — a real interactive user
 * fires many corrections calls per document; the goal is to catch
 * scripted abuse, not to throttle honest use.
 *
 * @param {number} limit  Requests allowed per user per day (default 500)
 */
function geminiDailyRateLimit(limit = 500) {
  return async (req, res, next) => {
    // authenticateJWT must run before this — it stamps req.authUser.
    // Falls back to req.user (attachUser) in case route ordering changes.
    const email = String(
      req.authUser?.email || req.user?.email || ''
    ).toLowerCase().trim();

    if (!email) {
      // Should not reach here behind authenticateJWT; fail closed.
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Supabase misconfigured or unreachable → fail OPEN. The primary
    // gate (auth) still applies; skipping the second layer once is
    // safer than locking every signed-in user out.
    if (!SUPABASE_URL || !SUPABASE_KEY) return next();

    const pIp = `geminirl:${email}`;
    const pDate = utcDayKey();

    let count = 0;
    try {
      const resp = await axios.post(
        `${SUPABASE_URL}/rest/v1/rpc/increment_ocr_usage`,
        { p_ip: pIp, p_date: pDate },
        { headers: supabaseHeaders(), timeout: 3000 }
      );
      count = Number(resp.data) || 0;
    } catch (err) {
      console.error('[GEMINI-RATELIMIT] increment failed (failing open):', err.message);
      return next();
    }

    if (count > limit) {
      console.warn(`[GEMINI-RATELIMIT] ${email} exceeded daily limit: ${count}/${limit}`);
      return res.status(429).json({
        error: 'daily_ai_limit_reached',
        message: `You've reached today's AI proofreading limit (${limit}/day). Resets at 00:00 UTC.`,
        limit,
        used: count,
      });
    }

    return next();
  };
}

module.exports = geminiDailyRateLimit;
