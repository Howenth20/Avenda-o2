import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { businessToday, isoDateSchema, mondayOfWeek, moneySchema, toCents, uuidSchema } from "@/lib/validation";

const expenseSchema = z.object({
  projectId: uuidSchema,
  expenseDate: isoDateSchema,
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(4).max(240),
  supplier: z.string().trim().max(160).optional().default(""),
  receiptNumber: z.string().trim().max(100).optional().default(""),
  amount: moneySchema.refine((value) => value > 0, "El importe debe ser mayor a cero."),
  paymentSource: z.enum(["DIRECT", "PETTY_CASH"]).default("DIRECT"),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const weekStart = params.get("weekStart");
    const month = params.get("month") ?? businessToday().slice(0, 7);
    const includeDeleted = params.get("includeDeleted") === "true" && user.role === "ADMIN";
    if (weekStart && mondayOfWeek(weekStart) !== weekStart) throw new ApiError(422, "Selecciona el lunes de la semana.");
    if (!weekStart && !/^\d{4}-\d{2}$/.test(month)) throw new ApiError(422, "El mes debe tener el formato AAAA-MM.");
    const values: unknown[] = [weekStart ?? `${month}-01`];
    let scope = "";
    if (user.role === "PROJECT_USER") {
      values.push(user.projectId);
      scope = ` AND e.project_id=$${values.length}`;
    }
    const result = await pool.query(
      `SELECT e.id,e.project_id,e.expense_date,e.week_start,e.category,e.description,e.supplier,e.receipt_number,
              e.amount_cents,e.stage,e.invoice_status,e.payment_source,e.created_at,e.updated_at,e.deleted_at,e.delete_reason,p.code AS project_code,p.name AS project_name,
              evidence.id AS evidence_id,evidence.original_name AS evidence_name,evidence.document_number AS evidence_document_number,evidence.document_date AS evidence_document_date,
              u.name AS registered_by
       FROM expenses e JOIN projects p ON p.id=e.project_id JOIN users u ON u.id=e.recorded_by
       LEFT JOIN document_evidences evidence ON evidence.entity_type='EXPENSE' AND evidence.entity_id=e.id AND evidence.deleted_at IS NULL
       WHERE ${includeDeleted ? "TRUE" : "e.deleted_at IS NULL"}
         AND ${weekStart ? "e.week_start = $1::date" : "e.expense_date >= $1::date AND e.expense_date < ($1::date + INTERVAL '1 month')"} ${scope}
       ORDER BY e.expense_date DESC,e.created_at DESC LIMIT 500`, values,
    );
    return Response.json({ expenses: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = expenseSchema.parse(await parseJson(request));
    ensureProjectAccess(user, input.projectId);
    const expense = await inTransaction(async (client) => {
      const project = await client.query("SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL AND status='ACTIVE'", [input.projectId]);
      if (!project.rowCount) throw new ApiError(422, "Selecciona una obra activa.");
      const result = await client.query(
        `INSERT INTO expenses (project_id,expense_date,week_start,category,description,supplier,receipt_number,amount_cents,payment_source,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id,project_id,expense_date,week_start,category,description,supplier,receipt_number,amount_cents,stage,invoice_status,payment_source,created_at`,
        [input.projectId, input.expenseDate, mondayOfWeek(input.expenseDate), input.category, input.description, input.supplier || null, input.receiptNumber || null, toCents(input.amount), input.paymentSource, user.id],
      );
      await recordAudit(client, { actorId: user.id, projectId: input.projectId, action: "CREATE", entityType: "expense", entityId: result.rows[0].id, before: null, after: result.rows[0], ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ expense }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "El gasto ya existe." }, { status: 409 });
    return errorResponse(error);
  }
}
