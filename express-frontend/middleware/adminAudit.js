/**
 * Admin audit logging.
 *
 * Every admin API mutation and every admin page render passes through
 * one of these helpers, which emits a single-line structured JSON log:
 *
 *   {"kind":"admin_audit","event":"api", "actor":"contact@prooftamil.com",
 *    "method":"POST","path":"/users/42/plan","status":200,"ms":183,...}
 *
 * Vercel captures stdout as searchable logs, so `kind:admin_audit` is a
 * ready-made filter for "who touched what and when" investigations. When
 * we move to a persisted `admin_audit_events` table (backend change), the
 * emitter switches from console.log to a DB write; no callers change.
 *
 * We deliberately do NOT log request bodies to avoid capturing user PII
 * (names, emails, payment details) that an admin passed in. Query params
 * ARE logged, with obviously sensitive keys redacted.
 */

const SENSITIVE_QUERY_KEYS = new Set([
  'password', 'token', 'secret', 'api_key', 'apikey', 'access_token',
  'refresh_token', 'authorization', 'auth',
]);

function redactQuery(query) {
  if (!query || typeof query !== 'object') return undefined;
  const out = {};
  let any = false;
  for (const [k, v] of Object.entries(query)) {
    any = true;
    out[k] = SENSITIVE_QUERY_KEYS.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return any ? out : undefined;
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || undefined;
}

/**
 * Log an admin API call (proxied to the Go backend). Called AFTER the
 * upstream request completes so we can capture status + duration.
 */
function logAdminApi({ req, method, upstreamPath, status, durationMs }) {
  try {
    const entry = {
      kind: 'admin_audit',
      event: 'api',
      ts: new Date().toISOString(),
      actor: req.user?.email || null,
      actor_id: req.user?.id || null,
      method,
      path: upstreamPath,
      query: redactQuery(req.query),
      status,
      ms: durationMs,
      ip: clientIp(req),
      ua: req.headers['user-agent'] || undefined,
    };
    console.log(JSON.stringify(entry));
  } catch (err) {
    console.warn('[admin_audit] emit failed:', err.message);
  }
}

/**
 * Log an admin page view. Renders don't hit the API proxy so we log them
 * separately. Useful for "was the drafts page opened while X was signed in?"
 */
function logAdminPage(req) {
  try {
    console.log(JSON.stringify({
      kind: 'admin_audit',
      event: 'page',
      ts: new Date().toISOString(),
      actor: req.user?.email || null,
      actor_id: req.user?.id || null,
      path: req.originalUrl || req.path,
      ip: clientIp(req),
      ua: req.headers['user-agent'] || undefined,
    }));
  } catch (err) {
    console.warn('[admin_audit] emit failed:', err.message);
  }
}

/**
 * Express middleware that emits a page-view audit line before the render
 * handler runs. Attach after requireAdmin so unauthed hits are not logged.
 */
function adminAuditPageMiddleware(req, res, next) {
  logAdminPage(req);
  next();
}

module.exports = { logAdminApi, logAdminPage, adminAuditPageMiddleware };
