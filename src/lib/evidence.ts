import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ApiError } from "@/lib/types";

export const evidenceEntityTypes = ["EXPENSE", "PETTY_CASH", "PER_DIEM"] as const;
export type EvidenceEntityType = typeof evidenceEntityTypes[number];
export const maxEvidenceBytes = Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);

function evidenceRoot(): string {
  return resolve(/* turbopackIgnore: true */ process.env.UPLOADS_DIR || join(process.cwd(), "private-uploads"));
}

function evidencePath(storageKey: string): string {
  const root = evidenceRoot();
  const target = resolve(root, storageKey);
  if (!target.startsWith(`${root}${sep}`)) throw new ApiError(400, "La ruta del comprobante no es válida.");
  return target;
}

export function safeEvidenceName(fileName: string): string {
  const safe = basename(fileName).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return (safe || "comprobante.pdf").slice(0, 160);
}

export async function validatePdfFile(file: File): Promise<{ buffer: Buffer; sha256: string; originalName: string }> {
  if (!Number.isFinite(maxEvidenceBytes) || maxEvidenceBytes < 1024) throw new ApiError(500, "UPLOAD_MAX_BYTES no tiene una configuración válida.");
  if (file.size < 1) throw new ApiError(422, "El PDF está vacío.");
  if (file.size > maxEvidenceBytes) throw new ApiError(422, `El PDF supera el límite de ${Math.floor(maxEvidenceBytes / 1024 / 1024)} MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const header = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
  const tail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString("latin1");
  if (!header.includes("%PDF-") || !tail.includes("%%EOF") || !buffer.includes(Buffer.from("obj"))) {
    throw new ApiError(422, "El archivo no es un PDF estructuralmente válido. Selecciona el comprobante original en PDF.");
  }
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    originalName: safeEvidenceName(file.name),
  };
}

export function newEvidenceStorageKey(): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${day}/${randomUUID()}.pdf`;
}

export async function writeEvidencePdf(storageKey: string, buffer: Buffer): Promise<void> {
  const target = evidencePath(storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer, { flag: "wx" });
}

export async function readEvidencePdf(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(/* turbopackIgnore: true */ evidencePath(storageKey));
  } catch {
    throw new ApiError(410, "El archivo físico del comprobante no está disponible.");
  }
}

export async function removeEvidencePdf(storageKey: string): Promise<void> {
  try {
    await unlink(evidencePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}