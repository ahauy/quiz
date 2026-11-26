import type { Classroom, ClassCode, Enrollment, User } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { EnrollmentStatus } from "@quiz/shared";
import type {
  ClassroomRecord,
  CreateClassroomInput,
  CreateEnrollmentInput,
  EnrollmentRecord,
} from "../classroom.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ClassroomRepository } from "./classroom.repository.js";

type ClassroomWithCode = Classroom & { code: ClassCode | null };
type EnrollmentWithUser = Enrollment & { user: User };

@Injectable()
export class PrismaClassroomRepository extends ClassroomRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async createClassroom(input: CreateClassroomInput): Promise<ClassroomRecord> {
    const row = await this.prisma.classroom.create({
      data: {
        name: input.name,
        teacherId: input.teacherId,
        code: { create: { code: input.code } },
      },
      include: { code: true },
    });
    return this.toClassroom(row);
  }

  override async findClassroomById(id: string): Promise<ClassroomRecord | null> {
    const row = await this.prisma.classroom.findUnique({ where: { id }, include: { code: true } });
    return row === null ? null : this.toClassroom(row);
  }

  override async findClassroomByCode(code: string): Promise<ClassroomRecord | null> {
    const classCode = await this.prisma.classCode.findUnique({ where: { code } });
    if (classCode === null) return null;
    return this.findClassroomById(classCode.classroomId);
  }

  override async listTeacherClassrooms(teacherId: string): Promise<ClassroomRecord[]> {
    const rows = await this.prisma.classroom.findMany({
      where: { teacherId },
      include: { code: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toClassroom(row));
  }

  override async listStudentClassrooms(userId: string): Promise<ClassroomRecord[]> {
    const rows = await this.prisma.classroom.findMany({
      where: {
        enrollments: { some: { userId, status: EnrollmentStatus.APPROVED } },
      },
      include: { code: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toClassroom(row));
  }

  override async deleteClassroom(id: string): Promise<void> {
    await this.prisma.classroom.delete({ where: { id } });
  }

  override async createEnrollment(input: CreateEnrollmentInput): Promise<EnrollmentRecord> {
    const row = await this.prisma.enrollment.create({
      data: { classroomId: input.classroomId, userId: input.userId },
      include: { user: true },
    });
    return this.toEnrollment(row);
  }

  override async findEnrollment(
    classroomId: string,
    userId: string,
  ): Promise<EnrollmentRecord | null> {
    const row = await this.prisma.enrollment.findUnique({
      where: { classroomId_userId: { classroomId, userId } },
      include: { user: true },
    });
    return row === null ? null : this.toEnrollment(row);
  }

  override async listEnrollments(classroomId: string): Promise<EnrollmentRecord[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { classroomId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => this.toEnrollment(row));
  }

  override async approveEnrollment(
    classroomId: string,
    userId: string,
  ): Promise<EnrollmentRecord> {
    const row = await this.prisma.enrollment.update({
      where: { classroomId_userId: { classroomId, userId } },
      data: { status: EnrollmentStatus.APPROVED, approvedAt: new Date() },
      include: { user: true },
    });
    return this.toEnrollment(row);
  }

  override async removeEnrollment(classroomId: string, userId: string): Promise<void> {
    await this.prisma.enrollment.delete({
      where: { classroomId_userId: { classroomId, userId } },
    });
  }

  private toClassroom(row: ClassroomWithCode): ClassroomRecord {
    if (row.code === null) throw new Error(`Classroom ${row.id} has no class code`);
    return {
      id: row.id,
      name: row.name,
      teacherId: row.teacherId,
      code: row.code.code,
      createdAt: row.createdAt,
    };
  }

  private toEnrollment(row: EnrollmentWithUser): EnrollmentRecord {
    return {
      id: row.id,
      classroomId: row.classroomId,
      userId: row.userId,
      displayName: row.user.displayName,
      email: row.user.email,
      status: row.status,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
    };
  }
}
