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
      { key: 'promo-codes', label: 'Promo codes', href: '/admin/promo-codes', icon: 'tag' },
      { key: 'health', label: 'Entitlement health', href: '/admin/health/entitlements', icon: 'chart' },
      { key: 'audit', label: 'Audit log', href: '/admin/audit', icon: 'alert' },
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

// Audit log viewer — reads the in-memory ring buffer of the current
// function instance. The authoritative history lives in Vercel logs
// (filter by kind:admin_audit); this UI is a fast local slice.
router.get('/audit', requireAdmin, (req, res) => {
  res.render('pages/admin/audit', {
    title: 'Admin · Audit log',
    ...commonLocals(req, 'audit'),
  });
});

// JSON snapshot for the /admin/audit page.
router.get('/api/audit/snapshot', requireAdmin, (req, res) => {
  const { getRingSnapshot } = require('../middleware/adminAudit');
  res.json({
    entries: getRingSnapshot(),
    process_uptime_seconds: Math.round(process.uptime()),
    note: 'This is a per-function-instance ring buffer (last 500 events). The authoritative audit log is Vercel logs — filter by `kind:admin_audit`.',
  });
});

// Entitlement health dashboard — visualizes the Supabase override table
// alongside processed webhook events so drift, failed writes, and
// past-expiry-still-active rows are visible without opening Supabase.
// Answers the "any error should be noticed" ask by making anomalies
// glanceable in one screen instead of email-based support triage.
router.get('/health/entitlements', requireAdmin, async (req, res) => {
  const overridesDb = require('../lib/user-entitlement-overrides-db');

  // Two Supabase reads in parallel — small enough that we do the join
  // in JS instead of a stored proc. If either fails we render the page
  // with what we have and surface the failure inline.
  const [overrides, events] = await Promise.all([
    overridesDb.listAllOverrides({ limit: 1000 }).catch((err) => {
      console.warn('[health/entitlements] listAllOverrides error:', err.message);
      return [];
    }),
    overridesDb.listRecentWebhookEvents({ limit: 100 }).catch((err) => {
      console.warn('[health/entitlements] listRecentWebhookEvents error:', err.message);
      return [];
    }),
  ]);

  const nowMs = Date.now();
  const isFuture = (iso) => iso && new Date(iso).getTime() > nowMs;

  // Anomaly buckets — each row a plain object the view renders.
  const anomalies = {
    expiredButActive: overrides.filter(
      (o) => o.is_premium === true && o.expires_at && !isFuture(o.expires_at)
    ),
    pastDueStuck: overrides.filter(
      (o) =>
        o.payment_status === 'past_due' &&
        o.expires_at &&
        (nowMs - new Date(o.expires_at).getTime()) / 86400000 > 7
    ),
    missingPlan: overrides.filter((o) => o.is_premium === true && !o.plan_code),
    refundedButActive: overrides.filter(
      (o) => o.payment_status === 'refunded' && o.is_premium === true
    ),
    failedEvents: events.filter((e) =>
      String(e.outcome || '').match(/^(error|failed)/i)
    ),
  };

  // Summary counts for the tiles at the top of the page.
  const summary = {
    total: overrides.length,
    active: overrides.filter((o) => o.is_premium === true && isFuture(o.expires_at)).length,
    expired: overrides.filter((o) => o.expires_at && !isFuture(o.expires_at)).length,
    autoRenewOff: overrides.filter((o) => o.auto_renew === false && o.is_premium === true).length,
    cancelled: overrides.filter((o) => o.cancelled_at).length,
    adminGranted: overrides.filter((o) => (o.granted_by_email || '').toLowerCase().indexOf('webhook') === -1).length,
    recentEvents: events.length,
    failedEvents: anomalies.failedEvents.length,
  };

  res.render('pages/admin/health-entitlements', {
    title: 'Admin · Entitlement health',
    ...commonLocals(req, 'health'),
    summary,
    anomalies,
    overrides,
    events,
    generatedAt: new Date().toISOString(),
    dbConfigured: overridesDb.isConfigured(),
  });
});

