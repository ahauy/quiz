import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ROLE } from "../src/auth/utils/role-value.js";
import type { CurrentUser } from "../src/questions/questions.types.js";
import { ClassroomService } from "../src/classroom/classroom.service.js";
import type { CurrentUser as ClassroomUser } from "../src/classroom/classroom.types.js";
import { FakeClassCodeGenerator } from "../src/classroom/testing/fakes.js";
import { PrismaClassroomRepository } from "../src/classroom/repositories/prisma-classroom.repository.js";
import { ExamsService } from "../src/exams/exams.service.js";
import { PrismaExamRepository } from "../src/exams/prisma-exam.repository.js";
import { StudentExamProjection } from "../src/exams/student-exam.projection.js";
import { createExamVerificationClient } from "./exam-verification-db.js";

describe("signed exam flows on guarded PostgreSQL 16", () => {
  let prisma: PrismaClient;
  let exams: ExamsService;
  let classrooms: ClassroomService;
  let studentExams: StudentExamProjection;

  const teacherId = "00000000-0000-4000-8000-000000000fa1";
  const otherTeacherId = "00000000-0000-4000-8000-000000000fa2";
  const studentAId = "00000000-0000-4000-8000-000000000fa3";
  const studentBId = "00000000-0000-4000-8000-000000000fa4";
  const classAId = "00000000-0000-4000-8000-000000000fa5";
  const classBId = "00000000-0000-4000-8000-000000000fa6";
  const subjectId = "00000000-0000-4000-8000-000000000fa7";
  const chapterId = "00000000-0000-4000-8000-000000000fa8";
  const examId = "00000000-0000-4000-8000-000000000fa9";
  const removableDraftId = "00000000-0000-4000-8000-000000000faa";
  const questionAId = "00000000-0000-4000-8000-000000000fab";
  const questionBId = "00000000-0000-4000-8000-000000000fac";
  const foreignQuestionId = "00000000-0000-4000-8000-000000000fad";
  const owner: CurrentUser = { id: teacherId, role: ROLE.TEACHER };
  const studentA: CurrentUser = { id: studentAId, role: ROLE.STUDENT };
  const studentB: CurrentUser = { id: studentBId, role: ROLE.STUDENT };
  const classroomOwner: ClassroomUser = { id: teacherId, role: ROLE.TEACHER };

  const mutation = (tail: number) => `00000000-0000-4000-8000-${tail.toString(16).padStart(12, "0")}`;

  async function cleanup(): Promise<void> {
    await prisma.examActionHistory.deleteMany({ where: { examId: { in: [examId, removableDraftId] } } });
    await prisma.exam.deleteMany({ where: { teacherId } });
    await prisma.question.deleteMany({ where: { id: { in: [questionAId, questionBId, foreignQuestionId] } } });
    await prisma.chapter.deleteMany({ where: { id: chapterId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
    await prisma.enrollment.deleteMany({ where: { userId: { in: [studentAId, studentBId] } } });
    await prisma.classroom.deleteMany({ where: { id: { in: [classAId, classBId] } } });
  }

  async function createQuestion(id: string, ownerId: string, content: string): Promise<void> {
    await prisma.question.create({ data: {
      id, teacherId: ownerId, type: "TRUE_FALSE", content, difficulty: "MEDIUM", explanation: "fixture",
      subjectId, chapterId, trueFalseAnswer: true,
    } });
  }

  async function write(exam: string, etag: string, op: Record<string, unknown>, revision: number) {
    return exams.write(owner, exam, etag, { ...op, mutationId: mutation(revision) });
  }

  async function makePublishable(exam: string, initialEtag: string, assignedIds: string[], revision: number) {
    const opensAt = new Date(Date.now() + 3_600_000).toISOString();
    const closesAt = new Date(Date.now() + 7_200_000).toISOString();
    let current = await write(exam, initialEtag, { op: "updateAssignments", addClassroomIds: assignedIds, removeClassroomIds: [] }, revision++);
    current = await write(exam, current.etag, {
      op: "saveSettings", settings: { durationMinutes: "60", maxAttempts: "2", allowAnswerReview: false, opensAt, closesAt },
    }, revision++);
    return { current, opensAt, closesAt, revision };
  }

  beforeAll(async () => {
    prisma = await createExamVerificationClient();
    exams = new ExamsService(new PrismaExamRepository(prisma as never));
    classrooms = new ClassroomService(new PrismaClassroomRepository(prisma as never), new FakeClassCodeGenerator([]));
    studentExams = new StudentExamProjection(prisma as never);
    await prisma.user.createMany({ data: [
      { id: teacherId, email: "signed-flow-owner@example.test", displayName: "Signed Flow Teacher", role: "TEACHER" },
      { id: otherTeacherId, email: "signed-flow-other@example.test", displayName: "Other Teacher", role: "TEACHER" },
      { id: studentAId, email: "signed-flow-a@example.test", displayName: "Student A", role: "STUDENT" },
      { id: studentBId, email: "signed-flow-b@example.test", displayName: "Student B", role: "STUDENT" },
    ], skipDuplicates: true });
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.classroom.createMany({ data: [
      { id: classAId, name: "Current room A", teacherId },
      { id: classBId, name: "Current room B", teacherId },
    ] });
    await prisma.classCode.createMany({ data: [
      { id: "00000000-0000-4000-8000-00000000fc01", classroomId: classAId, code: "SFA001" },
      { id: "00000000-0000-4000-8000-00000000fc02", classroomId: classBId, code: "SFB001" },
    ] });
    await prisma.enrollment.createMany({ data: [
      { classroomId: classAId, userId: studentAId, status: "APPROVED" },
      { classroomId: classBId, userId: studentBId, status: "APPROVED" },
    ] });
    await prisma.subject.create({ data: { id: subjectId, teacherId, name: "Signed subject", nameKey: "signed subject" } });
    await prisma.chapter.create({ data: { id: chapterId, subjectId, name: "Signed chapter", nameKey: "signed chapter" } });
    await createQuestion(questionAId, teacherId, "Captured version A1");
    await createQuestion(questionBId, teacherId, "Re-add question B");
    await createQuestion(foreignQuestionId, otherTeacherId, "Foreign source");
  });

  afterAll(async () => {
    if (!prisma) return;
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [teacherId, otherTeacherId, studentAId, studentBId] } } });
    await prisma.$disconnect();
  });

  it("keeps captured content stable until explicit refresh and preserves it on failed refresh", async () => {
    const created = await exams.create(owner, { id: examId, title: "Snapshot signed flow", mutationId: mutation(1) });
    await expect(exams.write(owner, examId, created.etag, { op: "addQuestion", mutationId: mutation(2), sourceQuestionId: foreignQuestionId }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    let current = await exams.write(owner, examId, created.etag, { op: "addQuestion", mutationId: mutation(3), sourceQuestionId: questionAId });
    await expect(exams.write(owner, examId, created.etag, { op: "saveSettings", mutationId: mutation(31), settings: { title: "stale tab" } }))
      .rejects.toMatchObject({ code: "EXAM_VERSION_CONFLICT" });
    expect((await exams.get(owner, examId)).detail.title).toBe("Snapshot signed flow");
    const first = await exams.snapshots(owner, examId);
    expect(first.page.items).toHaveLength(1);
    const snapshotId = first.page.items[0]!.id;
    expect(first.page.items[0]!.question.content).toBe("Captured version A1");

    await prisma.question.update({ where: { id: questionAId }, data: { content: "Edited source A2" } });
    expect((await exams.snapshots(owner, examId)).page.items[0]!.question.content).toBe("Captured version A1");
    current = await write(examId, current.etag, { op: "refreshQuestion", snapshotId }, 4);
    expect((await exams.snapshots(owner, examId)).page.items[0]!.question.content).toBe("Edited source A2");

    await prisma.question.delete({ where: { id: questionAId } });
    const refreshedPayload = (await prisma.examQuestionSnapshot.findUniqueOrThrow({ where: { id: snapshotId } })).payload;
    await expect(write(examId, current.etag, { op: "refreshQuestion", snapshotId }, 5)).rejects.toMatchObject({ code: "SOURCE_QUESTION_NOT_FOUND" });
    expect((await prisma.examQuestionSnapshot.findUniqueOrThrow({ where: { id: snapshotId } })).payload).toEqual(refreshedPayload);
    expect((await exams.snapshots(owner, examId)).page.items[0]!.question.content).toBe("Edited source A2");

    current = await write(examId, current.etag, { op: "addQuestion", sourceQuestionId: questionBId }, 6);
    const addedB = (await exams.snapshots(owner, examId)).page.items.find((item) => item.sourceQuestionId === questionBId)!;
    await expect(write(examId, current.etag, { op: "addQuestion", sourceQuestionId: questionBId }, 7)).rejects.toMatchObject({ code: "EXAM_DUPLICATE_SOURCE" });
    current = await write(examId, current.etag, { op: "removeQuestion", snapshotId: addedB.id }, 8);
    current = await write(examId, current.etag, { op: "addQuestion", sourceQuestionId: questionBId }, 9);
    expect((await exams.snapshots(owner, examId)).page.items.filter((item) => item.sourceQuestionId === questionBId)).toHaveLength(1);
    await expect(write(examId, current.etag, { op: "addQuestion", sourceQuestionId: questionBId }, 10)).rejects.toMatchObject({ code: "EXAM_DUPLICATE_SOURCE" });
  });

  it("replays publish, withdrawal, reassignment, student scope, deletion guards, and retained history", async () => {
    const draft = await exams.create(owner, { id: examId, title: "Current assignments", mutationId: mutation(20) });
    const snapshotId = "00000000-0000-4000-8000-00000000fbb1";
    await prisma.examQuestionSnapshot.create({ data: {
      id: snapshotId, examId, sourceQuestionId: questionBId, capturedAt: new Date(),
      payload: { version: 1, question: { type: "TRUE_FALSE", content: "Snapshot" }, internal: {} },
    } });
    await prisma.exam.update({ where: { id: examId }, data: { snapshotHeadId: snapshotId, snapshotTailId: snapshotId, snapshotCount: 1n } });
    await prisma.question.update({ where: { id: questionBId }, data: { content: "Edited after selection" } });
    let { current, revision } = await makePublishable(examId, draft.etag, [classAId, classBId], 21);
    expect((await exams.assignments(owner, examId)).page.items.map((assignment) => assignment.classroomId).sort()).toEqual([classAId, classBId].sort());
    const firstPublish = await write(examId, current.etag, { op: "publish" }, revision++);
    expect((await exams.history(owner, examId)).page.items.map((event) => event.type)).toEqual(["PUBLISHED"]);
    const originalPayload = (await prisma.examQuestionSnapshot.findUniqueOrThrow({ where: { id: snapshotId } })).payload;
    expect((originalPayload as { question: { content: string } }).question.content).toBe("Snapshot");

    await expect(classrooms.removeClassroom(classroomOwner, classAId)).rejects.toMatchObject({ code: "CLASSROOM_LINKED_TO_PUBLISHED_EXAM" });
    const withdrawn = await write(examId, firstPublish.etag, { op: "withdraw" }, revision++);
    expect((await exams.history(owner, examId)).page.items.map((event) => event.type)).toEqual(["WITHDRAWN", "PUBLISHED"]);
    expect((await prisma.examQuestionSnapshot.findUniqueOrThrow({ where: { id: snapshotId } })).payload).toEqual(originalPayload);
    expect(withdrawn.detail.state).toBe("DRAFT");
    const historyBeforeDraftDelete = await exams.history(owner, examId);
    const assignmentsBeforeDraftDelete = await prisma.currentExamAssignment.findMany({ where: { examId }, select: { classroomId: true }, orderBy: { classroomId: "asc" } });
    await expect(exams.remove(owner, examId, withdrawn.etag)).rejects.toMatchObject({ code: "EXAM_INVALID_STATE" });
    expect((await exams.history(owner, examId)).page.items).toEqual(historyBeforeDraftDelete.page.items);
    expect(await prisma.currentExamAssignment.findMany({ where: { examId }, select: { classroomId: true }, orderBy: { classroomId: "asc" } })).toEqual(assignmentsBeforeDraftDelete);
    await expect(classrooms.removeClassroom(classroomOwner, classAId)).rejects.toMatchObject({ code: "CLASSROOM_LINKED_TO_PUBLISHED_EXAM" });
    current = await write(examId, withdrawn.etag, { op: "updateAssignments", addClassroomIds: [], removeClassroomIds: [classAId] }, revision++);
    const historyBeforeRepublish = await exams.history(owner, examId);
    expect(historyBeforeRepublish.page.items.map((event) => event.type)).toEqual(["ASSIGNMENTS_UPDATED", "WITHDRAWN", "PUBLISHED"]);

    const republished = await write(examId, current.etag, { op: "publish" }, revision++);
    expect(republished.detail.everPublished).toBe(true);
    await expect(exams.remove(owner, examId, republished.etag)).rejects.toMatchObject({ code: "EXAM_INVALID_STATE" });
    const removable = await exams.create(owner, { id: removableDraftId, title: "Unpublished draft", mutationId: mutation(30) });
    await expect(exams.remove(owner, removableDraftId, removable.etag)).resolves.toEqual({ now: expect.any(Date) });

    await expect(studentExams.detail(studentA, examId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const listA = await studentExams.list(studentA, {});
    expect(listA.page.items.some((item) => item.detailPath === `/student/exams/${examId}`)).toBe(false);
    const listB = await studentExams.list(studentB, {});
    expect(listB.page.items.filter((item) => item.detailPath === `/student/exams/${examId}`)).toHaveLength(1);
    expect((await studentExams.detail(studentB, examId)).metadata.qualifyingClassroomNames).toEqual(["Current room B"]);

    await expect(classrooms.removeClassroom(classroomOwner, classBId)).rejects.toMatchObject({ code: "CLASSROOM_LINKED_TO_PUBLISHED_EXAM" });
    await expect(classrooms.removeClassroom(classroomOwner, classAId)).resolves.toEqual({ ok: true });
    const historyAfterClassDelete = await exams.history(owner, examId);
    expect(historyAfterClassDelete.page.items.map((event) => event.type)).toEqual(["PUBLISHED", "ASSIGNMENTS_UPDATED", "WITHDRAWN", "PUBLISHED"]);
    expect(historyAfterClassDelete.page.items.slice(1)).toEqual(historyBeforeRepublish.page.items);
    expect(await prisma.currentExamAssignment.findMany({ where: { examId }, select: { classroomId: true } })).toEqual([{ classroomId: classBId }]);
  });
});
