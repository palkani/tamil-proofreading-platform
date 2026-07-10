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
const { requireAdmin } = require('../middleware/admin');

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
    res.status(response.status);
    if (response.headers['content-type']) {
      res.type(response.headers['content-type']);
    }
    return res.send(response.data);
  } catch (err) {
    console.error('[ADMIN] proxy error:', err.message);
    return res.status(502).json({ error: 'Backend unreachable', details: err.message });
  }
});

module.exports = router;
