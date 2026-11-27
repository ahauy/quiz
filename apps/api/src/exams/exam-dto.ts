import type { ExamCreateRequest, ExamListQuery, TeacherExamWriteRequest } from "@quiz/shared";
import { examError } from "./exam-errors.js";
import { isUuid } from "./exam-rules.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function validation(field: string, reason: string): never {
  throw examError("VALIDATION_ERROR", "Invalid exam request", [{ field, reason }]);
}
function uuid(value: unknown, field: string): string {
  if (!isUuid(value)) validation(field, "UUID");
  return value;
}

function requireTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) validation("title", "REQUIRED");
  if (value.includes("\0") || /[\uD800-\uDFFF]/u.test(value) && [...value].some((c) => c.length === 1 && /[\uD800-\uDFFF]/.test(c))) validation("title", "TEXT");
}

export function parseCreateRequest(value: unknown): ExamCreateRequest {
  if (!record(value) || !exactKeys(value, ["id", "title", "mutationId"])) validation("body", "SHAPE");
  const id = uuid(value.id, "id");
  const mutationId = uuid(value.mutationId, "mutationId");
  requireTitle(value.title);
  return { id, mutationId, title: value.title };
}

const WRITE_KEYS: Record<string, readonly string[]> = {
  saveSettings: ["op", "mutationId", "settings"],
  addQuestion: ["op", "mutationId", "sourceQuestionId"],
  removeQuestion: ["op", "mutationId", "snapshotId"],
  moveQuestion: ["op", "mutationId", "snapshotId", "beforeSnapshotId"],
  refreshQuestion: ["op", "mutationId", "snapshotId"],
  updateAssignments: ["op", "mutationId", "addClassroomIds", "removeClassroomIds"],
  publish: ["op", "mutationId"],
  withdraw: ["op", "mutationId"],
  closeEarly: ["op", "mutationId"],
};

export function parseWriteRequest(value: unknown): TeacherExamWriteRequest {
  if (!record(value) || typeof value.op !== "string" || !Object.hasOwn(WRITE_KEYS, value.op)) validation("body", "SHAPE");
  const allowed = WRITE_KEYS[value.op];
  if (!allowed || !exactKeys(value, allowed)) validation("body", "SHAPE");
  uuid(value.mutationId, "mutationId");
  switch (value.op) {
    case "saveSettings": validateSettings(value.settings); break;
    case "addQuestion": uuid(value.sourceQuestionId, "sourceQuestionId"); break;
    case "removeQuestion": case "refreshQuestion": uuid(value.snapshotId, "snapshotId"); break;
    case "moveQuestion":
      uuid(value.snapshotId, "snapshotId");
      if (value.beforeSnapshotId !== null) uuid(value.beforeSnapshotId, "beforeSnapshotId");
      break;
    case "updateAssignments":
      validateUuidSet(value.addClassroomIds, "addClassroomIds");
      validateUuidSet(value.removeClassroomIds, "removeClassroomIds");
      if ((value.addClassroomIds as string[]).some((id) => (value.removeClassroomIds as string[]).includes(id))) validation("classroomIds", "DISJOINT");
      break;
  }
  return value as unknown as TeacherExamWriteRequest;
}

function validateUuidSet(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => !isUuid(item)) || new Set(value).size !== value.length) {
    validation(field, "UUID_SET");
  }
}

function validateSettings(value: unknown): void {
  const allowed = ["title", "durationMinutes", "maxAttempts", "allowAnswerReview", "opensAt", "closesAt", "password"];
  if (!record(value) || !exactKeys(value, allowed)) validation("settings", "SHAPE");
  if ("title" in value) requireTitle(value.title);
  for (const field of ["durationMinutes", "maxAttempts"] as const) {
    if (field in value && value[field] !== null && (typeof value[field] !== "string" || !/^[1-9][0-9]*$/.test(value[field]))) validation(field, "POSITIVE_INTEGER");
  }
  if ("allowAnswerReview" in value && value.allowAnswerReview !== null && typeof value.allowAnswerReview !== "boolean") validation("allowAnswerReview", "BOOLEAN");
  for (const field of ["opensAt", "closesAt"] as const) {
    if (field in value && value[field] !== null && typeof value[field] !== "string") validation(field, "INSTANT");
  }
  if ("password" in value) {
    const password = value.password;
    if (record(password) && ((password.mode === "set" && exactKeys(password, ["mode", "value"]) && typeof password.value === "string" && password.value.length > 0) ||
        (password.mode === "disable" && exactKeys(password, ["mode"])))) return;
    validation("password", "PASSWORD_INSTRUCTION");
  }
}

export function parseListQuery(value: Record<string, unknown>): ExamListQuery {
  if (!exactKeys(value, ["state", "cursor", "pageSize"])) validation("query", "SHAPE");
  let state: ExamListQuery["state"];
  if (value.state !== undefined) {
    if (typeof value.state !== "string" || !["DRAFT", "SCHEDULED", "OPEN", "CLOSED"].includes(value.state)) validation("state", "ENUM");
    state = value.state as ExamListQuery["state"];
  }
  let pageSize: number | undefined;
  if (value.pageSize !== undefined) {
    if (typeof value.pageSize !== "string" || !/^[1-9][0-9]*$/.test(value.pageSize)) validation("pageSize", "INTEGER");
    pageSize = Number(value.pageSize);
    if (pageSize < 1 || pageSize > 100) validation("pageSize", "RANGE");
  }
  if (value.cursor !== undefined && (typeof value.cursor !== "string" || value.cursor.length === 0)) validation("cursor", "STRING");
  return { ...(state ? { state } : {}), ...(value.cursor !== undefined ? { cursor: value.cursor as string } : {}), ...(pageSize ? { pageSize } : {}) };
}
