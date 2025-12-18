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

const forward = async (req, res, path, method = 'post') => {
  try {
    const url = `${BACKEND_URL}${path}`;
    const backendRes = await axios({
      method,
      url,
      data: req.body,
      params: req.query,
      headers: {
        ...req.headers,
        host: undefined,
        cookie: req.headers.cookie,
        origin: undefined,
      },
      withCredentials: true,
      validateStatus: () => true, // forward backend status as-is
    });

    // Propagate Set-Cookie from backend so httpOnly cookies flow to the browser
    const setCookie = backendRes.headers['set-cookie'];
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
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
router.post('/logout', (req, res) => forward(req, res, '/auth/logout', 'post'));
router.post('/social', (req, res) => forward(req, res, '/auth/social', 'post'));
router.post('/password-strength', (req, res) =>
  forward(req, res, '/auth/password-strength', 'post')
);
router.post('/forgot-password', (req, res) => forward(req, res, '/auth/forgot-password', 'post'));
router.post('/reset-password', (req, res) => forward(req, res, '/auth/reset-password', 'post'));
router.get('/me', (req, res) => forward(req, res, '/auth/me', 'get'));

// Google OAuth now owned by backend Cloud Run; redirect there directly
router.get('/google', (req, res) => {
  res.redirect('https://prooftamil-backend-991187041222.asia-south1.run.app/api/v1/auth/google');
});
router.get('/google/callback', (req, res) => {
  res.redirect('https://prooftamil.com/login?error=oauth_flow_invalid_path');
});
router.get('/v1/auth/google/callback', (req, res) => {
  res.redirect('https://prooftamil.com/login?error=oauth_flow_invalid_path');
});

module.exports = router;

