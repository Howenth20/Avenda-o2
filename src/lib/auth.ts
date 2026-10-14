import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { pool, requireDatabaseConfig } from "@/lib/db";
import { ApiError, type SessionUser } from "@/lib/types";

export const SESSION_COOKIE = "rinde_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  requireDatabaseConfig();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  await pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '14 days')",
    [tokenHash, userId],
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  requireDatabaseConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  requireDatabaseConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await pool.query<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role, u.project_id AS "projectId"
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.active = TRUE`,
    [hashToken(token)],
  );
  return result.rows[0] ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Inicia sesión para continuar.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Esta acción requiere una cuenta administradora.");
  return user;
}

export function ensureProjectAccess(user: SessionUser, projectId: string): void {
  if (user.role === "PROJECT_USER" && user.projectId !== projectId) {
    throw new ApiError(403, "No tienes acceso a esa obra.");
  }
}
