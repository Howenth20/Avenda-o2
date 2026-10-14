import { pool, requireDatabaseConfig } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireDatabaseConfig();
    await pool.query("SELECT 1");
    const result = await pool.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version");
    const applied = result.rows.map((row) => row.version);
    const expected = ["20261014_001_initial", "20261014_002_weekly_finance_and_claims", "20261014_003_document_evidence", "20261014_004_image_and_database_evidence", "20261014_005_optional_worker_contact"];
    const missing = expected.filter((version) => !applied.includes(version));
    if (missing.length) {
      return Response.json({ status: "error", database: "connected", error: "La base está conectada, pero faltan migraciones. Ejecuta scripts/migrate.mjs contra esta DATABASE_URL.", missingMigrations: missing }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ status: "ok", database: "connected", migrations: applied }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
