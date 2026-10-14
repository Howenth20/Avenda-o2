import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/types";

export function requestIp(request: Request): string {
  const trustedProxyIp = request.headers.get("x-real-ip");
  const forwardedFor = request.headers.get("x-forwarded-for");
  return (trustedProxyIp ?? forwardedFor?.split(",")[0]?.trim() ?? "unknown").slice(0, 64);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new ApiError(403, "Origen de solicitud no permitido.");
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String(error.code);
    if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "ENETUNREACH", "EHOSTUNREACH", "ECONNRESET", "08001", "08006"].includes(code)) {
      return NextResponse.json({ error: "Vercel no logra conectar con PostgreSQL. Revisa que DATABASE_URL sea la URL externa correcta, que el proveedor permita conexiones y que DATABASE_SSL coincida con su configuración." }, { status: 503 });
    }
    if (code === "28P01" || code === "28000") {
      return NextResponse.json({ error: "PostgreSQL rechazó las credenciales de DATABASE_URL. Copia de nuevo la URL completa de conexión del proveedor en Vercel." }, { status: 503 });
    }
    if (code === "3D000") {
      return NextResponse.json({ error: "La base indicada en DATABASE_URL no existe. Revisa el nombre de base en la conexión de Vercel." }, { status: 503 });
    }
    if (code === "42P01") {
      return NextResponse.json({ error: "La base de datos no tiene las tablas requeridas. Ejecuta npm run db:migrate contra la base de producción." }, { status: 503 });
    }
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Revisa los datos enviados." }, { status: 422 });
  }
  console.error("Request failed", error);
  return NextResponse.json({ error: "No se pudo completar la solicitud." }, { status: 500 });
}

export function parseJson(request: Request): Promise<unknown> {
  return request.json().catch(() => {
    throw new ApiError(400, "El cuerpo de la solicitud debe ser JSON válido.");
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export function duplicateResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}
