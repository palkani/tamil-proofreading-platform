const { Pool } = require('pg');

let pool;

const createPool = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required for authentication service');
  }

  if (pool) {
    return pool;
  }

  const connectionOptions = {
    connectionString: process.env.DATABASE_URL,
  };

  // Enable SSL automatically for managed providers (e.g. Neon, Railway, Render)
  if (process.env.DATABASE_URL.includes('sslmode=require') || process.env.PGSSLMODE === 'require') {
    connectionOptions.ssl = { rejectUnauthorized: false };
  }

  pool = new Pool(connectionOptions);
  pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
  });

  return pool;
};

const initDb = async () => {
  const db = createPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      google_id TEXT UNIQUE NOT NULL,
      profile_picture TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_id TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);`);
};

module.exports = {
  initDb,
  getPool: () => createPool(),
};

