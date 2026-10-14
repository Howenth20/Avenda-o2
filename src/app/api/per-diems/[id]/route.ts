import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

const stageSchema = z.object({ stage: z.enum(["PENDING", "APPROVED", "PAID"]), reason: z.string().trim().min(6).max(300).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = stageSchema.parse(await parseJson(request));
    const result = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM per_diems WHERE id=$1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Viático no encontrado.");
      const allowed = (before.stage === "PENDING" && input.stage === "APPROVED")
        || (before.stage === "APPROVED" && input.stage === "PAID")
        || (before.stage !== input.stage && input.stage === "PENDING" && Boolean(input.reason));
      if (!allowed && before.stage !== input.stage) throw new ApiError(409, "El cambio de etapa no está permitido.");
      const updated = await client.query(
          `UPDATE per_diems SET stage=$2::varchar,
         approved_at=CASE WHEN $2::varchar='APPROVED' THEN NOW() ELSE NULL END,
         paid_at=CASE WHEN $2::varchar='PAID' THEN NOW() ELSE NULL END, updated_at=NOW()
         WHERE id=$1 RETURNING *`, [id, input.stage],
      );
      await recordAudit(client, { actorId: user.id, projectId: before.project_id, action: "CHANGE_STAGE", entityType: "per_diem", entityId: id, before, after: updated.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      return updated.rows[0];
    });
    return Response.json({ perDiem: result });
  } catch (error) {
    return errorResponse(error);
  }
}
