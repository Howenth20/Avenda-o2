import { z } from "zod";

export const uuidSchema = z.string().uuid("Identificador inválido.");
export const emailSchema = z.string().trim().email("Escribe un correo válido.").max(254).transform((value) => value.toLowerCase());
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha válida.").refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "La fecha no es válida.");
export const moneySchema = z.coerce.number().finite().min(0, "El importe no puede ser negativo.").max(1_000_000, "El importe excede el límite permitido.");

export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function toSoles(cents: number): number {
  return cents / 100;
}

export function businessToday(): string {
  const zone = process.env.BUSINESS_TIME_ZONE || "America/Lima";
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
}

export function mondayOfWeek(value: string | Date): string {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() - weekday + 1);
  return day.toISOString().slice(0, 10);
}

export function getClientProjectId(projectId: string, userProjectId: string | null, isAdmin: boolean): string {
  return isAdmin ? projectId : (userProjectId ?? "");
}
