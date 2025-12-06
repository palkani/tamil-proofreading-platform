const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const requiredEnv = (key) => {
  if (!process.env[key]) {
    throw new Error(`${key} environment variable is required for authentication`);
  }
  return process.env[key];
};

const signAccessToken = (user) => {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.profile_picture,
  };

  return jwt.sign(payload, requiredEnv('JWT_ACCESS_SECRET'), {
    expiresIn: ACCESS_TOKEN_TTL,
  });
};

const signRefreshToken = (user) => {
  const tokenId = crypto.randomUUID();
  const payload = {
    sub: user.id,
    email: user.email,
    jti: tokenId,
  };

  const token = jwt.sign(payload, requiredEnv('JWT_REFRESH_SECRET'), {
    expiresIn: '7d',
  });

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return { token, tokenId, expiresAt };
};

const verifyAccessToken = (token) => jwt.verify(token, requiredEnv('JWT_ACCESS_SECRET'));

const verifyRefreshToken = (token) => jwt.verify(token, requiredEnv('JWT_REFRESH_SECRET'));

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};

