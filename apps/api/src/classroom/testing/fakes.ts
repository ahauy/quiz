import { randomUUID } from "node:crypto";
import { EnrollmentStatus } from "@quiz/shared";
import type {
  ClassroomRecord,
  CreateClassroomInput,
  CreateEnrollmentInput,
  EnrollmentRecord,
} from "../classroom.types.js";
import { ClassCodeGenerator } from "../ports.js";
import { ClassroomRepository } from "../repositories/classroom.repository.js";

export class FakeClassCodeGenerator extends ClassCodeGenerator {
  private readonly queue: string[];
  readonly calls: string[] = [];

  constructor(codes: string[]) {
    super();
    this.queue = [...codes];
  }

  override generate(): string {
    const next = this.queue.shift();
    if (next === undefined) throw new Error("FakeClassCodeGenerator is exhausted");
    this.calls.push(next);
    return next;
  }
}

interface SeededUser {
  displayName: string;
  email: string;
}

class FakeP2002 extends Error {
  readonly code = "P2002";

  constructor() {
    super("Unique constraint failed on ClassCode.code");
  }
}

export class InMemoryClassroomRepository extends ClassroomRepository {
  private readonly classrooms = new Map<string, ClassroomRecord>();
  private readonly enrollments = new Map<string, EnrollmentRecord>();
  private readonly users = new Map<string, SeededUser>();

  seedUser(user: SeededUser & { id: string }): void {
    this.users.set(user.id, { displayName: user.displayName, email: user.email });
  }

  countEnrollments(): number {
    return this.enrollments.size;
  }

  private key(classroomId: string, userId: string): string {
    return `${classroomId}:${userId}`;
  }

  private requireUser(id: string): SeededUser {
    const user = this.users.get(id);
    if (user === undefined) throw new Error(`Missing user ${id}`);
    return user;
  }

  override async createClassroom(input: CreateClassroomInput): Promise<ClassroomRecord> {
    for (const classroom of this.classrooms.values()) {
      if (classroom.code === input.code) throw new FakeP2002();
    }
    const record: ClassroomRecord = {
      id: randomUUID(),
      name: input.name,
      teacherId: input.teacherId,
      code: input.code,
      createdAt: new Date(),
    };
    this.classrooms.set(record.id, record);
    return { ...record };
  }

  override async findClassroomById(id: string): Promise<ClassroomRecord | null> {
    const record = this.classrooms.get(id);
    return record === undefined ? null : { ...record };
  }

  override async findClassroomByCode(code: string): Promise<ClassroomRecord | null> {
    for (const record of this.classrooms.values()) {
      if (record.code === code) return { ...record };
    }
    return null;
  }

  override async listTeacherClassrooms(teacherId: string): Promise<ClassroomRecord[]> {
    return [...this.classrooms.values()]
      .filter((record) => record.teacherId === teacherId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((record) => ({ ...record }));
  }

  override async listStudentClassrooms(userId: string): Promise<ClassroomRecord[]> {
    const approved = [...this.enrollments.values()].filter(
      (record) => record.userId === userId && record.status === EnrollmentStatus.APPROVED,
    );
    const result: ClassroomRecord[] = [];
    for (const enrollment of approved) {
      const classroom = this.classrooms.get(enrollment.classroomId);
      if (classroom !== undefined) result.push({ ...classroom });
    }
    return result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  override async deleteClassroom(id: string): Promise<void> {
    this.classrooms.delete(id);
    for (const [key, enrollment] of this.enrollments) {
      if (enrollment.classroomId === id) this.enrollments.delete(key);
    }
  }

  override async createEnrollment(input: CreateEnrollmentInput): Promise<EnrollmentRecord> {
    const user = this.requireUser(input.userId);
    const key = this.key(input.classroomId, input.userId);
    if (this.enrollments.has(key)) throw new Error("Enrollment already exists");
    const record: EnrollmentRecord = {
      id: randomUUID(),
      classroomId: input.classroomId,
      userId: input.userId,
      displayName: user.displayName,
      email: user.email,
      status: EnrollmentStatus.PENDING,
      createdAt: new Date(),
      approvedAt: null,
    };
    this.enrollments.set(key, record);
    return { ...record };
  }

  override async findEnrollment(
    classroomId: string,
    userId: string,
  ): Promise<EnrollmentRecord | null> {
    const record = this.enrollments.get(this.key(classroomId, userId));
    return record === undefined ? null : { ...record };
  }

  override async listEnrollments(classroomId: string): Promise<EnrollmentRecord[]> {
    return [...this.enrollments.values()]
      .filter((record) => record.classroomId === classroomId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((record) => ({ ...record }));
  }

  override async approveEnrollment(
    classroomId: string,
    userId: string,
  ): Promise<EnrollmentRecord> {
    const record = this.enrollments.get(this.key(classroomId, userId));
    if (record === undefined) throw new Error("Missing enrollment");
    record.status = EnrollmentStatus.APPROVED;
    record.approvedAt = new Date();
    return { ...record };
  }

  override async removeEnrollment(classroomId: string, userId: string): Promise<void> {
    this.enrollments.delete(this.key(classroomId, userId));
  }
}
