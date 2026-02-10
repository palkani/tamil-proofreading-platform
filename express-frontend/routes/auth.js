const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const router = express.Router();

// Construct backend API URL - handle both cases:
// 1. BACKEND_URL = http://localhost:8080/api/v1 (dev)
// 2. BACKEND_URL = https://prooftamil-backend-xxx.run.app (prod - needs /api/v1)
function getBackendApiUrl() {
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  if (baseUrl.endsWith('/api/v1')) {
    return baseUrl;
  }
  return baseUrl.replace(/\/$/, '') + '/api/v1';
}

const BACKEND_URL = getBackendApiUrl();
const AUTH_RETRY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];
const AUTH_RETRY_MAX = 8;
const AUTH_RETRY_DELAY_MS = 2500;

const forward = async (req, res, path, method = 'post') => {
  try {
    const url = `${BACKEND_URL}${path}`;
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
  // IMPORTANT: Always clear cookies on the frontend domain (prooftamil.com),
  // even if the backend is unreachable or the browser navigates early.
  const clearCookieEverywhere = (name) => {
    // Cookie identity is name + domain + path. Some deployments have different domain attributes.
    // Clear aggressively across common variants so attachUser cannot rehydrate the navbar.
    const baseOpts = {
      path: '/',
      // Secure helps ensure clearing works on HTTPS-only cookies too (Vercel/Cloud Run).
      secure: true,
      sameSite: 'lax',
    };

    // Host-only cookie
    res.clearCookie(name, { ...baseOpts });
    // Bare apex domain cookie
    res.clearCookie(name, { ...baseOpts, domain: 'prooftamil.com' });
    // Subdomain cookie (covers www + other subdomains)
    res.clearCookie(name, { ...baseOpts, domain: '.prooftamil.com' });
    // Explicit www domain cookie (some stacks set this)
    res.clearCookie(name, { ...baseOpts, domain: 'www.prooftamil.com' });
  };

  try {
    // Fire backend logout best-effort (revokes refresh token server-side)
    await axios({
      method: 'post',
      url: `${BACKEND_URL}/auth/logout`,
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
    });
  } catch (err) {
    console.warn('[AUTH-PROXY] Logout backend call failed (non-fatal):', err.message);
  } finally {
    clearCookieEverywhere('access_token');
    clearCookieEverywhere('proof_refresh_token');
    clearCookieEverywhere('refresh_token');

    // Match backend: 204 No Content
    res.status(204).send();
  }
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

router.get('/google', (req, res) => {
  const redirectUri = 'https://www.prooftamil.com/api/v1/auth/google/callback';
  const clientId = '991187041222-dp582s8kvqqktpq3t0bihl43e4iv8m5i.apps.googleusercontent.com';
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

