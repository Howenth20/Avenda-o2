import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { weeklyReport } from "@/lib/reporting";
import { businessToday, mondayOfWeek } from "@/lib/validation";
import { ApiError } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const weekStart = new URL(request.url).searchParams.get("weekStart") ?? mondayOfWeek(businessToday());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOfWeek(weekStart) !== weekStart) throw new ApiError(422, "Selecciona el lunes de la semana.");
    return Response.json(await weeklyReport(user, weekStart));
  } catch (error) {
    return errorResponse(error);
  }
}
