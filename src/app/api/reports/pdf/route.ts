import PDFDocument from "pdfkit";
import { getSessionUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { ApiError } from "@/lib/types";

export const runtime = "nodejs";

function money(cents: number): string {
  return `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Inicia sesión para generar reportes.");
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? new Intl.DateTimeFormat("en-CA", { timeZone: process.env.BUSINESS_TIME_ZONE || "America/Lima" }).format(new Date()).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ApiError(422, "El mes debe tener el formato AAAA-MM.");
    const values: unknown[] = [`${month}-01`];
    let projectFilter = "";
    if (user.role === "PROJECT_USER") {
      values.push(user.projectId);
      projectFilter = ` AND project_id=$${values.length}`;
    }
    const rows = await pool.query(
      `SELECT project_code,project_name,kind,category,description,expense_date,amount_cents,stage
       FROM (
         SELECT p.code AS project_code,p.name AS project_name,'Gasto' AS kind,e.category,e.description,e.expense_date,e.amount_cents,e.stage,e.project_id
         FROM expenses e JOIN projects p ON p.id=e.project_id
         WHERE e.deleted_at IS NULL AND e.expense_date >= $1::date AND e.expense_date < ($1::date + INTERVAL '1 month')
         UNION ALL
         SELECT p.code,p.name,'Viático' AS kind,'Viático' AS category,w.first_name || ' ' || w.last_name,d.week_start,d.total_cents,d.stage,d.project_id
         FROM per_diems d JOIN projects p ON p.id=d.project_id JOIN workers w ON w.id=d.worker_id
         WHERE d.week_start >= date_trunc('month',$1::date)::date AND d.week_start < (date_trunc('month',$1::date) + INTERVAL '1 month')::date
       ) combined WHERE TRUE ${projectFilter} ORDER BY expense_date DESC,project_code LIMIT 2000`, values,
    );
    const total = rows.rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
    const paid = rows.rows.filter((row) => row.stage === "PAID").reduce((sum, row) => sum + Number(row.amount_cents), 0);
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: `Reporte Rinde+ ${month}`, Author: "AVENDAÑO RINDE+" } });
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.fillColor("#24252A").fontSize(19).font("Helvetica-Bold").text("AVENDAÑO RINDE+", { continued: true });
    doc.fillColor("#EC823D").text("  ·  Reporte de obra");
    doc.moveDown(0.35).fillColor("#6D7078").font("Helvetica").fontSize(10).text(`Periodo: ${month}   |   Generado: ${new Date().toLocaleString("es-PE", { timeZone: process.env.BUSINESS_TIME_ZONE || "America/Lima" })}`);
    doc.moveDown(1).fillColor("#24252A").font("Helvetica-Bold").fontSize(12).text(`Importe registrado: ${money(total)}`);
    doc.font("Helvetica").fontSize(10).fillColor("#6D7078").text(`Importe pagado: ${money(paid)}   ·   Registros: ${rows.rowCount ?? rows.rows.length}`);
    doc.moveDown(1);
    const col = { date: 44, project: 109, item: 185, stage: 395, amount: 486 };
    const heading = () => {
      doc.rect(44, doc.y, 507, 23).fill("#F1EEE9");
      doc.fillColor("#686A70").font("Helvetica-Bold").fontSize(8.5);
      const y = doc.y + 7;
      doc.text("FECHA", col.date, y, { width: 61 });
      doc.text("OBRA", col.project, y, { width: 72 });
      doc.text("DETALLE", col.item, y, { width: 200 });
      doc.text("ETAPA", col.stage, y, { width: 82 });
      doc.text("IMPORTE", col.amount, y, { width: 64, align: "right" });
      doc.y += 23;
    };
    heading();
    for (const row of rows.rows) {
      if (doc.y > 745) { doc.addPage(); heading(); }
      const y = doc.y + 6;
      doc.font("Helvetica").fontSize(8).fillColor("#34353A");
      doc.text(new Date(`${row.expense_date}T00:00:00Z`).toLocaleDateString("es-PE", { timeZone: "UTC" }), col.date, y, { width: 61 });
      doc.text(String(row.project_code), col.project, y, { width: 70 });
      doc.text(`${row.kind} · ${row.category} · ${row.description}`, col.item, y, { width: 203, height: 26, ellipsis: true });
      doc.text(String(row.stage).toLowerCase(), col.stage, y, { width: 78 });
      doc.text(money(Number(row.amount_cents)), col.amount, y, { width: 64, align: "right" });
      doc.moveTo(44, y + 21).lineTo(551, y + 21).strokeColor("#ECE9E4").lineWidth(0.6).stroke();
      doc.y = y + 25;
    }
    doc.end();
    const pdf = await finished;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rinde-reporte-${month}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
