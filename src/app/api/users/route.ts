import { hash } from "bcryptjs";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { assertSameOrigin, errorResponse, isUniqueViolation, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { emailSchema, uuidSchema } from "@/lib/validation";

const userSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: emailSchema,
  password: z.string().min(14, "La contraseña debe tener al menos 14 caracteres.").max(128),
  projectId: uuidSchema,
});

export async function GET() {
  try {
    await requireAdmin();
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.project_id, u.active, u.created_at,
              p.code AS project_code, p.name AS project_name
       FROM users u LEFT JOIN projects p ON p.id=u.project_id
       ORDER BY u.role, u.name LIMIT 500`,
    );
    return Response.json({ users: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = userSchema.parse(await parseJson(request));
    const passwordHash = await hash(input.password, 12);
    const created = await inTransaction(async (client) => {
      const project = await client.query("SELECT id FROM projects WHERE id=$1 AND status='ACTIVE' AND deleted_at IS NULL", [input.projectId]);
      if (!project.rowCount) throw new ApiError(422, "Selecciona una obra activa.");
      const result = await client.query(
        `INSERT INTO users (name,email,password_hash,role,project_id)
         VALUES ($1,$2,$3,'PROJECT_USER',$4)
         RETURNING id,name,email,role,project_id,active,created_at`,
        [input.name, input.email, passwordHash, input.projectId],
      );
      await recordAudit(client, { actorId: actor.id, projectId: input.projectId, action: "CREATE", entityType: "user", entityId: result.rows[0].id, before: null, after: result.rows[0], ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ user: created }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) return Response.json({ error: "Ese correo ya tiene una cuenta." }, { status: 409 });
    return errorResponse(error);
  }
}
