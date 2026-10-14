import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { emailSchema, isoDateSchema, uuidSchema } from "@/lib/validation";

const updateSchema = z.object({
  action: z.enum(["UPDATE", "DELETE", "RESTORE"]).default("UPDATE"),
  projectId: uuidSchema.optional(),
  dni: z.string().regex(/^\d{8}$/).optional(),
  firstName: z.string().trim().min(2).max(100).optional(),
  lastName: z.string().trim().min(2).max(120).optional(),
  jobTitle: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9()\s.-]{7,24}$/).transform((value) => value.replace(/[()\s.-]/g, "")).optional(),
  email: emailSchema.nullable().optional().or(z.literal("").transform(() => null)),
  address: z.string().trim().max(240).nullable().optional().or(z.literal("")),
  hiredOn: isoDateSchema.optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = updateSchema.parse(await parseJson(request));
    if (input.action === "DELETE" && !input.reason) throw new ApiError(422, "Indica el motivo para dar de baja al trabajador.");
    if (input.action === "RESTORE" && user.role !== "ADMIN") throw new ApiError(403, "Solo administración puede restaurar trabajadores.");
    const worker = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM workers WHERE id = $1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Trabajador no encontrado.");
      ensureProjectAccess(user, before.project_id);
      let result;
      if (input.action === "DELETE") {
        result = await client.query("UPDATE workers SET deleted_at = NOW(), deleted_by = $2, delete_reason = $3, status = 'INACTIVE', updated_at = NOW() WHERE id = $1 RETURNING *", [id, user.id, input.reason]);
      } else if (input.action === "RESTORE") {
        result = await client.query("UPDATE workers SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, status = 'ACTIVE', updated_at = NOW() WHERE id = $1 RETURNING *", [id]);
      } else {
        const projectId = input.projectId ?? before.project_id;
        if (user.role === "PROJECT_USER" && projectId !== before.project_id) throw new ApiError(403, "No puedes mover trabajadores a otra obra.");
        const destination = await client.query("SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL AND status='ACTIVE'", [projectId]);
        if (!destination.rowCount) throw new ApiError(422, "Selecciona una obra activa.");
        result = await client.query(
          `UPDATE workers SET project_id=$2, dni=$3, first_name=$4, last_name=$5, job_title=$6,
           phone=$7, email=$8, address=$9, hired_on=$10, status=$11, updated_at=NOW()
           WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
          [id, projectId, input.dni ?? before.dni, input.firstName ?? before.first_name, input.lastName ?? before.last_name,
            input.jobTitle ?? before.job_title, input.phone ?? before.phone, input.email === undefined ? before.email : input.email,
            input.address === undefined ? before.address : input.address || null, input.hiredOn ?? before.hired_on, input.status ?? before.status],
        );
        if (!result.rows[0]) throw new ApiError(409, "Restaura al trabajador antes de editarlo.");
      }
      await recordAudit(client, { actorId: user.id, projectId: before.project_id, action: input.action, entityType: "worker", entityId: id, before, after: result.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ worker });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "El DNI, correo o teléfono ya está registrado." }, { status: 409 });
    return errorResponse(error);
  }
}
