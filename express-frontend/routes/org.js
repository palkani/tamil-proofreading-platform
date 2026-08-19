/**
 * Organization / team routes.
 *
 * Pages:
 *   GET  /org                         → your orgs (or redirect to onboarding)
 *   GET  /org/new                     → onboarding wizard entry
 *   GET  /org/:orgId                  → admin console (all sections in one page)
 *
 * JSON API (frontend-only proxies over enterpriseApi so client fetch()
 * calls don't need to know about mock-mode or backend URL):
 *   GET    /org/:orgId/api/members
 *   PATCH  /org/:orgId/api/members/:userId          body: { role }
 *   DELETE /org/:orgId/api/members/:userId
 *   GET    /org/:orgId/api/invites?status=pending
 *   POST   /org/:orgId/api/invites                   body: { emails, role }
 *   DELETE /org/:orgId/api/invites/:inviteId
 *   PATCH  /org/:orgId/api/settings                  body: { name?, data_retention_days? }
 *   POST   /org                                      body: { name, slug }  (create org)
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { requireOrg, ENTERPRISE_ENABLED } = require('../middleware/orgAccess');
const { enterpriseApi, MOCK_MODE } = require('../lib/enterprise/api');

// Small helper: wrap async handlers so errors reach the express error path.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Uniform JSON error responder for the /org/:orgId/api/* endpoints.
const jsonError = (res, err) => {
  const status = err.status || 500;
  const body = { error: err.message || 'error', ...(err.data ? { details: err.data } : {}) };
  return res.status(status).json(body);
};

// Guard the whole router behind the enterprise feature flag.
router.use((req, res, next) => {
  if (!ENTERPRISE_ENABLED()) {
    return res.status(404).render('pages/404', { title: 'Not found', seo: {} });
  }
  return next();
});

// ── /org — your orgs list ────────────────────────────────────────────────
router.get('/', requireAuth, wrap(async (req, res) => {
  const { organizations } = await enterpriseApi.myOrganizations(req);
  if (!organizations || organizations.length === 0) {
    return res.redirect('/onboarding');
  }
  if (organizations.length === 1) {
    return res.redirect('/org/' + organizations[0].id);
  }
  res.render('pages/org/list', {
    title: 'Your organizations | ProofTamil',
    seo: { title: 'Your organizations | ProofTamil', noIndex: true },
    user: req.user,
    organizations,
    mockMode: MOCK_MODE,
  });
}));

// Create org endpoint (used by onboarding wizard's step 1).
router.post('/', requireAuth, wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const slug = String(req.body?.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!name || !slug) return res.status(400).json({ error: 'name_and_slug_required' });
  try {
    const org = await enterpriseApi.createOrganization(req, { name, slug });
    return res.json({ ok: true, organization: org });
  } catch (err) {
    return jsonError(res, err);
  }
}));

// ── /org/:orgId — admin console (single page, all sections) ──────────────
router.get('/:orgId', requireAuth, requireOrg('reader'), wrap(async (req, res) => {
  const [members, invitesResp] = await Promise.all([
    enterpriseApi.listMembers(req, req.currentOrg.id),
    req.currentMembership.role === 'owner'
      ? enterpriseApi.listInvites(req, req.currentOrg.id, 'pending')
      : Promise.resolve({ invites: [] }),
  ]);
  res.render('pages/org/admin', {
    title: `${req.currentOrg.name} · Admin | ProofTamil`,
    seo: { title: `${req.currentOrg.name} · Admin | ProofTamil`, noIndex: true },
    user: req.user,
    org: req.currentOrg,
    myRole: req.currentMembership.role,
    members: members.members || [],
    invites: invitesResp.invites || [],
    mockMode: MOCK_MODE,
  });
}));

// ── /org/:orgId/api/* — JSON wrappers around enterpriseApi ───────────────
router.get('/:orgId/api/members', requireAuth, requireOrg('reader'), wrap(async (req, res) => {
  try { return res.json(await enterpriseApi.listMembers(req, req.currentOrg.id)); }
  catch (err) { return jsonError(res, err); }
}));

router.patch('/:orgId/api/members/:userId', requireAuth, requireOrg('owner'), wrap(async (req, res) => {
  try {
    const role = String(req.body?.role || '');
    if (!['owner', 'editor', 'reader'].includes(role)) {
      return res.status(400).json({ error: 'invalid_role' });
    }
    const updated = await enterpriseApi.updateMemberRole(req, req.currentOrg.id, req.params.userId, role);
    return res.json({ ok: true, member: updated });
  } catch (err) { return jsonError(res, err); }
}));

router.delete('/:orgId/api/members/:userId', requireAuth, requireOrg('owner'), wrap(async (req, res) => {
  try { return res.json(await enterpriseApi.removeMember(req, req.currentOrg.id, req.params.userId)); }
  catch (err) { return jsonError(res, err); }
}));

router.get('/:orgId/api/invites', requireAuth, requireOrg('owner'), wrap(async (req, res) => {
  const status = String(req.query.status || 'pending');
  try { return res.json(await enterpriseApi.listInvites(req, req.currentOrg.id, status)); }
  catch (err) { return jsonError(res, err); }
}));

router.post('/:orgId/api/invites', requireAuth, requireOrg('owner'), wrap(async (req, res) => {
  const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const role = req.body?.role === 'reader' ? 'reader' : 'editor';
  if (emails.length === 0) return res.status(400).json({ error: 'no_emails' });
  try { return res.json(await enterpriseApi.createInvites(req, req.currentOrg.id, emails, role)); }
  catch (err) { return jsonError(res, err); }
}));

router.delete('/:orgId/api/invites/:inviteId', requireAuth, requireOrg('owner'), wrap(async (req, res) => {
  try { return res.json(await enterpriseApi.revokeInvite(req, req.currentOrg.id, req.params.inviteId)); }
  catch (err) { return jsonError(res, err); }
}));

router.patch('/:orgId/api/settings', requireAuth, requireOrg('owner'), wrap(async (req, res) => {
  const body = {};
  if (typeof req.body?.name === 'string') body.name = req.body.name.trim();
  if (req.body?.data_retention_days != null) {
    const n = Number(req.body.data_retention_days);
    if (Number.isInteger(n) && n >= 7 && n <= 3650) body.data_retention_days = n;
  }
  try { return res.json(await enterpriseApi.updateOrganization(req, req.currentOrg.id, body)); }
  catch (err) { return jsonError(res, err); }
}));

module.exports = router;
