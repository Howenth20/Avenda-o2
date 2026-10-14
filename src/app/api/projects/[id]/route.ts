import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { moneySchema, toCents, uuidSchema } from "@/lib/validation";

const updateSchema = z.object({
  action: z.enum(["UPDATE", "DELETE", "RESTORE"]).default("UPDATE"),
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9-]+$/).transform((value) => value.toUpperCase()).optional(),
  name: z.string().trim().min(2).max(160).optional(),
  responsible: z.string().trim().min(2).max(160).optional(),
  location: z.string().trim().min(2).max(180).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]).optional(),
  dailyRate: moneySchema.optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireAdmin();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const input = updateSchema.parse(await parseJson(request));
    if (input.action === "DELETE" && !input.reason) throw new ApiError(422, "Indica el motivo para desactivar la obra.");
    const project = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM projects WHERE id = $1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Obra no encontrada.");
      let result;
      if (input.action === "DELETE") {
        result = await client.query(
          "UPDATE projects SET deleted_at = NOW(), deleted_by = $2, delete_reason = $3, updated_at = NOW(), status = 'CLOSED' WHERE id = $1 RETURNING id, code, name, status, daily_rate_cents, deleted_at",
          [id, user.id, input.reason],
        );
      } else if (input.action === "RESTORE") {
        result = await client.query(
          "UPDATE projects SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, status = 'ACTIVE', updated_at = NOW() WHERE id = $1 RETURNING id, code, name, status, daily_rate_cents, deleted_at",
          [id],
        );
      } else {
        const rate = input.dailyRate === undefined ? before.daily_rate_cents : toCents(input.dailyRate);
        result = await client.query(
          `UPDATE projects SET code = COALESCE($2, code), name = COALESCE($3, name),
           responsible = COALESCE($4, responsible), location = COALESCE($5, location),
           status = COALESCE($6, status), daily_rate_cents = $7, updated_at = NOW()
           WHERE id = $1 AND deleted_at IS NULL
           RETURNING id, code, name, responsible, location, status, daily_rate_cents`,
          [id, input.code ?? null, input.name ?? null, input.responsible ?? null, input.location ?? null, input.status ?? null, rate],
        );
        if (!result.rows[0]) throw new ApiError(409, "Restaura la obra antes de editarla.");
        if (rate !== before.daily_rate_cents) {
          const changed = await client.query(
            `SELECT p.id, p.worker_id, p.week_start, p.days_attended, p.daily_rate_cents, p.total_cents
             FROM per_diems p WHERE p.project_id = $1 AND p.stage = 'PENDING' FOR UPDATE`, [id],
          );
          for (const allowance of changed.rows) {
            const nextTotal = allowance.days_attended * rate;
            await client.query(
              "UPDATE per_diems SET daily_rate_cents = $2, total_cents = $3, calculated_at = NOW(), updated_at = NOW() WHERE id = $1",
              [allowance.id, rate, nextTotal],
            );
            await recordAudit(client, { actorId: user.id, projectId: id, action: "RECALCULATE", entityType: "per_diem", entityId: allowance.id, before: { dailyRateCents: allowance.daily_rate_cents, totalCents: allowance.total_cents }, after: { dailyRateCents: rate, totalCents: nextTotal, daysAttended: allowance.days_attended }, reason: "Cambio de tarifa de obra", ip: requestIp(request) });
          }
        }
      }
      await recordAudit(client, { actorId: user.id, projectId: id, action: input.action, entityType: "project", entityId: id, before, after: result.rows[0], reason: input.reason ?? null, ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ project });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "Ya existe una obra con ese código." }, { status: 409 });
    return errorResponse(error);
  }
}
