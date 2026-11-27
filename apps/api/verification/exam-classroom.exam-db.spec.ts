import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ROLE } from "../src/auth/utils/role-value.js";
import { ClassroomService } from "../src/classroom/classroom.service.js";
import { ClassroomException } from "../src/classroom/errors.js";
import type { CurrentUser } from "../src/classroom/classroom.types.js";
import { FakeClassCodeGenerator } from "../src/classroom/testing/fakes.js";
import { PrismaClassroomRepository } from "../src/classroom/repositories/prisma-classroom.repository.js";
import { ExamsService } from "../src/exams/exams.service.js";
import { PrismaExamRepository } from "../src/exams/prisma-exam.repository.js";
import { createExamVerificationClient } from "./exam-verification-db.js";

describe("classroom deletion with exam assignment locks on PostgreSQL 16", () => {
  let prisma: PrismaClient;
  let classrooms: ClassroomService;
  let exams: ExamsService;
  const teacherId = "00000000-0000-4000-8000-000000000ec1";
  const otherTeacherId = "00000000-0000-4000-8000-000000000ec2";
  const classroomId = "00000000-0000-4000-8000-000000000ec3";
  const foreignClassroomId = "00000000-0000-4000-8000-000000000ec4";
  const secondClassroomId = "00000000-0000-4000-8000-000000000ec9";
  const examId = "00000000-0000-4000-8000-000000000ec5";
  const user: CurrentUser = { id: teacherId, role: ROLE.TEACHER };
  const other: CurrentUser = { id: otherTeacherId, role: ROLE.TEACHER };

  async function cleanup(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "ExamActionHistory" WHERE "examId" IN (SELECT "id" FROM "Exam" WHERE "teacherId" = ${teacherId})`;
    await prisma.exam.deleteMany({ where: { teacherId } });
    await prisma.classroom.deleteMany({ where: { id: { in: [classroomId, foreignClassroomId, secondClassroomId] } } });
  }
  async function seedExam(firstPublishedAt: Date | null): Promise<void> {
    await prisma.exam.create({ data: { id: examId, teacherId, title: "Classroom guard", lastMutationId: "00000000-0000-4000-8000-000000000ec6", firstPublishedAt } });
    await prisma.currentExamAssignment.create({ data: { examId, classroomId } });
  }
  beforeAll(async () => {
    prisma = await createExamVerificationClient();
    classrooms = new ClassroomService(new PrismaClassroomRepository(prisma as never), new FakeClassCodeGenerator([]));
    exams = new ExamsService(new PrismaExamRepository(prisma as never));
    await prisma.user.createMany({ data: [
      { id: teacherId, email: "exam-class-owner@example.test", displayName: "Owner", role: "TEACHER" },
      { id: otherTeacherId, email: "exam-class-other@example.test", displayName: "Other", role: "TEACHER" },
    ], skipDuplicates: true });
  });
  beforeEach(async () => {
    await cleanup();
    await prisma.classroom.createMany({ data: [
      { id: classroomId, name: "Owned", teacherId },
      { id: foreignClassroomId, name: "Foreign", teacherId: otherTeacherId },
      { id: secondClassroomId, name: "Owned second", teacherId },
    ] });
    await prisma.classCode.createMany({ data: [
      { id: "00000000-0000-4000-8000-000000000ec7", classroomId, code: "ECOWN1" },
      { id: "00000000-0000-4000-8000-000000000ec8", classroomId: foreignClassroomId, code: "ECFOR1" },
    ] });
  });
  afterAll(async () => {
    if (!prisma) return;
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [teacherId, otherTeacherId] } } });
    await prisma.$disconnect();
  });

  it("deletes linked never-published drafts, rotates their validators, and preserves the exam", async () => {
    await seedExam(null);
    const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(await classrooms.removeClassroom(user, classroomId)).toEqual({ ok: true });
    const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.revision).not.toBe(before.revision);
    expect(after.lastMutationId).not.toBe(before.lastMutationId);
    expect(await prisma.currentExamAssignment.count({ where: { examId } })).toBe(0);
    expect(await prisma.classroom.count({ where: { id: classroomId } })).toBe(0);
  });

  it("blocks deletion of any still-linked ever-published exam without partial cleanup", async () => {
    await seedExam(new Date("2026-11-27T00:00:00.000Z"));
    const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    await expect(classrooms.removeClassroom(user, classroomId)).rejects.toMatchObject({
      code: "CLASSROOM_LINKED_TO_PUBLISHED_EXAM", getStatus: expect.any(Function),
    });
    const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.revision).toBe(before.revision);
    expect(await prisma.currentExamAssignment.count({ where: { examId, classroomId } })).toBe(1);
    expect(await prisma.classroom.count({ where: { id: classroomId } })).toBe(1);
  });

  it("preserves 404 and 403 classroom distinctions", async () => {
    await expect(classrooms.removeClassroom(user, "00000000-0000-4000-8000-000000000ecf")).rejects.toMatchObject({ code: "CLASSROOM_NOT_FOUND" });
    try { await classrooms.removeClassroom(user, foreignClassroomId); throw new Error("expected forbidden"); }
    catch (error) { expect(error).toBeInstanceOf(ClassroomException); expect((error as ClassroomException).getStatus()).toBe(403); }
  });

  it("serializes concurrent publication and classroom deletion into one valid winner", async () => {
    await prisma.exam.create({ data: {
      id: examId, teacherId, title: "Race", lastMutationId: "00000000-0000-4000-8000-000000000ec6",
      durationMinutes: "60", maxAttempts: "1", allowAnswerReview: false,
      opensAt: new Date(Date.now() + 3_600_000), closesAt: new Date(Date.now() + 7_200_000),
      snapshotHeadId: "00000000-0000-4000-8000-000000000ec9", snapshotTailId: "00000000-0000-4000-8000-000000000ec9", snapshotCount: 1n,
      snapshots: { create: { id: "00000000-0000-4000-8000-000000000ec9", sourceQuestionId: "00000000-0000-4000-8000-000000000eca", capturedAt: new Date(), payload: { version: 1, question: { type: "TRUE_FALSE" }, internal: {} } } },
      assignments: { create: { classroomId } },
    } });
    const current = await exams.get(user, examId);
    const mutationId = "00000000-0000-4000-8000-000000000ecb";
    const results = await Promise.allSettled([
      classrooms.removeClassroom(user, classroomId),
      exams.write(user, examId, current.etag, { op: "publish", mutationId }),
    ]);
    const roomExists = (await prisma.classroom.count({ where: { id: classroomId } })) === 1;
    const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const assignmentExists = (await prisma.currentExamAssignment.count({ where: { examId, classroomId } })) === 1;
    const published = exam.firstPublishedAt !== null;
    if (published) {
      expect(roomExists).toBe(true);
      expect(assignmentExists).toBe(true);
      expect(results[1]?.status).toBe("fulfilled");
      expect(results[0]?.status).toBe("rejected");
    } else {
      expect(roomExists).toBe(false);
      expect(assignmentExists).toBe(false);
      expect(results[0]?.status).toBe("fulfilled");
      expect(results[1]?.status).toBe("rejected");
    }
  });

  it("retries an assignment child page when its canonical exam revision changes", async () => {
    await prisma.exam.create({ data: { id: examId, teacherId, title: "Assignment page", lastMutationId: "00000000-0000-4000-8000-000000000ec6" } });
    await prisma.currentExamAssignment.create({ data: { examId, classroomId } });
    let pause!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { pause = resolve; });
    const atChildRead = new Promise<void>((resolve) => { entered = resolve; });
    let intercepted = false;
    const client = new Proxy(prisma, {
      get(target, key) {
        if (key === "currentExamAssignment") return new Proxy(target.currentExamAssignment, {
          get(delegate, method) {
            if (method === "findMany") return (...args: unknown[]) => {
              const query = (Reflect.get(delegate, method) as (...values: unknown[]) => Promise<unknown>).bind(delegate);
              if (!intercepted) { intercepted = true; entered(); return gate.then(() => query(...args)); }
              return query(...args);
            };
            const value = Reflect.get(delegate, method) as unknown;
            return typeof value === "function" ? value.bind(delegate) : value;
          },
        });
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const concurrentExams = new ExamsService(new PrismaExamRepository(client as never));
    const initial = await concurrentExams.get(user, examId);
    const pending = concurrentExams.assignments(user, examId);
    await atChildRead;
    const newRevision = "00000000-0000-4000-8000-000000000ecc";
    await prisma.$transaction(async (tx) => {
      await tx.currentExamAssignment.delete({ where: { examId_classroomId: { examId, classroomId } } });
      await tx.currentExamAssignment.create({ data: { examId, classroomId: secondClassroomId } });
      await tx.exam.update({ where: { id: examId }, data: { revision: newRevision, lastMutationId: "00000000-0000-4000-8000-000000000ecd" } });
    });
    pause();
    const page = await pending;
    expect(initial.etag).not.toBe(page.etag);
    expect(page.etag).toBe(`"v1-${newRevision}-DRAFT"`);
    expect(page.page.items).toEqual([{ classroomId: secondClassroomId, name: "Owned second" }]);
  });

  it("rolls back assignment links and revision when history insertion fails mid-write", async () => {
    await prisma.exam.create({ data: {
      id: examId, teacherId, title: "History rollback", lastMutationId: "00000000-0000-4000-8000-000000000ec6",
      firstPublishedAt: new Date("2026-11-27T00:00:00.000Z"),
      assignments: { create: { classroomId } },
    } });
    const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const current = await exams.get(user, examId);
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_fail_assignment_history ON "ExamActionHistory"`;
    await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_fail_assignment_history_fn()`;
    try {
      await prisma.$executeRaw`CREATE FUNCTION exam_backend_fail_assignment_history_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced assignment history failure'; END; $$`;
      await prisma.$executeRaw`CREATE TRIGGER exam_backend_fail_assignment_history BEFORE INSERT ON "ExamActionHistory" FOR EACH ROW WHEN (NEW."examId" = '00000000-0000-4000-8000-000000000ec5' AND NEW."action" = 'ASSIGNMENTS_UPDATED') EXECUTE FUNCTION exam_backend_fail_assignment_history_fn()`;
      await expect(exams.write(user, examId, current.etag, {
        op: "updateAssignments", mutationId: "00000000-0000-4000-8000-000000000ece",
        addClassroomIds: [secondClassroomId], removeClassroomIds: [classroomId],
      })).rejects.toThrow();
      expect(await prisma.currentExamAssignment.findMany({ where: { examId }, select: { classroomId: true } })).toEqual([{ classroomId }]);
      const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
      expect(after.revision).toBe(before.revision);
      expect(after.lastMutationId).toBe(before.lastMutationId);
      expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(0);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_fail_assignment_history ON "ExamActionHistory"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_fail_assignment_history_fn()`;
    }
  });
});
