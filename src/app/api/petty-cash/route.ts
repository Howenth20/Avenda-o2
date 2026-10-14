import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { weeklyReport } from "@/lib/reporting";
import { ApiError } from "@/lib/types";
import { businessToday, isoDateSchema, mondayOfWeek, moneySchema, toCents, uuidSchema } from "@/lib/validation";

const movementSchema = z.object({
  projectId: uuidSchema,
  movementDate: isoDateSchema,
  movementType: z.enum(["FUND", "REPLENISHMENT", "RETURN"]),
  description: z.string().trim().min(4).max(240),
  receiptNumber: z.string().trim().max(100).optional().default(""),
  amount: moneySchema.refine((value) => value > 0, "El importe debe ser mayor a cero."),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const weekStart = params.get("weekStart") ?? mondayOfWeek(businessToday());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOfWeek(weekStart) !== weekStart) throw new ApiError(422, "Selecciona el lunes de la semana.");
    const includeDeleted = params.get("includeDeleted") === "true" && user.role === "ADMIN";
    const values: unknown[] = [weekStart];
    let scope = "";
    if (user.role === "PROJECT_USER") {
      values.push(user.projectId);
      scope = ` AND c.project_id=$${values.length}`;
    }
    const [result, report] = await Promise.all([
      pool.query(
        `SELECT c.id,c.project_id,c.week_start,c.movement_date,c.movement_type,c.description,c.receipt_number,c.amount_cents,
                c.created_at,c.updated_at,c.deleted_at,c.delete_reason,p.code AS project_code,p.name AS project_name,u.name AS recorded_by,
                evidence.id AS evidence_id,evidence.original_name AS evidence_name,evidence.document_number AS evidence_document_number,evidence.document_date AS evidence_document_date
         FROM petty_cash_movements c JOIN projects p ON p.id=c.project_id JOIN users u ON u.id=c.recorded_by
         LEFT JOIN document_evidences evidence ON evidence.entity_type='PETTY_CASH' AND evidence.entity_id=c.id AND evidence.deleted_at IS NULL
         WHERE ${includeDeleted ? "TRUE" : "c.deleted_at IS NULL"} AND c.week_start=$1::date ${scope}
         ORDER BY c.movement_date DESC,c.created_at DESC LIMIT 500`, values,
      ),
      weeklyReport(user, weekStart),
    ]);
    return Response.json({ movements: result.rows, totals: report.totals, weekStart: report.weekStart, weekEnd: report.weekEnd });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = movementSchema.parse(await parseJson(request));
    if (input.movementDate > businessToday()) throw new ApiError(422, "No se puede registrar un movimiento futuro.");
    ensureProjectAccess(user, input.projectId);
    const movement = await inTransaction(async (client) => {
      const project = await client.query("SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL AND status='ACTIVE'", [input.projectId]);
      if (!project.rowCount) throw new ApiError(422, "Selecciona una obra activa.");
      const result = await client.query(
        `INSERT INTO petty_cash_movements (project_id,week_start,movement_date,movement_type,description,receipt_number,amount_cents,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,project_id,week_start,movement_date,movement_type,description,receipt_number,amount_cents,created_at`,
        [input.projectId, mondayOfWeek(input.movementDate), input.movementDate, input.movementType, input.description, input.receiptNumber || null, toCents(input.amount), user.id],
      );
      await recordAudit(client, { actorId: user.id, projectId: input.projectId, action: "CREATE", entityType: "petty_cash", entityId: result.rows[0].id, before: null, after: result.rows[0], ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ movement }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
