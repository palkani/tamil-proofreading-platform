/**
 * Organization access middleware.
 *
 * Two guards:
 *
 *   requireOrg(minRole)  — attach req.currentOrg + req.currentMembership
 *                          based on :orgId param, ensure caller is a
 *                          member with at least minRole ('reader' |
 *                          'editor' | 'owner'). Redirects to /org (or
 *                          /login) on failure.
 *
 *   loadUserOrgs         — attach req.userOrgs = array of orgs the
 *                          caller belongs to. Used by nav rendering.
 *
 * Both are safe to no-op if the enterprise feature flag is off.
 */

const { enterpriseApi } = require('../lib/enterprise/api');

const ROLE_RANK = { reader: 1, editor: 2, owner: 3 };

function ENTERPRISE_ENABLED() {
  // Enabled if backend contract is live (mock mode counts as "live" for UI).
  return process.env.ENTERPRISE_ENABLED === 'true' ||
         process.env.ENTERPRISE_MOCK_MODE === 'true';
}

async function loadUserOrgs(req, res, next) {
  if (!ENTERPRISE_ENABLED() || !req.user) {
    req.userOrgs = [];
    return next();
  }
  try {
    const { organizations } = await enterpriseApi.myOrganizations(req);
    req.userOrgs = organizations || [];
  } catch (err) {
    console.warn('[org] loadUserOrgs failed:', err.message);
    req.userOrgs = [];
  }
  return next();
}

function requireOrg(minRole = 'reader') {
  return async (req, res, next) => {
    if (!ENTERPRISE_ENABLED()) return res.status(404).render('pages/404', { title: 'Not found', seo: {} });
    if (!req.user) return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));

    const orgId = req.params.orgId || req.params.id;
    if (!orgId) return res.status(400).send('org id required');

    try {
      const org = await enterpriseApi.getOrganization(req, orgId);
      const { members } = await enterpriseApi.listMembers(req, orgId);
      const membership = (members || []).find(
        (m) => (m.email || '').toLowerCase() === (req.user.email || '').toLowerCase()
      );
      if (!membership) {
        return res.status(403).render('pages/error', {
          title: 'Not a member',
          message: 'You are not a member of this organization.',
          user: req.user,
          seo: { noIndex: true },
        });
      }
      if ((ROLE_RANK[membership.role] || 0) < (ROLE_RANK[minRole] || 0)) {
        return res.status(403).render('pages/error', {
          title: 'Not allowed',
          message: `This action requires the ${minRole} role.`,
          user: req.user,
          seo: { noIndex: true },
        });
      }
      req.currentOrg = org;
      req.currentMembership = membership;
      return next();
    } catch (err) {
      if (err.status === 404) {
        return res.status(404).render('pages/404', { title: 'Not found', seo: {} });
      }
      console.error('[org] requireOrg failed:', err.message);
      return res.status(500).render('pages/error', {
        title: 'Error',
        message: 'Could not load organization.',
        user: req.user,
        seo: { noIndex: true },
      });
    }
  };
}

module.exports = { requireOrg, loadUserOrgs, ENTERPRISE_ENABLED, ROLE_RANK };
