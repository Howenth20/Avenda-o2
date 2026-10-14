import { getSessionUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    return Response.json({ user: await getSessionUser() });
  } catch (error) {
    return errorResponse(error);
  }
}
