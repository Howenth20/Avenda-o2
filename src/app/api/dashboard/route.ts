import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { businessToday, mondayOfWeek } from "@/lib/validation";

export async function GET() {
  try {
    const user = await requireUser();
    const params: unknown[] = [];
    const projectWhere = user.role === "ADMIN" ? "" : " AND project_id=$1";
    const expenseProjectWhere = user.role === "ADMIN" ? "" : " AND project_id=$1";
    const workerProjectWhere = user.role === "ADMIN" ? "" : " AND project_id=$1";
    if (user.role !== "ADMIN") params.push(user.projectId);
    const weekStart = mondayOfWeek(businessToday());
    const weekEnd = new Date(`${weekStart}T00:00:00Z`);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const attendanceParams: unknown[] = [weekStart, weekEnd.toISOString().slice(0, 10)];
    const attendanceScope = user.role === "ADMIN" ? "" : " AND w.project_id=$3";
    if (user.role !== "ADMIN") attendanceParams.push(user.projectId);

    const [projectCount, workerCount, expenseStats, perDiemStats, projectSummary, recent, attendanceStats] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM projects WHERE deleted_at IS NULL AND status='ACTIVE' ${projectWhere}`, params),
      pool.query(`SELECT COUNT(*)::int AS count FROM workers WHERE deleted_at IS NULL AND status='ACTIVE' ${workerProjectWhere}`, params),
      pool.query(
        `SELECT COALESCE(SUM(amount_cents),0)::int AS total,
                COALESCE(SUM(amount_cents) FILTER (WHERE stage='PENDING'),0)::int AS pending,
                COALESCE(SUM(amount_cents) FILTER (WHERE stage='PAID'),0)::int AS paid,
                COUNT(*) FILTER (WHERE stage='PENDING')::int AS pending_count
         FROM expenses WHERE deleted_at IS NULL ${expenseProjectWhere}`, params,
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_cents),0)::int AS total,
                COALESCE(SUM(total_cents) FILTER (WHERE stage='PENDING'),0)::int AS pending,
                COALESCE(SUM(total_cents) FILTER (WHERE stage='PAID'),0)::int AS paid,
                COUNT(*) FILTER (WHERE stage='PENDING')::int AS pending_count
         FROM per_diems WHERE TRUE ${projectWhere}`, params,
      ),
      pool.query(
        `SELECT p.id,p.code,p.name,p.responsible,p.location,p.status,p.daily_rate_cents,
                COALESCE(e.total,0)::int AS expense_cents,
                COALESCE(d.total,0)::int AS per_diem_cents,
                COALESCE(w.count,0)::int AS workers
         FROM projects p
         LEFT JOIN LATERAL (SELECT SUM(amount_cents) AS total FROM expenses WHERE project_id=p.id AND deleted_at IS NULL) e ON TRUE
         LEFT JOIN LATERAL (SELECT SUM(total_cents) AS total FROM per_diems WHERE project_id=p.id) d ON TRUE
         LEFT JOIN LATERAL (SELECT COUNT(*) AS count FROM workers WHERE project_id=p.id AND deleted_at IS NULL) w ON TRUE
         WHERE p.deleted_at IS NULL ${user.role === "ADMIN" ? "" : "AND p.id=$1"}
         ORDER BY p.code LIMIT 8`, params,
      ),
      pool.query(
        `SELECT e.id,e.expense_date,e.description,e.amount_cents,e.stage,p.code AS project_code
         FROM expenses e JOIN projects p ON p.id=e.project_id
         WHERE e.deleted_at IS NULL ${expenseProjectWhere}
         ORDER BY e.created_at DESC LIMIT 6`, params,
      ),
      pool.query(
        `SELECT a.status,COUNT(*)::int AS count FROM attendances a
         JOIN workers w ON w.id=a.worker_id
         WHERE a.work_date BETWEEN $1::date AND $2::date AND a.deleted_at IS NULL ${attendanceScope}
         GROUP BY a.status`, attendanceParams,
      ),
    ]);
    const expenses = expenseStats.rows[0];
    const perDiems = perDiemStats.rows[0];
    const attendanceByStatus = Object.fromEntries(attendanceStats.rows.map((row) => [row.status, Number(row.count)]));
    return Response.json({
      summary: {
        projectCount: projectCount.rows[0]?.count ?? 0,
        workerCount: workerCount.rows[0]?.count ?? 0,
        expenseTotalCents: Number(expenses.total),
        perDiemTotalCents: Number(perDiems.total),
        pendingCents: Number(expenses.pending) + Number(perDiems.pending),
        paidCents: Number(expenses.paid) + Number(perDiems.paid),
        pendingCount: Number(expenses.pending_count) + Number(perDiems.pending_count),
        attendanceThisWeek: {
          present: attendanceByStatus.PRESENT ?? 0,
          absent: attendanceByStatus.ABSENT ?? 0,
          excused: attendanceByStatus.EXCUSED ?? 0,
        },
      },
      projects: projectSummary.rows.map((row) => ({ ...row, projectTotalCents: Number(row.expense_cents) + Number(row.per_diem_cents) })),
      recent: recent.rows,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
