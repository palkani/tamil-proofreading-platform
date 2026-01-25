import pg from "pg";

export type PgClient = pg.Pool;

export function createPool(): PgClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  return new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 4),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 2_000,
  });
}


