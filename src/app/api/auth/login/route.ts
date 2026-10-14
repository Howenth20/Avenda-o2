import { compare } from "bcryptjs";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { pool, requireDatabaseConfig } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { emailSchema } from "@/lib/validation";

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(256) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireDatabaseConfig();
    const input = loginSchema.parse(await parseJson(request));
    const ip = requestIp(request);
    const recent = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM auth_attempts
       WHERE email = $1 AND ip_address = $2 AND succeeded = FALSE
       AND attempted_at > NOW() - INTERVAL '15 minutes'`,
      [input.email, ip],
    );
    if ((recent.rows[0]?.count ?? 0) >= 8) {
      return Response.json({ error: "Demasiados intentos. Espera unos minutos y vuelve a intentarlo." }, { status: 429 });
    }

    const result = await pool.query<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      role: "ADMIN" | "PROJECT_USER";
      project_id: string | null;
      active: boolean;
    }>(
      `SELECT id, name, email, password_hash, role, project_id, active FROM users WHERE email = $1`,
      [input.email],
    );
    const account = result.rows[0];
    const valid = account ? await compare(input.password, account.password_hash) : false;
    const succeeded = Boolean(account && valid && account.active);
    await pool.query(
      "INSERT INTO auth_attempts (email, ip_address, succeeded) VALUES ($1, $2, $3)",
      [input.email, ip, succeeded],
    );
    if (!succeeded || !account) {
      return Response.json({ error: "Correo o contraseña incorrectos." }, { status: 401 });
    }
    await createSession(account.id);
    return Response.json({ user: { id: account.id, name: account.name, email: account.email, role: account.role, projectId: account.project_id } });
  } catch (error) {
    return errorResponse(error);
  }
}
