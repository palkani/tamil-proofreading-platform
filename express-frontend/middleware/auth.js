// Authentication Middleware

// Check if user is authenticated
function requireAuth(req, res, next) {
  console.log('[AUTH-DEBUG] Checking authentication');
  console.log('[AUTH-DEBUG] Session ID:', req.sessionID);
  console.log('[AUTH-DEBUG] Session object exists:', !!req.session);
  console.log('[AUTH-DEBUG] Session.user exists:', !!req.session?.user);
  console.log('[AUTH-DEBUG] Full session object:', JSON.stringify(req.session));
  
  if (req.session && req.session.user) {
    console.log('[AUTH-DEBUG] ✅ User authenticated:', req.session.user.email);
    return next();
  }
  
  console.log('[AUTH-DEBUG] ❌ User NOT authenticated - redirecting to login');
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
