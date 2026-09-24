/**
 * ProofTamil shutdown-mode kill switch (Express side).
 *
 * When SHUTDOWN_MODE=true, the app enters "wind-down" mode:
 *
 *   ✔ Users can still sign in, view /drafts, view individual drafts,
 *     export/download their work, and sign out.
 *   ✖ Every AI-billing endpoint (proofreading, corrections, OCR,
 *     translate, rewrite, AI content writer, submissions/create)
 *     returns 503 with a shutdown message — no Gemini spend possible.
 *   ✖ New signups are blocked (POST /auth/register + /auth/social).
 *   ✖ Workspace / tool pages redirect to /drafts so users land on
 *     the one page they actually need.
 *   ✔ Every rendered page shows a banner via res.locals.shutdownMode
 *     (partials/shutdown-banner.ejs).
 *
 * Reversible: unset the env var and redeploy — everything works again.
 * There's an intentionally separate Go-side kill switch on the backend
 * (backend/internal/middleware/shutdown.go); this Express one gives
 * users a nice message and blocks the majority of traffic that hits
 * Vercel first, but the backend gate is the definitive "no spend"
 * boundary — a client that bypasses Vercel to hit api.prooftamil.com
 * directly still gets 503.
 */

const SHUTDOWN_MODE = String(process.env.SHUTDOWN_MODE || '').toLowerCase() === 'true';

// API paths blocked in ALL methods. Everything on this list is either
// a direct Gemini caller or a proxy that reaches one. Kept as regexes
// rather than an exact map so an accidental new sibling endpoint under
// the same prefix (say /api/ocr/foo/bar) still gets caught.
const BLOCKED_API_PATTERNS = [
  /^\/api\/gemini\//,
  /^\/api\/corrections(\/|$)/,
  /^\/api\/rewrite(\/|$)/,
  /^\/api\/handwriting-ocr(\/|$)/,
  /^\/api\/ocr(\/|$)/,
  /^\/api\/ai-content-writer(\/|$)/,
  /^\/api\/submit(\/|$)/,          // proofread submit
  /^\/api\/v1\/submit(\/|$)/,      // Vercel rewrite target
  /^\/api\/v1\/submissions\/[^/]+\/stream/,  // SSE re-analysis (Gemini)
];

// Method + path pairs blocked. Distinguishes GET /api/submissions/:id
// (read a draft — allowed) from POST /api/submissions (create — blocked
// as it triggers proofreading).
const BLOCKED_METHOD_PATTERNS = [
  { method: 'POST',   pattern: /^\/auth\/register$/ },
  { method: 'POST',   pattern: /^\/auth\/social$/ },
  { method: 'POST',   pattern: /^\/api\/submissions(\/|$)/ },
  { method: 'PUT',    pattern: /^\/api\/submissions(\/|$)/ },
  { method: 'PATCH',  pattern: /^\/api\/submissions(\/|$)/ },
  { method: 'POST',   pattern: /^\/api\/v1\/submissions(\/[^/]+)?$/ },
  { method: 'PUT',    pattern: /^\/api\/v1\/submissions(\/|$)/ },
];

// Page routes that redirect to /drafts because the underlying feature
// is off. Anonymous users still bounce through requireAuth → /login
// naturally on the redirect target.
const REDIRECT_PAGE_PATTERNS = [
  /^\/workspace(\/|$)/,
  /^\/tools\//,
  /^\/register(\/|$)/,
  /^\/signup(\/|$)/,
];

function isBlockedApi(req) {
  const path = req.path;
  for (const p of BLOCKED_API_PATTERNS) if (p.test(path)) return true;
  for (const { method, pattern } of BLOCKED_METHOD_PATTERNS) {
    if (req.method === method && pattern.test(path)) return true;
  }
  return false;
}

function isRedirectPage(req) {
  if (req.method !== 'GET') return false;
  const path = req.path;
  for (const p of REDIRECT_PAGE_PATTERNS) if (p.test(path)) return true;
  return false;
}

function isNewSignupBlock(req) {
  return (
    (req.method === 'POST' && (req.path === '/auth/register' || req.path === '/auth/social'))
  );
}

function shutdownGuard(req, res, next) {
  // Expose the flag to EJS templates so the banner shows on every page.
  // Done outside the SHUTDOWN_MODE branch so a caller can pre-render
  // the banner in a preview environment by setting shutdownMode manually.
  res.locals.shutdownMode = SHUTDOWN_MODE;

  if (!SHUTDOWN_MODE) return next();

  // API blocks — 503 with a JSON message the client can display.
  if (isBlockedApi(req)) {
    const message = isNewSignupBlock(req)
      ? 'ProofTamil is winding down and is no longer accepting new signups.'
      : 'ProofTamil is winding down. AI proofreading, OCR and editing tools are disabled. Your drafts remain accessible at /drafts.';
    return res.status(503).json({
      error: 'shutdown_mode',
      message,
      drafts_url: '/drafts',
    });
  }

  // Page redirects — send tool / workspace / register visitors to /drafts.
  if (isRedirectPage(req)) {
    return res.redirect(302, '/drafts?shutdown=1');
  }

  return next();
}

module.exports = shutdownGuard;
module.exports.SHUTDOWN_MODE = SHUTDOWN_MODE;
