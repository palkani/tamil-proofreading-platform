const express = require('express');
const router = express.Router();

// Login page (home page)
router.get('/', (req, res) => {
  res.render('pages/login', { 
    title: 'Tamil AI Proofreading Platform',
    error: req.query.error || null
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
