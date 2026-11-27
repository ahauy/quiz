import { HttpException } from "@nestjs/common";

export type QuestionErrorCode =
  | "QUESTION_NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE";

export const QUESTION_ERROR_STATUS: Record<QuestionErrorCode, number> = {
  QUESTION_NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 422,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
};

export class QuestionException extends HttpException {
  readonly code: QuestionErrorCode;

  constructor(code: QuestionErrorCode, status: number, message: string, details?: unknown) {
    super({ code, message, ...(details !== undefined ? { details } : {}) }, status);
    this.code = code;
  }
}

export function questionError(
  code: QuestionErrorCode,
  message: string,
  details?: unknown,
): QuestionException {
  return new QuestionException(code, QUESTION_ERROR_STATUS[code], message, details);
}
