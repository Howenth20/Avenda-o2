import { Pool, type PoolClient, type QueryResultRow } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForPool = globalThis as typeof globalThis & { rindePool?: Pool };

export const pool = globalForPool.rindePool ?? new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

export function requireDatabaseConfig(): void {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured before using the backend.");
}

if (process.env.NODE_ENV !== "production") globalForPool.rindePool = pool;

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error", error);
});

export async function inTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function rows<T extends QueryResultRow>(result: { rows: T[] }): T[] {
  return result.rows;
}
