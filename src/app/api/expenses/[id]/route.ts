import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { isoDateSchema, moneySchema, toCents, uuidSchema } from "@/lib/validation";

const schema = z.object({
  action: z.enum(["UPDATE", "STAGE", "DELETE", "RESTORE"]),
  expenseDate: isoDateSchema.optional(),
  category: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().min(4).max(240).optional(),
  supplier: z.string().trim().max(160).optional(),
  receiptNumber: z.string().trim().max(100).optional(),
  amount: moneySchema.refine((value) => value > 0, "El importe debe ser mayor a cero.").optional(),
  stage: z.enum(["PENDING", "APPROVED", "PAID"]).optional(),
  reason: z.string().trim().min(6).max(300).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = schema.parse(await parseJson(request));
    if (input.action !== "UPDATE" && actor.role !== "ADMIN") throw new ApiError(403, "Esta acción requiere una cuenta administradora.");
    if ((input.action === "DELETE" || input.action === "STAGE" && input.stage === "PENDING") && !input.reason) {
      throw new ApiError(422, "Indica el motivo del cambio.");
    }
    const expense = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM expenses WHERE id=$1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Gasto no encontrado.");
      ensureProjectAccess(actor, before.project_id);
      if (input.action === "UPDATE" && actor.role !== "ADMIN" && before.recorded_by !== actor.id) throw new ApiError(403, "Solo puedes corregir tus propios gastos.");
      if (input.action === "UPDATE" && before.stage !== "PENDING") throw new ApiError(409, "Solo se puede editar un gasto pendiente.");
      let result;
      if (input.action === "DELETE") {
        if (actor.role !== "ADMIN" && before.stage !== "PENDING") throw new ApiError(409, "Solo se puede dar de baja un gasto pendiente.");
        result = await client.query("UPDATE expenses SET deleted_at=NOW(),deleted_by=$2,delete_reason=$3,updated_at=NOW() WHERE id=$1 RETURNING *", [id, actor.id, input.reason]);
      } else if (input.action === "RESTORE") {
        result = await client.query("UPDATE expenses SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING *", [id]);
      } else if (input.action === "UPDATE") {
        const updated = await client.query(
          `UPDATE expenses SET expense_date=$2,category=$3,description=$4,supplier=$5,receipt_number=$6,
           amount_cents=$7,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
          [id, input.expenseDate ?? before.expense_date, input.category ?? before.category,
            input.description ?? before.description, input.supplier === undefined ? before.supplier : input.supplier || null,
            input.receiptNumber === undefined ? before.receipt_number : input.receiptNumber || null,
            input.amount === undefined ? before.amount_cents : toCents(input.amount)],
        );
        if (!updated.rows[0]) throw new ApiError(409, "Restaura el gasto antes de editarlo.");
        result = updated;
      } else {
        if (!input.stage) throw new ApiError(422, "Selecciona la nueva etapa.");
        const allowed = (before.stage === "PENDING" && input.stage === "APPROVED")
          || (before.stage === "APPROVED" && input.stage === "PAID")
          || (before.stage !== input.stage && input.stage === "PENDING" && Boolean(input.reason));
        if (!allowed && before.stage !== input.stage) throw new ApiError(409, "El cambio de etapa no está permitido.");
        result = await client.query(
          `UPDATE expenses SET stage=$2::varchar,
           approved_at=CASE WHEN $2::varchar='APPROVED' THEN NOW() ELSE NULL END,
           paid_at=CASE WHEN $2::varchar='PAID' THEN NOW() ELSE NULL END,updated_at=NOW()
           WHERE id=$1 RETURNING *`, [id, input.stage],
        );
      }
      await recordAudit(client, { actorId: actor.id, projectId: before.project_id, action: input.action === "STAGE" ? "CHANGE_STAGE" : input.action, entityType: "expense", entityId: id, before, after: result.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}
