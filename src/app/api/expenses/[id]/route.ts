import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { isoDateSchema, mondayOfWeek, moneySchema, toCents, uuidSchema } from "@/lib/validation";

const schema = z.object({
  action: z.enum(["UPDATE", "STAGE", "INVOICE", "DELETE", "RESTORE"]),
  expenseDate: isoDateSchema.optional(),
  category: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().min(4).max(240).optional(),
  supplier: z.string().trim().max(160).optional(),
  receiptNumber: z.string().trim().max(100).optional(),
  amount: moneySchema.refine((value) => value > 0, "El importe debe ser mayor a cero.").optional(),
  paymentSource: z.enum(["DIRECT", "PETTY_CASH"]).optional(),
  stage: z.enum(["PENDING", "APPROVED", "PAID"]).optional(),
  invoiceStatus: z.enum(["PENDING", "HECHO"]).optional(),
  reason: z.string().trim().min(6).max(300).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = schema.parse(await parseJson(request));
    if ((input.action === "STAGE" || input.action === "RESTORE") && actor.role !== "ADMIN") throw new ApiError(403, "Esta acción requiere una cuenta administradora.");
    if ((input.action === "DELETE" || input.action === "STAGE" && input.stage === "PENDING" || input.action === "INVOICE" && input.invoiceStatus === "PENDING") && !input.reason) {
      throw new ApiError(422, "Indica el motivo del cambio.");
    }
    const expense = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM expenses WHERE id=$1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Gasto no encontrado.");
      ensureProjectAccess(actor, before.project_id);
      if (["UPDATE", "DELETE"].includes(input.action) && before.stage !== "PENDING") throw new ApiError(409, "Solo se puede modificar o eliminar un gasto pendiente.");
      let result;
      if (input.action === "DELETE") {
        result = await client.query("UPDATE expenses SET deleted_at=NOW(),deleted_by=$2,delete_reason=$3,updated_at=NOW() WHERE id=$1 RETURNING *", [id, actor.id, input.reason]);
      } else if (input.action === "RESTORE") {
        result = await client.query("UPDATE expenses SET deleted_at=NULL,deleted_by=NULL,delete_reason=NULL,updated_at=NOW() WHERE id=$1 RETURNING *", [id]);
      } else if (input.action === "UPDATE") {
        const expenseDate = input.expenseDate ?? String(before.expense_date).slice(0, 10);
        const updated = await client.query(
          `UPDATE expenses SET expense_date=$2,week_start=$3,category=$4,description=$5,supplier=$6,receipt_number=$7,
           amount_cents=$8,payment_source=$9,updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
          [id, expenseDate, mondayOfWeek(expenseDate), input.category ?? before.category,
            input.description ?? before.description, input.supplier === undefined ? before.supplier : input.supplier || null,
            input.receiptNumber === undefined ? before.receipt_number : input.receiptNumber || null,
            input.amount === undefined ? before.amount_cents : toCents(input.amount), input.paymentSource ?? before.payment_source],
        );
        if (!updated.rows[0]) throw new ApiError(409, "Restaura el gasto antes de editarlo.");
        result = updated;
      } else if (input.action === "STAGE") {
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
      } else {
        if (!input.invoiceStatus) throw new ApiError(422, "Selecciona el estado de factura.");
        const receipt = input.receiptNumber === undefined ? before.receipt_number : input.receiptNumber || null;
        const supplier = input.supplier === undefined ? before.supplier : input.supplier || null;
        if (input.invoiceStatus === "HECHO" && (!receipt || !supplier)) throw new ApiError(422, "Para marcar la factura como hecha indica proveedor y número de comprobante.");
        if (input.invoiceStatus === "HECHO") {
          throw new ApiError(422, "Adjunta el PDF de la factura desde el botón Comprobante PDF. El sistema verificará su importe y número antes de marcarla como hecha.");
        }
        result = await client.query(
          `UPDATE expenses SET invoice_status=$2,supplier=$3,receipt_number=$4,updated_at=NOW()
           WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [id, input.invoiceStatus, supplier, receipt],
        );
        if (!result.rows[0]) throw new ApiError(409, "Restaura el gasto antes de actualizar su factura.");
      }
      await recordAudit(client, { actorId: actor.id, projectId: before.project_id, action: input.action === "STAGE" ? "CHANGE_STAGE" : input.action === "INVOICE" ? "MARK_INVOICE" : input.action, entityType: "expense", entityId: id, before, after: result.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ expense });
  } catch (error) {
    return errorResponse(error);
  }
}
