import { HttpStatus, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function hostWithResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    json,
    status,
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: "GET", url: "/health" }),
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
});
