import type {
  ClassroomRecord,
  CreateClassroomInput,
  CreateEnrollmentInput,
  EnrollmentRecord,
} from "../classroom.types.js";

export abstract class ClassroomRepository {
  abstract createClassroom(input: CreateClassroomInput): Promise<ClassroomRecord>;
  abstract findClassroomById(id: string): Promise<ClassroomRecord | null>;
  abstract findClassroomByCode(code: string): Promise<ClassroomRecord | null>;
  abstract listTeacherClassrooms(teacherId: string): Promise<ClassroomRecord[]>;
  abstract listStudentClassrooms(userId: string): Promise<ClassroomRecord[]>;
  abstract deleteClassroom(id: string, teacherId: string): Promise<"deleted" | "not-found" | "forbidden" | "published-exam">;

  abstract createEnrollment(input: CreateEnrollmentInput): Promise<EnrollmentRecord>;
  abstract findEnrollment(classroomId: string, userId: string): Promise<EnrollmentRecord | null>;
  abstract listEnrollments(classroomId: string): Promise<EnrollmentRecord[]>;
  abstract approveEnrollment(classroomId: string, userId: string): Promise<EnrollmentRecord>;
  abstract removeEnrollment(classroomId: string, userId: string): Promise<void>;
}
