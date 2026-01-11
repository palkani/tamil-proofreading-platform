const express = require('express');
const router = express.Router();
const axios = require('axios');
const { redirectIfAuth, getCurrentUser } = require('../middleware/auth');
const { getSeoData } = require('../config/seo');
// Build backend API URL (matches api/auth proxy)
function getBackendApiUrl() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  if (baseUrl.endsWith('/api/v1')) {
    return baseUrl;
  }
  return baseUrl.replace(/\/$/, '') + '/api/v1';
}

const BACKEND_URL = getBackendApiUrl();

// Homepage - accessible to everyone
router.get('/', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('home');
  res.render('pages/home', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// How to Use page - accessible to everyone
router.get('/how-to-use', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('howToUse');
  res.render('pages/how-to-use', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Login page - redirect authenticated users to drafts
router.get('/login', (req, res) => {
  if (req.user) {
    console.log('[AUTH] user already authenticated, redirecting to /drafts');
    return res.redirect('/drafts');
  }
  const seo = getSeoData('login');
  res.render('pages/login', { 
    title: seo.title,
    seo: seo,
    error: req.query.error || null,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    redirectTo: req.query.redirect || '/dashboard'
  });
});

// Resolve Google Client ID once (prefer NEXT_PUBLIC_* so Vercel runtime matches frontend expectation)
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';

// Register page - redirect authenticated users to drafts
router.get('/register', (req, res) => {
  if (req.user) {
    console.log('[AUTH] user already authenticated, redirecting to /drafts');
    return res.redirect('/drafts');
  }
  const seo = getSeoData('register');
  res.render('pages/register', { 
    title: seo.title,
    seo: seo,
    googleClientId: GOOGLE_CLIENT_ID,
    redirectTo: req.query.redirect || '/dashboard'
  });
});

// Handle login form submission
router.post('/login', (req, res) => {
  res.redirect('/login?error=Email%20and%20password%20login%20are%20no%20longer%20supported.%20Use%20Google%20Sign-In.');
});

// Handle registration form submission
router.post('/register', (req, res) => {
  res.redirect('/register?error=Registration%20is%20handled%20via%20Google%20Sign-In.');
});

// Provide Google Client ID to frontend
router.get('/api/config/google-client-id', (req, res) => {
  res.json({ 
    clientId: GOOGLE_CLIENT_ID 
  });
});

// Dashboard page - client-side auth only
router.get('/dashboard', (req, res) => {
  const seo = getSeoData('dashboard');
  res.render('pages/dashboard', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Account page - client-side auth only
router.get('/account', (req, res) => {
  const seo = getSeoData('account');
  res.render('pages/account', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Analytics dashboard - client-side auth only
router.get('/analytics', (req, res) => {
  // Check if user is admin (prooftamil@gmail.com)
  const user = req.user;
  if (user.email !== 'prooftamil@gmail.com' && user.role !== 'admin') {
    const seo = getSeoData('error');
    return res.status(403).render('pages/error', {
      title: 'Access Denied',
      seo: seo,
      message: 'You do not have permission to view this page.',
      user: user
    });
  }
  
  const seo = getSeoData('analytics');
  res.render('pages/analytics', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Archive page - client-side auth only
router.get('/archive', (req, res) => {
  const seo = getSeoData('archive');
  res.render('pages/archive', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Drafts page - client-side auth only
router.get('/drafts', (req, res) => {
  try {
    const user = getCurrentUser(req) || null; // Ensure user is null if not set, not undefined
    const seo = getSeoData('drafts');
    res.render('pages/drafts', { 
      title: seo.title || 'My Drafts',
      seo: seo,
      user: user // Pass null explicitly if user is not authenticated
    });
  } catch (error) {
    console.error('[DRAFTS] Error rendering drafts page:', error);
    res.status(500).render('pages/error', {
      title: 'Error - ProofTamil',
      seo: getSeoData('error'),
      user: getCurrentUser(req) || null,
      error: error.message || 'An unexpected error occurred'
    });
  }
});

// Contact page - accessible to everyone
router.get('/contact', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('contact');
  res.render('pages/contact', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Privacy Policy page - accessible to everyone
router.get('/privacy', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('privacy');
  res.render('pages/privacy', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Terms of Service page - accessible to everyone
router.get('/terms', (req, res) => {
  const user = getCurrentUser(req);
  const seo = getSeoData('terms');
  res.render('pages/terms', { 
    title: seo.title,
    seo: seo,
    user: user
  });
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    const backendRes = await axios({
      method: 'post',
      url: `${BACKEND_URL}/auth/logout`,
      headers: {
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
        host: undefined,
        origin: undefined,
      },
      withCredentials: true,
      validateStatus: () => true,
    });

    const setCookie = backendRes.headers['set-cookie'];
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
    }

    res.redirect('/');
  } catch (err) {
    console.error('[AUTH-LOGOUT] Failed to revoke session:', err.message);
    res.redirect('/');
  }
});

module.exports = router;
