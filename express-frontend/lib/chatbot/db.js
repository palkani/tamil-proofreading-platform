const { Pool } = require('pg');

/**
 * Direct Postgres access for the chatbot.
 *
 * No Supabase client and no service-role key: all access is server-side, so
 * connecting as the table owner is both simpler and one fewer secret. It also
 * gives us real transactions, which PostgREST cannot express.
 */

/**
 * CHATBOT_DATABASE_URL wins over DATABASE_URL on purpose. This monorepo has two
 * different DATABASE_URLs (a Supabase pooler and a Cloud SQL host), so the
 * explicit variable removes any ambiguity about which one the chatbot uses.
 */
function connectionString() {
  const dsn = process.env.CHATBOT_DATABASE_URL || process.env.DATABASE_URL;
  if (!dsn) {
    throw new Error(
      'No database connection string. Set CHATBOT_DATABASE_URL (preferred) or DATABASE_URL.',
    );
  }
  return dsn;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '']);

/**
 * Decide whether to negotiate TLS.
 *
 * An explicit `sslmode` in the DSN always wins. Otherwise remote gets TLS and
 * local does not. Parsed with `new URL` rather than a regex: a pattern looking
 * for `@host` misses a DSN with no credentials
 * (`postgresql://localhost:5432/db`), which then gets treated as remote and
 * fails with "server does not support SSL connections".
 */
function sslConfig(dsn) {
  const strict = { rejectUnauthorized: process.env.CHATBOT_DB_SSL_STRICT === 'true' };

  let url;
  try {
    url = new URL(dsn);
  } catch (_) {
    return strict;
  }

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) return sslmode === 'disable' ? undefined : strict;

  return LOCAL_HOSTS.has(url.hostname) ? undefined : strict;
}

let pool = null;

function getPool() {
  if (pool) return pool;

  const dsn = connectionString();

  pool = new Pool({
    connectionString: dsn,
    // Small on purpose: Supabase's transaction pooler multiplexes for us, and a
    // large per-instance pool is how you exhaust connection limits.
    max: Number(process.env.CHATBOT_DB_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: sslConfig(dsn),
  });

  // Mandatory: without this, an idle client dropped by the server surfaces as
  // an unhandled 'error' event and takes the whole process down.
  pool.on('error', (error) => {
    console.error('[chatbot/db] idle client error:', error.message);
  });

  return pool;
}

async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

/** Run `fn` in a transaction, rolling back on any throw. Always releases. */
async function withTransaction(fn) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[chatbot/db] rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** pgvector's text input format — identical to a JSON number array. */
function toVector(embedding) {
  return JSON.stringify(embedding);
}

async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

module.exports = { getPool, query, queryOne, withTransaction, toVector, closePool };
