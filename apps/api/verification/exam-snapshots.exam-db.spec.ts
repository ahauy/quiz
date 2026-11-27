import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ROLE } from "../src/auth/utils/role-value.js";
import type { CurrentUser } from "../src/questions/questions.types.js";
import { ExamsService } from "../src/exams/exams.service.js";
import { PrismaExamRepository } from "../src/exams/prisma-exam.repository.js";
import { createExamVerificationClient } from "./exam-verification-db.js";

describe("ordered detached exam snapshots on PostgreSQL 16", () => {
  let prisma: PrismaClient;
  let service: ExamsService;
  const teacherId = "00000000-0000-4000-8000-000000000eb1";
  const subjectId = "00000000-0000-4000-8000-000000000eb2";
  const chapterId = "00000000-0000-4000-8000-000000000eb3";
  const examId = "00000000-0000-4000-8000-000000000eb4";
  const user: CurrentUser = { id: teacherId, role: ROLE.TEACHER };
  const questionIds = ["00000000-0000-4000-8000-000000000eb5", "00000000-0000-4000-8000-000000000eb6", "00000000-0000-4000-8000-000000000eb7", "00000000-0000-4000-8000-000000000ec1", "00000000-0000-4000-8000-000000000ec2"];
  const mutationIds = ["00000000-0000-4000-8000-000000000eb8", "00000000-0000-4000-8000-000000000eb9", "00000000-0000-4000-8000-000000000eba", "00000000-0000-4000-8000-000000000ebb", "00000000-0000-4000-8000-000000000ebc", "00000000-0000-4000-8000-000000000ebd", "00000000-0000-4000-8000-000000000ebe", "00000000-0000-4000-8000-000000000ebf", "00000000-0000-4000-8000-000000000ec6", "00000000-0000-4000-8000-000000000ec7"];
  async function clean(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "ExamActionHistory" WHERE "examId" IN (SELECT "id" FROM "Exam" WHERE "teacherId" = ${teacherId})`;
    await prisma.exam.deleteMany({ where: { teacherId } });
    await prisma.question.deleteMany({ where: { teacherId } });
    await prisma.chapter.deleteMany({ where: { id: chapterId } });
    await prisma.subject.deleteMany({ where: { id: subjectId } });
  }
  async function seedQuestion(id: string, type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "FILL_BLANK" | "MATCHING" = "TRUE_FALSE"): Promise<void> {
    await prisma.question.create({ data: {
      id, teacherId, type, content: `<p>original ${id}</p><img src="/uploads/kept.png">`, difficulty: "MEDIUM",
      explanation: "source explanation", subjectId, chapterId,
      trueFalseAnswer: type === "TRUE_FALSE" ? true : null,
      ...(["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(type) ? { options: { create: [
        { text: "first", isCorrect: false, position: 0 },
        { text: "second", isCorrect: true, position: 1 },
      ] } } : {}),
      ...(type === "FILL_BLANK" ? { fillAnswers: { create: [{ text: " Blue  sky ", normalized: "blue sky", position: 0 }] } } : {}),
      ...(type === "MATCHING" ? { pairs: { create: [{ leftText: "Hot", leftNormalized: "hot", rightText: "Cold", rightNormalized: "cold", position: 0 }] } } : {}),
    } });
  }
  async function begin(): Promise<string> {
    const created = await service.create(user, { id: examId, title: "Snapshot exam", mutationId: mutationIds[0] });
    return created.etag;
  }
  beforeAll(async () => {
    prisma = await createExamVerificationClient();
    service = new ExamsService(new PrismaExamRepository(prisma as never));
    await prisma.user.create({ data: { id: teacherId, email: "exam-snapshot-owner@example.test", displayName: "Snapshot Owner", role: "TEACHER" } }).catch(() => undefined);
  });
  beforeEach(async () => {
    await clean();
    await prisma.subject.create({ data: { id: subjectId, teacherId, name: "Algebra", nameKey: "algebra" } });
    await prisma.chapter.create({ data: { id: chapterId, subjectId, name: "Linear", nameKey: "linear" } });
  });
  afterAll(async () => {
    if (!prisma) return;
    await clean();
    await prisma.user.deleteMany({ where: { id: teacherId } });
    await prisma.$disconnect();
  });

  it("captures all five variant data from one owned source read and preserves images and normalized keys", async () => {
    const sourceId = questionIds[0]!;
    await seedQuestion(sourceId, "SINGLE_CHOICE");
    const etag = await begin();
    const added = await service.write(user, examId, etag, { op: "addQuestion", mutationId: mutationIds[1], sourceQuestionId: sourceId });
    const result = await service.snapshots(user, examId);
    expect(result.page.items[0]?.question).toMatchObject({
      type: "SINGLE_CHOICE", content: expect.stringContaining("/uploads/kept.png"),
      subjectName: "Algebra", chapterName: "Linear", options: [{ text: "first" }, { text: "second" }],
    });
    expect(result.page.items[0]?.question).toHaveProperty("correctOptionId");
    const stored = await prisma.examQuestionSnapshot.findFirstOrThrow({ where: { examId } });
    expect(stored.payload).toMatchObject({ version: 1, internal: { correctOptionIds: expect.any(Array) } });
    expect(added.detail.questionCount).toBe("1");
  });

  it("keeps the detached source image and captured content after source edits and deletion", async () => {
    const sourceId = questionIds[0]!;
    await seedQuestion(sourceId);
    let result = await service.create(user, { id: examId, title: "Snapshot exam", mutationId: mutationIds[0] });
    result = await service.write(user, examId, result.etag, { op: "addQuestion", mutationId: mutationIds[1], sourceQuestionId: sourceId });
    await prisma.question.update({ where: { id: sourceId }, data: { content: "<p>changed</p>" } });
    expect((await service.snapshots(user, examId)).page.items[0]?.question.content).toContain("original");
    await prisma.question.delete({ where: { id: sourceId } });
    const snapshotId = (await service.snapshots(user, examId)).page.items[0]!.id;
    await expect(service.write(user, examId, result.etag, { op: "refreshQuestion", mutationId: mutationIds[2], snapshotId })).rejects.toMatchObject({ code: "SOURCE_QUESTION_NOT_FOUND" });
    expect((await service.snapshots(user, examId)).page.items[0]?.question.content).toContain("original");
  });

  it("moves a snapshot by relinking constant rows and removes only the selected node", async () => {
    for (const id of questionIds) await seedQuestion(id);
    let state = await service.create(user, { id: examId, title: "Ordered", mutationId: mutationIds[0] });
    for (let i = 0; i < 3; i += 1) state = await service.write(user, examId, state.etag, { op: "addQuestion", mutationId: mutationIds[i + 1], sourceQuestionId: questionIds[i] });
    const firstView = await service.snapshots(user, examId);
    const [first, second, third] = firstView.page.items;
    const before = await prisma.examQuestionSnapshot.findMany({ where: { examId }, select: { id: true, nextSnapshotId: true } });
    const moved = await service.write(user, examId, state.etag, { op: "moveQuestion", mutationId: mutationIds[4], snapshotId: first!.id, beforeSnapshotId: third!.id });
    const after = await prisma.examQuestionSnapshot.findMany({ where: { examId }, select: { id: true, nextSnapshotId: true } });
    expect(after).toHaveLength(3);
    expect(after.filter((row) => before.find((old) => old.id === row.id)?.nextSnapshotId !== row.nextSnapshotId).length).toBeLessThanOrEqual(3);
    const ordered = await service.snapshots(user, examId);
    expect(ordered.page.items.map((row) => row.sourceQuestionId)).toEqual([questionIds[1], questionIds[0], questionIds[2]]);
    const afterRemove = await service.write(user, examId, moved.etag, { op: "removeQuestion", mutationId: mutationIds[5], snapshotId: second!.id });
    expect(afterRemove.detail.questionCount).toBe("2");
    expect((await service.snapshots(user, examId)).page.items.map((row) => row.sourceQuestionId)).toEqual([questionIds[0], questionIds[2]]);
  });

  it("captures every supported variant with normalized answer keys kept only internally", async () => {
    const types = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "MATCHING"] as const;
    for (let i = 0; i < types.length; i += 1) await seedQuestion(questionIds[i]!, types[i]!);
    let state = await service.create(user, { id: examId, title: "All variants", mutationId: mutationIds[0] });
    for (let i = 0; i < types.length; i += 1) state = await service.write(user, examId, state.etag, { op: "addQuestion", mutationId: mutationIds[i + 1], sourceQuestionId: questionIds[i] });
    const page = await service.snapshots(user, examId);
    expect(page.page.items.map(({ question }) => question.type)).toEqual(types);
    expect(page.page.items[3]?.question).toMatchObject({ type: "FILL_BLANK", acceptedAnswers: [" Blue  sky "] });
    expect(page.page.items[4]?.question).toMatchObject({ type: "MATCHING", pairs: [{ leftText: "Hot", rightText: "Cold" }] });
    const payloads = await prisma.examQuestionSnapshot.findMany({ where: { examId }, orderBy: { id: "asc" }, select: { payload: true } });
    expect(JSON.stringify(payloads)).toContain("blue sky");
    expect(JSON.stringify(payloads)).toContain("leftNormalized");
    expect(JSON.stringify(page.page.items)).not.toContain("leftNormalized");
    expect(JSON.stringify(page.page.items)).not.toContain("acceptedAnswerKeys");
  });

  it("moves and removes near the front of a 10,000-node chain with constant relinking", async () => {
    let state = await service.create(user, { id: examId, title: "Large chain", mutationId: mutationIds[0] });
    await prisma.$executeRaw`
      WITH nodes AS (
        SELECT n,
          '00000000-0000-4000-8000-' || lpad(n::text, 12, '0') AS id,
          '00000000-0000-4000-8000-' || lpad((n + 20000)::text, 12, '0') AS source_id
        FROM generate_series(1, 10000) AS n
      )
      INSERT INTO "ExamQuestionSnapshot" ("id", "examId", "sourceQuestionId", "capturedAt", "payload", "nextSnapshotId")
      SELECT id, ${examId}, source_id, clock_timestamp(), '{"version":1,"question":{"type":"TRUE_FALSE"},"internal":{}}'::jsonb,
        CASE WHEN n < 10000 THEN '00000000-0000-4000-8000-' || lpad((n + 1)::text, 12, '0') ELSE NULL END
      FROM nodes
    `;
    await prisma.exam.update({ where: { id: examId }, data: {
      snapshotHeadId: "00000000-0000-4000-8000-000000000001",
      snapshotTailId: "00000000-0000-4000-8000-000000010000",
      snapshotCount: 10000n,
    } });
    const firstId = "00000000-0000-4000-8000-000000000001";
    const secondId = "00000000-0000-4000-8000-000000000002";
    const tailId = "00000000-0000-4000-8000-000000010000";
    const pageOne = await service.snapshots(user, examId, { pageSize: "3" });
    expect(pageOne.page.items.map((item) => item.id)).toEqual([
      "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003",
    ]);
    expect(pageOne.page.nextCursor).not.toBeNull();
    const pageTwo = await service.snapshots(user, examId, { pageSize: "3", cursor: pageOne.page.nextCursor! });
    expect(pageTwo.page.items.map((item) => item.id)).toEqual([
      "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006",
    ]);
    const before = await prisma.examQuestionSnapshot.findMany({ where: { examId }, select: { id: true, nextSnapshotId: true } });
    state = await service.write(user, examId, state.etag, { op: "moveQuestion", mutationId: mutationIds[1], snapshotId: firstId, beforeSnapshotId: tailId });
    await expect(service.snapshots(user, examId, { pageSize: "3", cursor: pageOne.page.nextCursor! })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const afterMove = await prisma.examQuestionSnapshot.findMany({ where: { examId }, select: { id: true, nextSnapshotId: true } });
    expect(afterMove.filter((row) => before.find((old) => old.id === row.id)?.nextSnapshotId !== row.nextSnapshotId).length).toBeLessThanOrEqual(3);
    const changedBefore = afterMove.length;
    state = await service.write(user, examId, state.etag, { op: "removeQuestion", mutationId: mutationIds[2], snapshotId: secondId });
    expect(state.detail.questionCount).toBe("9999");
    expect(await prisma.examQuestionSnapshot.count({ where: { examId } })).toBe(changedBefore - 1);
  });

  it("rechecks the canonical ETag when a snapshot changes during the child read", async () => {
    const created = await service.create(user, { id: examId, title: "Concurrent page", mutationId: mutationIds[0] });
    const snapshotId = "00000000-0000-4000-8000-000000000ec3";
    await prisma.examQuestionSnapshot.create({ data: {
      id: snapshotId, examId, sourceQuestionId: questionIds[0]!, capturedAt: new Date(),
      payload: { version: 1, question: { type: "TRUE_FALSE", content: "old" }, internal: {} },
    } });
    await prisma.exam.update({ where: { id: examId }, data: { snapshotHeadId: snapshotId, snapshotTailId: snapshotId, snapshotCount: 1n } });
    let rawCount = 0;
    let pause!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { pause = resolve; });
    const atChildRead = new Promise<void>((resolve) => { entered = resolve; });
    let intercepted = false;
    const client = new Proxy(prisma, {
      get(target, key) {
        if (key === "$queryRaw") return (...args: unknown[]) => {
          rawCount += 1;
          const query = (target.$queryRaw as (...values: unknown[]) => Promise<unknown>).bind(target);
          if (rawCount === 2 && !intercepted) {
            intercepted = true; entered();
            return gate.then(() => query(...args));
          }
          return query(...args);
        };
        const value = Reflect.get(target, key, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const concurrentService = new ExamsService(new PrismaExamRepository(client as never));
    const pending = concurrentService.snapshots(user, examId);
    await atChildRead;
    const newRevision = "00000000-0000-4000-8000-000000000ec4";
    await prisma.$transaction(async (tx) => {
      await tx.examQuestionSnapshot.update({ where: { id: snapshotId }, data: { payload: { version: 1, question: { type: "TRUE_FALSE", content: "new" }, internal: {} } } });
      await tx.exam.update({ where: { id: examId }, data: { revision: newRevision, lastMutationId: mutationIds[1] } });
    });
    pause();
    const page = await pending;
    expect(page.etag).toBe(`"v1-${newRevision}-DRAFT"`);
    expect(page.page.items[0]?.question.content).toBe("new");
    expect(created.etag).not.toBe(page.etag);
  });
});
