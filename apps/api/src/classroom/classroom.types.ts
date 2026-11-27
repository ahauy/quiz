import type { EnrollmentStatus, Role } from "@quiz/shared";

export interface CurrentUser {
  id: string;
  role: Role;
}

export interface ClassroomRecord {
  id: string;
  name: string;
  teacherId: string;
  code: string;
  createdAt: Date;
}

export interface EnrollmentRecord {
  id: string;
  classroomId: string;
  userId: string;
  displayName: string;
  email: string;
  status: EnrollmentStatus;
  createdAt: Date;
  approvedAt: Date | null;
}

export interface CreateClassroomInput {
  name: string;
  teacherId: string;
  code: string;
}

export interface CreateEnrollmentInput {
  classroomId: string;
  userId: string;
}
