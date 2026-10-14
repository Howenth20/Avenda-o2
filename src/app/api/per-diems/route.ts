import { z } from "zod";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { recalculatePerDiem } from "@/lib/finance";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { businessToday, isoDateSchema } from "@/lib/validation";

const runSchema = z.object({ projectId: z.string().uuid(), weekStart: isoDateSchema });

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? businessToday().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(422, "El mes debe tener el formato AAAA-MM.");
    const values: unknown[] = [`${month}-01`];
    let scope = "";
    if (user.role === "PROJECT_USER") {
      values.push(user.projectId);
      scope = ` AND d.project_id = $${values.length}`;
    }
    const result = await pool.query(
      `SELECT d.id, d.worker_id, d.project_id, d.week_start, d.days_attended, d.daily_rate_cents,
              d.total_cents, d.stage, d.calculated_at, d.approved_at, d.paid_at,
              w.first_name, w.last_name, w.dni, p.code AS project_code, p.name AS project_name
       FROM per_diems d JOIN workers w ON w.id=d.worker_id JOIN projects p ON p.id=d.project_id
       WHERE d.week_start >= date_trunc('month', $1::date)::date
         AND d.week_start < (date_trunc('month', $1::date) + INTERVAL '1 month')::date ${scope}
       ORDER BY d.week_start DESC, w.last_name`, values,
    );
    return Response.json({ perDiems: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = runSchema.parse(await parseJson(request));
    ensureProjectAccess(user, input.projectId);
    if (input.weekStart > businessToday()) throw new ApiError(422, "No puedes calcular viáticos para una semana futura.");
    const monday = new Date(`${input.weekStart}T00:00:00Z`);
    if ((monday.getUTCDay() || 7) !== 1) throw new ApiError(422, "Selecciona el lunes de la semana que deseas calcular.");
    const rows = await inTransaction(async (client) => {
      const workers = await client.query(
        `SELECT id FROM workers WHERE project_id=$1 AND status='ACTIVE' AND deleted_at IS NULL ORDER BY last_name, first_name`,
        [input.projectId],
      );
      for (const worker of workers.rows) await recalculatePerDiem(client, worker.id, input.weekStart, user, requestIp(request));
      const result = await client.query(
        `SELECT d.id, d.worker_id, d.project_id, d.week_start, d.days_attended, d.daily_rate_cents,
                d.total_cents, d.stage, w.first_name, w.last_name, w.dni
         FROM per_diems d JOIN workers w ON w.id=d.worker_id
         WHERE d.project_id=$1 AND d.week_start=$2 ORDER BY w.last_name`, [input.projectId, input.weekStart],
      );
      return result.rows;
    });
    return Response.json({ perDiems: rows });
  } catch (error) {
    return errorResponse(error);
  }
}
