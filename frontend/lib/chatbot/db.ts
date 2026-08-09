import 'server-only';

import { Pool, type PoolClient } from 'pg';

/**
 * Direct Postgres access for the chatbot.
 *
 * Replaces the Supabase JS client deliberately. All chatbot database access is
 * server-side (API routes + the ingest script), so PostgREST bought us nothing
 * but an extra credential: its HTTP API only accepts the anon key or the
 * service-role key, and the anon key is public. Connecting as the table owner
 * sidesteps that entirely — no service-role key to store or rotate.
 *
 * It also buys real transactions, which PostgREST cannot express. See
 * `upsertDocumentWithChunks`.
 */

/**
 * `CHATBOT_DATABASE_URL` wins over `DATABASE_URL` on purpose.
 *
 * This monorepo has two different DATABASE_URLs — a Supabase pooler in
 * ../.env and a Cloud SQL box in ../.env.local — and .env.local takes
 * precedence, so bare `DATABASE_URL` silently resolves to whichever the loader
 * saw first. The explicit variable removes that ambiguity.
 */
function connectionString(): string {
  const dsn = process.env.CHATBOT_DATABASE_URL ?? process.env.DATABASE_URL;
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
 * An explicit `sslmode` in the DSN always wins — that is the standard knob and
 * ignoring it surprises people. Otherwise: remote gets TLS, local does not.
 *
 * Parsed with `new URL` rather than a regex over the string. A regex looking
 * for `@host` misses a DSN with no credentials
 * (`postgresql://localhost:5432/db`), which then gets treated as remote and
 * fails against a local server with "does not support SSL connections".
 */
function sslConfig(dsn: string): { rejectUnauthorized: boolean } | undefined {
  const strict = { rejectUnauthorized: process.env.CHATBOT_DB_SSL_STRICT === 'true' };

  let url: URL | null = null;
  try {
    url = new URL(dsn);
  } catch {
    return strict;
  }

  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) {
    return sslmode === 'disable' ? undefined : strict;
  }

  return LOCAL_HOSTS.has(url.hostname) ? undefined : strict;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;

  const dsn = connectionString();

  pool = new Pool({
    connectionString: dsn,
    // Small on purpose. Supabase's transaction pooler (port 6543) multiplexes
    // for us, and a serverless deploy can spin up many instances — a large
    // per-instance pool is how you exhaust connection limits.
    max: Number(process.env.CHATBOT_DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Managed Postgres (Supabase pooler, Cloud SQL) commonly presents a chain
    // Node will not verify against the system store, so verification is off by
    // default. Set CHATBOT_DB_SSL_STRICT=true once you have the CA wired up.
    ssl: sslConfig(dsn),
  });

  // A pool-level error handler is mandatory: without one, an idle client
  // dropped by the server surfaces as an unhandled 'error' event and takes the
  // whole Node process down.
  pool.on('error', (error) => {
    console.error('[db] idle client error:', error.message);
  });

  return pool;
}

/** Run a query and return the rows. */
export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** Run a query expecting at most one row. */
export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a transaction, rolling back on any throw.
 *
 * The client is always released — including when the ROLLBACK itself fails,
 * which is exactly when a leaked connection would be most damaging.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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
      console.error('[db] rollback failed:', (rollbackError as Error).message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/** pgvector's text input format — identical to a JSON number array. */
export function toVector(embedding: number[]): string {
  return JSON.stringify(embedding);
}

/** Close the pool. Used by scripts so the process can exit cleanly. */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
