const express = require('express');
const router = express.Router();
const { requireAuth, redirectIfAuth, getCurrentUser } = require('../middleware/auth');

// Homepage - accessible to everyone
router.get('/', (req, res) => {
  const user = getCurrentUser(req);
  res.render('pages/home', { 
    title: 'Free Tamil Editor & Typing Tool - AI Grammar Checker | ProofTamil',
    user: user
  });
});

// Login page - redirect if already logged in
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('pages/login', { 
    title: 'Sign In - ProofTamil',
    error: req.query.error || null
  });
});

// Register page - redirect if already logged in
router.get('/register', redirectIfAuth, (req, res) => {
  res.render('pages/register', { 
    title: 'Register - ProofTamil'
  });
});

// Handle login form submission
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  // For now, accept any email/password and create a session
  // In production, validate against database
  req.session.user = {
    id: 1,
    email: email || 'user@example.com',
    name: email ? email.split('@')[0] : 'User',
    role: 'user'
  };
  
  // Redirect to the page they were trying to access, or dashboard
  const redirectTo = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  res.redirect(redirectTo);
});

// Handle registration form submission
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;
  
  // For now, accept any registration and create a session
  // In production, validate and save to database
  req.session.user = {
    id: 1,
    email: email || 'user@example.com',
    name: name || email.split('@')[0],
    role: 'user'
  };
  
  res.redirect('/dashboard');
});

// Handle Google OAuth callback from frontend
router.post('/auth/google-callback', (req, res) => {
  const { id, email, name, role } = req.body;
  
  // Create session for Google authenticated user
  req.session.user = {
    id: id || 1,
    email: email,
    name: name,
    role: role || 'user'
  };
  
  res.json({ success: true });
});

// Provide Google Client ID to frontend
router.get('/api/config/google-client-id', (req, res) => {
  res.json({ 
    clientId: process.env.GOOGLE_CLIENT_ID || '' 
  });
});

// Dashboard page - requires authentication
router.get('/dashboard', requireAuth, (req, res) => {
  res.render('pages/dashboard', { 
    title: 'Dashboard - ProofTamil',
    user: req.session.user
  });
});

// Account page - requires authentication
router.get('/account', requireAuth, (req, res) => {
  res.render('pages/account', { 
    title: 'Account Settings - ProofTamil',
    user: req.session.user
  });
});

// Archive page - requires authentication
router.get('/archive', requireAuth, (req, res) => {
  res.render('pages/archive', { 
    title: 'Archive - ProofTamil',
    user: req.session.user
  });
});

// Contact page - accessible to everyone
router.get('/contact', (req, res) => {
  const user = getCurrentUser(req);
  res.render('pages/contact', { 
    title: 'Contact Us - ProofTamil',
    user: user
  });
});

// Privacy Policy page - accessible to everyone
router.get('/privacy', (req, res) => {
  const user = getCurrentUser(req);
  res.render('pages/privacy', { 
    title: 'Privacy Policy - ProofTamil',
    user: user
  });
});

// Terms of Service page - accessible to everyone
router.get('/terms', (req, res) => {
  const user = getCurrentUser(req);
  res.render('pages/terms', { 
    title: 'Terms of Service - ProofTamil',
    user: user
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.clearCookie('auth_token');
    res.redirect('/');
  });
});

module.exports = router;
