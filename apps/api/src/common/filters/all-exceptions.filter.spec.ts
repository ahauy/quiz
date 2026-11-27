import { BadRequestException, HttpStatus, Logger, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function hostWithResponse(url = "/health") {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    json,
    status,
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: "GET", url }),
      }),
    } as never,
  };
}

describe("AllExceptionsFilter", () => {
  const filter = new AllExceptionsFilter();

  it("maps NotFoundException to 404 with a stable error code", () => {
    const { host, status, json } = hostWithResponse();
    filter.catch(new NotFoundException("missing"), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "NOT_FOUND", message: "missing" }),
    );
  });

  it("never exposes stack traces for unknown errors", () => {
    const { host, json } = hostWithResponse();
    filter.catch(new Error("db password is hunter2"), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INTERNAL_ERROR", message: "Internal server error" }),
    );
  });

  it("maps native oversized body-parser errors to a safe exam response", () => {
    const marker = "private raw request body";
    const { host, status, json } = hostWithResponse("/teacher/exams?draft=1");
    const error = Object.assign(new Error(marker), {
      type: "entity.too.large",
      status: 413,
      statusCode: 413,
      body: marker,
    });
    const loggedError = vi.spyOn(Logger.prototype, "error");

    try {
      filter.catch(error, host);
      expect(status).toHaveBeenCalledWith(413);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "EXAM_REQUEST_TOO_LARGE", message: expect.any(String) }),
      );
      expect(JSON.stringify(json.mock.calls)).not.toContain(marker);
      expect(loggedError.mock.calls.flat().join(" ")).not.toContain(marker);
    } finally {
      loggedError.mockRestore();
    }
  });

  it("maps native malformed JSON parser errors to a safe exam response", () => {
    const marker = "private raw request body";
    const { host, status, json } = hostWithResponse("/teacher/exams");
    const error = Object.assign(new SyntaxError(marker), {
      type: "entity.parse.failed",
      status: 400,
      statusCode: 400,
      body: marker,
    });

    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.any(String) }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain(marker);
  });

  it("safely handles Nest's wrapped malformed JSON exception on exam routes", () => {
    const marker = "Unexpected token in private request body";
    const { host, status, json } = hostWithResponse("/teacher/exams");

    filter.catch(new BadRequestException(marker), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR", message: expect.not.stringContaining(marker) }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain(marker);
  });

  it("keeps parser errors on non-exam paths as internal errors", () => {
    const marker = "raw input marker";
    const { host, status, json } = hostWithResponse("/teacher/exams-history");
    const error = Object.assign(new Error(marker), {
      type: "entity.too.large",
      status: 413,
    });
    const loggedError = vi.spyOn(Logger.prototype, "error");

    try {
      filter.catch(error, host);
      expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INTERNAL_ERROR", message: "Internal server error" }),
      );
      expect(loggedError.mock.calls.flat().join(" ")).not.toContain(marker);
    } finally {
      loggedError.mockRestore();
    }
  });

  it("preserves explicit typed validation details on exam routes", () => {
    const { host, json } = hostWithResponse("/teacher/exams");

    filter.catch(
      new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Invalid title",
        details: [{ field: "title" }],
      }),
      host,
    );
    expect(json).toHaveBeenLastCalledWith(
      expect.objectContaining({
        code: "VALIDATION_ERROR",
        message: "Invalid title",
        details: [{ field: "title" }],
      }),
    );
  });

  it("redacts exam query strings and diagnostics from logs and envelopes", () => {
    const marker = "postgres driver write args secret-marker";
    const { host, json } = hostWithResponse(`/teacher/exams/private?token=${marker}`);
    const loggedError = vi.spyOn(Logger.prototype, "error");
    try {
      filter.catch(new Error(marker), host);
      expect(JSON.stringify(json.mock.calls)).not.toContain(marker);
      expect(json).toHaveBeenCalledWith(expect.objectContaining({ path: "/teacher/exams/private" }));
      expect(loggedError.mock.calls.flat().join(" ")).not.toContain(marker);
      expect(loggedError.mock.calls.flat().join(" ")).toContain("500");
    } finally { loggedError.mockRestore(); }
  });

  it.each(["/Teacher/ExAmS/private", "/Student/ExAmS/private"])(
    "redacts diagnostics and query strings for case-variant accepted exam route %s",
    (path) => {
      const marker = "private diagnostic secret-marker";
      const { host, json } = hostWithResponse(`${path}?token=${marker}`);
      const loggedError = vi.spyOn(Logger.prototype, "error");
      try {
        filter.catch(new Error(marker), host);
        expect(json).toHaveBeenCalledWith(expect.objectContaining({ path }));
        expect(JSON.stringify(json.mock.calls)).not.toContain(marker);
        expect(loggedError.mock.calls.flat().join(" ")).not.toContain(marker);
      } finally { loggedError.mockRestore(); }
    },
  );
});
