import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { recalculatePerDiem } from "@/lib/finance";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { businessToday, uuidSchema } from "@/lib/validation";

const editSchema = z.object({ status: z.enum(["PRESENT", "ABSENT", "EXCUSED"]), note: z.string().trim().max(300).optional().default("") });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = editSchema.parse(await parseJson(request));
    const updated = await inTransaction(async (client) => {
      const found = await client.query(
        `SELECT a.*, w.project_id FROM attendances a JOIN workers w ON w.id=a.worker_id
         WHERE a.id=$1 AND a.deleted_at IS NULL FOR UPDATE OF a`, [id],
      );
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Asistencia no encontrada.");
      ensureProjectAccess(user, before.project_id);
      if (before.work_date > businessToday()) throw new ApiError(422, "No se puede editar una asistencia futura.");
      const result = await client.query(
        "UPDATE attendances SET status=$2, note=$3, updated_at=NOW() WHERE id=$1 RETURNING id, worker_id, work_date, status, note, recorded_at, updated_at",
        [id, input.status, input.note || null],
      );
      await recordAudit(client, { actorId: user.id, projectId: before.project_id, action: "UPDATE", entityType: "attendance", entityId: id, before, after: result.rows[0], ip: requestIp(request) });
      await recalculatePerDiem(client, before.worker_id, before.work_date, user, requestIp(request));
      return result.rows[0];
    });
    return Response.json({ attendance: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
