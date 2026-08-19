/**
 * Guided first-run onboarding for new organization owners.
 *
 *   GET  /onboarding                     → step 1 (name your org) OR redirect
 *                                          into the wizard at your saved step
 *   GET  /onboarding/:orgId/step/:n      → render step n (1..4) for that org
 *   POST /onboarding/:orgId/complete-step body: { step } → mark step done
 *
 * Steps:
 *   1. Name your organization
 *   2. Invite your first teammate (skippable)
 *   3. Try grammar check on sample Tamil text
 *   4. Export as PDF or Word
 *
 * Progress is persisted server-side via enterpriseApi so a user resuming
 * on a different browser lands on the right step.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { enterpriseApi } = require('../lib/enterprise/api');
const { ENTERPRISE_ENABLED } = require('../middleware/orgAccess');

router.use((req, res, next) => {
  if (!ENTERPRISE_ENABLED()) return res.status(404).render('pages/404', { title: 'Not found', seo: {} });
  return next();
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Step 1 — landing / create-org form
router.get('/', requireAuth, wrap(async (req, res) => {
  // If already in an org, jump to whichever step is next.
  try {
    const { organizations } = await enterpriseApi.myOrganizations(req);
    if (organizations && organizations.length > 0) {
      const org = organizations[0];
      const progress = await enterpriseApi.getOnboarding(req, org.id);
      const nextStep = firstIncompleteStep(progress);
      if (nextStep) return res.redirect(`/onboarding/${org.id}/step/${nextStep}`);
      return res.redirect('/org/' + org.id);
    }
  } catch (_) { /* fall through to create-org */ }

  res.render('pages/onboarding/step1', {
    title: 'Welcome to ProofTamil | Setup',
    seo: { title: 'Welcome to ProofTamil | Setup', noIndex: true },
    user: req.user,
    step: 1,
  });
}));

router.get('/:orgId/step/:n', requireAuth, wrap(async (req, res) => {
  const orgId = req.params.orgId;
  const step = parseInt(req.params.n, 10);
  if (!Number.isInteger(step) || step < 1 || step > 4) return res.redirect('/onboarding');

  const org = await enterpriseApi.getOrganization(req, orgId);
  const progress = await enterpriseApi.getOnboarding(req, orgId);

  const view = ['step1', 'step2', 'step3', 'step4'][step - 1];
  res.render(`pages/onboarding/${view}`, {
    title: `Setup step ${step} of 4 | ProofTamil`,
    seo: { title: `Setup step ${step} of 4 | ProofTamil`, noIndex: true },
    user: req.user,
    org,
    progress,
    step,
  });
}));

router.post('/:orgId/complete-step', requireAuth, wrap(async (req, res) => {
  const step = parseInt(req.body?.step, 10);
  if (!Number.isInteger(step) || step < 1 || step > 4) return res.status(400).json({ error: 'invalid_step' });
  const key = ['step_named', 'step_invited', 'step_tried', 'step_exported'][step - 1];
  try {
    const updated = await enterpriseApi.updateOnboarding(req, req.params.orgId, { [key]: true });
    const next = firstIncompleteStep(updated);
    return res.json({ ok: true, progress: updated, next_step: next, redirect_to: next ? `/onboarding/${req.params.orgId}/step/${next}` : `/org/${req.params.orgId}` });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'error' });
  }
}));

function firstIncompleteStep(progress) {
  if (!progress?.step_named) return 1;
  if (!progress?.step_invited) return 2;
  if (!progress?.step_tried) return 3;
  if (!progress?.step_exported) return 4;
  return null;
}

module.exports = router;
