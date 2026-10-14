export type Role = "ADMIN" | "PROJECT_USER";
export type Stage = "PENDING" | "APPROVED" | "PAID";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  projectId: string | null;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
