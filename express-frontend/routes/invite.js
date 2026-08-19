/**
 * Invite acceptance flow.
 *
 * Path shape:
 *   GET  /invite/:token   → public landing page. Shows "You've been
 *                           invited to <org> as <role>" and one of:
 *                             • "Sign in to accept" (anonymous)
 *                             • "Accept" button (signed in, email matches)
 *                             • "Sign out and sign in as <invited email>"
 *                               (signed in, wrong email)
 *   POST /invite/:token/accept → auth-required JSON handler that calls
 *                                the backend acceptInvite endpoint and
 *                                redirects to /org/:orgId on success.
 */

const express = require('express');
const router = express.Router();
const { enterpriseApi } = require('../lib/enterprise/api');
const { ENTERPRISE_ENABLED } = require('../middleware/orgAccess');

router.use((req, res, next) => {
  if (!ENTERPRISE_ENABLED()) return res.status(404).render('pages/404', { title: 'Not found', seo: {} });
  return next();
});

router.get('/:token', async (req, res) => {
  const token = String(req.params.token || '');
  try {
    const invite = await enterpriseApi.lookupInvite(req, token);
    const signedInEmail = String(req.user?.email || '').toLowerCase();
    const invitedEmail = String(invite.email || '').toLowerCase();
    const state = !req.user
      ? 'anonymous'
      : signedInEmail === invitedEmail ? 'ready' : 'wrong_user';

    res.render('pages/invite-accept', {
      title: `Join ${invite.organization.name} | ProofTamil`,
      seo: { title: `Join ${invite.organization.name} | ProofTamil`, noIndex: true },
      user: req.user,
      invite,
      token,
      state,
    });
  } catch (err) {
    return res.status(err.status || 500).render('pages/invite-accept', {
      title: 'Invite | ProofTamil',
      seo: { title: 'Invite | ProofTamil', noIndex: true },
      user: req.user || null,
      invite: null,
      token,
      state: 'error',
      errorMessage:
        err.status === 404 ? 'This invite link is not valid.'
        : err.status === 410 ? 'This invite has expired or been revoked.'
        : err.status === 409 ? 'This invite has already been accepted.'
        : 'We could not load this invite.',
    });
  }
});

router.post('/:token/accept', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  try {
    const org = await enterpriseApi.acceptInvite(req, String(req.params.token));
    return res.json({ ok: true, redirect_to: '/org/' + org.id });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || 'error',
      ...(err.data ? { details: err.data } : {}),
    });
  }
});

module.exports = router;
