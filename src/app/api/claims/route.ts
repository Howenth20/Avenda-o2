import { randomBytes } from "node:crypto";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { inTransaction, pool, requireDatabaseConfig } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { emailSchema, uuidSchema } from "@/lib/validation";

export const CLAIM_POLICY_VERSION = "2026-10-14";

const phoneSchema = z.string().trim().regex(/^\+?[0-9()\s.-]{7,24}$/, "Escribe un teléfono válido.");
const claimSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  documentType: z.enum(["DNI", "CE", "PASSPORT", "RUC", "OTHER"]),
  documentNumber: z.string().trim().min(4).max(32),
  email: emailSchema,
  phone: phoneSchema,
  address: z.string().trim().min(4).max(240),
  projectId: uuidSchema.nullable().optional().default(null),
  claimType: z.enum(["COMPLAINT", "CLAIM"]),
  detail: z.string().trim().min(10).max(4000),
  requestText: z.string().trim().min(4).max(2000),
  policyVersion: z.literal(CLAIM_POLICY_VERSION),
  accepted: z.literal(true),
  _company: z.string().max(0).optional().default(""),
});

function claimCode(): string {
  return `REC-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Inicia sesión para consultar el libro de reclamaciones.");
    const result = user.role === "ADMIN"
      ? await pool.query(`SELECT c.id,c.claim_code,c.full_name,c.document_type,c.document_number,c.email,c.phone,c.address,c.project_id,
                                 p.code AS project_code,c.claim_type,c.detail,c.request_text,c.policy_version,c.accepted_at,c.status,c.response,c.responded_at,c.created_at
                          FROM claims c LEFT JOIN projects p ON p.id=c.project_id ORDER BY c.created_at DESC LIMIT 300`)
      : await pool.query(`SELECT c.id,c.claim_code,c.full_name,c.document_type,c.document_number,c.email,c.phone,c.address,c.project_id,
                                 p.code AS project_code,c.claim_type,c.detail,c.request_text,c.policy_version,c.accepted_at,c.status,c.response,c.responded_at,c.created_at
                          FROM claims c LEFT JOIN projects p ON p.id=c.project_id WHERE c.project_id=$1 ORDER BY c.created_at DESC LIMIT 150`, [user.projectId]);
    return Response.json({ claims: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireDatabaseConfig();
    const input = claimSchema.parse(await parseJson(request));
    const ip = requestIp(request);
    if (input._company) return Response.json({ claim: { claim_code: "" } }, { status: 201 });
    const rate = await pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM claims WHERE requester_ip=$1 AND created_at > NOW() - INTERVAL '1 hour'", [ip]);
    if (Number(rate.rows[0]?.count ?? 0) >= 3) throw new ApiError(429, "Se alcanzó el límite de envíos. Vuelve a intentarlo más tarde.");
    const user = await getSessionUser();
    if (user?.role === "PROJECT_USER" && input.projectId && input.projectId !== user.projectId) throw new ApiError(403, "No tienes acceso a esa obra.");
    const claim = await inTransaction(async (client) => {
      if (input.projectId) {
        const project = await client.query("SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL", [input.projectId]);
        if (!project.rowCount) throw new ApiError(422, "La obra seleccionada no está disponible.");
      }
      const result = await client.query(
        `INSERT INTO claims (claim_code,full_name,document_type,document_number,email,phone,address,project_id,claim_type,detail,request_text,policy_version,requester_ip,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id,claim_code,claim_type,status,created_at,policy_version`,
        [claimCode(), input.fullName, input.documentType, input.documentNumber, input.email, input.phone, input.address, input.projectId,
          input.claimType, input.detail, input.requestText, input.policyVersion, ip, user?.id ?? null],
      );
      await recordAudit(client, { actorId: user?.id ?? null, projectId: input.projectId, action: "CREATE", entityType: "claim", entityId: result.rows[0].id, before: null, after: result.rows[0], reason: "Aceptó la política del libro de reclamaciones", ip });
      return result.rows[0];
    });
    return Response.json({ claim }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

const responseSchema = z.object({
  id: uuidSchema,
  status: z.enum(["RECEIVED", "REVIEW", "RESPONDED", "CLOSED"]),
  response: z.string().trim().max(4000).optional().default(""),
});

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = responseSchema.parse(await parseJson(request));
    if (input.status === "RESPONDED" && input.response.length < 4) throw new ApiError(422, "Escribe la respuesta antes de marcar la reclamación como atendida.");
    const claim = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM claims WHERE id=$1 FOR UPDATE", [input.id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Reclamación no encontrada.");
      const updated = await client.query(
        `UPDATE claims SET status=$2,response=$3,responded_by=CASE WHEN $2='RESPONDED' THEN $4 ELSE responded_by END,
         responded_at=CASE WHEN $2='RESPONDED' THEN NOW() ELSE responded_at END,updated_at=NOW()
         WHERE id=$1 RETURNING id,claim_code,status,response,responded_at,updated_at`,
        [input.id, input.status, input.response || null, actor.id],
      );
      await recordAudit(client, { actorId: actor.id, projectId: before.project_id, action: "CHANGE_STATUS", entityType: "claim", entityId: input.id, before, after: updated.rows[0], ip: requestIp(request) });
      return updated.rows[0];
    });
    return Response.json({ claim });
  } catch (error) {
    return errorResponse(error);
  }
}
