const express = require('express');
const router = express.Router();

// Mock user for testing (same as backend)
const mockUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  role: 'user'
};

// Homepage
router.get('/', (req, res) => {
  res.render('pages/home', { 
    title: 'Free Tamil Editor & Typing Tool - AI Grammar Checker | ProofTamil',
    user: mockUser // Show logged-in state for testing
  });
});

// Login page
router.get('/login', (req, res) => {
  res.render('pages/login', { 
    title: 'Sign In - ProofTamil',
    error: req.query.error || null
  });
});

// Register page
router.get('/register', (req, res) => {
  res.render('pages/register', { 
    title: 'Register - ProofTamil'
  });
});

// Dashboard page
router.get('/dashboard', (req, res) => {
  res.render('pages/dashboard', { 
    title: 'Dashboard - ProofTamil',
    user: mockUser
  });
});

// Account page
router.get('/account', (req, res) => {
  res.render('pages/account', { 
    title: 'Account Settings - ProofTamil',
    user: mockUser
  });
});

// Archive page
router.get('/archive', (req, res) => {
  res.render('pages/archive', { 
    title: 'Archive - ProofTamil',
    user: mockUser
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
