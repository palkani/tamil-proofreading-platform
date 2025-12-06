const { randomUUID } = require('crypto');
const { getPool } = require('../db');

const mapRowToUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    google_id: row.google_id,
    profile_picture: row.profile_picture,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const upsertGoogleUser = async ({ googleId, email, name, profilePicture }) => {
  const db = getPool();

  const userId = randomUUID();
  const result = await db.query(
    `
      INSERT INTO users (id, google_id, email, name, profile_picture, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (google_id) DO UPDATE
        SET email = EXCLUDED.email,
            name = EXCLUDED.name,
            profile_picture = EXCLUDED.profile_picture,
            updated_at = NOW()
      RETURNING *;
    `,
    [userId, googleId, email, name, profilePicture]
  );

  return mapRowToUser(result.rows[0]);
};

const findUserById = async (id) => {
  const db = getPool();
  const result = await db.query(`SELECT * FROM users WHERE id = $1 LIMIT 1;`, [id]);
  return mapRowToUser(result.rows[0]);
};

module.exports = {
  upsertGoogleUser,
  findUserById,
};

