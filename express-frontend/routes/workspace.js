const express = require('express');
const router = express.Router();
const { attachUser } = require('../middleware/auth');

// Ensure user attachment runs before auth guard
router.use((req, res, next) => {
  attachUser(req, res, () => {
    console.log('[AUTH] workspace middleware order: attachUser executed, user present:', !!req.user);
    next();
  });
});
const { getSeoData } = require('../config/seo');

// Workspace page - main editor (client-side auth only)
router.get('/', (req, res) => {
  if (req.cookies && req.cookies.access_token) {
    console.log('[AUTH] cookie present on /workspace');
  }
  if (!req.user) {
    console.log('[AUTH] workspace guard missing req.user; redirecting to login');
    return res.redirect(`/login?redirect=${encodeURIComponent('/workspace')}`);
  }

  const seo = getSeoData('workspace');
  res.render('pages/workspace', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

module.exports = router;
