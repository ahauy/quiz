import type {
  ExamAction,
  ExamAssignment,
  ExamCreateRequest,
  ExamListQuery,
  ExamQuestionSnapshot,
  Page,
  StudentExamListItem,
  StudentExamListQuery,
  StudentExamMetadata,
  TeacherExamDetail,
  TeacherExamListItem,
  TeacherExamWriteRequest,
} from "@quiz/shared";
import { z } from "zod";
import { ApiError, apiRequest, type ApiResponseProjection } from "@/lib/api-client.js";
import {
  examActionSchema,
  examAssignmentSchema,
  examCreateRequestSchema,
  examQuestionSnapshotSchema,
  examListQuerySchema,
  pageSchema,
  studentExamListItemSchema,
  studentExamListQuerySchema,
  studentExamMetadataSchema,
  teacherExamDetailSchema,
  teacherExamListItemSchema,
  teacherExamWriteRequestSchema,
  uuidSchema,
} from "./schemas.js";

export type ExamApiResponse<T> = ApiResponseProjection<T>;
export type ExamEntityTag = string & { readonly __examEntityTag: unique symbol };
export type ExamWriteOutcome = "rejected" | "unknown";

function assertExamId(value: string): string {
  if (!uuidSchema.safeParse(value).success) throw new TypeError("Exam id must be a UUID");
  return value;
}

export function strongExamETag(value: string): ExamEntityTag {
  if (!/^"[^"\r\n,]+"$/.test(value)) throw new TypeError("Expected one strong Exam ETag");
  return value as ExamEntityTag;
}

export function readExamETag(headers: Headers, childResource = false): ExamEntityTag | null {
  const value = headers.get(childResource ? "X-Exam-ETag" : "ETag");
  if (value === null) return null;
  try {
    return strongExamETag(value);
  } catch {
    return null;
  }
}

export function classifyExamWriteOutcome(error: unknown, dispatched = true): ExamWriteOutcome {
  if (error instanceof z.ZodError) return "rejected";
  if (error instanceof TypeError) return dispatched ? "unknown" : "rejected";
  if (!(error instanceof ApiError)) return "unknown";
  if (error.source === "invalid-success" || error.status === 408) return "unknown";
  if (error.status >= 500 && !(error.status === 503 && error.body.code === "EXAM_WRITE_BUSY")) {
    return "unknown";
  }
  return "rejected";
}

function queryString(state: string | undefined, cursor: string | undefined, pageSize: number | undefined): string {
  const params = new URLSearchParams();
  if (state !== undefined) params.set("state", state);
  if (cursor !== undefined) params.set("cursor", cursor);
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  const serialized = params.toString();
  return serialized.length === 0 ? "" : `?${serialized}`;
}

function requestPath(id: string): string {
  return encodeURIComponent(assertExamId(id));
}

function pageOf<T>(items: z.ZodType<T>) {
  return pageSchema(items);
}

export function listTeacherExams(query: ExamListQuery = {}): Promise<ExamApiResponse<Page<TeacherExamListItem>>> {
  const input = examListQuerySchema.parse(query);
  return apiRequest(`/teacher/exams${queryString(input.state, input.cursor, input.pageSize)}`, {
    schema: pageOf(teacherExamListItemSchema),
    includeResponse: true,
  });
}

export function createTeacherExam(input: ExamCreateRequest): Promise<ExamApiResponse<TeacherExamDetail>> {
  const body = examCreateRequestSchema.parse(input);
  return apiRequest("/teacher/exams", {
    method: "POST",
    body,
    schema: teacherExamDetailSchema,
    includeResponse: true,
  });
}

export function getTeacherExam(id: string): Promise<ExamApiResponse<TeacherExamDetail>> {
  return apiRequest(`/teacher/exams/${requestPath(id)}`, {
    schema: teacherExamDetailSchema,
    includeResponse: true,
  });
}

export function patchTeacherExam(
  id: string,
  ifMatch: ExamEntityTag,
  input: TeacherExamWriteRequest,
): Promise<ExamApiResponse<TeacherExamDetail>> {
  const body = teacherExamWriteRequestSchema.parse(input);
  return apiRequest(`/teacher/exams/${requestPath(id)}`, {
    method: "PATCH",
    body,
    headers: { "If-Match": strongExamETag(ifMatch) },
    schema: teacherExamDetailSchema,
    includeResponse: true,
  });
}

export function deleteTeacherExam(id: string, ifMatch: ExamEntityTag): Promise<{ ok: true }> {
  return apiRequest(`/teacher/exams/${requestPath(id)}`, {
    method: "DELETE",
    headers: { "If-Match": strongExamETag(ifMatch) },
    schema: z.object({ ok: z.literal(true) }).strict(),
  });
}

export function listExamQuestions(
  id: string,
  query: { cursor?: string; pageSize?: number } = {},
): Promise<ExamApiResponse<Page<ExamQuestionSnapshot>>> {
  const parsed = examListQuerySchema.pick({ cursor: true, pageSize: true }).strict().parse(query);
  return apiRequest(`/teacher/exams/${requestPath(id)}/questions${queryString(undefined, parsed.cursor, parsed.pageSize)}`, {
    schema: pageOf(examQuestionSnapshotSchema),
    includeResponse: true,
  });
}

export function listExamAssignments(
  id: string,
  query: { cursor?: string; pageSize?: number } = {},
): Promise<ExamApiResponse<Page<ExamAssignment>>> {
  const parsed = examListQuerySchema.pick({ cursor: true, pageSize: true }).strict().parse(query);
  return apiRequest(`/teacher/exams/${requestPath(id)}/assignments${queryString(undefined, parsed.cursor, parsed.pageSize)}`, {
    schema: pageOf(examAssignmentSchema),
    includeResponse: true,
  });
}

export function listExamHistory(
  id: string,
  query: { cursor?: string; pageSize?: number } = {},
): Promise<ExamApiResponse<Page<ExamAction>>> {
  const parsed = examListQuerySchema.pick({ cursor: true, pageSize: true }).strict().parse(query);
  return apiRequest(`/teacher/exams/${requestPath(id)}/history${queryString(undefined, parsed.cursor, parsed.pageSize)}`, {
    schema: pageOf(examActionSchema),
    includeResponse: true,
  });
}

export function listStudentExams(query: StudentExamListQuery = {}): Promise<ExamApiResponse<Page<StudentExamListItem>>> {
  const input = studentExamListQuerySchema.parse(query);
  return apiRequest(`/student/exams${queryString(input.state, input.cursor, input.pageSize)}`, {
    schema: pageOf(studentExamListItemSchema),
    includeResponse: true,
  });
}

export function getStudentExam(id: string): Promise<ExamApiResponse<StudentExamMetadata>> {
  return apiRequest(`/student/exams/${requestPath(id)}`, {
    schema: studentExamMetadataSchema,
    includeResponse: true,
  });
}
