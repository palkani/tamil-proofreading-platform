const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const router = express.Router();
const { getRegionalBackendUrl, getPrimaryBackendUrl } = require('../utils/regional-backend');

// Stamp the regional backend URL once per request.
// All route handlers read req._backendUrl instead of the static constant.
router.use((req, res, next) => {
  req._backendUrl = getRegionalBackendUrl(req);
  next();
});

// Module-level fallback (used by getGoogleCallbackUrl which has no req context).
const BACKEND_URL = getPrimaryBackendUrl();
const AUTH_RETRY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/supabase-token'];
const AUTH_RETRY_MAX = 5;
const AUTH_RETRY_DELAY_MS = 2000;

const forward = async (req, res, path, method = 'post') => {
  try {
    const url = `${req._backendUrl}${path}`;
    const doRetry = AUTH_RETRY_PATHS.includes(path);
    const headers = {
      ...req.headers,
      host: undefined,
      cookie: req.headers.cookie,
      origin: undefined,
    };

    if (path === '/auth/refresh') {
      const cookies = req.headers.cookie || '';
      const hasRefreshToken = cookies.includes('proof_refresh_token') || cookies.includes('refresh_token');
      console.log(`[AUTH-PROXY] Refresh request - cookies present: ${hasRefreshToken}, cookie header: ${cookies ? 'Yes' : 'No'}`);
      if (cookies) {
        console.log(`[AUTH-PROXY] Cookie header preview: ${cookies.substring(0, 200)}...`);
      }
    }

    let backendRes;
    for (let attempt = 1; attempt <= (doRetry ? AUTH_RETRY_MAX : 1); attempt++) {
      backendRes = await axios({
        method,
        url,
        data: req.body,
        params: req.query,
        headers,
        withCredentials: true,
        validateStatus: () => true,
        timeout: 15000,
      });
      if (backendRes.status !== 503 || !doRetry || attempt === AUTH_RETRY_MAX) break;
      if (attempt < AUTH_RETRY_MAX) {
        console.log(`[AUTH-PROXY] ${path} backend 503 (starting), retry ${attempt}/${AUTH_RETRY_MAX} in ${AUTH_RETRY_DELAY_MS}ms`);
        await new Promise((r) => setTimeout(r, AUTH_RETRY_DELAY_MS));
      }
    }

    // Log response for refresh endpoint
    if (path === '/auth/refresh') {
      console.log(`[AUTH-PROXY] Refresh response status: ${backendRes.status}`);
      console.log(`[AUTH-PROXY] Refresh response has access_token: ${!!backendRes.data?.access_token}`);
    }

    // Propagate Set-Cookie from backend so httpOnly cookies flow to the browser
    const setCookie = backendRes.headers['set-cookie'];
    if (setCookie) {
      // Handle both single cookie string and array of cookies
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      cookies.forEach(cookie => {
        res.append('Set-Cookie', cookie);
      });
      console.log(`[AUTH-PROXY] Forwarded ${cookies.length} cookie(s) from backend for ${path}`);
    }

    res.status(backendRes.status).json(backendRes.data);
  } catch (err) {
    console.error(`[AUTH-PROXY] ${method.toUpperCase()} ${path} failed:`, err.message);
    res.status(502).json({ error: 'Authentication service unavailable' });
  }
};

