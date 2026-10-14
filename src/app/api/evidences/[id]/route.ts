import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { readEvidencePdf } from "@/lib/evidence";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { uuidSchema } from "@/lib/validation";
import { z } from "zod";

const deleteSchema = z.object({ reason: z.string().trim().min(6).max(300) });

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const result = await pool.query(
      `SELECT id,project_id,original_name,storage_key,mime_type,byte_size
       FROM document_evidences WHERE id=$1 AND deleted_at IS NULL`,
      [id],
    );
    const evidence = result.rows[0];
    if (!evidence) throw new ApiError(404, "Comprobante no encontrado.");
    ensureProjectAccess(user, evidence.project_id);
    const pdf = await readEvidencePdf(evidence.storage_key);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `inline; filename="${encodeURIComponent(evidence.original_name)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    uuidSchema.parse(id);
    const { reason } = deleteSchema.parse(await parseJson(request));
    const evidence = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM document_evidences WHERE id=$1 FOR UPDATE", [id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Comprobante no encontrado.");
      ensureProjectAccess(user, before.project_id);
      if (before.deleted_at) throw new ApiError(409, "El comprobante ya fue retirado.");
      const updated = await client.query(
        "UPDATE document_evidences SET deleted_at=NOW(),deleted_by=$2,delete_reason=$3 WHERE id=$1 RETURNING *",
        [id, user.id, reason],
      );
      await recordAudit(client, { actorId: user.id, projectId: before.project_id, action: "DELETE_EVIDENCE", entityType: "evidence", entityId: id, before, after: updated.rows[0], reason, ip: requestIp(request) });
      return updated.rows[0];
    });
    return Response.json({ evidence });
  } catch (error) {
    return errorResponse(error);
  }
}