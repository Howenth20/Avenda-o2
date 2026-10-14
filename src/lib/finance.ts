import "server-only";
import type { PoolClient } from "pg";
import { recordAudit } from "@/lib/audit";
import { ApiError, type SessionUser } from "@/lib/types";
import { mondayOfWeek } from "@/lib/validation";

export async function recalculatePerDiem(
  client: PoolClient,
  workerId: string,
  workDate: string | Date,
  actor: SessionUser,
  ip: string,
): Promise<void> {
  const weekStart = mondayOfWeek(workDate);
  const workerResult = await client.query(
    `SELECT w.id, w.project_id, w.deleted_at, p.daily_rate_cents, p.deleted_at AS project_deleted_at, p.status AS project_status
     FROM workers w JOIN projects p ON p.id = w.project_id WHERE w.id = $1 FOR UPDATE OF w, p`,
    [workerId],
  );
  const worker = workerResult.rows[0];
  if (!worker || worker.deleted_at || worker.project_deleted_at || worker.project_status !== "ACTIVE") throw new ApiError(422, "El trabajador u obra ya no están activos.");
  if (actor.role === "PROJECT_USER" && actor.projectId !== worker.project_id) throw new ApiError(403, "No tienes acceso a esa obra.");

  const current = await client.query(
    "SELECT id, stage, days_attended, daily_rate_cents, total_cents FROM per_diems WHERE worker_id=$1 AND week_start=$2 FOR UPDATE",
    [workerId, weekStart],
  );
  if (current.rows[0] && current.rows[0].stage !== "PENDING") {
    throw new ApiError(409, "El viático ya fue aprobado. Reábrelo con una cuenta administradora antes de modificar la asistencia.");
  }

  const count = await client.query<{ days: number }>(
    `SELECT COUNT(*)::int AS days FROM attendances
     WHERE worker_id=$1 AND work_date BETWEEN $2::date AND ($2::date + INTERVAL '6 days')
       AND status='PRESENT' AND deleted_at IS NULL`,
    [workerId, weekStart],
  );
  const days = Number(count.rows[0]?.days ?? 0);
  if (days === 0 && !current.rows[0]) return;
  const rate = Number(worker.daily_rate_cents);
  const total = days * rate;
  const previous = current.rows[0] ?? null;
  let result;
  if (previous) {
    result = await client.query(
      `UPDATE per_diems SET days_attended=$2, daily_rate_cents=$3, total_cents=$4,
       calculated_at=NOW(), updated_at=NOW() WHERE id=$1
       RETURNING id, worker_id, project_id, week_start, days_attended, daily_rate_cents, total_cents, stage`,
      [previous.id, days, rate, total],
    );
  } else {
    result = await client.query(
      `INSERT INTO per_diems (worker_id, project_id, week_start, days_attended, daily_rate_cents, total_cents, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, worker_id, project_id, week_start, days_attended, daily_rate_cents, total_cents, stage`,
      [workerId, worker.project_id, weekStart, days, rate, total, actor.id],
    );
  }
  await recordAudit(client, {
    actorId: actor.id,
    projectId: worker.project_id,
    action: previous ? "RECALCULATE" : "CREATE_FROM_ATTENDANCE",
    entityType: "per_diem",
    entityId: result.rows[0].id,
    before: previous,
    after: result.rows[0],
    reason: "Cálculo automático por asistencia semanal",
    ip,
  });
}
