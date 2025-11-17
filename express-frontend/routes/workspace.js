const express = require('express');
const router = express.Router();

// Workspace page - main editor
router.get('/', (req, res) => {
  // Mock auth bypass for testing (same as Next.js version)
  // TODO: Re-enable authentication before production
  const user = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User'
  };
  
  res.render('pages/workspace', { 
    title: 'Free Tamil Typing Workspace - Online Editor | ProofTamil',
    user: user
  });
});

module.exports = router;
