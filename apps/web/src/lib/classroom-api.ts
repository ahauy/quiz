import type { CreateClassroomDto } from "@quiz/shared";
import { apiRequest } from "./api-client.js";
import {
  classroomSchema,
  enrollmentSchema,
  okSchema,
  type Classroom,
  type Enrollment,
  type Ok,
} from "./schemas.js";

// Typed wrappers over the classroom API contract (contract.md §API endpoints, unprefixed paths).

const classroomListSchema = classroomSchema.array();
const enrollmentListSchema = enrollmentSchema.array();

export function createClassroom(input: CreateClassroomDto): Promise<Classroom> {
  return apiRequest("/classrooms", { method: "POST", body: input, schema: classroomSchema });
}

export function getClassrooms(): Promise<Classroom[]> {
  return apiRequest("/classrooms", { schema: classroomListSchema });
}

export function getClassroomEnrollments(classroomId: string): Promise<Enrollment[]> {
  return apiRequest(`/classrooms/${encodeURIComponent(classroomId)}/enrollments`, {
    schema: enrollmentListSchema,
  });
}

export function deleteClassroom(classroomId: string): Promise<Ok> {
  return apiRequest(`/classrooms/${encodeURIComponent(classroomId)}`, {
    method: "DELETE",
    schema: okSchema,
  });
}

export function joinClassroom(code: string): Promise<Enrollment> {
  return apiRequest(`/classrooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    schema: enrollmentSchema,
  });
}

export function approveEnrollment(classroomId: string, userId: string): Promise<Enrollment> {
  return apiRequest(
    `/classrooms/${encodeURIComponent(classroomId)}/enrollments/${encodeURIComponent(userId)}/approve`,
    { method: "PATCH", schema: enrollmentSchema },
  );
}

export function removeEnrollment(classroomId: string, userId: string): Promise<Ok> {
  return apiRequest(
    `/classrooms/${encodeURIComponent(classroomId)}/enrollments/${encodeURIComponent(userId)}`,
    { method: "DELETE", schema: okSchema },
  );
}