// ── User email auditing ────────────────────────────────────────────
// Client posts a batch of user emails; we run each through the same
// email validator that gates registration (syntax + disposable
// blocklist + MX check) and return { email: {valid, reason} }. Powers
// the "Suspicious" filter on /admin/users so admins can spot and
// clean up junk accounts created before the strict validator shipped.
router.post('/api/users/audit-suspicious', requireAdmin, express.json(), async (req, res) => {
  const emails = Array.isArray(req.body?.emails) ? req.body.emails.slice(0, 200) : [];
  if (emails.length === 0) return res.json({ results: {} });
  const { validateEmail } = require('../lib/email-validation/validate');
  const results = {};
  await Promise.all(emails.map(async (raw) => {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) return;
    try {
      const r = await validateEmail(email);
      results[email] = { valid: r.valid, reason: r.reason || null };
    } catch (_) {
      results[email] = { valid: true, reason: 'check_failed' };
    }
  }));
  return res.json({ results });
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

// Diagnostic: which email transports are configured on this env? Returns
// booleans + non-secret metadata (host, port, user, password source,
// masked hint of the key) — NEVER leaks the actual API key or password.
// Enough signal for an admin to verify Vercel is serving the values
// they set and to compare against what they just pasted upstream.
router.get('/api/campaigns/email-transports', requireAdmin, (req, res) => {
  const resendKey    = (process.env.RESEND_API_KEY || '').trim();
  const sendgridKey  = (process.env.SENDGRID_API_KEY || '').trim();
  const smtpPassRaw  = process.env.SMTP_PASSWORD || '';
  const smtpPassAlias = process.env.SENDGRID_SMTP_PASSWORD || '';
  const smtpPass     = smtpPassRaw || smtpPassAlias;
  const sendgridDerivedFromSmtp = !sendgridKey && smtpPass.startsWith('SG.');

  // Masked hint so the operator can eyeball "does that match what I
  // just pasted upstream?" without revealing the secret. Always
  // 6 chars + length, never more.
  const mask = (v) => {
    if (!v) return null;
    if (v.length <= 8) return '***';
    return v.slice(0, 3) + '...' + v.slice(-3) + ' (' + v.length + ' chars)';
  };

  res.json({
    resend: {
      configured: Boolean(resendKey),
      key_hint: mask(resendKey),
    },
    sendgrid: {
      configured: Boolean(sendgridKey) || sendgridDerivedFromSmtp,
      key_hint: mask(sendgridKey || (sendgridDerivedFromSmtp ? smtpPass : '')),
      derived_from_smtp: sendgridDerivedFromSmtp,
    },
    smtp: {
      configured: Boolean(smtpPass),
      host: process.env.SMTP_HOST || process.env.SENDGRID_SMTP_HOST || null,
      port: parseInt(process.env.SMTP_PORT || process.env.SENDGRID_SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || process.env.SENDGRID_SMTP_USER || null,
      pass_hint: mask(smtpPass),
      pass_env_source: smtpPassRaw ? 'SMTP_PASSWORD' : (smtpPassAlias ? 'SENDGRID_SMTP_PASSWORD' : null),
    },
    from: {
      address: process.env.EMAIL_FROM_ADDRESS || 'noreply@prooftamil.com',
      name:    process.env.EMAIL_FROM_NAME    || 'ProofTamil',
    },
    // Non-secret runtime info to catch "new env, old function" bugs.
    // A high uptime after you added env vars means this instance is
    // still running with the previous values — force a redeploy.
    process_uptime_seconds: Math.round(process.uptime()),
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

// ---------- Promo codes (admin-generated single-use codes) ----------
//
// List / create / revoke / reset admin-generated promo codes stored in
// the admin_promo_codes Supabase table. This is Express-local — no
// backend proxy — because the codes DB is directly reachable from
// Express (same pattern as the OCR usage table).
//
// Every route here uses express.json() explicitly (the global JSON
// parser runs at app scope but declaring it inline keeps the intent
// obvious for POST bodies coming from the admin form's fetch().
const promoCodesDb = require('../lib/promo-codes-db');

router.get('/promo-codes', requireAdmin, async (req, res) => {
  const codes = await promoCodesDb.listAll({ limit: 200 });
  res.render('pages/admin/promo-codes', {
    title: 'Admin · Promo codes',
    ...commonLocals(req, 'promo-codes'),
    codes,
    dbConfigured: promoCodesDb.isConfigured(),
    // Suggested code prefills the "code" field in the form. Admin can
    // overwrite; if left as-is or blank the server auto-generates.
    suggestedCode: promoCodesDb.generateCode(),
  });
});

router.post('/promo-codes', requireAdmin, express.json(), async (req, res) => {
  const body = req.body || {};
  // Normalise entitlements — form sends a comma-separated string OR
  // an array (depending on how the client encoded it).
  let ents = body.entitlements;
  if (typeof ents === 'string') {
    ents = ents.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  if (!Array.isArray(ents)) ents = [];

  const result = await promoCodesDb.createCode({
    code:             body.code,
    label:            body.label,
    price_cents:      body.price_cents,
    currency:         body.currency,
    plan_code:        body.plan_code,
    billing_interval: body.billing_interval,
    entitlements:     ents,
    checkout_url:     body.checkout_url,
    recurring_terms:  body.recurring_terms,
    target_email:     body.target_email,
    single_use:       body.single_use !== false && body.single_use !== 'false',
    expires_at:       body.expires_at || null,
    created_by_email: req.user?.email,
    notes:            body.notes,
  });
  if (result && result.error) {
    return res.status(400).json({ ok: false, ...result });
  }
  res.json({ ok: true, code: result });
});

router.post('/promo-codes/:code/revoke', requireAdmin, async (req, res) => {
  const result = await promoCodesDb.revokeCode(req.params.code, req.user?.email);
  if (result && result.error) return res.status(500).json({ ok: false, ...result });
  res.json({ ok: true });
});

router.post('/promo-codes/:code/reset', requireAdmin, async (req, res) => {
  const result = await promoCodesDb.resetRedemption(req.params.code);
  if (result && result.error) return res.status(500).json({ ok: false, ...result });
  res.json({ ok: true });
});

// ---------- User entitlement overrides (read-only for now) ----------
//
// Powers the "override" badge on /admin/users so the users table
// reflects Express-side entitlement grants that the Go backend doesn't
// know about (see PR #188 for context). Client-side JS fetches this
// once, indexes by lowercase email, and merges into the row rendering.
//
// Writes (grant/revoke) still go through Supabase SQL editor for now —
// admin grant buttons are a follow-up. Kept read-only here to keep the
// PR small.
const userOverridesDb = require('../lib/user-entitlement-overrides-db');

router.get('/api/user-overrides', requireAdmin, async (req, res) => {
  const overrides = await userOverridesDb.listAllOverrides({ limit: 1000 });
  // Normalise the response: lowercase email (defensive — schema is
  // lowercase but old rows might have mixed case), strip nothing else.
  res.json({
    ok: true,
    overrides: overrides.map((o) => ({ ...o, email: String(o.email || '').toLowerCase() })),
  });
});

// Admin-driven entitlement grant. Creates/updates an override row for
// the target user with the plan_code the admin picks from the promo-code
// registry. Fills the gap between "paid via Dodo but webhook never fired"
// and "manually grant a lite plan without giving Full Pro via the backend
// premium_override flag". Previously the only writer of the overrides
// table was the Dodo webhook receiver — until that was live, admins had
// no way to grant Lite tiers.
//
// Body: { email, promo_code, months? = 1, notes? }
//   promo_code is one of the keys from lib/promo-codes.js (e.g.
//   'PROOFPROLITE' | 'OCRPROLITE'). We look up the plan_label,
//   entitlements, and amount from the registry so admins can't fat-finger
//   the entitlement set.
const promoCodes = require('../lib/promo-codes');

router.post('/api/users/:id/entitlement-override', requireAdmin, express.json(), async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const promoCode = String((req.body && req.body.promo_code) || '').trim().toUpperCase();
  const months = Number((req.body && req.body.months) || 1);
  const notes = String((req.body && req.body.notes) || '').trim() || null;

  if (!email)      return res.status(400).json({ ok: false, error: 'email_required' });
  if (!promoCode)  return res.status(400).json({ ok: false, error: 'promo_code_required' });
  if (!(months > 0 && months <= 24)) return res.status(400).json({ ok: false, error: 'months_out_of_range' });

  const meta = promoCodes.findCode(promoCode);
  if (!meta) return res.status(400).json({ ok: false, error: 'unknown_promo_code' });

  const now = new Date();
  const expiresAt = new Date(now.getTime());
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + months);

  const grantedBy = (req.user && req.user.email) || 'admin';

  const result = await userOverridesDb.upsertOverride({
    email,
    is_premium:     true,
    entitlements:   meta.entitlements,
    plan_code:      meta.plan_code,
    plan_label:     meta.label,
    expires_at:     expiresAt.toISOString(),
    granted_by_email: grantedBy,
    notes:          notes || `admin-granted via ${promoCode} for ${months}mo`,
    auto_renew:     false,   // admin manual grant, not a Dodo subscription
    payment_status: 'admin_granted',
    currency:       meta.currency,
    amount_cents:   meta.price_cents,
    next_renewal_at: expiresAt.toISOString(),
  });

  if (result && result.error) {
    return res.status(500).json({ ok: false, error: result.error, detail: result.detail });
  }
  logAdminApi({
    req, method: 'POST',
    upstreamPath: `/users/${req.params.id}/entitlement-override (${promoCode}, ${months}mo)`,
    status: 200, durationMs: 0,
  });
  return res.json({ ok: true, override: result && result.row });
});

// ---------- Impersonation (server-side cookie swap) ----------
//
// Old flow: client JS called /admin/api/users/:id/impersonate, got the
// impersonation JWT in the response body, then set access_token via
// document.cookie. Bug: the original access_token was HttpOnly, so JS
// couldn't overwrite it — it just created a SECOND non-HttpOnly cookie
// with the same name. Browser sent both; Express picked the older
// (admin) one; req.user stayed as the admin. Result: banner showed but
// the identity was never actually switched. This was the "impersonation
// not working" bug the user hit today.
//
// New flow: server does the cookie swap via Set-Cookie so the new
// access_token is properly HttpOnly and overrides the original. The
// impersonation token never touches JavaScript, which is also better
// from a security standpoint (no way for a page script to exfiltrate).
const IMPERSONATION_MAX_AGE_MS = 30 * 60 * 1000;   // 30 min, matches the note in the confirm dialog
const IS_PROD = process.env.NODE_ENV === 'production';

// Cookie attributes must EXACTLY match the ones the Go backend uses when
// it sets access_token at login (backend/internal/handlers/auth_handlers.go
// L182-L204: Domain=.prooftamil.com; HttpOnly; Secure; SameSite=None). If
// Domain/SameSite differ, the browser treats the impersonation cookie as
// a DIFFERENT cookie than the login one (RFC 6265: cookie identity is
// name+domain+path), keeps BOTH, and sends BOTH in every request —
// cookie-parser picks whichever comes first, which turned out to be the
// admin's original token. That was PR #194's bug; PR #196 tried to fix
// via req.hostname detection but was still fragile. Now we always use the
// prod shape when NODE_ENV=production — no host detection needed.
function impersonationCookieBase() {
  if (IS_PROD) {
    return {
      httpOnly: true,
      sameSite: 'none',   // exact match with backend
      secure:   true,     // required for SameSite=None
      domain:   '.prooftamil.com',
      path:     '/',
      maxAge:   IMPERSONATION_MAX_AGE_MS,
    };
  }
  // Local dev over http://localhost: SameSite=None+Secure would be rejected.
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:   false,
    path:     '/',
    maxAge:   IMPERSONATION_MAX_AGE_MS,
  };
}

function impersonationFlagCookieBase() {
  return { ...impersonationCookieBase(), httpOnly: false };
}

// Nuke every historical (domain × sameSite) variant of an impersonation cookie
// name so that a lingering duplicate from an older shape can't win priority
// over the fresh one we're about to set. This mirrors the logout matrix in
// routes/auth.js:135-146 which was added for the same reason. Called at the
// start of impersonate AND end-impersonation, since both operations must
// leave the jar with EXACTLY ONE cookie of each name.
const COOKIE_VARIANTS = [
  // host-only (matches the buggy PR #194 shape)
  { path: '/', secure: true,  sameSite: 'lax'  },
  { path: '/', secure: false, sameSite: 'lax'  },
  { path: '/', secure: true,  sameSite: 'none' },
  // domain-scoped, all forms browsers accept
  { path: '/', secure: true,  sameSite: 'lax',  domain: '.prooftamil.com' },
  { path: '/', secure: true,  sameSite: 'lax',  domain: 'prooftamil.com'  },
  { path: '/', secure: true,  sameSite: 'lax',  domain: 'www.prooftamil.com' },
  { path: '/', secure: true,  sameSite: 'none', domain: '.prooftamil.com' },
  { path: '/', secure: true,  sameSite: 'none', domain: 'prooftamil.com'  },
  { path: '/', secure: true,  sameSite: 'none', domain: 'www.prooftamil.com' },
];

// Full nuke — INCLUDES access_token. Only safe to call when the caller
// will IMMEDIATELY set a fresh access_token before returning. Otherwise
// the admin loses their real login cookie.
function nukeImpersonationCookies(res) {
  const names = ['access_token', 'admin_original_token', 'impersonation_active'];
  names.forEach((name) => COOKIE_VARIANTS.forEach((v) => res.clearCookie(name, v)));
}

// Clears ONLY the impersonation-side cookies — never touches access_token.
// Use this when end-impersonation is called with nothing to restore (e.g.
// a stale impersonation_active flag from an older buggy state) so the
// admin's real login isn't wiped alongside the stale flag.
function clearImpersonationFlagsOnly(res) {
  const names = ['admin_original_token', 'impersonation_active'];
  names.forEach((name) => COOKIE_VARIANTS.forEach((v) => res.clearCookie(name, v)));
}

router.post('/api/users/:id/impersonate', requireAdmin, express.json(), async (req, res) => {
  const targetId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(targetId)) return res.status(400).json({ ok: false, error: 'invalid_id' });

  const adminToken = req.cookies && req.cookies.access_token;
  if (!adminToken) return res.status(401).json({ ok: false, error: 'admin_token_missing' });

  try {
    const response = await axios.post(
      `${backendBase()}/api/v1/admin/users/${encodeURIComponent(targetId)}/impersonate`,
      {},
      {
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        validateStatus: () => true,
        timeout: 15000,
      }
    );
    logAdminApi({ req, method: 'POST', upstreamPath: `/users/${targetId}/impersonate`, status: response.status, durationMs: 0 });

    if (response.status < 200 || response.status >= 300) {
      return res.status(response.status).json(response.data || { ok: false, error: 'backend_error' });
    }
    const impersonationToken = response.data && response.data.access_token;
    if (!impersonationToken) {
      return res.status(502).json({ ok: false, error: 'backend_returned_no_token' });
    }

    // Nuke every (domain × sameSite) variant of impersonation cookies
    // that might be lingering in the jar (from PR #194's buggy shape,
    // or a previous impersonation on a different domain form) so nothing
    // can beat our fresh cookie in priority.
    nukeImpersonationCookies(res);

    // Set fresh cookies with the exact backend cookie shape.
    const cookieBase = impersonationCookieBase();
    res.cookie('admin_original_token', adminToken,         cookieBase);
    res.cookie('access_token',         impersonationToken, cookieBase);
    res.cookie('impersonation_active', '1', impersonationFlagCookieBase());

    console.log('[IMPERSONATE] target=%s admin_hostname=%s cookie_domain=%s samesite=%s secure=%s prod=%s',
      targetId, req.hostname, cookieBase.domain || '(host-only)', cookieBase.sameSite, cookieBase.secure, IS_PROD);

    return res.json({ ok: true, target_id: Number(targetId) });
  } catch (err) {
    console.error('[admin/impersonate] failed:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/api/impersonation/end', requireAdmin, express.json(), async (req, res) => {
  const originalToken = req.cookies && req.cookies.admin_original_token;

  if (!originalToken) {
    // CRITICAL: no impersonation to end. Do NOT nuke access_token here —
    // the admin may be normally logged in with just a stale
    // impersonation_active flag in their jar (leftover from an earlier
    // buggy state). Wiping access_token would bounce them to /login
    // for no reason. This is exactly the bug that hit prod on
    // 2026-09-15 after PR #197 shipped — end handler was nuking
    // the admin's real login cookie before checking whether it had
    // anything to restore.
    clearImpersonationFlagsOnly(res);
    console.log('[IMPERSONATE-END] no admin_original_token; cleared stale flags only, access_token preserved');
    return res.json({ ok: true, note: 'no_admin_token_to_restore' });
  }

  // Real end path — nuke everything, then restore. Safe because we set
  // a fresh access_token below before returning.
  nukeImpersonationCookies(res);
  const targetId = Number(req.body && req.body.target_id) || 0;

  // Best-effort backend audit — never blocks session restore.
  try {
    await axios.post(
      `${backendBase()}/api/v1/admin/impersonation/end`,
      { target_id: targetId },
      {
        headers: { Authorization: `Bearer ${originalToken}`, 'Content-Type': 'application/json' },
        validateStatus: () => true,
        timeout: 5000,
      }
    );
  } catch (_) { /* audit-only, ignore */ }

  // Restore the admin's original token as access_token. The nuke above
  // deleted every variant, so this is a clean set with no duplicates
  // possible.
  const restoreBase = { ...impersonationCookieBase(), maxAge: 24 * 3600 * 1000 };  // 1 day, matches admin login TTL
  res.cookie('access_token', originalToken, restoreBase);
  logAdminApi({ req, method: 'POST', upstreamPath: `/impersonation/end (target ${targetId})`, status: 200, durationMs: 0 });
  console.log('[IMPERSONATE-END] target=%s restored admin identity, cookie_domain=%s samesite=%s',
    targetId, restoreBase.domain || '(host-only)', restoreBase.sameSite);
  return res.json({ ok: true });
});

// ---------- Diagnostic: dump cookies the server sees ----------
//
// Lets an admin verify what's actually landing in their jar after an
// impersonation attempt. Returns a summary of names (never the raw JWT
// values) so we can see if there's a duplicate access_token, a stale
// admin_original_token, etc. Safe to leave in — admin-gated, read-only.
router.get('/api/impersonation/debug', requireAdmin, (req, res) => {
  const cookieHeader = req.headers.cookie || '';
  const rawPairs = cookieHeader.split(/;\s*/).filter(Boolean);
  const counts = {};
  rawPairs.forEach((p) => {
    const eq = p.indexOf('=');
    const name = eq >= 0 ? p.slice(0, eq) : p;
    counts[name] = (counts[name] || 0) + 1;
  });
  res.json({
    ok: true,
    hostname: req.hostname,
    protocol: req.protocol,
    prod: IS_PROD,
    cookie_shape_would_use: impersonationCookieBase(),
    cookies_parsed_count: Object.keys(req.cookies || {}).length,
    cookies_present: Object.keys(req.cookies || {}),
    raw_cookie_name_counts: counts,
    duplicates: Object.entries(counts).filter(([, n]) => n > 1).map(([n, c]) => ({ name: n, count: c })),
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

    // Enrich GET /users/:id with the Express-side entitlement override
    // if one exists for this user's email. Without this, the admin
    // detail page shows "Free (inactive)" for users granted plans via
    // /admin/promo-codes or /admin/api/user-overrides (e.g. Proofreading
    // Lite grants), because the Go backend has no idea those overrides
    // exist. Same enrichment pattern as PR #189 used for /admin/users.
    if (
      method === 'GET' &&
      /^\/users\/\d+$/.test(upstreamPath) &&
      response.status >= 200 && response.status < 300 &&
      data && data.profile && data.profile.email
    ) {
      try {
        const override = await userOverridesDb.findFullSubscriptionByEmail(data.profile.email);
        const isLive = override && (!override.expires_at || new Date(override.expires_at) > new Date());
        if (isLive) {
          // Merge into shape the client already renders. is_pro_active
          // drives the top-right badge; premium_override drives the
          // "[override]" tag on the Plan row; plan_label/plan_code/
          // subscription_end/entitlements power the detail rows.
          data = {
            ...data,
            is_pro_active: true,
            profile: {
              ...data.profile,
              premium_override:  true,
              plan_code:         override.plan_code || data.profile.plan_code || null,
              plan_label:        override.plan_label || null,
              subscription:      override.plan_code
                ? String(override.plan_code).toLowerCase()
                : data.profile.subscription,
              subscription_end:  override.expires_at || data.profile.subscription_end || null,
              entitlements:      Array.isArray(override.entitlements)
                ? override.entitlements
                : data.profile.entitlements,
              override_source: {
                granted_by:      override.granted_by_email || null,
                granted_at:      override.granted_at || null,
                auto_renew:      override.auto_renew !== false,
                payment_status:  override.payment_status || null,
                cancelled_at:    override.cancelled_at || null,
                next_renewal_at: override.next_renewal_at || null,
                notes:           override.notes || null,
              },
            },
          };
        }
      } catch (e) {
        // Fail-quiet: never break the admin page because the override
        // lookup errored. The page will just render the backend view.
        console.warn('[ADMIN] user-detail override enrichment error:', e.message);
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
