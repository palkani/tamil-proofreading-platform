/**
 * OCR v2 beta feature-flag middleware.
 *
 * Reads OCR_V2_BETA_EMAILS (comma-separated, case-insensitive) at
 * boot and exposes helpers for:
 *   - Deciding whether the current request's user should see the v2 UI
 *   - Guarding /api/ocr-v2/* endpoints (401/403 for non-beta users)
 *
 * Not on the list → sees the existing maintenance page + 503 API.
 * The v2 rollout expands the list over time; no code redeploy needed
 * beyond a Vercel env-var update.
 *
 * Admin allowlist (from middleware/admin.js) gets automatic access —
 * so ops can always test in prod without touching this env var.
 */

const { isAdminEmail } = require('./admin');

let cachedList = null;

function getBetaList() {
  if (cachedList) return cachedList;
  const raw = process.env.OCR_V2_BETA_EMAILS || '';
  cachedList = new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return cachedList;
}

/**
 * Is this user allowed to see / use OCR v2?
 * Returns true if:
 *   - user is on the OCR_V2_BETA_EMAILS allowlist
 *   - OR user is an admin (via existing admin allowlist)
 */
function isOcrV2BetaUser(req) {
  const email = String(req.user?.email || '').toLowerCase().trim();
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  return getBetaList().has(email);
}

/**
 * Middleware that gates /api/ocr-v2/* endpoints.
 * Anonymous → 401. Non-beta authenticated → 403 with a clear message.
 * Beta user → next().
 */
function requireOcrV2Beta(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'auth_required', message: 'Sign in to use OCR.' });
  }
  if (!isOcrV2BetaUser(req)) {
    return res.status(403).json({
      error: 'beta_only',
      message: 'OCR is currently in limited beta. Contact support to request access.',
    });
  }
  next();
}

module.exports = { isOcrV2BetaUser, requireOcrV2Beta };
