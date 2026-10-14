import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const databaseUrl = process.env.DATABASE_URL;
const connectionStringDefinesSsl = /[?&](sslmode|sslcert|sslkey|sslrootcert)=/i.test(databaseUrl);
const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  ...(process.env.DATABASE_SSL === "true" && !connectionStringDefinesSsl ? { ssl: { rejectUnauthorized: true } } : {}),
});

try {
  const migrations = [
    { version: "20261014_001_initial", file: new URL("../db/schema.sql", import.meta.url) },
    { version: "20261014_002_weekly_finance_and_claims", file: new URL("../db/migrations/20261014_002_weekly_finance_and_claims.sql", import.meta.url) },
    { version: "20261014_003_document_evidence", file: new URL("../db/migrations/20261014_003_document_evidence.sql", import.meta.url) },
    { version: "20261014_004_image_and_database_evidence", file: new URL("../db/migrations/20261014_004_image_and_database_evidence.sql", import.meta.url) },
    { version: "20261014_005_optional_worker_contact", file: new URL("../db/migrations/20261014_005_optional_worker_contact.sql", import.meta.url) },
  ];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    let appliedCount = 0;
    for (const migration of migrations) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [migration.version]);
      if (applied.rowCount) continue;
      const sql = await readFile(migration.file, "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
      console.log(`Applied database migration ${migration.version}.`);
      appliedCount += 1;
    }
    if (appliedCount === 0) console.log("Database schema is up to date.");
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
