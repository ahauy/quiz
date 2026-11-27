import { HttpException } from "@nestjs/common";

export type ExamErrorCode =
  | "VALIDATION_ERROR" | "FORBIDDEN" | "EXAM_NOT_FOUND" | "SNAPSHOT_NOT_FOUND" | "SOURCE_QUESTION_NOT_FOUND"
  | "EXAM_INVALID_STATE" | "EXAM_VERSION_REQUIRED" | "EXAM_VERSION_CONFLICT"
  | "EXAM_WRITE_BUSY" | "EXAM_READ_BUSY" | "CLASSROOM_LINKED_TO_PUBLISHED_EXAM"
  | "EXAM_ALREADY_EXISTS" | "EXAM_DUPLICATE_SOURCE" | "EXAM_HASH_BUSY" | "CLASSROOM_NOT_FOUND";

const STATUS: Record<ExamErrorCode, number> = {
  VALIDATION_ERROR: 400, FORBIDDEN: 403, EXAM_NOT_FOUND: 404, SNAPSHOT_NOT_FOUND: 404, SOURCE_QUESTION_NOT_FOUND: 404,
  EXAM_INVALID_STATE: 409, EXAM_DUPLICATE_SOURCE: 409, EXAM_ALREADY_EXISTS: 409,
  EXAM_VERSION_REQUIRED: 428, EXAM_VERSION_CONFLICT: 412,
  EXAM_WRITE_BUSY: 503, EXAM_READ_BUSY: 503, EXAM_HASH_BUSY: 429,
  CLASSROOM_LINKED_TO_PUBLISHED_EXAM: 409, CLASSROOM_NOT_FOUND: 404,
};

export class ExamException extends HttpException {
  readonly code: ExamErrorCode;
  constructor(code: ExamErrorCode, message: string, details?: unknown) {
    super({ code, message, ...(details === undefined ? {} : { details }) }, STATUS[code]);
    this.code = code;
  }
}

export function examError(code: ExamErrorCode, message: string, details?: unknown): ExamException {
  return new ExamException(code, message, details);
}

export function isPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}
