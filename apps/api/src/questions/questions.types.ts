import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "@quiz/shared";

// Boundary identity handed to the service. JwtAuthGuard + RolesGuard populate
// `req.user` before a bank route runs; this accessor keeps the fallback explicit.
export interface CurrentUser {
  id: string;
  role: Role;
}

// Raw list-query shape as seen at the HTTP boundary. Querystring values arrive as
// strings; the service coerces and validates them (no reliance on a global pipe,
// whose exceptionFactory maps VALIDATION_ERROR to the auth code's 400, not 422).
export interface ListQuery {
  subjectId?: string;
  chapterId?: string;
  difficulty?: string;
  type?: string;
  q?: string;
  page?: number | string;
  pageSize?: number | string;
}

export function currentUser(req: Request): CurrentUser {
  const user = (req as Request & { user?: CurrentUser }).user;
  if (user === undefined) throw new UnauthorizedException();
  return user;
}
