import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ApiErrorBody } from "../schemas/api-response.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const isExamRequest = this.isExamPath(request.url);
    const diagnosticPath = isExamRequest ? this.pathname(request.url) : request.url;
    const parserError = isExamRequest ? this.fromParserError(exception) : undefined;
    const status = isHttp
      ? exception.getStatus()
      : parserError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ApiErrorBody = parserError?.body ?? (isHttp
      ? this.fromHttpException(exception, isExamRequest)
      : { code: "INTERNAL_ERROR", message: "Internal server error" });

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(isExamRequest
        ? `${request.method} ${diagnosticPath} -> ${status}`
        : `${request.method} ${request.url} -> ${status}`, isExamRequest
          ? "Exam request failed"
          : this.isBodyParserError(exception)
            ? "Body parser error"
            : exception instanceof Error ? exception.stack : String(exception));
    }

    if (body.code === "EXAM_HASH_BUSY") response.setHeader("Retry-After", "1");
    response.status(status).json({ ...body, path: diagnosticPath, timestamp: new Date().toISOString() });
  }

  private fromHttpException(exception: HttpException, isExamRequest: boolean): ApiErrorBody {
    const response = exception.getResponse();
    if (typeof response === "string") {
      if (isExamRequest && exception.getStatus() === HttpStatus.BAD_REQUEST) {
        return { code: "VALIDATION_ERROR", message: "Invalid exam request" };
      }
      return { code: this.codeFor(exception.getStatus()), message: response };
    }
    const payload = response as Record<string, unknown>;
    if (
      isExamRequest &&
      exception.getStatus() === HttpStatus.BAD_REQUEST &&
      typeof payload.code !== "string"
    ) {
      return { code: "VALIDATION_ERROR", message: "Invalid exam request" };
    }
    const rawMessage = payload.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : typeof rawMessage === "string"
        ? rawMessage
        : exception.message;
    return {
      code: typeof payload.code === "string" ? payload.code : this.codeFor(exception.getStatus()),
      message,
      ...(payload.details !== undefined ? { details: payload.details } : {}),
    };
  }

  private fromParserError(exception: unknown): { status: number; body: ApiErrorBody } | undefined {
    if (typeof exception !== "object" || exception === null) return undefined;
    const error = exception as { type?: unknown; status?: unknown; statusCode?: unknown };
    if (error.type === "entity.too.large" && (error.status === 413 || error.statusCode === 413)) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        body: { code: "EXAM_REQUEST_TOO_LARGE", message: "Exam request body is too large" },
      };
    }
    if (error.type === "entity.parse.failed" && (error.status === 400 || error.statusCode === 400)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: "VALIDATION_ERROR", message: "Invalid exam request" },
      };
    }
    return undefined;
  }

  private isBodyParserError(exception: unknown): boolean {
    if (typeof exception !== "object" || exception === null) return false;
    const type = (exception as { type?: unknown }).type;
    return type === "entity.too.large" || type === "entity.parse.failed";
  }

  private isExamPath(url: string): boolean {
    return /(^|\/)exams(?:\/|$)/i.test(this.pathname(url));
  }

  private pathname(url: string): string {
    return url.split("?", 1)[0] ?? url;
  }

  private codeFor(status: number): string {
    const map: Record<number, string> = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "VALIDATION_ERROR",
    };
    return map[status] ?? "HTTP_ERROR";
  }
}
