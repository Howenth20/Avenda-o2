import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";

const schema = z.object({ active: z.boolean() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const { id } = await context.params;
    uuidSchema.parse(id);
    if (id === actor.id) throw new ApiError(422, "No puedes desactivar tu propia cuenta.");
    const input = schema.parse(await parseJson(request));
    const user = await inTransaction(async (client) => {
      const found = await client.query("SELECT id, name, email, role, project_id, active FROM users WHERE id=$1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Cuenta no encontrada.");
      const result = await client.query("UPDATE users SET active=$2, updated_at=NOW() WHERE id=$1 RETURNING id,name,email,role,project_id,active", [id, input.active]);
      if (!input.active) await client.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      await recordAudit(client, { actorId: actor.id, projectId: before.project_id, action: input.active ? "ACTIVATE" : "DEACTIVATE", entityType: "user", entityId: id, before, after: result.rows[0], ip: requestIp(request) });
      return result.rows[0];
    });
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
