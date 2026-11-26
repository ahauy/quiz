import type { Role } from "@quiz/shared";
import { timingSafeEqualBuf } from "./crypto.util.js";
import { authError } from "../errors.js";
import { ROLE } from "./role-value.js";

export function resolveRole(
  requestedRole: Role | undefined,
  teacherCode: string | undefined,
  expectedCode: string,
): Role {
  const claimsTeacher = requestedRole === ROLE.TEACHER || teacherCode !== undefined;
  if (!claimsTeacher) return ROLE.STUDENT;
  const matches = timingSafeEqualBuf(
    Buffer.from(teacherCode ?? "", "utf8"),
    Buffer.from(expectedCode, "utf8"),
  );
  if (matches) return ROLE.TEACHER;
  throw authError("INVALID_TEACHER_CODE", "Invalid or missing teacher code");
}
