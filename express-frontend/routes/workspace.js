const express = require('express');
const router = express.Router();
const { getSeoData } = require('../config/seo');

// Workspace page - main editor (client-side auth only)
router.get('/', (req, res) => {
  if (!req.user) {
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
