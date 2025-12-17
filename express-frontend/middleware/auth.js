const jwt = require('jsonwebtoken');

const getAccessTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  return null;
};

const attachUser = (req, res, next) => {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    // Decode without verifying signature — trust is enforced by backend
    const payload = jwt.decode(token) || {};
    req.user = payload.sub
      ? {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          profile_picture: payload.picture,
        }
      : null;
  } catch (err) {
    req.user = null;
  }

  next();
};

function requireAuth(req, res, next) {
  // TEMP: Allow OAuth callback flow to land on workspace once with access_token in query
  if (req.path === '/workspace' && req.query.access_token) {
    console.log('[AUTH] Bypass redirect for workspace with access_token in query (OAuth handoff)');
    return next();
  }

  if (req.user) {
    return next();
  }

  const redirectParam = encodeURIComponent(req.originalUrl || '/dashboard');
  res.redirect(`/login?redirect=${redirectParam}`);
}

function redirectIfAuth(req, res, next) {
  if (req.user) {
    const redirectTarget = req.query.redirect || '/dashboard';
    return res.redirect(redirectTarget);
  }
  next();
}

function getCurrentUser(req) {
  return req.user || null;
}

function authenticateJWT(req, res, next) {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.decode(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.authUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      profile_picture: payload.picture,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = {
  attachUser,
  requireAuth,
  redirectIfAuth,
  getCurrentUser,
  authenticateJWT,
};
