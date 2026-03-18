const express = require('express');
const router = express.Router();
const { getSeoData } = require('../config/seo');

// Workspace page - main editor
// IMPORTANT: Do NOT enforce server-side auth here.
// This app uses client-side auth (localStorage token) for API calls, and server-side
// auth can bounce users back to /drafts when access_token cookie isn't present.

router.get('/', (req, res) => {
  if (req.cookies && req.cookies.access_token) {
    console.log('[AUTH] cookie present on /workspace');
  }

  const seo = getSeoData('workspace');

  // Detect country from CDN/proxy headers for region-specific payment routing
  const countryCode = (
    req.headers['cf-ipcountry'] ||
    req.headers['x-vercel-ip-country'] ||
    'US'
  ).toUpperCase().slice(0, 2);

  res.render('pages/workspace', {
    title: seo.title,
    seo: seo,
    user: req.user || null,
    countryCode,
  });
});

module.exports = router;
