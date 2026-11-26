import { HttpException } from "@nestjs/common";

export type AuthErrorCode =
  | "EMAIL_IN_USE"
  | "INVALID_CREDENTIALS"
  | "INVALID_TEACHER_CODE"
  | "INVALID_RESET_TOKEN"
  | "EXPIRED_RESET_TOKEN"
  | "INVALID_STATE"
  | "OAUTH_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR";

export const AUTH_ERROR_STATUS: Record<AuthErrorCode, number> = {
  EMAIL_IN_USE: 409,
  INVALID_CREDENTIALS: 401,
  INVALID_TEACHER_CODE: 400,
  INVALID_RESET_TOKEN: 400,
  EXPIRED_RESET_TOKEN: 400,
  INVALID_STATE: 400,
  OAUTH_FAILED: 401,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
};

export class AuthException extends HttpException {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, status: number, message: string, details?: unknown) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, status);
    this.code = code;
  }
}

export function authError(
  code: AuthErrorCode,
  message: string,
  details?: unknown,
): AuthException {
  return new AuthException(code, AUTH_ERROR_STATUS[code], message, details);
}
