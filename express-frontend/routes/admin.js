/**
 * Admin console routes.
 *
 * All routes here are gated by requireAdmin (see middleware/admin.js).
 * Data-fetch endpoints proxy to the Go backend's /api/v1/admin/*
 * namespace, which enforces the real security gate (JWT signature +
 * email allowlist + role check + rate limit + audit log).
 *
 * Pages here render server-side EJS shells; anything interactive
 * (search, live tables, modals) fetches via /admin/api/* which
 * proxies to the backend.
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { requireAdmin, isAdminEmail } = require('../middleware/admin');
const { logAdminApi, adminAuditPageMiddleware } = require('../middleware/adminAudit');

// Emit a `kind:admin_audit event:page` line for every admin page render.
// Skipped for /admin/api/* — those go through the proxy handler below,
// which emits its own richer `event:api` line with status + duration.
router.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return requireAdmin(req, res, (err) => {
    if (err) return next(err);
    adminAuditPageMiddleware(req, res, next);
  });
});

// Backend base URL for admin API proxying. Falls back to the same
// value the rest of the app uses; a dedicated ADMIN_BACKEND_URL var
// is respected if operators want to route admin traffic through a
// specific region.
function backendBase() {
  return (
    process.env.ADMIN_BACKEND_URL ||
    process.env.BACKEND_URL_US ||
    process.env.BACKEND_URL ||
    'https://api.prooftamil.com'
  ).replace(/\/$/, '');
}

// All admin pages get the same layout data. Kept in one place so nav
// state stays in sync across pages.
function commonLocals(req, activeTab) {
  return {
    user: req.user,
    activeTab,
    navItems: [
      { key: 'dashboard', label: 'Dashboard', href: '/admin', icon: 'home' },
      { key: 'users', label: 'Users', href: '/admin/users', icon: 'users' },
      { key: 'activity', label: 'Activity', href: '/admin/activity', icon: 'clock' },
      { key: 'issues', label: 'Issues', href: '/admin/issues', icon: 'alert' },
      { key: 'ai-requests', label: 'AI requests', href: '/admin/ai-requests', icon: 'chart' },
      { key: 'blog-generator', label: 'Blog generator', href: '/admin/blog-generator', icon: 'chart' },
      { key: 'communications', label: 'Communications', href: '/admin/communications', icon: 'mail' },
    ],
  };
}

// ---------- Pages ----------

router.get('/', requireAdmin, (req, res) => {
  res.render('pages/admin/dashboard', {
    title: 'Admin · Dashboard',
    ...commonLocals(req, 'dashboard'),
    // Empty scaffolding — real stats land in PR C
    stats: null,
    recentActivity: [],
    recentIssues: [],
  });
});

router.get('/users', requireAdmin, (req, res) => {
  res.render('pages/admin/users', {
    title: 'Admin · Users',
    ...commonLocals(req, 'users'),
  });
});

router.get('/users/:id', requireAdmin, (req, res) => {
  res.render('pages/admin/user-detail', {
    title: 'Admin · User #' + req.params.id,
    ...commonLocals(req, 'users'),
    userId: req.params.id,
  });
});

router.get('/activity', requireAdmin, (req, res) => {
  res.render('pages/admin/activity', {
    title: 'Admin · Activity',
    ...commonLocals(req, 'activity'),
  });
});

router.get('/issues', requireAdmin, (req, res) => {
  res.render('pages/admin/issues', {
    title: 'Admin · Issues',
    ...commonLocals(req, 'issues'),
  });
});

router.get('/ai-requests', requireAdmin, (req, res) => {
  res.render('pages/admin/ai-requests', {
    title: 'Admin · AI requests',
    ...commonLocals(req, 'ai-requests'),
  });
});

// Paginated list of every user with AI-request activity. Overview page
// only shows top 10 by cost; this is the "who's using how much" full
// list used to spot outliers or audit specific accounts.
router.get('/ai-requests/users', requireAdmin, (req, res) => {
  res.render('pages/admin/ai-requests-users', {
    title: 'Admin · AI requests by user',
    ...commonLocals(req, 'ai-requests'),
  });
});

// Single-user drill-down — every call that user made in the window,
// with model/status/latency/cost. Reached by clicking a row in the
// users list or the top-users panel on the overview.
router.get('/ai-requests/user/:id', requireAdmin, (req, res) => {
  res.render('pages/admin/ai-requests-user', {
    title: 'Admin · AI requests · user #' + req.params.id,
    ...commonLocals(req, 'ai-requests'),
    userId: req.params.id,
  });
});

router.get('/blog-generator', requireAdmin, (req, res) => {
  res.render('pages/admin/blog-generator', {
    title: 'Admin · Blog generator',
    ...commonLocals(req, 'blog-generator'),
  });
});

router.get('/communications', requireAdmin, (req, res) => {
  res.render('pages/admin/communications', {
    title: 'Admin · Communications',
    ...commonLocals(req, 'communications'),
  });
});

// ── Marketing campaigns ────────────────────────────────────────────
// Currently ships one campaign: the handwriting-OCR launch email.
// The page renders a live preview, sends a test to any address, and
// (once wired to the backend recipient-list endpoint) can trigger a
// batched send to newsletter subscribers on the Free plan.
router.get('/campaigns/ocr-launch', requireAdmin, (req, res) => {
  const campaign = require('../lib/email/campaigns/ocr-launch');
  const preview = campaign.render({
    name: req.user?.name || 'Preview',
    email: req.user?.email || 'preview@example.com',
  });
  res.render('pages/admin/campaign-ocr-launch', {
    title: 'Admin · OCR launch campaign',
    ...commonLocals(req, 'communications'),
    subject: preview.subject,
    previewHtml: preview.html,
    previewText: preview.text,
    unsubscribeUrl: preview.listUnsubscribe,
  });
});

// Send the exact campaign email to one address for review. Uses the
// shared sendEmail helper (Resend → SendGrid → SMTP).
router.post('/api/campaigns/ocr-launch/test-send', requireAdmin, express.json(), async (req, res) => {
  const to = String(req.body?.to || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim() || 'there';
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  try {
    const campaign = require('../lib/email/campaigns/ocr-launch');
    const { sendEmail } = require('../lib/email/send');
    const { subject, html, text, listUnsubscribe } = campaign.render({ name, email: to });
    const result = await sendEmail({ to, subject, html, text, listUnsubscribe });
    console.log(JSON.stringify({
      kind: 'admin_audit', event: 'campaign_test_send',
      ts: new Date().toISOString(),
      actor: req.user?.email || null,
      campaign: campaign.CAMPAIGN, to, transport: result.transport, ok: result.ok,
    }));
    return res.json({ ok: result.ok, transport: result.transport, error: result.error || null });
  } catch (err) {
    console.error('[campaign-test-send] failed:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------- API proxy ----------
//
// The frontend sends fetch() calls to /admin/api/* which we forward
// to the Go backend's /api/v1/admin/*. The admin's JWT cookie carries
// their identity; we pass it through in an Authorization header so
// the backend can validate + audit-log the call.
router.all('/api/*', requireAdmin, async (req, res) => {
  const upstreamPath = req.path.replace(/^\/api/, '');
  const url = `${backendBase()}/api/v1/admin${upstreamPath}`;
  const method = req.method.toUpperCase();
  const startedAt = Date.now();

  const token = req.cookies && req.cookies.access_token;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  // Only include a body + Content-Type on methods that carry one.
  // Sending Content-Type: application/json with no data on a GET
  // request causes some backends (including our Gin setup) to 400
  // out on JSON binding before the handler even runs.
  const config = {
    method,
    url,
    params: req.query,
    headers,
    validateStatus: () => true,
    timeout: 30000,
  };
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    config.data = req.body;
    headers['Content-Type'] = req.get('Content-Type') || 'application/json';
  }

  try {
    const response = await axios(config);
    logAdminApi({ req, method, upstreamPath, status: response.status, durationMs: Date.now() - startedAt });
    let data = response.data;

    // Hide admin/staff accounts' own events from the Activity feed — repeated staff
    // logins are internal noise, not real user activity. Filtered here (proxy) so no
    // backend change is needed. `total` is best-effort adjusted by what we drop on this
    // page; because the backend paginates on the unfiltered set, the count can be a
    // few off across pages — acceptable for an internal ops view.
    if (upstreamPath === '/activity' && data && Array.isArray(data.activity)) {
      const before = data.activity.length;
      data = { ...data, activity: data.activity.filter((a) => !isAdminEmail(a.email)) };
      if (typeof data.total === 'number') {
        data.total = Math.max(0, data.total - (before - data.activity.length));
      }
    }

    res.status(response.status);
    if (response.headers['content-type']) {
      res.type(response.headers['content-type']);
    }
    return res.send(data);
  } catch (err) {
    logAdminApi({ req, method, upstreamPath, status: 502, durationMs: Date.now() - startedAt });
    console.error('[ADMIN] proxy error:', err.message);
    return res.status(502).json({ error: 'Backend unreachable', details: err.message });
  }
});

module.exports = router;
