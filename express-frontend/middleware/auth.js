const jwt = require('jsonwebtoken');

// Signing key must match the backend's JWT_SECRET so Express can verify
// the token's HMAC. When present, we jwt.verify() the signature and
// reject forged tokens — closes the class of "any user can pose as
// admin for Express-gated routes" bugs.
//
// LEGACY-COMPAT FALLBACK: when JWT_SECRET is NOT set, we fall back to
// jwt.decode() (unverified) and log a loud warning. This is the pre-
// hot-fix behavior. It exists ONLY so that a missing env-var on a live
// deployment doesn't lock every user out of their account (login
// succeeds → cookie sets → next page load can't verify → redirect
// back to /login → loop). If you're seeing the warning below in prod,
// set JWT_SECRET in Vercel env vars (matching the Cloud Run value)
// and redeploy to restore signature verification.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[AUTH] ⚠️  SECURITY WARNING: JWT_SECRET env var is not set. Falling back to jwt.decode() WITHOUT signature verification — any client-crafted token will be accepted. This lets attackers pose as admin for Express-gated routes (DOCX export, blog admin, blog-generator). Set JWT_SECRET on Vercel to match the Cloud Run backend and redeploy to restore verification.');
}

const getAccessTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (req.cookies && req.cookies.access_token) {
    console.log('[AUTH] access_token cookie detected; populating req.user');
    return req.cookies.access_token;
  }

  return null;
};

const attachUser = (req, res, next) => {
  try {
    const token = getAccessTokenFromRequest(req);
    if (!token) {
      req.user = null;
      return next();
    }

    // SECURITY: verify the HMAC signature when JWT_SECRET is configured
    // — do NOT trust unverified JWTs in the primary path. The startup
    // banner logs a loud warning if JWT_SECRET is missing.
    let payload;
    if (JWT_SECRET) {
      try {
        // clockTolerance=300 preserves the 5-minute clock skew tolerance
        // the pre-verify code applied by hand.
        payload = jwt.verify(token, JWT_SECRET, {
          algorithms: ['HS256'],
          clockTolerance: 300,
        });
      } catch (verifyErr) {
        if (verifyErr.name === 'TokenExpiredError') {
          // Handled below — decode without verifying so we can still tell
          // the client to refresh. Safe: we don't populate req.user, we
          // just check whether a refresh token is present.
          payload = jwt.decode(token) || {};
        } else {
          // Bad signature or malformed token — treat as anonymous and
          // clear the cookie so the client stops sending it.
          console.warn('[AUTH] JWT verification failed:', verifyErr.message);
          req.user = null;
          if (req.cookies && req.cookies.access_token) {
            res.clearCookie('access_token');
          }
          return next();
        }
      }
    } else {
      // LEGACY-COMPAT: JWT_SECRET unset. Decode without verifying so
      // login still works. Startup banner already logged the security
      // warning; we don't re-log per-request to avoid log spam.
      payload = jwt.decode(token) || {};
    }

    // Check if token is expired (with 5 minute clock skew tolerance)
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      const clockSkewTolerance = 300; // 5 minutes in seconds
      const isExpired = payload.exp < (now - clockSkewTolerance);

      if (isExpired) {
        // Token is expired.
        // IMPORTANT: Do NOT treat the user as authenticated when access token is expired,
        // even if a refresh token exists. Otherwise pages like /login will immediately
        // redirect to /drafts while API calls still 401 (bad UX loop).
        //
        // Backend uses 'proof_refresh_token' as the cookie name.
        const hasRefreshToken = req.cookies && (req.cookies.proof_refresh_token || req.cookies.refresh_token);
        
        if (hasRefreshToken) {
          // Refresh token exists, so the session is refreshable, but NOT authenticated yet.
          // Let client-side refresh, but don't populate req.user (prevents server-side redirects).
          req.user = null;
          req.authRefreshable = true;
          console.log('[AUTH] Token expired but refresh token exists; marking refreshable (req.user=null):', { 
            exp: payload.exp, 
            now: now, 
            diff: payload.exp - now 
          });
          return next();
        } else {
          // No refresh token, token is expired - clear everything
          req.user = null;
          if (req.cookies && req.cookies.access_token) {
            res.clearCookie('access_token');
          }
          console.log('[AUTH] Token expired and no refresh token, clearing user:', { 
            exp: payload.exp, 
            now: now, 
            diff: payload.exp - now 
          });
          return next();
        }
      }
    }
    
    // Handle both Supabase format (sub) and backend format (user_id)
    const userId = payload.sub || payload.user_id;
    if (userId) {
      // Compute isAdmin here so every page render can gate on it without
      // re-parsing the JWT or hitting the env var directly from EJS.
      // Mirrors the backend AdminMiddleware's check: role must be admin
      // AND email must be in ADMIN_ALLOWED_EMAILS. Cached at first use.
      const { isAdminEmail } = require('./admin');
      req.user = {
        id: userId,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        profile_picture: payload.picture,
        isAdmin: payload.role === 'admin' && isAdminEmail(payload.email),
      };
    } else {
      req.user = null;
    }
  } catch (err) {
    // Non-fatal: never throw from attachUser
    req.user = null;
    console.warn('[AUTH] attachUser non-fatal error:', err.message);
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
    console.log(`[AUTH] requireAuth passed for path=${req.path} user_id=${req.user.id || 'unknown'}`);
    return next();
  }

  const redirectParam = encodeURIComponent(req.originalUrl || '/dashboard');
  // If we have a refresh token (session is refreshable) but access token is expired,
  // send user to login with an auto-refresh hint to avoid redirect loops.
  if (req.authRefreshable) {
    return res.redirect(`/login?redirect=${redirectParam}&refresh=1`);
  }
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

  let payload;
  if (JWT_SECRET) {
    try {
      payload = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        clockTolerance: 300, // 5-min clock skew tolerance
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else {
    // LEGACY-COMPAT fallback: JWT_SECRET unset. Decode without verifying
    // so the endpoint stays reachable. Startup banner in attachUser
    // already logged the security warning; not re-logging here to avoid
    // per-request spam.
    payload = jwt.decode(token);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    // Manual expiry check since jwt.decode() doesn't validate exp.
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now - 300) {
        return res.status(401).json({ error: 'Token expired' });
      }
    }
  }

  // Handle both Supabase format (sub) and backend format (user_id)
  const userId = payload.sub || payload.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.authUser = {
    id: userId,
    email: payload.email,
    name: payload.name,
    profile_picture: payload.picture,
  };
  return next();
}

module.exports = {
  attachUser,
  requireAuth,
  redirectIfAuth,
  getCurrentUser,
  authenticateJWT,
};
