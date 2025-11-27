const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getSeoData } = require('../config/seo');

// Workspace page - main editor (requires authentication)
router.get('/', requireAuth, (req, res) => {
  const seo = getSeoData('workspace');
  res.render('pages/workspace', { 
    title: seo.title,
    seo: seo,
    user: req.session.user
  });
});

module.exports = router;
