import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { ApiError } from "@/lib/types";

export const evidenceEntityTypes = ["EXPENSE", "PETTY_CASH", "PER_DIEM"] as const;
export type EvidenceEntityType = typeof evidenceEntityTypes[number];
// Vercel Functions accept request bodies up to 4.5 MB. Keep the file itself at 4 MB
// so multipart headers still fit, even if an environment variable is set higher.
export const maxEvidenceBytes = Math.min(Number(process.env.UPLOAD_MAX_BYTES ?? 4 * 1024 * 1024), 4 * 1024 * 1024);

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
  return (safe || "adjunto").slice(0, 160);
}

export type EvidenceMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/bmp";

export async function validateEvidenceFile(file: File): Promise<{ buffer: Buffer; sha256: string; originalName: string; mimeType: EvidenceMimeType }> {
  if (!Number.isFinite(maxEvidenceBytes) || maxEvidenceBytes < 1024) throw new ApiError(500, "UPLOAD_MAX_BYTES no tiene una configuración válida.");
  if (file.size < 1) throw new ApiError(422, "El archivo está vacío.");
  if (file.size > maxEvidenceBytes) throw new ApiError(413, `El archivo supera el límite de ${Math.floor(maxEvidenceBytes / 1024 / 1024)} MB.`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectEvidenceMimeType(buffer);
  if (!detected) throw new ApiError(422, "Formato no admitido o archivo dañado. Sube un PDF, JPG, PNG, WEBP, GIF o BMP válido.");
  return {
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    originalName: safeEvidenceName(file.name),
    mimeType: detected,
  };
}

function detectEvidenceMimeType(buffer: Buffer): EvidenceMimeType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) return "image/gif";
  if (buffer.length >= 2 && buffer.toString("ascii", 0, 2) === "BM") return "image/bmp";
  const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
  const tail = buffer.subarray(Math.max(0, buffer.length - 4096)).toString("latin1");
  if (head.includes("%PDF-") && tail.includes("%%EOF") && buffer.includes(Buffer.from("obj"))) return "application/pdf";
  return null;
}

export function newEvidenceStorageKey(): string {
  return randomUUID();
}

export async function readLegacyEvidencePdf(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(/* turbopackIgnore: true */ evidencePath(storageKey));
  } catch {
    throw new ApiError(410, "El archivo antiguo no está disponible en este servidor.");
  }
}
