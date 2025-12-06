const express = require('express');
const passport = require('passport');
const router = express.Router();

const { authenticateJWT } = require('../middleware/auth');
const {
  setAuthCookies,
  clearAuthCookies,
  issueTokensForUser,
  rotateRefreshToken,
  revokeRefreshToken,
} = require('../services/authService');
const { findUserById } = require('../models/userModel');

const buildStateParam = (statePayload = {}) => {
  try {
    return Buffer.from(JSON.stringify(statePayload)).toString('base64url');
  } catch {
    return '';
  }
};

const parseStateParam = (stateString) => {
  if (!stateString) return {};
  try {
    return JSON.parse(Buffer.from(stateString, 'base64url').toString('utf-8'));
  } catch {
    return {};
  }
};

router.get('/google', (req, res, next) => {
  const redirectPath = req.query.redirect || '/dashboard';
  const responseMode = req.query.mode || 'redirect';
  const state = buildStateParam({ redirect: redirectPath, mode: responseMode });

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
    prompt: 'select_account',
    state,
  })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/login?error=Google%20authentication%20failed',
  }),
  async (req, res) => {
    try {
      const tokens = await issueTokensForUser(req.user);
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

      const stateParams = parseStateParam(req.query.state);
      const defaultRedirect =
        process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}/dashboard`;
      let redirectTarget = defaultRedirect;

      if (stateParams.redirect && typeof stateParams.redirect === 'string') {
        if (stateParams.redirect.startsWith('http')) {
          redirectTarget = stateParams.redirect;
        } else {
          const url = new URL(defaultRedirect);
          url.pathname = stateParams.redirect.startsWith('/')
            ? stateParams.redirect
            : `/${stateParams.redirect}`;
          redirectTarget = url.toString();
        }
      }

      if (stateParams.mode === 'json') {
        return res.json({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: 'Bearer',
          expires_in: 15 * 60,
          user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            profile_picture: req.user.profile_picture,
          },
        });
      }

      const redirectUrl = new URL(redirectTarget);
      redirectUrl.searchParams.set('access_token', tokens.accessToken);
      redirectUrl.searchParams.set('refresh_token', tokens.refreshToken);
      redirectUrl.searchParams.set('token_type', 'Bearer');
      redirectUrl.searchParams.set('expires_in', (15 * 60).toString());
      redirectUrl.searchParams.set('email', req.user.email || '');
      redirectUrl.searchParams.set('name', req.user.name || '');
      redirectUrl.searchParams.set('picture', req.user.profile_picture || '');
      res.redirect(redirectUrl.toString());
    } catch (err) {
      console.error('[AUTH] OAuth callback failed:', err.message);
      res.redirect('/login?error=Unable%20to%20complete%20login');
    }
  }
);

router.post('/refresh', async (req, res) => {
  try {
    const incomingToken =
      req.cookies.refresh_token || req.body.refreshToken || req.headers['x-refresh-token'];

    if (!incomingToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const { tokens } = await rotateRefreshToken(incomingToken);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: 15 * 60,
    });
  } catch (err) {
    console.error('[AUTH] Refresh token error:', err.message);
    res.status(401).json({ error: 'Unable to refresh session' });
  }
});

router.post('/logout', async (req, res) => {
  const incomingToken =
    req.cookies.refresh_token || req.body.refreshToken || req.headers['x-refresh-token'];
  await revokeRefreshToken(incomingToken);
  clearAuthCookies(res);
  res.json({ success: true });
});

router.get('/me', authenticateJWT, async (req, res) => {
  const user = await findUserById(req.authUser.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

module.exports = router;

