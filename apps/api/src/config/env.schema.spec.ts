import { describe, expect, it } from "vitest";
import { validateEnv } from "./env.schema.js";

const validEnv = {
  DATABASE_URL: "postgresql://quiz:quiz@localhost:5432/quiz",
  JWT_SECRET: "a".repeat(64),
  JWT_REFRESH_SECRET: "b".repeat(64),
  TEACHER_CODE: "TEACH-2026",
  UPLOAD_DIR: "./uploads",
  OAUTH_GOOGLE_CLIENT_ID: "client-id",
  OAUTH_GOOGLE_CLIENT_SECRET: "client-secret",
};

describe("validateEnv", () => {
  it("applies documented defaults for optional values", () => {
    const env = validateEnv(validEnv);
    expect(env.PORT).toBe(3000);
    expect(env.VIOLATION_WARN_AT).toBe(2);
    expect(env.VIOLATION_SUBMIT_AT).toBe(3);
  });

  it("fails fast with a field-specific message when a required secret is short", () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: "too-short" })).toThrowError(
      /JWT_SECRET/,
    );
  });

  it("fails fast when DATABASE_URL is missing", () => {
    const withoutDb = { ...validEnv };
    delete (withoutDb as Partial<typeof validEnv>).DATABASE_URL;
    expect(() => validateEnv(withoutDb)).toThrowError(/DATABASE_URL/);
  });

  it("requires UPLOAD_DIR for local asset storage", () => {
    const withoutUploadDir = { ...validEnv };
    delete (withoutUploadDir as Partial<typeof validEnv>).UPLOAD_DIR;
    expect(() => validateEnv(withoutUploadDir)).toThrowError(/UPLOAD_DIR/);
  });
});
