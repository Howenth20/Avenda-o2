import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { emailSchema, isoDateSchema, uuidSchema } from "@/lib/validation";

const phoneSchema = z.string().trim().regex(/^\+?[0-9()\s.-]{7,24}$/, "Escribe un teléfono válido.").transform((value) => value.replace(/[()\s.-]/g, ""));
const workerSchema = z.object({
  projectId: uuidSchema,
  dni: z.string().trim().regex(/^\d{8}$/, "El DNI debe tener ocho dígitos."),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: emailSchema,
  address: z.string().trim().min(4).max(240),
  hiredOn: isoDateSchema,
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const includeDeleted = params.get("includeDeleted") === "true" && user.role === "ADMIN";
    const values: unknown[] = [];
    let where = includeDeleted ? "TRUE" : "w.deleted_at IS NULL";
    if (user.role === "PROJECT_USER") {
      values.push(user.projectId);
      where += ` AND w.project_id = $${values.length}`;
    }
    const result = await pool.query(
      `SELECT w.id, w.project_id, w.dni, w.first_name, w.last_name, w.job_title, w.phone, w.email,
              w.address, w.hired_on, w.status, w.deleted_at, p.code AS project_code, p.name AS project_name
       FROM workers w JOIN projects p ON p.id = w.project_id
       WHERE ${where} ORDER BY w.last_name, w.first_name LIMIT 500`, values,
    );
    return Response.json({ workers: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = workerSchema.parse(await parseJson(request));
    const worker = await inTransaction(async (client) => {
      const project = await client.query("SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL AND status='ACTIVE'", [input.projectId]);
      if (!project.rowCount) throw new ApiError(422, "Selecciona una obra activa.");
      ensureProjectAccess(user, input.projectId);
      const result = await client.query(
        `INSERT INTO workers (project_id, dni, first_name, last_name, job_title, phone, email, address, hired_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, project_id, dni, first_name, last_name, job_title, phone, email, address, hired_on, status`,
        [input.projectId, input.dni, input.firstName, input.lastName, input.jobTitle, input.phone, input.email, input.address, input.hiredOn],
      );
      await recordAudit(client, { actorId: user.id, projectId: input.projectId, action: "CREATE", entityType: "worker", entityId: result.rows[0].id, before: null, after: result.rows[0], ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ worker }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "El DNI, correo o teléfono ya está registrado." }, { status: 409 });
    return errorResponse(error);
  }
}
