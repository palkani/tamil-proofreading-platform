/**
 * OCR Daily Rate Limiter
 *
 * Limits free/anonymous users to 2 handwriting OCR extractions per IP per day.
 * Premium users bypass the limit entirely.
 *
 * Uses Supabase REST API (via axios) for cross-instance persistence on Vercel.
 * Fails open (allows the request) if Supabase is unreachable — we never block
 * legitimate users due to an infrastructure hiccup.
 *
 * Requires: Supabase table + RPC function from db/migrations/handwriting_ocr_usage.sql
 */

const axios = require('axios');

const FREE_DAILY_LIMIT = 2;

// Supabase connection — reuse the same env var names the rest of the app uses
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/**
 * Extract the real client IP, handling reverse proxies and Vercel's headers.
 */
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'] || '';
  const vercelIP  = req.headers['x-vercel-forwarded-for'] || '';
  const raw = forwarded || vercelIP || req.socket.remoteAddress || '';
  return raw.split(',')[0].trim() || '0.0.0.0';
}

/**
 * Returns true if the authenticated user has an active paid plan.
 * Adjust field names here if your JWT payload uses different keys.
 */
function isPremiumUser(req) {
  if (!req.user) return false;
  const plan = (req.user.plan || req.user.subscription || '').toLowerCase();
  return plan && plan !== 'free' && plan !== '';
}

/**
 * Atomically increment today's usage count for the given IP via the Supabase
 * `increment_ocr_usage` RPC function, then return the new count.
 *
 * Returns { allowed, count, remaining } — or { allowed: true } on error (fail open).
 */
async function incrementAndCheck(ip) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[OCR-LIMIT] Supabase not configured — skipping daily rate limit.');
    return { allowed: true, count: 0, remaining: FREE_DAILY_LIMIT };
  }

  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

  try {
    const response = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/increment_ocr_usage`,
      { p_ip: ip, p_date: today },
      {
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        timeout: 3000, // fail fast — never let a DB call block OCR for more than 3 s
      }
    );

    const newCount = Number(response.data);
    const allowed  = newCount <= FREE_DAILY_LIMIT;

    return {
      allowed,
      count: newCount,
      remaining: Math.max(0, FREE_DAILY_LIMIT - newCount),
      limit: FREE_DAILY_LIMIT,
    };
  } catch (err) {
    // Network error, Supabase down, etc. — fail open so real users aren't blocked.
    console.error('[OCR-LIMIT] Rate limit check error (failing open):', err.message);
    return { allowed: true, count: 0, remaining: FREE_DAILY_LIMIT };
  }
}

/**
 * Express middleware factory.
 *
 * Usage:
 *   const ocrDailyLimit = require('../middleware/ocrDailyLimit');
 *   router.post('/handwriting-ocr/extract-words', ocrDailyLimit(), uploadHandwriting.single('file'), handler);
 */
function ocrDailyLimit() {
  return async (req, res, next) => {
    // Premium / logged-in paid users get unlimited access
    if (isPremiumUser(req)) {
      console.log(`[OCR-LIMIT] Premium user ${req.user?.email || '?'} — bypassing limit`);
      return next();
    }

    const ip     = getClientIP(req);
    const result = await incrementAndCheck(ip);

    console.log(`[OCR-LIMIT] ip=${ip} count=${result.count} allowed=${result.allowed}`);

    if (!result.allowed) {
      return res.status(429).json({
        success: false,
        upgrade_required: true,
        error: `You've used your ${FREE_DAILY_LIMIT} free handwriting extractions for today.`,
        limit: {
          daily_limit: FREE_DAILY_LIMIT,
          used: result.count,
          remaining: 0,
          resets_at: 'midnight UTC',
        },
      });
    }

    // Attach usage info to the request for downstream logging
    req.ocrUsage = result;
    next();
  };
}

module.exports = ocrDailyLimit;
