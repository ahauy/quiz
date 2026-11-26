import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AUTH_ERROR_STATUS, AuthException, authError } from "./errors.js";
import type { AuthErrorCode } from "./errors.js";

describe("auth errors", () => {
  const expectedStatus: Record<AuthErrorCode, number> = {
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

  it("maps every documented code to its contracted HTTP status", () => {
    for (const code of Object.keys(expectedStatus) as AuthErrorCode[]) {
      expect(AUTH_ERROR_STATUS[code]).toBe(expectedStatus[code]);
      expect(authError(code, "msg").getStatus()).toBe(expectedStatus[code]);
    }
  });

  it("produces a serialisable { code, message, details? } body", () => {
    const error = authError("INVALID_TEACHER_CODE", "bad code", { hint: "ask admin" });
    expect(error).toBeInstanceOf(AuthException);
    expect(error.code).toBe("INVALID_TEACHER_CODE");
    expect(error.getResponse()).toEqual({
      code: "INVALID_TEACHER_CODE",
      message: "bad code",
      details: { hint: "ask admin" },
    });
  });

  it("omits details entirely when not provided", () => {
    expect(authError("UNAUTHORIZED", "nope").getResponse()).toEqual({
      code: "UNAUTHORIZED",
      message: "nope",
    });
  });
});