router.post('/register', (req, res) => forward(req, res, '/auth/register', 'post'));
router.post('/login', (req, res) => forward(req, res, '/auth/login', 'post'));
router.post('/refresh', (req, res) => forward(req, res, '/auth/refresh', 'post'));
router.post('/otp/send', (req, res) => forward(req, res, '/auth/otp/send', 'post'));
router.post('/otp/verify', (req, res) => forward(req, res, '/auth/otp/verify', 'post'));
router.post('/logout', async (req, res) => {
  // CRITICAL: Clear cookies on the response IMMEDIATELY, BEFORE the backend call.
  // The backend call can take 5+ seconds on Cloud Run cold-start; the browser
  // races the logout fetch against an 800 ms timeout in the navbar. If we awaited
  // the backend before sending Set-Cookie clearing headers, the redirect to /login
  // would fire with the old access_token cookie still attached, attachUser would
  // populate req.user, and redirectIfAuth would bounce the user to /dashboard —
  // making logout appear broken.
  //
  // Backend (Go) sets these cookies with: HttpOnly, Secure, SameSite=None,
  // Domain=.prooftamil.com (when host ends in prooftamil.com). To delete reliably
  // across browsers we issue Set-Cookie deletions for every (domain × sameSite)
  // combination that may have been used historically.
  const clearCookieEverywhere = (name) => {
    const variants = [
      { path: '/', secure: true, sameSite: 'lax' },
      { path: '/', secure: true, sameSite: 'lax', domain: 'prooftamil.com' },
      { path: '/', secure: true, sameSite: 'lax', domain: '.prooftamil.com' },
      { path: '/', secure: true, sameSite: 'lax', domain: 'www.prooftamil.com' },
      // SameSite=None to match how the backend actually sets these cookies.
      { path: '/', secure: true, sameSite: 'none' },
      { path: '/', secure: true, sameSite: 'none', domain: '.prooftamil.com' },
      { path: '/', secure: true, sameSite: 'none', domain: 'prooftamil.com' },
      { path: '/', secure: true, sameSite: 'none', domain: 'www.prooftamil.com' },
    ];
    variants.forEach((opts) => res.clearCookie(name, opts));
  };

  clearCookieEverywhere('access_token');
  clearCookieEverywhere('proof_refresh_token');
  clearCookieEverywhere('refresh_token');

  // Send 204 immediately — Set-Cookie deletions are now in flight to the browser.
  res.status(204).send();

  // Best-effort: tell the backend to revoke the refresh token server-side.
  // Fire-and-forget — never block logout UX on this.
  axios({
    method: 'post',
    url: `${req._backendUrl}/auth/logout`,
    data: req.body,
    params: req.query,
    headers: {
      ...req.headers,
      host: undefined,
      cookie: req.headers.cookie,
      origin: undefined,
    },
    withCredentials: true,
    validateStatus: () => true,
    timeout: 8000,
  }).catch((err) => {
    console.warn('[AUTH-PROXY] Logout backend call failed (non-fatal):', err.message);
  });
});
router.post('/social', (req, res) => forward(req, res, '/auth/social', 'post'));
router.post('/password-strength', (req, res) =>
  forward(req, res, '/auth/password-strength', 'post')
);
router.post('/forgot-password', (req, res) => forward(req, res, '/auth/forgot-password', 'post'));
router.post('/reset-password', (req, res) => forward(req, res, '/auth/reset-password', 'post'));
router.get('/me', (req, res) => forward(req, res, '/auth/me', 'get'));

// Supabase: exchange Supabase Auth JWT (e.g. from Google sign-in via Supabase) for app session
router.post('/supabase-token', (req, res) => forward(req, res, '/auth/supabase-token', 'post'));

// Valid Google OAuth client IDs end with .apps.googleusercontent.com (never use a domain like prooftamil.com)
const VALID_GOOGLE_CLIENT_ID = '991187041222-dp582s8kvqqktpq3t0bihl43e4iv8m5i.apps.googleusercontent.com';
function getGoogleClientId() {
  const env = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  if (env && typeof env === 'string' && env.includes('.apps.googleusercontent.com')) return env.trim();
  return VALID_GOOGLE_CLIENT_ID;
}

// OAuth callback URL must match Google Console. Use BACKEND_URL when API is on Cloud Run (e.g. https://xxx.run.app).
function getGoogleCallbackUrl() {
  const base = process.env.BACKEND_URL || 'https://www.prooftamil.com';
  return base.replace(/\/$/, '') + '/api/v1/auth/google/callback';
}

router.get('/google', (req, res) => {
  const redirectUri = getGoogleCallbackUrl();
  const clientId = getGoogleClientId();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[OAUTH-FRONTEND] redirecting to Google auth', { redirectUri, clientIdPresent: !!clientId });
  res.redirect(authUrl);
});
router.get('/google/callback', (req, res) => {
  res.redirect('https://prooftamil.com/login?error=oauth_flow_invalid_path');
});
router.get('/v1/auth/google/callback', (req, res) => {
  res.redirect('https://prooftamil.com/login?error=oauth_flow_invalid_path');
});

module.exports = router;

