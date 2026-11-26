import { Injectable } from "@nestjs/common";
import type { ClassroomDto, EnrollmentDto, OkDto } from "@quiz/shared";
import { EnrollmentStatus, Role } from "@quiz/shared";
import type { ClassroomRecord, CurrentUser, EnrollmentRecord } from "./classroom.types.js";
import type { CreateClassroomDto } from "./dto/index.js";
import { classroomError } from "./errors.js";
import { ClassCodeGenerator } from "./ports.js";
import { ClassroomRepository } from "./repositories/classroom.repository.js";

const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class ClassroomService {
  constructor(
    private readonly repo: ClassroomRepository,
    private readonly codes: ClassCodeGenerator,
  ) {}

  async create(user: CurrentUser, dto: CreateClassroomDto): Promise<ClassroomDto> {
    if (user.role !== Role.TEACHER) {
      throw classroomError("FORBIDDEN", "Only teachers can create classrooms");
    }
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.codes.generate();
      try {
        const created = await this.repo.createClassroom({
          name: dto.name,
          teacherId: user.id,
          code,
        });
        return this.toClassroomDto(created);
      } catch (error) {
        if (!this.isPrismaError(error, "P2002")) throw error;
      }
    }
    throw new Error("Unable to generate a unique class code");
  }

  async list(user: CurrentUser): Promise<ClassroomDto[]> {
    const records =
      user.role === Role.TEACHER
        ? await this.repo.listTeacherClassrooms(user.id)
        : await this.repo.listStudentClassrooms(user.id);
    return records.map((record) => this.toClassroomDto(record));
  }

  async listEnrollments(user: CurrentUser, classroomId: string): Promise<EnrollmentDto[]> {
    const classroom = await this.requireOwnedClassroom(user, classroomId);
    const records = await this.repo.listEnrollments(classroom.id);
    return records.map((record) => this.toEnrollmentDto(record));
  }

  async removeClassroom(user: CurrentUser, classroomId: string): Promise<OkDto> {
    const classroom = await this.requireOwnedClassroom(user, classroomId);
    await this.repo.deleteClassroom(classroom.id);
    return { ok: true };
  }

  async join(user: CurrentUser, code: string): Promise<EnrollmentDto> {
    if (user.role !== Role.STUDENT) {
      throw classroomError("FORBIDDEN", "Only students can join classrooms");
    }
    const classroom = await this.repo.findClassroomByCode(code);
    if (classroom === null) {
      throw classroomError("CLASS_CODE_NOT_FOUND", "Class code not found");
    }
    const existing = await this.repo.findEnrollment(classroom.id, user.id);
    if (existing !== null) return this.toEnrollmentDto(existing);
    let created: EnrollmentRecord;
    try {
      created = await this.repo.createEnrollment({
        classroomId: classroom.id,
        userId: user.id,
      });
    } catch (error) {
      // Two concurrent joins can both pass the read above; treat the loser as idempotent.
      if (!this.isPrismaError(error, "P2002")) throw error;
      const raced = await this.repo.findEnrollment(classroom.id, user.id);
      if (raced === null) throw error;
      return this.toEnrollmentDto(raced);
    }
    return this.toEnrollmentDto(created);
  }

  async approve(user: CurrentUser, classroomId: string, userId: string): Promise<EnrollmentDto> {
    await this.requireOwnedClassroom(user, classroomId);
    const enrollment = await this.repo.findEnrollment(classroomId, userId);
    if (enrollment === null) {
      throw classroomError("ENROLLMENT_NOT_FOUND", "Enrollment not found");
    }
    if (enrollment.status === EnrollmentStatus.APPROVED) {
      return this.toEnrollmentDto(enrollment);
    }
    try {
      const approved = await this.repo.approveEnrollment(classroomId, userId);
      return this.toEnrollmentDto(approved);
    } catch (error) {
      if (this.isPrismaError(error, "P2025")) {
        throw classroomError("ENROLLMENT_NOT_FOUND", "Enrollment not found");
      }
      throw error;
    }
  }

  async removeEnrollment(user: CurrentUser, classroomId: string, userId: string): Promise<OkDto> {
    await this.requireOwnedClassroom(user, classroomId);
    const enrollment = await this.repo.findEnrollment(classroomId, userId);
    if (enrollment === null) {
      throw classroomError("ENROLLMENT_NOT_FOUND", "Enrollment not found");
    }
    try {
      await this.repo.removeEnrollment(classroomId, userId);
    } catch (error) {
      if (this.isPrismaError(error, "P2025")) {
        throw classroomError("ENROLLMENT_NOT_FOUND", "Enrollment not found");
      }
      throw error;
    }
    return { ok: true };
  }

  private async requireOwnedClassroom(
    user: CurrentUser,
    classroomId: string,
  ): Promise<ClassroomRecord> {
    const classroom = await this.repo.findClassroomById(classroomId);
    if (classroom === null) {
      throw classroomError("CLASSROOM_NOT_FOUND", "Classroom not found");
    }
    if (classroom.teacherId !== user.id) {
      throw classroomError("FORBIDDEN", "Classroom belongs to another teacher");
    }
    return classroom;
  }

  private isPrismaError(error: unknown, code: "P2002" | "P2025"): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) return false;
    return (error as { code?: unknown }).code === code;
  }

  private toClassroomDto(record: ClassroomRecord): ClassroomDto {
    return {
      id: record.id,
      name: record.name,
      code: record.code,
      teacherId: record.teacherId,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private toEnrollmentDto(record: EnrollmentRecord): EnrollmentDto {
    return {
      id: record.id,
      classroomId: record.classroomId,
      userId: record.userId,
      displayName: record.displayName,
      email: record.email,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      ...(record.approvedAt !== null
        ? { approvedAt: record.approvedAt.toISOString() }
        : {}),
    };
  }
}
