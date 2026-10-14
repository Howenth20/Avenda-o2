import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { recalculatePerDiem } from "@/lib/finance";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { businessToday, uuidSchema } from "@/lib/validation";

const editSchema = z.object({
  action: z.enum(["UPDATE", "DELETE", "RESTORE"]).default("UPDATE"),
  status: z.enum(["PRESENT", "ABSENT", "EXCUSED"]).optional(),
  note: z.string().trim().max(300).optional().default(""),
  reason: z.string().trim().min(6).max(300).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = editSchema.parse(await parseJson(request));
    if (input.action === "RESTORE" && user.role !== "ADMIN") throw new ApiError(403, "Solo administración puede restaurar asistencias.");
    if (input.action === "DELETE" && !input.reason) throw new ApiError(422, "Indica el motivo de eliminación.");
    if (input.action === "UPDATE" && !input.status) throw new ApiError(422, "Selecciona el estado de asistencia.");
    const updated = await inTransaction(async (client) => {
      const found = await client.query(
        `SELECT a.*, w.project_id FROM attendances a JOIN workers w ON w.id=a.worker_id
         WHERE a.id=$1 FOR UPDATE OF a`, [id],
      );
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Asistencia no encontrada.");
      ensureProjectAccess(user, before.project_id);
      if (String(before.work_date).slice(0, 10) > businessToday()) throw new ApiError(422, "No se puede modificar una asistencia futura.");
      let result;
      if (input.action === "DELETE") {
        result = await client.query(
          "UPDATE attendances SET deleted_at=NOW(),deleted_by=$2,delete_reason=$3,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id,worker_id,work_date,status,note,deleted_at,delete_reason,recorded_at,updated_at",
          [id, user.id, input.reason],
        );
      } else if (input.action === "RESTORE") {
        result = await client.query(
          "UPDATE attendances SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_at=NOW() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id,worker_id,work_date,status,note,deleted_at,delete_reason,recorded_at,updated_at",
          [id],
        );
      } else {
        if (before.deleted_at) throw new ApiError(409, "Restaura la asistencia antes de editarla.");
        result = await client.query(
          "UPDATE attendances SET status=$2, note=$3, updated_at=NOW() WHERE id=$1 RETURNING id,worker_id,work_date,status,note,deleted_at,recorded_at,updated_at",
          [id, input.status, input.note || null],
        );
      }
      if (!result.rows[0]) throw new ApiError(409, "La asistencia no puede modificarse en su estado actual.");
      await recordAudit(client, { actorId: user.id, projectId: before.project_id, action: input.action, entityType: "attendance", entityId: id, before, after: result.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      await recalculatePerDiem(client, before.worker_id, before.work_date, user, requestIp(request));
      return result.rows[0];
    });
    return Response.json({ attendance: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
