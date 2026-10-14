import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const version = "20261014_001_initial";
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [version]);
    if (applied.rowCount === 0) {
      await client.query(schema);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      console.log(`Applied database migration ${version}.`);
    } else {
      console.log("Database schema is up to date.");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
