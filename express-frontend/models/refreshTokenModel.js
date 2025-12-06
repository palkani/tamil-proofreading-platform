const { randomUUID } = require('crypto');
const { getPool } = require('../db');

const saveRefreshToken = async ({ userId, tokenId, tokenHash, expiresAt }) => {
  const db = getPool();
  const recordId = randomUUID();
  await db.query(
    `
      INSERT INTO refresh_tokens (id, user_id, token_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (token_id) DO UPDATE
        SET token_hash = EXCLUDED.token_hash,
            expires_at = EXCLUDED.expires_at,
            created_at = NOW();
    `,
    [recordId, userId, tokenId, tokenHash, expiresAt]
  );
};

const findTokenById = async (tokenId) => {
  const db = getPool();
  const result = await db.query(`SELECT * FROM refresh_tokens WHERE token_id = $1 LIMIT 1;`, [tokenId]);
  return result.rows[0] || null;
};

const deleteTokenById = async (tokenId) => {
  const db = getPool();
  await db.query(`DELETE FROM refresh_tokens WHERE token_id = $1;`, [tokenId]);
};

const deleteTokensForUser = async (userId) => {
  const db = getPool();
  await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1;`, [userId]);
};

module.exports = {
  saveRefreshToken,
  findTokenById,
  deleteTokenById,
  deleteTokensForUser,
};

