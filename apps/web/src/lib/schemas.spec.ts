import { describe, expect, it } from "vitest";
import { EnrollmentStatus, Role } from "@quiz/shared";
import {
  authResultSchema,
  classroomSchema,
  enrollmentSchema,
  enrollmentStatusSchema,
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

describe("classroomSchema", () => {
  const valid = {
    id: "c-1",
    name: "Toán 10A",
    code: "ABC234",
    teacherId: "u-1",
    createdAt: "2026-11-26T00:00:00.000Z",
  };

  it("parses the wire ClassroomDto shape", () => {
    expect(classroomSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a missing code or a non-string timestamp", () => {
    expect(classroomSchema.safeParse({ ...valid, code: undefined }).success).toBe(false);
    expect(classroomSchema.safeParse({ ...valid, createdAt: 123 }).success).toBe(false);
  });
});

describe("enrollmentSchema", () => {
  const valid = {
    id: "e-1",
    classroomId: "c-1",
    userId: "u-2",
    displayName: "Student",
    email: "student@example.com",
    status: EnrollmentStatus.PENDING,
    createdAt: "2026-11-26T00:00:00.000Z",
  };

  it("accepts PENDING without approvedAt and APPROVED with it", () => {
    expect(enrollmentSchema.parse(valid).approvedAt).toBeUndefined();
    const approved = { ...valid, status: EnrollmentStatus.APPROVED, approvedAt: "2026-11-26T01:00:00.000Z" };
    expect(enrollmentSchema.parse(approved).approvedAt).toBe(approved.approvedAt);
  });

  it("rejects an out-of-contract status", () => {
    expect(enrollmentStatusSchema.safeParse("REJECTED").success).toBe(false);
    expect(enrollmentSchema.safeParse({ ...valid, status: "REJECTED" }).success).toBe(false);
  });
});
