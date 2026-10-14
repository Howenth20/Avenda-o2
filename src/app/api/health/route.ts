import { pool, requireDatabaseConfig } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireDatabaseConfig();
    await pool.query("SELECT 1");
    const result = await pool.query<{ version: string }>("SELECT version FROM schema_migrations ORDER BY version");
    return Response.json({ status: "ok", database: "connected", migrations: result.rows.map((row) => row.version) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}