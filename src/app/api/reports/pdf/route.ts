import PDFDocument from "pdfkit";
import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { reportForRange, reportingRange, type ReportPeriod } from "@/lib/reporting";
import { ApiError } from "@/lib/types";
import { businessToday, mondayOfWeek, uuidSchema } from "@/lib/validation";

export const runtime = "nodejs";

function money(cents: number): string {
  return `S/ ${(cents / 100).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateOnly(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  }
  return null;
}

function displayDate(value: unknown): string {
  const normalized = dateOnly(value);
  if (!normalized) return "—";
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function stageLabel(stage: string, invoiceStatus: string | null): string {
  const stageText = ({ PENDING: "Pendiente", APPROVED: "Aprobado", PAID: "Pagado", REGISTERED: "Registrado" } as Record<string, string>)[stage] ?? stage;
  return invoiceStatus === "HECHO" ? `${stageText} · Factura hecha` : stageText;
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Inicia sesión para generar reportes.");
    const params = new URL(request.url).searchParams;
    const period = (params.get("period") ?? "week") as ReportPeriod;
    if (!["week", "month", "year"].includes(period)) throw new ApiError(422, "El periodo del reporte no es válido.");
    const today = businessToday();
    const value = params.get("value") ?? params.get("weekStart") ?? (period === "week" ? mondayOfWeek(today) : period === "month" ? today.slice(0, 7) : today.slice(0, 4));
    const projectId = params.get("projectId");
    if (projectId) uuidSchema.parse(projectId);
    if (user.role !== "ADMIN" && projectId && projectId !== user.projectId) throw new ApiError(403, "No tienes acceso a esa obra.");
    const { start, end } = reportingRange(period, value);
    const report = await reportForRange(user, start, end, projectId);
    const chunks: Buffer[] = [];
    const periodLabel = period === "week" ? "semanal" : period === "month" ? "mensual" : "anual";
    const scopeLabel = projectId ? report.movements[0]?.projectName ?? "Obra seleccionada" : "Todas las obras";
    const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: `Reporte ${periodLabel} Rinde+ ${value}`, Author: "AVENDAÑO RINDE+" } });
    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.fillColor("#24252A").fontSize(19).font("Helvetica-Bold").text("AVENDAÑO RINDE+", { continued: true });
    doc.fillColor("#EC823D").text(`  ·  Reporte ${periodLabel}`);
    doc.moveDown(0.35).fillColor("#6D7078").font("Helvetica").fontSize(10)
      .text(`Periodo: ${displayDate(report.weekStart)} al ${displayDate(report.weekEnd)}   |   Alcance: ${scopeLabel}   |   Generado: ${new Date().toLocaleString("es-PE", { timeZone: process.env.BUSINESS_TIME_ZONE || "America/Lima" })}`);
    doc.moveDown(0.8).fillColor("#24252A").font("Helvetica-Bold").fontSize(12).text(`Operación del periodo: ${money(report.totals.operationalCents)}`);
    doc.font("Helvetica").fontSize(9.5).fillColor("#6D7078")
      .text(`Gastos: ${money(report.totals.expenseCents)}   ·   Viáticos: ${money(report.totals.perDiemCents)}   ·   Facturas hechas: ${money(report.totals.invoiceDoneCents)}`)
      .text(`Caja chica disponible: ${money(report.totals.pettyCashBalanceCents)}   ·   Movimientos: ${report.movements.length}`);
    doc.moveDown(1);
    const col = { date: 44, project: 110, item: 181, stage: 400, amount: 487 };
    const heading = () => {
      doc.rect(44, doc.y, 507, 23).fill("#F1EEE9");
      doc.fillColor("#686A70").font("Helvetica-Bold").fontSize(8.5);
      const y = doc.y + 7;
      doc.text("FECHA", col.date, y, { width: 61 });
      doc.text("OBRA", col.project, y, { width: 66 });
      doc.text("DETALLE", col.item, y, { width: 210 });
      doc.text("ESTADO", col.stage, y, { width: 82 });
      doc.text("IMPORTE", col.amount, y, { width: 64, align: "right" });
      doc.y += 23;
    };
    heading();
    for (const row of report.movements) {
      if (doc.y > 745) { doc.addPage(); heading(); }
      const y = doc.y + 6;
      const kind = row.kind === "GASTO" ? "Gasto" : row.kind === "VIATICO" ? "Viático" : "Caja chica";
      const payment = row.paymentSource === "PETTY_CASH" ? " · Caja chica" : "";
      const days = row.daysAttended !== null ? ` · ${row.daysAttended} días` : "";
      const direction = row.cashDirection === "OUT" ? " · salida" : row.cashDirection === "IN" ? " · ingreso" : "";
      doc.font("Helvetica").fontSize(8).fillColor("#34353A");
      doc.text(displayDate(row.movementDate), col.date, y, { width: 61 });
      doc.text(row.projectCode, col.project, y, { width: 66, height: 26, ellipsis: true });
      doc.text(`${kind} · ${row.category} · ${row.description}${days}${payment}${direction}`, col.item, y, { width: 212, height: 26, ellipsis: true });
      doc.text(stageLabel(row.stage, row.invoiceStatus), col.stage, y, { width: 82, height: 22, ellipsis: true });
      doc.text(money(row.amountCents), col.amount, y, { width: 64, align: "right" });
      doc.moveTo(44, y + 21).lineTo(551, y + 21).strokeColor("#ECE9E4").lineWidth(0.6).stroke();
      doc.y = y + 25;
    }
    if (!report.movements.length) {
      doc.moveDown(1).font("Helvetica").fontSize(10).fillColor("#6D7078").text("No hay movimientos registrados en esta semana.");
    }
    doc.end();
    const pdf = await finished;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rinde-reporte-${periodLabel}-${value}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
