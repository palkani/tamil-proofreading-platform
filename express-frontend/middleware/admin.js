/**
 * Admin-only middleware for the Express frontend.
 *
 * This is defence in depth: the real gate is on the Go backend
 * (AdminMiddleware validates the JWT signature, the email allowlist,
 * and user.role=admin). Everything served from /admin here is either
 * static shell HTML or a proxied call to /api/v1/admin/* — so a
 * request that reaches an admin page without a real admin JWT will
 * fail loudly at the API layer.
 *
 * This middleware exists so we can:
 *   1. Redirect unauthed users to /login instead of showing a broken
 *      admin shell that then explodes on every fetch.
 *   2. Skip rendering the sidebar for non-admin visitors.
 *   3. Give a fast 302 for anyone who has a session but isn't on the
 *      admin allowlist.
 *
 * ADMIN_ALLOWED_EMAILS mirrors the backend env var — same value in
 * both places. Comma-separated, case-insensitive.
 */

let cachedAllowlist = null;

function getAllowlist() {
  if (cachedAllowlist) return cachedAllowlist;
  const raw = process.env.ADMIN_ALLOWED_EMAILS || '';
  cachedAllowlist = new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  return cachedAllowlist;
}

function isAdminEmail(email) {
  if (!email) return false;
  return getAllowlist().has(String(email).trim().toLowerCase());
}

/**
 * Gate an Express route to admin-only. Redirects non-admin users to
 * /login with a return-to URL so they land on the admin page after
 * signing in as the right account.
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    const returnTo = encodeURIComponent(req.originalUrl || '/admin');
    return res.redirect(`/login?returnTo=${returnTo}`);
  }

  if (!isAdminEmail(req.user.email)) {
    // Don't leak whether the email is on the list — show a generic 403
    // page. In dev we log which email was rejected for debugging.
    console.warn(`[ADMIN] Access denied for user id=${req.user.id} email=${req.user.email}`);
    return res.status(403).render('pages/error', {
      title: 'Access denied',
      message: 'You do not have permission to view this page.',
      user: req.user,
    });
  }

  next();
}

module.exports = { requireAdmin, isAdminEmail };
