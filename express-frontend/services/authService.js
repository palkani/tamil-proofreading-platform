const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/token');
const { hashToken, compareTokenHash } = require('../utils/hash');
const { saveRefreshToken, findTokenById, deleteTokenById } = require('../models/refreshTokenModel');
const { findUserById } = require('../models/userModel');

const ACCESS_COOKIE_NAME = 'access_token';
const REFRESH_COOKIE_NAME = 'refresh_token';

const setAuthCookies = (res, accessToken, refreshToken) => {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie(ACCESS_COOKIE_NAME);
  res.clearCookie(REFRESH_COOKIE_NAME);
};

const issueTokensForUser = async (user) => {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, tokenId, expiresAt } = signRefreshToken(user);
  const tokenHash = await hashToken(refreshToken);
  await saveRefreshToken({
    userId: user.id,
    tokenId,
    tokenHash,
    expiresAt,
  });
  return { accessToken, refreshToken };
};

const rotateRefreshToken = async (incomingToken) => {
  const payload = verifyRefreshToken(incomingToken);
  const stored = await findTokenById(payload.jti);
  if (!stored || stored.expires_at < new Date()) {
    throw new Error('Refresh token expired');
  }

  const matches = await compareTokenHash(incomingToken, stored.token_hash);
  if (!matches) {
    await deleteTokenById(payload.jti);
    throw new Error('Refresh token invalid');
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    await deleteTokenById(payload.jti);
    throw new Error('User not found');
  }

  await deleteTokenById(payload.jti);
  const tokens = await issueTokensForUser(user);
  return { tokens, user };
};

const revokeRefreshToken = async (incomingToken) => {
  if (!incomingToken) return;
  try {
    const payload = verifyRefreshToken(incomingToken);
    await deleteTokenById(payload.jti);
  } catch (err) {
    // Ignore invalid token errors during logout/revoke
  }
};

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
  clearAuthCookies,
  issueTokensForUser,
  rotateRefreshToken,
  revokeRefreshToken,
};

