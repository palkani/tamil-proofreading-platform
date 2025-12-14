const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth, redirectIfAuth, getCurrentUser } = require('../middleware/auth');
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

// Login page - redirect if already logged in
router.get('/login', redirectIfAuth, (req, res) => {
  const seo = getSeoData('login');
  res.render('pages/login', { 
    title: seo.title,
    seo: seo,
    error: req.query.error || null,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    redirectTo: req.query.redirect || '/dashboard'
  });
});

// Register page - redirect if already logged in
router.get('/register', redirectIfAuth, (req, res) => {
  const seo = getSeoData('register');
  res.render('pages/register', { 
    title: seo.title,
    seo: seo,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
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
    clientId: process.env.GOOGLE_CLIENT_ID || '' 
  });
});

// Dashboard page - requires authentication
router.get('/dashboard', requireAuth, (req, res) => {
  const seo = getSeoData('dashboard');
  res.render('pages/dashboard', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Account page - requires authentication
router.get('/account', requireAuth, (req, res) => {
  const seo = getSeoData('account');
  res.render('pages/account', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
});

// Analytics dashboard - requires admin role
router.get('/analytics', requireAuth, (req, res) => {
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

// Archive page - requires authentication
router.get('/archive', requireAuth, (req, res) => {
  const seo = getSeoData('archive');
  res.render('pages/archive', { 
    title: seo.title,
    seo: seo,
    user: req.user
  });
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
