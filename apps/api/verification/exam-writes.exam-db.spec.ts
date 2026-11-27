import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ROLE } from "../src/auth/utils/role-value.js";
import type { CurrentUser } from "../src/questions/questions.types.js";
import { ExamsService } from "../src/exams/exams.service.js";
import { PrismaExamRepository } from "../src/exams/prisma-exam.repository.js";
import { ExamException } from "../src/exams/exam-errors.js";
import { progressDueExamIds } from "../src/exams/exam-lifecycle-read.js";
import { createExamVerificationClient } from "./exam-verification-db.js";

describe("teacher exam writes on PostgreSQL 16", () => {
  let prisma: PrismaClient;
  let service: ExamsService;
  const teacherId = "00000000-0000-4000-8000-000000000ea1";
  const otherTeacherId = "00000000-0000-4000-8000-000000000ea2";
  const classroomId = "00000000-0000-4000-8000-000000000ea3";
  const examId = "00000000-0000-4000-8000-000000000ea4";
  const user: CurrentUser = { id: teacherId, role: ROLE.TEACHER };
  const other: CurrentUser = { id: otherTeacherId, role: ROLE.TEACHER };
  const mutation = "00000000-0000-4000-8000-000000000ea5";
  const nextMutation = "00000000-0000-4000-8000-000000000ea6";
  const snap = "00000000-0000-4000-8000-000000000ea7";
  const source = "00000000-0000-4000-8000-000000000ea8";
  const barrierExamId = "00000000-0000-4000-8000-00000000ead1";
  async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    await expect(promise).rejects.toMatchObject({ code });
  }
  async function cleanup(): Promise<void> {
    await prisma.$executeRaw`DELETE FROM "ExamActionHistory" WHERE "examId" IN (SELECT "id" FROM "Exam" WHERE "teacherId" = ${teacherId})`;
    await prisma.exam.deleteMany({ where: { teacherId } });
  }
  beforeAll(async () => {
    prisma = await createExamVerificationClient();
    service = new ExamsService(new PrismaExamRepository(prisma as never));
    await prisma.user.createMany({ data: [
      { id: teacherId, email: "exam-write-owner@example.test", displayName: "Owner", role: "TEACHER" },
      { id: otherTeacherId, email: "exam-write-other@example.test", displayName: "Other", role: "TEACHER" },
    ], skipDuplicates: true });
    await prisma.classroom.createMany({ data: [
      { id: classroomId, name: "Owned room", teacherId },
    ], skipDuplicates: true });
  });
  beforeEach(async () => {
    await cleanup();
  });
  afterAll(async () => {
    if (!prisma) return;
    await cleanup();
    await prisma.classroom.deleteMany({ where: { id: classroomId } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherId, otherTeacherId] } } });
    await prisma.$disconnect();
  });

  it("creates a named draft without configuration defaults and scopes ID reads", async () => {
    const created = await service.create(user, { id: examId, title: "  Algebra  ", mutationId: mutation });
    expect(created.detail).toMatchObject({ title: "  Algebra  ", state: "DRAFT", questionCount: "0", durationMinutes: null, maxAttempts: null, allowAnswerReview: null, passwordRequired: false, everPublished: false });
    expect(created.etag).toContain("DRAFT");
    try {
      await service.create(user, { id: examId, title: "must not replace", mutationId: nextMutation });
      throw new Error("Expected owned duplicate conflict");
    } catch (error) {
      expect((error as ExamException).getResponse()).toMatchObject({ code: "EXAM_ALREADY_EXISTS", details: [{ field: "id", reason: "OWNED_DUPLICATE" }] });
    }
    try {
      await service.create(other, { id: examId, title: "hidden collision", mutationId: nextMutation });
      throw new Error("Expected generic collision");
    } catch (error) {
      expect((error as ExamException).getResponse()).toMatchObject({ code: "EXAM_ALREADY_EXISTS" });
      expect((error as ExamException).getResponse()).not.toHaveProperty("details");
    }
    expect((await service.get(user, examId)).etag).toBe(created.etag);
    await expectCode(service.get(other, examId), "FORBIDDEN");
    await expectCode(service.get(user, "00000000-0000-4000-8000-000000000eaf"), "EXAM_NOT_FOUND");
  });

  it("requires a strong If-Match and rejects malformed or stale revisions", async () => {
    const created = await service.create(user, { id: examId, title: "Exam", mutationId: mutation });
    await expectCode(service.write(user, examId, undefined, { op: "saveSettings", mutationId: nextMutation, settings: {} }), "EXAM_VERSION_REQUIRED");
    await expectCode(service.write(user, examId, "*", { op: "saveSettings", mutationId: nextMutation, settings: {} }), "VALIDATION_ERROR");
    await service.write(user, examId, created.etag, { op: "saveSettings", mutationId: nextMutation, settings: { durationMinutes: "90071992547409931234567890", maxAttempts: "90071992547409931234567890", allowAnswerReview: false } });
    await expectCode(service.write(user, examId, created.etag, { op: "saveSettings", mutationId: "00000000-0000-4000-8000-000000000ea9", settings: {} }), "EXAM_VERSION_CONFLICT");
    const detail = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(detail.durationMinutes).toBe("90071992547409931234567890");
    expect(detail.maxAttempts).toBe("90071992547409931234567890");
    expect(detail.allowAnswerReview).toBe(false);
  });

  it("rejects a stale state suffix even when the mutation revision is unchanged", async () => {
    const created = await service.create(user, { id: examId, title: "State stale", mutationId: mutation });
    const opensAt = new Date(Date.now() - 60_000);
    const closesAt = new Date(Date.now() + 60_000);
    await prisma.exam.update({ where: { id: examId }, data: {
      durationMinutes: "1", maxAttempts: "1", allowAnswerReview: false, opensAt, closesAt,
      activePublicationId: "00000000-0000-4000-8000-000000000ead", activePhase: "OPEN",
    } });
    await expectCode(service.write(user, examId, created.etag, { op: "saveSettings", mutationId: nextMutation, settings: { title: "should not apply" } }), "EXAM_VERSION_CONFLICT");
    expect((await prisma.exam.findUniqueOrThrow({ where: { id: examId } })).title).toBe("State stale");
  });

  it("commits natural open and closed phases before returning stale or invalid write errors", async () => {
    const created = await service.create(user, { id: examId, title: "Natural phase writes", mutationId: mutation });
    const now = new Date();
    const publicationId = "00000000-0000-4000-8000-000000000ead";
    await prisma.exam.update({ where: { id: examId }, data: {
      durationMinutes: "1", maxAttempts: "1", allowAnswerReview: false,
      opensAt: new Date(now.getTime() - 60_000), closesAt: new Date(now.getTime() + 60_000),
      activePublicationId: publicationId, activePhase: "SCHEDULED",
    } });
    const beforeStaleAdvance = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    await expectCode(service.write(user, examId, created.etag, { op: "withdraw", mutationId: nextMutation }), "EXAM_VERSION_CONFLICT");
    let current = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(current.activePhase).toBe("OPEN");
    expect(current.revision).toBe(created.etag.slice(4, 40));
    expect(current.updatedAt).toEqual(beforeStaleAdvance.updatedAt);
    expect(current.lastMutationId).toBe(beforeStaleAdvance.lastMutationId);
    expect(current.title).toBe(beforeStaleAdvance.title);
    expect(current.durationMinutes).toBe(beforeStaleAdvance.durationMinutes);
    expect(current.maxAttempts).toBe(beforeStaleAdvance.maxAttempts);
    expect(current.allowAnswerReview).toBe(beforeStaleAdvance.allowAnswerReview);
    const openEtag = `"v1-${current.revision}-OPEN"`;
    const beforeInvalid = current;
    await expectCode(service.write(user, examId, openEtag, { op: "withdraw", mutationId: nextMutation }), "EXAM_INVALID_STATE");
    current = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(current.activePhase).toBe("OPEN");
    expect(current.updatedAt).toEqual(beforeInvalid.updatedAt);
    expect(current.lastMutationId).toBe(beforeInvalid.lastMutationId);
    expect(current.revision).toBe(beforeInvalid.revision);
    await prisma.exam.update({ where: { id: examId }, data: { closesAt: new Date(Date.now() - 1) } });
    const beforeClosedAdvance = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    await expectCode(service.write(user, examId, openEtag, { op: "closeEarly", mutationId: nextMutation }), "EXAM_VERSION_CONFLICT");
    current = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(current.activePhase).toBe("CLOSED");
    expect(current.revision).toBe(created.etag.slice(4, 40));
    expect(current.updatedAt).toEqual(beforeClosedAdvance.updatedAt);
    expect(current.lastMutationId).toBe(beforeClosedAdvance.lastMutationId);
    expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(0);
  });

  it("preserves author metadata when a stale delete commits only its due phase", async () => {
    const created = await service.create(user, { id: examId, title: "Natural delete phase", mutationId: mutation });
    await prisma.exam.update({ where: { id: examId }, data: {
      durationMinutes: "1", maxAttempts: "1", allowAnswerReview: false,
      opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60_000),
      activePublicationId: "00000000-0000-4000-8000-000000000ead", activePhase: "SCHEDULED",
    } });
    const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    await expectCode(service.remove(user, examId, created.etag), "EXAM_VERSION_CONFLICT");
    const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.activePhase).toBe("OPEN");
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.revision).toBe(before.revision);
    expect(after.lastMutationId).toBe(before.lastMutationId);
    expect(after.title).toBe(before.title);
    expect(after.opensAt).toEqual(before.opensAt);
    expect(after.closesAt).toEqual(before.closesAt);
    expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(0);
  });

  it("publishes false answer review explicitly and records history atomically", async () => {
    await service.create(user, { id: examId, title: "Ready", mutationId: mutation });
    const initial = await service.get(user, examId);
    const opensAt = new Date(Date.now() + 3_600_000).toISOString();
    const closesAt = new Date(Date.now() + 7_200_000).toISOString();
    await prisma.examQuestionSnapshot.create({ data: { id: snap, examId, sourceQuestionId: source, capturedAt: new Date(), payload: { version: 1, question: { type: "TRUE_FALSE" }, internal: {} } } });
    await prisma.exam.update({ where: { id: examId }, data: { snapshotHeadId: snap, snapshotTailId: snap, snapshotCount: 1n } });
    await prisma.currentExamAssignment.create({ data: { examId, classroomId } });
    const configured = await service.write(user, examId, initial.etag, { op: "saveSettings", mutationId: nextMutation, settings: { durationMinutes: "60", maxAttempts: "1", allowAnswerReview: false, opensAt, closesAt } });
    const published = await service.write(user, examId, configured.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-000000000eaa" });
    expect(published.detail.state).toBe("SCHEDULED");
    expect(published.detail.allowAnswerReview).toBe(false);
    expect(published.detail.maxAttempts).toBe("1");
    expect(await prisma.examActionHistory.count({ where: { examId, action: "PUBLISHED" } })).toBe(1);
    const beforeDuplicate = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const historyBeforeDuplicate = await prisma.examActionHistory.count({ where: { examId } });
    try {
      await service.create(user, { id: examId, title: "Recovery request", mutationId: mutation });
      throw new Error("Expected published duplicate conflict");
    } catch (error) {
      expect((error as ExamException).getResponse()).toMatchObject({ code: "EXAM_ALREADY_EXISTS", details: [{ field: "id", reason: "OWNED_DUPLICATE" }] });
    }
    const afterDuplicate = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(afterDuplicate.revision).toBe(beforeDuplicate.revision);
    expect(afterDuplicate.activePhase).toBe("SCHEDULED");
    expect(afterDuplicate.title).toBe("Ready");
    expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(historyBeforeDuplicate);
    await expectCode(service.write(user, examId, published.etag, { op: "saveSettings", mutationId: "00000000-0000-4000-8000-000000000eab", settings: { title: "changed" } }), "EXAM_INVALID_STATE");
  });

  it("reports each missing publication field without changing exam or history", async () => {
    const created = await service.create(user, { id: examId, title: "Required fields", mutationId: mutation });
    const opensAt = new Date(Date.now() + 3_600_000);
    const closesAt = new Date(Date.now() + 7_200_000);
    await prisma.examQuestionSnapshot.create({ data: { id: snap, examId, sourceQuestionId: source, capturedAt: new Date(), payload: { version: 1, question: { type: "TRUE_FALSE" }, internal: {} } } });
    await prisma.exam.update({ where: { id: examId }, data: { snapshotHeadId: snap, snapshotTailId: snap, snapshotCount: 1n } });
    await prisma.currentExamAssignment.create({ data: { examId, classroomId } });
    const configured = await service.write(user, examId, created.etag, { op: "saveSettings", mutationId: nextMutation, settings: { durationMinutes: "60", maxAttempts: "1", allowAnswerReview: false, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() } });
    const required: Array<[string, Record<string, unknown>, unknown]> = [
      ["durationMinutes", { durationMinutes: null }, "60"], ["maxAttempts", { maxAttempts: null }, "1"],
      ["allowAnswerReview", { allowAnswerReview: null }, false], ["opensAt", { opensAt: null }, opensAt], ["closesAt", { closesAt: null }, closesAt],
    ];
    for (const [field, invalid, restore] of required) {
      await prisma.exam.update({ where: { id: examId }, data: invalid as never });
      const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
      const historyBefore = await prisma.examActionHistory.count({ where: { examId } });
      try {
        await service.write(user, examId, configured.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-000000000eae" });
        throw new Error("Expected field-specific publication rejection");
      } catch (error) {
        expect((error as ExamException).getResponse()).toMatchObject({ details: [{ field, reason: "REQUIRED" }] });
      }
      const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
      expect(after.revision).toBe(before.revision);
      expect(after.activePublicationId).toBeNull();
      expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(historyBefore);
      await prisma.exam.update({ where: { id: examId }, data: { [field]: restore } as never });
    }
    await prisma.$executeRaw`ALTER TABLE "Exam" DROP CONSTRAINT "exam_duration_positive_digits", DROP CONSTRAINT "exam_max_attempts_positive_digits"`;
    try {
      for (const [field, invalid, restore] of [["durationMinutes", "01", "60"], ["maxAttempts", "0", "1"]] as const) {
        await prisma.exam.update({ where: { id: examId }, data: { [field]: invalid } as never });
        const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
        try {
          await service.write(user, examId, configured.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-000000000eae" });
          throw new Error("Expected stored-field publication rejection");
        } catch (error) {
          expect((error as ExamException).getResponse()).toMatchObject({ details: [{ field, reason: "POSITIVE_INTEGER" }] });
        }
        const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
        expect(after.revision).toBe(before.revision);
        expect(after.activePublicationId).toBeNull();
        expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(0);
        await prisma.exam.update({ where: { id: examId }, data: { [field]: restore } as never });
      }
    } finally {
      await prisma.exam.update({ where: { id: examId }, data: { durationMinutes: "60", maxAttempts: "1" } });
      await prisma.$executeRaw`ALTER TABLE "Exam" ADD CONSTRAINT "exam_duration_positive_digits" CHECK ("durationMinutes" IS NULL OR ("durationMinutes" ~ '^[1-9][0-9]*$' AND "durationMinutes" !~ '[^0-9]'))`;
      await prisma.$executeRaw`ALTER TABLE "Exam" ADD CONSTRAINT "exam_max_attempts_positive_digits" CHECK ("maxAttempts" IS NULL OR ("maxAttempts" ~ '^[1-9][0-9]*$' AND "maxAttempts" !~ '[^0-9]'))`;
    }
  });

  it("uses publication history IDs as active IDs across withdraw and republish", async () => {
    const created = await service.create(user, { id: examId, title: "History identities", mutationId: mutation });
    const opensAt = new Date(Date.now() + 3_600_000).toISOString();
    const closesAt = new Date(Date.now() + 7_200_000).toISOString();
    await prisma.examQuestionSnapshot.create({ data: { id: snap, examId, sourceQuestionId: source, capturedAt: new Date(), payload: { version: 1, question: { type: "TRUE_FALSE" }, internal: {} } } });
    await prisma.exam.update({ where: { id: examId }, data: { snapshotHeadId: snap, snapshotTailId: snap, snapshotCount: 1n } });
    await prisma.currentExamAssignment.create({ data: { examId, classroomId } });
    const configured = await service.write(user, examId, created.etag, { op: "saveSettings", mutationId: nextMutation, settings: { durationMinutes: "60", maxAttempts: "1", allowAnswerReview: false, opensAt, closesAt } });
    const first = await service.write(user, examId, configured.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-000000000eaf" });
    const firstId = (await prisma.exam.findUniqueOrThrow({ where: { id: examId } })).activePublicationId;
    expect((await prisma.examActionHistory.findFirstOrThrow({ where: { examId, action: "PUBLISHED" } })).id).toBe(firstId);
    const withdrawn = await service.write(user, examId, first.etag, { op: "withdraw", mutationId: "00000000-0000-4000-8000-000000000eb0" });
    const withdrawnAction = await prisma.examActionHistory.findFirstOrThrow({ where: { examId, action: "WITHDRAWN" } });
    expect(withdrawnAction.payload).toMatchObject({ publicationEventId: firstId });
    const second = await service.write(user, examId, withdrawn.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-000000000eb1" });
    const secondId = (await prisma.exam.findUniqueOrThrow({ where: { id: examId } })).activePublicationId;
    expect(secondId).not.toBe(firstId);
    expect((await prisma.examActionHistory.findMany({ where: { examId, action: "PUBLISHED" }, orderBy: { ordinal: "asc" } })).map((event) => event.id)).toEqual([firstId, secondId]);
    expect(second.detail.state).toBe("SCHEDULED");
  });

  it("rolls back the publication marker when history insertion fails", async () => {
    const created = await service.create(user, { id: examId, title: "Atomic publish", mutationId: mutation });
    const opensAt = new Date(Date.now() + 3_600_000).toISOString();
    const closesAt = new Date(Date.now() + 7_200_000).toISOString();
    await prisma.examQuestionSnapshot.create({ data: { id: snap, examId, sourceQuestionId: source, capturedAt: new Date(), payload: { version: 1, question: { type: "TRUE_FALSE" }, internal: {} } } });
    await prisma.exam.update({ where: { id: examId }, data: { snapshotHeadId: snap, snapshotTailId: snap, snapshotCount: 1n } });
    await prisma.currentExamAssignment.create({ data: { examId, classroomId } });
    const configured = await service.write(user, examId, created.etag, { op: "saveSettings", mutationId: nextMutation, settings: { durationMinutes: "60", maxAttempts: "1", allowAnswerReview: false, opensAt, closesAt } });
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_publish_failure ON "ExamActionHistory"`;
    await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_publish_failure_fn()`;
    try {
      await prisma.$executeRaw`CREATE FUNCTION exam_backend_publish_failure_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."action" = 'PUBLISHED' THEN RAISE EXCEPTION 'forced history failure'; END IF; RETURN NEW; END; $$`;
      await prisma.$executeRaw`CREATE TRIGGER exam_backend_publish_failure BEFORE INSERT ON "ExamActionHistory" FOR EACH ROW EXECUTE FUNCTION exam_backend_publish_failure_fn()`;
      await expect(service.write(user, examId, configured.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-000000000eb2" })).rejects.toThrow();
      const unchanged = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
      expect(unchanged.activePublicationId).toBeNull();
      expect(unchanged.revision).toBe(configured.etag.slice(4, 40));
      expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(0);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_publish_failure ON "ExamActionHistory"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_publish_failure_fn()`;
    }
  });

  it("rejects non-canonical integer input without echoing the submitted value", async () => {
    const created = await service.create(user, { id: examId, title: "Exam", mutationId: mutation });
    try {
      await service.write(user, examId, created.etag, { op: "saveSettings", mutationId: nextMutation, settings: { durationMinutes: "1\n" } });
      throw new Error("Expected validation rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ExamException);
      expect((error as ExamException).message).not.toContain("1\\n");
      expect((error as ExamException).getResponse()).toMatchObject({ details: [{ field: "durationMinutes", reason: "POSITIVE_INTEGER" }] });
    }
  });

  it("rejects malformed create and write values without draft or revision effects", async () => {
    await expectCode(service.create(user, { id: examId, title: "bad\0title", mutationId: mutation }).then(() => undefined), "VALIDATION_ERROR");
    const created = await service.create(user, { id: examId, title: "Validated", mutationId: mutation });
    const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const historyBefore = await prisma.examActionHistory.count({ where: { examId } });
    for (const body of [
      { op: "toString", mutationId: nextMutation },
      { op: "saveSettings", mutationId: nextMutation, settings: { password: null } },
      { op: "saveSettings", mutationId: nextMutation, settings: { password: { mode: "set", value: "" } } },
    ]) await expectCode(service.write(user, examId, created.etag, body).then(() => undefined), "VALIDATION_ERROR");
    const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.revision).toBe(before.revision);
    expect(after.lastMutationId).toBe(before.lastMutationId);
    expect(await prisma.examActionHistory.count({ where: { examId } })).toBe(historyBefore);
  });

  it("validates list, history, and assignment cursor boundaries before querying", async () => {
    const created = await service.create(user, { id: examId, title: "Cursor validation", mutationId: mutation });
    await expectCode(service.list(user, { cursor: "" }).then(() => undefined), "VALIDATION_ERROR");
    const malformed = Buffer.from(JSON.stringify({ v: 1, createdAt: "2026", id: examId, state: null })).toString("base64url");
    await expectCode(service.list(user, { cursor: malformed }).then(() => undefined), "VALIDATION_ERROR");
    const overflow = Buffer.from(JSON.stringify({ v: 1, revision: created.etag.slice(4, 40), kind: "history", key: "9223372036854775808" })).toString("base64url");
    await expectCode(service.history(user, examId, { cursor: overflow }).then(() => undefined), "VALIDATION_ERROR");
    await expectCode(service.write(user, examId, created.etag, { op: "updateAssignments", mutationId: nextMutation, addClassroomIds: ["00000000-0000-4000-8000-000000000ecf"], removeClassroomIds: [] }).then(() => undefined), "CLASSROOM_NOT_FOUND");
  });

  it("commits the highest observed phase across a backward clock sample without changing revision or list ordering", async () => {
    const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const opensAt = new Date(clock!.now.getTime() + 60_000);
    const closesAt = new Date(clock!.now.getTime() + 120_000);
    const publicationId = "00000000-0000-4000-8000-000000000eac";
    await prisma.exam.create({ data: {
      id: examId, teacherId, title: "Clock phase", lastMutationId: mutation,
      durationMinutes: "1", maxAttempts: "1", allowAnswerReview: false,
      opensAt, closesAt, activePublicationId: publicationId, activePhase: "SCHEDULED",
    } });
    const before = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    await progressDueExamIds(prisma as never, [{ examId, activePublicationId: publicationId, candidateAt: new Date(opensAt.getTime() + 1_000), isInCurrentScope: async (_tx, exam) => exam.teacherId === teacherId }]);
    const after = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    expect(after.activePhase).toBe("OPEN");
    expect(after.revision).toBe(before.revision);
    expect(after.lastMutationId).toBe(before.lastMutationId);
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("withholds a due teacher read until a withdrawal commits or rolls back", async () => {
    async function installHistoryTrigger(rollback: boolean): Promise<void> {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_withdraw_barrier ON "ExamActionHistory"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_withdraw_barrier_fn()`;
      if (rollback) {
        await prisma.$executeRaw`CREATE FUNCTION exam_backend_withdraw_barrier_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RAISE EXCEPTION 'forced withdrawal rollback'; END; $$`;
      } else {
        await prisma.$executeRaw`CREATE FUNCTION exam_backend_withdraw_barrier_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN NEW; END; $$`;
      }
      await prisma.$executeRaw`CREATE TRIGGER exam_backend_withdraw_barrier BEFORE INSERT ON "ExamActionHistory" FOR EACH ROW WHEN (NEW."examId" = '00000000-0000-4000-8000-00000000ead1' AND NEW."action" = 'WITHDRAWN') EXECUTE FUNCTION exam_backend_withdraw_barrier_fn()`;
    }
    async function waitForTrigger(): Promise<void> {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
          SELECT COUNT(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event = 'PgSleep'
            AND query ILIKE '%ExamActionHistory%'
        `;
        if ((row?.count ?? 0) > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("history trigger did not enter its controlled delay");
    }
    async function createScheduled(): Promise<{ etag: string; opensAt: Date }> {
      const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const opensAt = new Date(clock!.now.getTime() + 1_500);
      const closesAt = new Date(clock!.now.getTime() + 600_000);
      const data = {
        title: "Withdrawal barrier", lastMutationId: mutation,
        durationMinutes: "1", maxAttempts: "1", allowAnswerReview: false,
        opensAt, closesAt, firstPublishedAt: clock!.now,
        activePublicationId: "00000000-0000-4000-8000-000000000ead", activePhase: "SCHEDULED" as const,
      };
      if (await prisma.exam.findUnique({ where: { id: barrierExamId }, select: { id: true } })) {
        await prisma.exam.update({ where: { id: barrierExamId }, data: { ...data, revision: "00000000-0000-4000-8000-00000000ead4" } });
      } else {
        await prisma.exam.create({ data: { id: barrierExamId, teacherId, ...data } });
      }
      return { etag: (await service.get(user, barrierExamId)).etag, opensAt };
    }
    async function waitPastOpen(open: Date): Promise<void> {
      for (;;) {
        const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
        if (clock!.now >= open) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try {
      const committed = await createScheduled();
      await installHistoryTrigger(false);
      const withdrawal = service.write(user, barrierExamId, committed.etag, { op: "withdraw", mutationId: "00000000-0000-4000-8000-00000000ead2" });
      await waitForTrigger();
      await waitPastOpen(committed.opensAt);
      const dueRead = service.get(user, barrierExamId);
      await expect(withdrawal).resolves.toMatchObject({ detail: { state: "DRAFT" } });
      expect((await dueRead).detail.state).toBe("DRAFT");

      await installHistoryTrigger(true);
      const rolledBack = await createScheduled();
      const failedWithdrawal = service.write(user, barrierExamId, rolledBack.etag, { op: "withdraw", mutationId: "00000000-0000-4000-8000-00000000ead3" });
      await waitForTrigger();
      await waitPastOpen(rolledBack.opensAt);
      const readAfterRollback = service.get(user, barrierExamId);
      await expect(failedWithdrawal).rejects.toThrow();
      expect((await readAfterRollback).detail.state).toBe("OPEN");
      expect((await prisma.exam.findUniqueOrThrow({ where: { id: barrierExamId } })).activePublicationId).toBe("00000000-0000-4000-8000-000000000ead");
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_withdraw_barrier ON "ExamActionHistory"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_withdraw_barrier_fn()`;
    }
  });

  it("returns the committed effective phase when the publish response crosses opening", async () => {
    await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_publish_barrier ON "ExamActionHistory"`;
    await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_publish_barrier_fn()`;
    try {
      await prisma.$executeRaw`CREATE FUNCTION exam_backend_publish_barrier_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2); RETURN NEW; END; $$`;
      await prisma.$executeRaw`CREATE TRIGGER exam_backend_publish_barrier BEFORE INSERT ON "ExamActionHistory" FOR EACH ROW WHEN (NEW."examId" = '00000000-0000-4000-8000-00000000ead1' AND NEW."action" = 'PUBLISHED') EXECUTE FUNCTION exam_backend_publish_barrier_fn()`;
      const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const opensAt = new Date(clock!.now.getTime() + 1_000);
      const closesAt = new Date(clock!.now.getTime() + 600_000);
      await prisma.exam.create({ data: {
        id: barrierExamId, teacherId, title: "Delayed publish", lastMutationId: mutation,
        snapshotHeadId: snap, snapshotTailId: snap, snapshotCount: 1n,
        snapshots: { create: { id: snap, sourceQuestionId: source, capturedAt: clock!.now, payload: { version: 1, question: { type: "TRUE_FALSE" }, internal: {} } } },
        assignments: { create: { classroomId } },
      } });
      const created = await service.get(user, barrierExamId);
      const configured = await service.write(user, barrierExamId, created.etag, { op: "saveSettings", mutationId: "00000000-0000-4000-8000-00000000ead5", settings: { durationMinutes: "1", maxAttempts: "1", allowAnswerReview: false, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() } });
      const published = await service.write(user, barrierExamId, configured.etag, { op: "publish", mutationId: "00000000-0000-4000-8000-00000000ead6" });
      expect(published.detail.state).toBe("OPEN");
      expect(published.etag).toContain("-OPEN\"");
      expect(await prisma.examActionHistory.count({ where: { examId: barrierExamId, action: "PUBLISHED" } })).toBe(1);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS exam_backend_publish_barrier ON "ExamActionHistory"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS exam_backend_publish_barrier_fn()`;
    }
  });
});
