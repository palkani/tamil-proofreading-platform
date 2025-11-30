// Authentication Middleware

// Check if user is authenticated
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  
  // Store the original URL for redirect after login
  req.session.returnTo = req.originalUrl;
  res.redirect('/login?error=Please login to access this page');
}

// Check if user is already logged in (for login/register pages)
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

// Get current user from session
function getCurrentUser(req) {
  return req.session && req.session.user ? req.session.user : null;
}

module.exports = {
  requireAuth,
  redirectIfAuth,
  getCurrentUser
};
