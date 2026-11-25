import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ApiErrorBody } from "../api-response.js";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ApiErrorBody = isHttp
      ? this.fromHttpException(exception)
      : { code: "INTERNAL_ERROR", message: "Internal server error" };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({ ...body, path: request.url, timestamp: new Date().toISOString() });
  }

  private fromHttpException(exception: HttpException): ApiErrorBody {
    const response = exception.getResponse();
    if (typeof response === "string") {
      return { code: this.codeFor(exception.getStatus()), message: response };
    }
    const payload = response as Record<string, unknown>;
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
