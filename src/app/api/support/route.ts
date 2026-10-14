import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { inTransaction, pool, requireDatabaseConfig } from "@/lib/db";
import { assertSameOrigin, errorResponse, parseJson, requestIp } from "@/lib/http";
import { ApiError } from "@/lib/types";
import { emailSchema } from "@/lib/validation";

const ticketSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(10).max(4000),
  _company: z.string().max(0).optional().default(""),
});

function ticketCode(): string {
  return `RND-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Inicia sesión para consultar soporte.");
    const result = user.role === "ADMIN"
      ? await pool.query("SELECT id,ticket_code,name,email,subject,message,status,mail_status,created_at,updated_at FROM support_tickets ORDER BY created_at DESC LIMIT 300")
      : await pool.query("SELECT id,ticket_code,name,email,subject,message,status,mail_status,created_at,updated_at FROM support_tickets WHERE created_by=$1 ORDER BY created_at DESC LIMIT 100", [user.id]);
    return Response.json({ tickets: result.rows });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireDatabaseConfig();
    const input = ticketSchema.parse(await parseJson(request));
    const ip = requestIp(request);
    if (input._company) return Response.json({ ok: true, ticketCode: "" }, { status: 201 });
    const recent = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM support_tickets WHERE requester_ip=$1 AND created_at > NOW() - INTERVAL '1 hour'", [ip],
    );
    if ((recent.rows[0]?.count ?? 0) >= 3) throw new ApiError(429, "Se alcanzó el límite de solicitudes. Vuelve a intentarlo más tarde.");
    const user = await getSessionUser();
    const code = ticketCode();
    const mailConfigured = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.SUPPORT_EMAIL);
    const inserted = await inTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO support_tickets (ticket_code,name,email,subject,message,created_by,requester_ip,mail_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,ticket_code,status,mail_status,created_at`,
        [code, input.name, input.email, input.subject, input.message, user?.id ?? null, ip, mailConfigured ? "PENDING" : "NOT_CONFIGURED"],
      );
      await recordAudit(client, { actorId: user?.id ?? null, projectId: user?.projectId ?? null, action: "CREATE", entityType: "support_ticket", entityId: result.rows[0].id, before: null, after: result.rows[0], ip });
      return result.rows[0];
    });
    if (mailConfigured) {
      try {
        const transport = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
        });
        await transport.sendMail({
          from: process.env.GMAIL_USER,
          to: process.env.SUPPORT_EMAIL,
          replyTo: input.email,
          subject: `[${code}] ${input.subject}`,
          text: `Ticket: ${code}\nNombre: ${input.name}\nCorreo: ${input.email}\n\n${input.message}`,
        });
        await pool.query("UPDATE support_tickets SET mail_status='SENT',updated_at=NOW() WHERE id=$1", [inserted.id]);
      } catch (mailError) {
        console.error("Support notification email could not be delivered", mailError);
        await pool.query("UPDATE support_tickets SET mail_status='FAILED',updated_at=NOW() WHERE id=$1", [inserted.id]);
      }
    }
    const latest = await pool.query("SELECT id,ticket_code,status,mail_status,created_at FROM support_tickets WHERE id=$1", [inserted.id]);
    return Response.json({ ticket: latest.rows[0] }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

const statusSchema = z.object({ status: z.enum(["PENDING", "REVIEW", "RESOLVED", "CLOSED"]) });
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const input = statusSchema.extend({ id: z.string().uuid() }).parse(await parseJson(request));
    const result = await inTransaction(async (client) => {
      const found = await client.query("SELECT * FROM support_tickets WHERE id=$1 FOR UPDATE", [input.id]);
      const before = found.rows[0];
      if (!before) throw new ApiError(404, "Ticket no encontrado.");
      const updated = await client.query("UPDATE support_tickets SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING id,ticket_code,status,updated_at", [input.id, input.status]);
      await recordAudit(client, { actorId: actor.id, projectId: null, action: "CHANGE_STATUS", entityType: "support_ticket", entityId: input.id, before: { status: before.status }, after: updated.rows[0], ip: requestIp(request) });
      return updated.rows[0];
    });
    return Response.json({ ticket: result });
  } catch (error) {
    return errorResponse(error);
  }
}
