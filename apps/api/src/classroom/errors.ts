import { HttpException } from "@nestjs/common";

export type ClassroomErrorCode =
  | "CLASS_CODE_NOT_FOUND"
  | "CLASSROOM_NOT_FOUND"
  | "ENROLLMENT_NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED";

export const CLASSROOM_ERROR_STATUS: Record<ClassroomErrorCode, number> = {
  CLASS_CODE_NOT_FOUND: 404,
  CLASSROOM_NOT_FOUND: 404,
  ENROLLMENT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

export class ClassroomException extends HttpException {
  readonly code: ClassroomErrorCode;

  constructor(code: ClassroomErrorCode, status: number, message: string, details?: unknown) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, status);
    this.code = code;
  }
}

export function classroomError(
  code: ClassroomErrorCode,
  message: string,
  details?: unknown,
): ClassroomException {
  return new ClassroomException(code, CLASSROOM_ERROR_STATUS[code], message, details);
}
