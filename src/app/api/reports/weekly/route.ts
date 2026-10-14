import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { reportForRange, reportingRange, type ReportPeriod } from "@/lib/reporting";
import { ApiError } from "@/lib/types";
import { businessToday, mondayOfWeek, uuidSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const params = new URL(request.url).searchParams;
    const period = (params.get("period") ?? "week") as ReportPeriod;
    if (!["week", "month", "year"].includes(period)) throw new ApiError(422, "El periodo del reporte no es válido.");
    const today = businessToday();
    const value = params.get("value") ?? params.get("weekStart") ?? (period === "week" ? mondayOfWeek(today) : period === "month" ? today.slice(0, 7) : today.slice(0, 4));
    const projectId = params.get("projectId");
    if (projectId) uuidSchema.parse(projectId);
    if (user.role !== "ADMIN" && projectId && projectId !== user.projectId) return Response.json({ error: "No tienes acceso a esa obra." }, { status: 403 });
    const { start, end } = reportingRange(period, value);
    return Response.json(await reportForRange(user, start, end, projectId));
  } catch (error) {
    return errorResponse(error);
  }
}
