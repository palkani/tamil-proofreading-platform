const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Workspace page - main editor (requires authentication)
router.get('/', requireAuth, (req, res) => {
  res.render('pages/workspace', { 
    title: 'Free Tamil Typing Workspace - Online Editor | ProofTamil',
    user: req.session.user
  });
});

module.exports = router;
