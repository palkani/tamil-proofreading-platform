const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getSeoData } = require('../config/seo');

// Workspace page - main editor (client-side auth only)
router.use(requireAuth);

router.get('/', (req, res) => {
  if (req.cookies && req.cookies.access_token) {
    console.log('[AUTH] cookie present on /workspace');
  }

  const seo = getSeoData('workspace');
  res.render('pages/workspace', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

module.exports = router;
