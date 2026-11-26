import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  fieldErrors,
  getErrorMessage,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./forms.js";

describe("loginSchema", () => {
  it("requires a valid email and a non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "secret12" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "bad", password: "secret12" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = {
    email: "a@b.com",
    password: "password1",
    displayName: "Alice",
    requestedRole: "STUDENT",
  };

  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("rejects an invalid role value", () => {
    expect(registerSchema.safeParse({ ...valid, requestedRole: "ADMIN" }).success).toBe(false);
  });

  it("keeps teacherCode optional", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, teacherCode: "CODE" }).success).toBe(true);
  });
});

describe("resetPasswordSchema", () => {
  it("requires a token and a password of at least 8 characters", () => {
    expect(resetPasswordSchema.safeParse({ token: "t", newPassword: "password1" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "", newPassword: "password1" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "t", newPassword: "short" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("requires the confirmation password to match", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpass1",
        newPassword: "newpass12",
        confirmPassword: "newpass12",
      }).success,
    ).toBe(true);
    const bad = changePasswordSchema.safeParse({
      currentPassword: "oldpass1",
      newPassword: "newpass12",
      confirmPassword: "different",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(fieldErrors(bad.error).confirmPassword).toBeDefined();
    }
  });
});

describe("fieldErrors", () => {
  it("maps the first issue per field", () => {
    const result = registerSchema.safeParse({
      email: "bad",
      password: "short",
      displayName: "",
      requestedRole: "STUDENT",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(errors.email).toBeDefined();
      expect(errors.password).toBeDefined();
      expect(errors.displayName).toBeDefined();
    }
  });
});

describe("getErrorMessage", () => {
  it("prefers the API error body message", () => {
    expect(getErrorMessage({ body: { code: "X", message: "Sai thông tin" } })).toBe("Sai thông tin");
  });

  it("falls back to a generic Error message", () => {
    expect(getErrorMessage(new Error("network down"))).toBe("network down");
  });

  it("returns a safe default for unknown values", () => {
    expect(getErrorMessage(null)).toBe("Đã có lỗi không xác định");
  });
});
