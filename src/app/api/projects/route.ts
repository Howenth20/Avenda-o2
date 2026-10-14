import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireAdmin, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { moneySchema, toCents } from "@/lib/validation";

const projectSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9-]+$/, "Usa letras, números y guiones en el código.").transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  responsible: z.string().trim().min(2).max(160),
  location: z.string().trim().min(2).max(180),
  dailyRate: moneySchema,
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "true" && user.role === "ADMIN";
    const result = user.role === "ADMIN"
      ? await pool.query(`SELECT id, code, name, responsible, location, status, daily_rate_cents, created_at, deleted_at FROM projects ${includeDeleted ? "" : "WHERE deleted_at IS NULL"} ORDER BY code`)
      : await pool.query("SELECT id, code, name, responsible, location, status, daily_rate_cents, created_at, deleted_at FROM projects WHERE id = $1 AND deleted_at IS NULL", [user.projectId]);
    return Response.json({ projects: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const input = projectSchema.parse(await parseJson(request));
    const project = await inTransaction(async (client) => {
      const created = await client.query(
        `INSERT INTO projects (code, name, responsible, location, daily_rate_cents)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, code, name, responsible, location, status, daily_rate_cents`,
        [input.code, input.name, input.responsible, input.location, toCents(input.dailyRate)],
      );
      await recordAudit(client, { actorId: user.id, projectId: created.rows[0].id, action: "CREATE", entityType: "project", entityId: created.rows[0].id, before: null, after: created.rows[0], ip: requestIp(request) });
      return created.rows[0];
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "Ya existe una obra con ese código." }, { status: 409 });
    if (error instanceof z.ZodError) return errorResponse(error);
    if (error instanceof ApiError) return errorResponse(error);
    return errorResponse(error);
  }
}
