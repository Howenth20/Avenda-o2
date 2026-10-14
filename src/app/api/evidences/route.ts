import type { PoolClient } from "pg";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { ensureProjectAccess, requireUser } from "@/lib/auth";
import { inTransaction, pool } from "@/lib/db";
import { evidenceEntityTypes, maxEvidenceBytes, newEvidenceStorageKey, removeEvidencePdf, validatePdfFile, writeEvidencePdf } from "@/lib/evidence";
import { assertSameOrigin, errorResponse, isUniqueViolation, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { businessToday, isoDateSchema, moneySchema, toCents, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

const inputSchema = z.object({
  entityType: z.enum(evidenceEntityTypes),
  entityId: uuidSchema,
  documentNumber: z.string().trim().min(2, "Indica el número del comprobante.").max(100),
  documentAmount: moneySchema.refine((value) => value > 0, "El importe debe ser mayor a cero."),
  documentDate: isoDateSchema.optional(),
  supplier: z.string().trim().max(160).optional().default(""),
});

function textValue(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function lockedTarget(client: PoolClient, input: z.infer<typeof inputSchema>, user: Awaited<ReturnType<typeof requireUser>>) {
  const amountCents = toCents(input.documentAmount);
  if (input.entityType === "EXPENSE") {
    const result = await client.query("SELECT * FROM expenses WHERE id=$1 FOR UPDATE", [input.entityId]);
    const before = result.rows[0];
    if (!before) throw new ApiError(404, "Gasto no encontrado.");
    ensureProjectAccess(user, before.project_id);
    if (Number(before.amount_cents) !== amountCents) throw new ApiError(422, "El importe del PDF debe coincidir exactamente con el importe del gasto.");
    if (!input.supplier) throw new ApiError(422, "Indica el proveedor que figura en la factura.");
    if (before.receipt_number && before.receipt_number !== input.documentNumber) throw new ApiError(422, "El número del PDF no coincide con el comprobante ya registrado en el gasto.");
    if (before.supplier && before.supplier !== input.supplier) throw new ApiError(422, "El proveedor del PDF no coincide con el proveedor ya registrado en el gasto.");
    const updated = await client.query(
      `UPDATE expenses SET supplier=COALESCE(supplier,$2),receipt_number=COALESCE(receipt_number,$3),invoice_status='HECHO',updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [input.entityId, input.supplier, input.documentNumber],
    );
    return { before, after: updated.rows[0], projectId: before.project_id };
  }
  if (input.entityType === "PETTY_CASH") {
    const result = await client.query("SELECT * FROM petty_cash_movements WHERE id=$1 FOR UPDATE", [input.entityId]);
    const before = result.rows[0];
    if (!before) throw new ApiError(404, "Movimiento de caja chica no encontrado.");
    ensureProjectAccess(user, before.project_id);
    if (Number(before.amount_cents) !== amountCents) throw new ApiError(422, "El importe del PDF debe coincidir exactamente con el importe de caja chica.");
    if (before.receipt_number && before.receipt_number !== input.documentNumber) throw new ApiError(422, "El número del PDF no coincide con el comprobante ya registrado en caja chica.");
    const updated = await client.query(
      "UPDATE petty_cash_movements SET receipt_number=COALESCE(receipt_number,$2),updated_at=NOW() WHERE id=$1 RETURNING *",
      [input.entityId, input.documentNumber],
    );
    return { before, after: updated.rows[0], projectId: before.project_id };
  }
  if (user.role !== "ADMIN") throw new ApiError(403, "Solo administración puede adjuntar constancias de pago de viáticos.");
  const result = await client.query("SELECT * FROM per_diems WHERE id=$1 FOR UPDATE", [input.entityId]);
  const before = result.rows[0];
  if (!before) throw new ApiError(404, "Viático no encontrado.");
  if (before.stage !== "PAID") throw new ApiError(409, "Marca el viático como pagado antes de adjuntar la constancia.");
  if (Number(before.total_cents) !== amountCents) throw new ApiError(422, "El importe del PDF debe coincidir exactamente con el viático pagado.");
  return { before, after: before, projectId: before.project_id };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const entityType = z.enum(evidenceEntityTypes).parse(params.get("entityType"));
    const entityId = uuidSchema.parse(params.get("entityId"));
    const result = await pool.query(
      `SELECT id,entity_type,entity_id,project_id,original_name,document_number,document_amount_cents,document_date,byte_size,sha256,created_at
       FROM document_evidences WHERE entity_type=$1 AND entity_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [entityType, entityId],
    );
    for (const evidence of result.rows) ensureProjectAccess(user, evidence.project_id);
    return Response.json({ evidences: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let storageKey: string | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maxEvidenceBytes + 128 * 1024) throw new ApiError(413, "El archivo supera el límite permitido.");
    const form = await request.formData().catch(() => { throw new ApiError(400, "No se pudo leer el formulario de adjunto."); });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "Selecciona un archivo PDF.");
    const input = inputSchema.parse({
      entityType: textValue(form, "entityType"),
      entityId: textValue(form, "entityId"),
      documentNumber: textValue(form, "documentNumber"),
      documentAmount: textValue(form, "documentAmount"),
      documentDate: textValue(form, "documentDate"),
      supplier: textValue(form, "supplier"),
    });
    if (input.documentDate && input.documentDate > businessToday()) throw new ApiError(422, "La fecha del comprobante no puede ser futura.");
    const pdf = await validatePdfFile(file);
    storageKey = newEvidenceStorageKey();
    const evidence = await inTransaction(async (client) => {
      const target = await lockedTarget(client, input, user);
      const existing = await client.query(
        "SELECT id FROM document_evidences WHERE entity_type=$1 AND entity_id=$2 AND deleted_at IS NULL FOR UPDATE",
        [input.entityType, input.entityId],
      );
      if (existing.rowCount) throw new ApiError(409, "Este registro ya tiene un PDF activo. Retíralo con un motivo antes de reemplazarlo.");
      await writeEvidencePdf(storageKey!, pdf.buffer);
      const created = await client.query(
        `INSERT INTO document_evidences (entity_type,entity_id,project_id,original_name,storage_key,sha256,byte_size,mime_type,document_number,document_amount_cents,document_date,uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'application/pdf',$8,$9,$10,$11)
         RETURNING id,entity_type,entity_id,project_id,original_name,document_number,document_amount_cents,document_date,byte_size,sha256,created_at`,
        [input.entityType, input.entityId, target.projectId, pdf.originalName, storageKey, pdf.sha256, pdf.buffer.length, input.documentNumber, toCents(input.documentAmount), input.documentDate ?? null, user.id],
      );
      await recordAudit(client, { actorId: user.id, projectId: target.projectId, action: "UPLOAD_EVIDENCE", entityType: "evidence", entityId: created.rows[0].id, before: target.before, after: { evidence: created.rows[0], financialRecord: target.after }, ip: requestIp(request) });
      return created.rows[0];
    });
    return Response.json({ evidence }, { status: 201 });
  } catch (error) {
    if (storageKey) await removeEvidencePdf(storageKey).catch(() => undefined);
    if (isUniqueViolation(error)) return Response.json({ error: "Este registro ya tiene un comprobante PDF activo." }, { status: 409 });
    return errorResponse(error);
  }
}