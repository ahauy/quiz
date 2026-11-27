import { Injectable } from "@nestjs/common";
import type { Prisma, Exam } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { lockTeacherForExamWrite } from "../prisma/lock-teacher-for-exam-write.js";

@Injectable()
export class PrismaExamRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(input: { id: string; teacherId: string; title: string; mutationId: string }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
      const teacher = await lockTeacherForExamWrite(tx, input.teacherId);
      if (!teacher || teacher.role !== "TEACHER") return { kind: "forbidden" as const };
      const existing = await tx.exam.findUnique({ where: { id: input.id } });
      if (existing) return existing.teacherId === input.teacherId
        ? { kind: "existing" as const, exam: existing }
        : { kind: "collision" as const };
      const exam = await tx.exam.create({ data: {
        id: input.id, teacherId: input.teacherId, title: input.title, lastMutationId: input.mutationId,
      } });
      return { kind: "created" as const, exam };
    }, { maxWait: 2000, timeout: 5000 });
  }

  async withWrite<T>(
    teacherId: string,
    examId: string,
    work: (tx: Prisma.TransactionClient, exam: Exam, now: Date) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
      const teacher = await lockTeacherForExamWrite(tx, teacherId);
      if (!teacher || teacher.role !== "TEACHER") throw new Error("EXAM_FORBIDDEN");
      const rows = await tx.$queryRaw<Array<Exam>>`
        SELECT * FROM "Exam" WHERE "id" = ${examId} AND "teacherId" = ${teacherId} FOR UPDATE
      `;
      if (!rows[0]) {
        const exists = await tx.exam.findUnique({ where: { id: examId }, select: { id: true } });
        throw new Error(exists ? "EXAM_FORBIDDEN" : "EXAM_NOT_FOUND");
      }
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      if (!clock) throw new Error("EXAM_READ_BUSY");
      return work(tx, rows[0], clock.now);
    }, { maxWait: 2000, timeout: 5000 });
  }

  get client(): PrismaService { return this.prisma; }
}
