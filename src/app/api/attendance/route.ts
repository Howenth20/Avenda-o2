import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { recalculatePerDiem } from "@/lib/finance";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { businessToday, isoDateSchema, mondayOfWeek, uuidSchema } from "@/lib/validation";

const attendanceSchema = z.object({
  workerId: uuidSchema,
  workDate: isoDateSchema,
  status: z.enum(["PRESENT", "ABSENT", "EXCUSED"]),
  note: z.string().trim().max(300).optional().default(""),
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
      scope = ` AND w.project_id = $${values.length}`;
    }
    const result = await pool.query(
      `SELECT a.id, a.worker_id, a.work_date, a.status, a.note, a.recorded_at, a.updated_at,a.deleted_at,a.delete_reason,
              w.first_name, w.last_name, w.dni, w.project_id, p.code AS project_code, u.name AS recorded_by
       FROM attendances a JOIN workers w ON w.id=a.worker_id JOIN projects p ON p.id=w.project_id
       JOIN users u ON u.id=a.recorded_by
       WHERE ${includeDeleted ? "TRUE" : "a.deleted_at IS NULL"}
         AND ${weekStart ? "a.work_date BETWEEN $1::date AND ($1::date + INTERVAL '6 days')" : "a.work_date >= $1::date AND a.work_date < ($1::date + INTERVAL '1 month')"}
         ${scope}
       ORDER BY a.work_date DESC, w.last_name, w.first_name LIMIT 1000`, values,
    );
    return Response.json({ attendance: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const input = attendanceSchema.parse(await parseJson(request));
    if (input.workDate > businessToday()) throw new ApiError(422, "No se puede registrar asistencia en una fecha futura.");
    const row = await inTransaction(async (client) => {
      const workerResult = await client.query("SELECT w.id,w.project_id FROM workers w JOIN projects p ON p.id=w.project_id WHERE w.id=$1 AND w.deleted_at IS NULL AND w.status='ACTIVE' AND p.deleted_at IS NULL AND p.status='ACTIVE'", [input.workerId]);
      const worker = workerResult.rows[0];
      if (!worker) throw new ApiError(404, "No se encontró un trabajador activo.");
      ensureProjectAccess(user, worker.project_id);
      const result = await client.query(
        `INSERT INTO attendances (worker_id, work_date, status, note, recorded_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, worker_id, work_date, status, note, recorded_at, updated_at`,
        [input.workerId, input.workDate, input.status, input.note || null, user.id],
      );
      await recordAudit(client, { actorId: user.id, projectId: worker.project_id, action: "CREATE", entityType: "attendance", entityId: result.rows[0].id, before: null, after: result.rows[0], ip: requestIp(request) });
      await recalculatePerDiem(client, input.workerId, input.workDate, user, requestIp(request));
      return result.rows[0];
    });
    return Response.json({ attendance: row }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "Ya existe una asistencia para ese trabajador y esa fecha." }, { status: 409 });
    return errorResponse(error);
  }
}
