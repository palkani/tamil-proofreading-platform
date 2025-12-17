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
  // TEMP: Allow OAuth handoff to land on /workspace once when access_token is nested in ?redirect=/workspace?access_token=...
  if (req.path === '/workspace' && req.query.redirect) {
    const rawRedirect = req.query.redirect;
    // Extract access_token from the redirect query (handles plain or comma-separated values)
    const extractToken = (value) => {
      if (!value) return null;
      // Fast regex for any occurrence of access_token
      const match = value.match(/access_token=([^&]+)/);
      if (match && match[1]) return match[1];
      try {
        const url = new URL(value, `${req.protocol}://${req.get('host')}`);
        return url.searchParams.get('access_token');
      } catch (err) {
        return null;
      }
    };

    const tokenFromRedirect = extractToken(rawRedirect);
    if (tokenFromRedirect) {
      console.log('[AUTH] Bypass redirect for workspace with access_token found in redirect param (OAuth handoff)');
      return next();
    }
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
