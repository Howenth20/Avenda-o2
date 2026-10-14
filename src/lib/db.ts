import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { ApiError } from "@/lib/types";

const databaseUrl = process.env.DATABASE_URL;

const globalForPool = globalThis as typeof globalThis & { rindePool?: Pool };
const connectionStringDefinesSsl = /[?&](sslmode|sslcert|sslkey|sslrootcert)=/i.test(databaseUrl ?? "");
const configuredPoolMax = process.env.VERCEL === "1" ? 3 : 10;

export const pool = globalForPool.rindePool ?? new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.DB_POOL_MAX ?? configuredPoolMax),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ...(process.env.DATABASE_SSL === "true" && !connectionStringDefinesSsl ? { ssl: { rejectUnauthorized: true } } : {}),
});

export function requireDatabaseConfig(): void {
  const value = process.env.DATABASE_URL;
  if (!value) throw new ApiError(503, "La base de datos de producción no está configurada. Agrega DATABASE_URL en Vercel y vuelve a desplegar.");
  let host: string;
  try { host = new URL(value).hostname; } catch { throw new ApiError(503, "DATABASE_URL no tiene un formato PostgreSQL válido. Usa la cadena completa entregada por tu proveedor."); }
  if (process.env.VERCEL === "1" && ["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new ApiError(503, "DATABASE_URL apunta a localhost. Vercel requiere una base PostgreSQL externa, por ejemplo Neon, y no puede usar la base de tu PC.");
  }
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
