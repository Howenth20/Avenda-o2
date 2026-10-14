import "server-only";
import { pool } from "@/lib/db";
import { ApiError, type SessionUser } from "@/lib/types";
import { addDays, mondayOfWeek } from "@/lib/validation";

export type ReportPeriod = "week" | "month" | "year";

export function reportingRange(period: ReportPeriod, value: string): { start: string; end: string } {
  if (period === "week") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || mondayOfWeek(value) !== value) throw new ApiError(422, "Para el reporte semanal selecciona el lunes de la semana.");
    return { start: value, end: addDays(value, 6) };
  }
  if (period === "month") {
    if (!/^\d{4}-\d{2}$/.test(value)) throw new ApiError(422, "Selecciona un mes válido.");
    const [year, month] = value.split("-").map(Number);
    if (year < 1900 || year > 2100 || month < 1 || month > 12) throw new ApiError(422, "Selecciona un mes válido.");
    return { start: `${value}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
  }
  if (!/^\d{4}$/.test(value)) throw new ApiError(422, "Selecciona un año válido.");
  if (Number(value) < 1900 || Number(value) > 2100) throw new ApiError(422, "El año debe estar entre 1900 y 2100.");
  return { start: `${value}-01-01`, end: `${value}-12-31` };
}

export interface WeeklyMovement {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  kind: "GASTO" | "VIATICO" | "CAJA_CHICA";
  movementDate: string;
  category: string;
  description: string;
  amountCents: number;
  stage: string;
  invoiceStatus: string | null;
  paymentSource: string | null;
  receiptNumber: string | null;
  daysAttended: number | null;
  cashDirection: "IN" | "OUT" | null;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  expenses: WeeklyMovement[];
  perDiems: WeeklyMovement[];
  pettyCash: WeeklyMovement[];
  movements: WeeklyMovement[];
  totals: {
    expenseCents: number;
    perDiemCents: number;
    operationalCents: number;
    pendingCents: number;
    paidCents: number;
    invoiceDoneCents: number;
    pettyCashInCents: number;
    pettyCashReturnCents: number;
    pettyCashExpenseCents: number;
    pettyCashBalanceCents: number;
  };
}

function number(value: unknown): number {
  return Number(value ?? 0);
}

function projectScope(user: SessionUser, column: string, values: unknown[], requestedProjectId?: string | null): string {
  const projectId = user.role === "ADMIN" ? requestedProjectId : user.projectId;
  if (!projectId) return "";
  values.push(projectId);
  return ` AND ${column}=$${values.length}`;
}

export async function reportForRange(user: SessionUser, inputStart: string, inputEnd: string, requestedProjectId?: string | null): Promise<WeeklyReport> {
  const weekStart = inputStart;
  const weekEnd = inputEnd;
  const expenseValues: unknown[] = [weekStart, weekEnd];
  const expenseScope = projectScope(user, "e.project_id", expenseValues, requestedProjectId);
  const perDiemValues: unknown[] = [weekStart, weekEnd];
  const perDiemScope = projectScope(user, "d.project_id", perDiemValues, requestedProjectId);
  const pettyValues: unknown[] = [weekStart, weekEnd];
  const pettyScope = projectScope(user, "c.project_id", pettyValues, requestedProjectId);
  const cashMovementBalanceValues: unknown[] = [weekEnd];
  const cashScope = projectScope(user, "project_id", cashMovementBalanceValues, requestedProjectId);
  const cashExpenseBalanceValues: unknown[] = [weekEnd];
  const cashExpenseScope = projectScope(user, "project_id", cashExpenseBalanceValues, requestedProjectId);

  const [expensesResult, perDiemsResult, pettyResult, cashMovementBalance, cashExpenseBalance] = await Promise.all([
    pool.query(
      `SELECT e.id,e.project_id,e.expense_date::text AS movement_date,e.category,e.description,e.amount_cents,e.stage,
              e.invoice_status,e.payment_source,e.receipt_number,p.code AS project_code,p.name AS project_name
       FROM expenses e JOIN projects p ON p.id=e.project_id
       WHERE e.deleted_at IS NULL AND e.expense_date BETWEEN $1::date AND $2::date ${expenseScope}
       ORDER BY e.expense_date DESC,e.created_at DESC`, expenseValues,
    ),
    pool.query(
      `SELECT d.id,d.project_id,d.week_start::text AS movement_date,d.days_attended,d.total_cents AS amount_cents,d.stage,
              w.first_name || ' ' || w.last_name AS worker_name,p.code AS project_code,p.name AS project_name
       FROM per_diems d JOIN projects p ON p.id=d.project_id JOIN workers w ON w.id=d.worker_id
       WHERE d.week_start BETWEEN $1::date AND $2::date ${perDiemScope}
       ORDER BY d.week_start DESC,w.last_name,w.first_name`, perDiemValues,
    ),
    pool.query(
      `SELECT c.id,c.project_id,c.movement_date::text AS movement_date,c.movement_type,c.description,c.receipt_number,
              c.amount_cents,p.code AS project_code,p.name AS project_name
       FROM petty_cash_movements c JOIN projects p ON p.id=c.project_id
       WHERE c.deleted_at IS NULL AND c.movement_date BETWEEN $1::date AND $2::date ${pettyScope}
       ORDER BY c.movement_date DESC,c.created_at DESC`, pettyValues,
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN movement_type IN ('FUND','REPLENISHMENT') THEN amount_cents ELSE -amount_cents END),0)::int AS balance
       FROM petty_cash_movements
       WHERE deleted_at IS NULL AND movement_date <= $1::date ${cashScope}`, cashMovementBalanceValues,
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount_cents),0)::int AS balance
       FROM expenses
       WHERE deleted_at IS NULL AND payment_source='PETTY_CASH' AND expense_date <= $1::date ${cashExpenseScope}`, cashExpenseBalanceValues,
    ),
  ]);

  const expenses: WeeklyMovement[] = expensesResult.rows.map((row) => ({
    id: row.id, projectId: row.project_id, projectCode: row.project_code, projectName: row.project_name,
    kind: "GASTO", movementDate: row.movement_date, category: row.category, description: row.description,
    amountCents: number(row.amount_cents), stage: row.stage, invoiceStatus: row.invoice_status,
    paymentSource: row.payment_source, receiptNumber: row.receipt_number, daysAttended: null, cashDirection: null,
  }));
  const perDiems: WeeklyMovement[] = perDiemsResult.rows.map((row) => ({
    id: row.id, projectId: row.project_id, projectCode: row.project_code, projectName: row.project_name,
    kind: "VIATICO", movementDate: row.movement_date, category: "Viático semanal", description: row.worker_name,
    amountCents: number(row.amount_cents), stage: row.stage, invoiceStatus: null, paymentSource: null,
    receiptNumber: null, daysAttended: number(row.days_attended), cashDirection: null,
  }));
  const pettyCash: WeeklyMovement[] = pettyResult.rows.map((row) => {
    const incoming = row.movement_type === "FUND" || row.movement_type === "REPLENISHMENT";
    return {
      id: row.id, projectId: row.project_id, projectCode: row.project_code, projectName: row.project_name,
      kind: "CAJA_CHICA", movementDate: row.movement_date,
      category: row.movement_type === "FUND" ? "Fondo asignado" : row.movement_type === "REPLENISHMENT" ? "Reposición" : "Devolución",
      description: row.description, amountCents: number(row.amount_cents), stage: "REGISTERED", invoiceStatus: null,
      paymentSource: null, receiptNumber: row.receipt_number, daysAttended: null, cashDirection: incoming ? "IN" : "OUT",
    };
  });

  const expenseCents = expenses.reduce((sum, row) => sum + row.amountCents, 0);
  const perDiemCents = perDiems.reduce((sum, row) => sum + row.amountCents, 0);
  const pettyCashInCents = pettyCash.filter((row) => row.cashDirection === "IN").reduce((sum, row) => sum + row.amountCents, 0);
  const pettyCashReturnCents = pettyCash.filter((row) => row.cashDirection === "OUT").reduce((sum, row) => sum + row.amountCents, 0);
  const pettyCashExpenseCents = expenses.filter((row) => row.paymentSource === "PETTY_CASH").reduce((sum, row) => sum + row.amountCents, 0);
  const pendingCents = [...expenses, ...perDiems].filter((row) => row.stage === "PENDING").reduce((sum, row) => sum + row.amountCents, 0);
  const paidCents = [...expenses, ...perDiems].filter((row) => row.stage === "PAID").reduce((sum, row) => sum + row.amountCents, 0);
  const invoiceDoneCents = expenses.filter((row) => row.invoiceStatus === "HECHO").reduce((sum, row) => sum + row.amountCents, 0);
  const movementOrder = [...expenses, ...perDiems, ...pettyCash].sort((left, right) => right.movementDate.localeCompare(left.movementDate));

  return {
    weekStart, weekEnd, expenses, perDiems, pettyCash, movements: movementOrder,
    totals: {
      expenseCents, perDiemCents, operationalCents: expenseCents + perDiemCents, pendingCents, paidCents,
      invoiceDoneCents, pettyCashInCents, pettyCashReturnCents, pettyCashExpenseCents,
      pettyCashBalanceCents: number(cashMovementBalance.rows[0]?.balance) - number(cashExpenseBalance.rows[0]?.balance),
    },
  };
}

export async function weeklyReport(user: SessionUser, inputWeekStart: string): Promise<WeeklyReport> {
  const weekStart = mondayOfWeek(inputWeekStart);
  return reportForRange(user, weekStart, addDays(weekStart, 6));
}
