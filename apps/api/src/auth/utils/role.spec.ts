import "reflect-metadata";
import { Role } from "@quiz/shared";
import { describe, expect, it } from "vitest";
import { resolveRole } from "./role.js";

const TEACHER_CODE = "TEACH-2026";

function capture(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("resolveRole", () => {
  it("defaults to STUDENT when there is no teacher claim", () => {
    expect(resolveRole(undefined, undefined, TEACHER_CODE)).toBe(Role.STUDENT);
    expect(resolveRole(Role.STUDENT, undefined, TEACHER_CODE)).toBe(Role.STUDENT);
  });

  it("grants TEACHER when the code matches", () => {
    expect(resolveRole(Role.TEACHER, TEACHER_CODE, TEACHER_CODE)).toBe(Role.TEACHER);
  });

  it("grants TEACHER when a valid code is supplied without requestedRole", () => {
    expect(resolveRole(undefined, TEACHER_CODE, TEACHER_CODE)).toBe(Role.TEACHER);
  });

  it("rejects a wrong code with INVALID_TEACHER_CODE", () => {
    expect(capture(() => resolveRole(Role.TEACHER, "wrong", TEACHER_CODE))).toMatchObject({
      code: "INVALID_TEACHER_CODE",
    });
  });

  it("rejects a teacher claim with no code with INVALID_TEACHER_CODE", () => {
    expect(capture(() => resolveRole(Role.TEACHER, undefined, TEACHER_CODE))).toMatchObject({
      code: "INVALID_TEACHER_CODE",
    });
  });

  it("rejects a supplied invalid code even without an explicit requestedRole", () => {
    expect(capture(() => resolveRole(undefined, "wrong", TEACHER_CODE))).toMatchObject({
      code: "INVALID_TEACHER_CODE",
    });
  });
});
