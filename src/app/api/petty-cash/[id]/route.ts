import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { isoDateSchema, mondayOfWeek, moneySchema, toCents, uuidSchema } from "@/lib/validation";

const schema = z.object({
  action: z.enum(["UPDATE", "DELETE", "RESTORE"]),
  movementDate: isoDateSchema.optional(),
  movementType: z.enum(["FUND", "REPLENISHMENT", "RETURN"]).optional(),
  description: z.string().trim().min(4).max(240).optional(),
  receiptNumber: z.string().trim().max(100).optional(),
  amount: moneySchema.refine((value) => value > 0, "El importe debe ser mayor a cero.").optional(),
  reason: z.string().trim().min(6).max(300).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = schema.parse(await parseJson(request));
    if (input.action === "RESTORE" && actor.role !== "ADMIN") throw new ApiError(403, "Solo administración puede restaurar movimientos.");
    if (input.action === "DELETE" && !input.reason) throw new ApiError(422, "Indica el motivo de eliminación.");
    const movement = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM petty_cash_movements WHERE id=$1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Movimiento de caja chica no encontrado.");
      ensureProjectAccess(actor, before.project_id);
      let result;
      if (input.action === "DELETE") {
        result = await client.query("UPDATE petty_cash_movements SET deleted_at=NOW(),deleted_by=$2,delete_reason=$3,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *", [id, actor.id, input.reason]);
      } else if (input.action === "RESTORE") {
        result = await client.query("UPDATE petty_cash_movements SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING *", [id]);
      } else {
        const movementDate = input.movementDate ?? String(before.movement_date).slice(0, 10);
        result = await client.query(
          `UPDATE petty_cash_movements SET movement_date=$2,week_start=$3,movement_type=$4,description=$5,receipt_number=$6,amount_cents=$7,updated_at=NOW()
           WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
          [id, movementDate, mondayOfWeek(movementDate), input.movementType ?? before.movement_type, input.description ?? before.description,
            input.receiptNumber === undefined ? before.receipt_number : input.receiptNumber || null, input.amount === undefined ? before.amount_cents : toCents(input.amount)],
        );
      }
      if (!result.rows[0]) throw new ApiError(409, "El movimiento no puede modificarse en su estado actual.");
      await recordAudit(client, { actorId: actor.id, projectId: before.project_id, action: input.action, entityType: "petty_cash", entityId: id, before, after: result.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ movement });
  } catch (error) {
    return errorResponse(error);
  }
}
