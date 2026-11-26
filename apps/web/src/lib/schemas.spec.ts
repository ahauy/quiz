import { describe, expect, it } from "vitest";
import { Role } from "@quiz/shared";
import {
  authResultSchema,
  errorEnvelopeSchema,
  okSchema,
  roleSchema,
  successEnvelope,
  userSchema,
} from "./schemas.js";

const validUser = {
  id: "u-1",
  email: "teacher@example.com",
  displayName: "Ms. A",
  role: Role.TEACHER,
};

describe("roleSchema", () => {
  it("accepts exactly TEACHER and STUDENT", () => {
    expect(roleSchema.parse(Role.TEACHER)).toBe(Role.TEACHER);
    expect(roleSchema.parse(Role.STUDENT)).toBe(Role.STUDENT);
  });

  it("rejects ADMIN and arbitrary values", () => {
    expect(roleSchema.safeParse("ADMIN").success).toBe(false);
    expect(roleSchema.safeParse("").success).toBe(false);
  });
});

describe("userSchema", () => {
  it("parses a valid user", () => {
    expect(userSchema.parse(validUser)).toEqual(validUser);
  });

  it("rejects an out-of-contract role", () => {
    expect(userSchema.safeParse({ ...validUser, role: "ADMIN" }).success).toBe(false);
  });
});

describe("envelopes", () => {
  it("validates the success envelope and exposes data", () => {
    const envelope = successEnvelope(userSchema);
    expect(envelope.parse({ data: validUser }).data).toEqual(validUser);
    expect(envelope.safeParse({ data: { ...validUser, role: "ADMIN" } }).success).toBe(false);
    expect(envelope.safeParse({}).success).toBe(false);
  });

  it("validates the error envelope with optional details", () => {
    const parsed = errorEnvelopeSchema.parse({ code: "UNAUTHORIZED", message: "nope" });
    expect(parsed.code).toBe("UNAUTHORIZED");
    expect(parsed.message).toBe("nope");
    expect(errorEnvelopeSchema.safeParse({ code: "X" }).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ message: "x" }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({ code: "X", message: "y", details: { field: "email" } }).success,
    ).toBe(true);
  });

  it("parses auth result and ok payloads", () => {
    expect(authResultSchema.parse({ accessToken: "t", user: validUser }).user.id).toBe("u-1");
    expect(okSchema.parse({ ok: true }).ok).toBe(true);
    expect(okSchema.safeParse({ ok: false }).success).toBe(false);
  });
});
