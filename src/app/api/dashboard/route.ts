import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { weeklyReport } from "@/lib/reporting";
import { ApiError } from "@/lib/types";
import { businessToday, mondayOfWeek } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const weekStart = new URL(request.url).searchParams.get("weekStart") ?? mondayOfWeek(businessToday());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOfWeek(weekStart) !== weekStart) throw new ApiError(422, "Selecciona el lunes de la semana.");
    const values: unknown[] = [weekStart];
    const projectScope = user.role === "ADMIN" ? "" : " AND p.id=$2";
    const attendanceScope = user.role === "ADMIN" ? "" : " AND w.project_id=$3";
    const countValues: unknown[] = user.role === "ADMIN" ? [] : [user.projectId];
    const projectCountScope = user.role === "ADMIN" ? "" : " AND p.id=$1";
    const workerCountScope = user.role === "ADMIN" ? "" : " AND w.project_id=$1";
    if (user.role === "PROJECT_USER") values.push(user.projectId);
    const attendanceValues: unknown[] = [weekStart, weekStart];
    if (user.role === "PROJECT_USER") attendanceValues.push(user.projectId);

    const [report, projectCount, workerCount, projectSummary, recent, attendanceStats] = await Promise.all([
      weeklyReport(user, weekStart),
      pool.query(`SELECT COUNT(*)::int AS count FROM projects p WHERE p.deleted_at IS NULL AND p.status='ACTIVE' ${projectCountScope}`, countValues),
      pool.query(`SELECT COUNT(*)::int AS count FROM workers w WHERE w.deleted_at IS NULL AND w.status='ACTIVE' ${workerCountScope}`, countValues),
      pool.query(
        `SELECT p.id,p.code,p.name,p.responsible,p.location,p.status,p.daily_rate_cents,
                COALESCE(e.total,0)::int AS expense_cents,COALESCE(d.total,0)::int AS per_diem_cents,
                COALESCE(w.count,0)::int AS workers
         FROM projects p
         LEFT JOIN LATERAL (SELECT SUM(amount_cents) AS total FROM expenses WHERE project_id=p.id AND deleted_at IS NULL AND week_start=$1::date) e ON TRUE
         LEFT JOIN LATERAL (SELECT SUM(total_cents) AS total FROM per_diems WHERE project_id=p.id AND week_start=$1::date) d ON TRUE
         LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM workers WHERE project_id=p.id AND deleted_at IS NULL AND status='ACTIVE') w ON TRUE
         WHERE p.deleted_at IS NULL ${projectScope} ORDER BY p.code LIMIT 20`, values,
      ),
      pool.query(
        `SELECT e.id,e.expense_date::text AS expense_date,e.description,e.category,e.amount_cents,e.stage,e.invoice_status,e.payment_source,p.code AS project_code
         FROM expenses e JOIN projects p ON p.id=e.project_id
         WHERE e.deleted_at IS NULL AND e.week_start=$1::date ${user.role === "ADMIN" ? "" : "AND e.project_id=$2"}
         ORDER BY e.created_at DESC LIMIT 8`, values,
      ),
      pool.query(
        `SELECT a.status,COUNT(*)::int AS count FROM attendances a JOIN workers w ON w.id=a.worker_id
         WHERE a.work_date BETWEEN $1::date AND ($2::date + INTERVAL '6 days') AND a.deleted_at IS NULL ${attendanceScope}
         GROUP BY a.status`, attendanceValues,
      ),
    ]);
    const attendanceByStatus = Object.fromEntries(attendanceStats.rows.map((row) => [row.status, Number(row.count)]));
    return Response.json({
      weekStart: report.weekStart,
      weekEnd: report.weekEnd,
      summary: {
        projectCount: Number(projectCount.rows[0]?.count ?? 0), workerCount: Number(workerCount.rows[0]?.count ?? 0),
        expenseTotalCents: report.totals.expenseCents, perDiemTotalCents: report.totals.perDiemCents,
        pendingCents: report.totals.pendingCents, paidCents: report.totals.paidCents,
        pendingCount: report.movements.filter((movement) => movement.stage === "PENDING").length,
        invoiceDoneCents: report.totals.invoiceDoneCents, pettyCashBalanceCents: report.totals.pettyCashBalanceCents,
        attendanceThisWeek: { present: attendanceByStatus.PRESENT ?? 0, absent: attendanceByStatus.ABSENT ?? 0, excused: attendanceByStatus.EXCUSED ?? 0 },
      },
      projects: projectSummary.rows.map((row) => ({ ...row, projectTotalCents: Number(row.expense_cents) + Number(row.per_diem_cents) })),
      recent: recent.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
