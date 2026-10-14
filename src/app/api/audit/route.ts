import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const result = user.role === "ADMIN"
      ? await pool.query(
        `SELECT a.id,a.project_id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.reason,a.ip_address,a.created_at,
                u.name AS actor_name,p.code AS project_code
         FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN projects p ON p.id=a.project_id
         ORDER BY a.created_at DESC LIMIT 300`,
      )
      : await pool.query(
        `SELECT a.id,a.project_id,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.reason,a.created_at,
                u.name AS actor_name,p.code AS project_code
         FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN projects p ON p.id=a.project_id
         WHERE a.project_id=$1 ORDER BY a.created_at DESC LIMIT 200`, [user.projectId],
      );
    return Response.json({ audit: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}
