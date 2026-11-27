import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Exam, Prisma } from "@prisma/client";
import type { ExamAction, ExamAssignment, Page, TeacherExamDetail, TeacherExamListItem, TeacherExamWriteRequest } from "@quiz/shared";
import { ROLE } from "../auth/utils/role-value.js";
import type { CurrentUser } from "../questions/questions.types.js";
import { examError, isPrismaCode } from "./exam-errors.js";
import { ExamException } from "./exam-errors.js";
import { parseCreateRequest, parseListQuery, parseWriteRequest } from "./exam-dto.js";
import { canonicalPositiveInteger, decimalAtMost, effectiveExamStatus, exactMinuteWindow, isUuid, parseExamInstant } from "./exam-rules.js";
import { hashExamPassword } from "./exam-password.js";
import { advanceAndReadExam, isExamReadContention, progressDueExamIds } from "./exam-lifecycle-read.js";
import { PrismaExamRepository } from "./prisma-exam.repository.js";
import { captureOwnedQuestion, snapshotPayload } from "./exam-snapshot-source.js";
import type { ExamQuestionSnapshot } from "@quiz/shared";

const PAGE_SIZE = 25;
const REPRESENTATION_VERSION = "v1";
type ExamState = TeacherExamDetail["state"];
type Cursor = { v: 1; route: "teacher-exams"; createdAt: string; id: string; state: string | null };
interface ExpectedValidator { revision: string; state: ExamState }

@Injectable()
export class ExamsService {
  constructor(private readonly repo: PrismaExamRepository) {}

  async list(user: CurrentUser, rawQuery: Record<string, unknown>): Promise<{ page: Page<TeacherExamListItem>; now: Date }> {
    this.requireTeacher(user);
    const query = parseListQuery(rawQuery);
    const pageSize = query.pageSize ?? PAGE_SIZE;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    if (cursor && cursor.state !== (query.state ?? null)) throw examError("VALIDATION_ERROR", "Cursor does not match this filter", [{ field: "cursor", reason: "FILTER_MISMATCH" }]);
    let result: Array<Exam & { effectiveState: ExamState; serverNow: Date }> = [];
    let now: Date | null = null;
    for (let pass = 0; pass < 3; pass += 1) {
      result = await this.teacherListProjection(user.id, query.state ?? null, cursor, pageSize);
      now = result[0]?.serverNow ?? await this.databaseClock();
      const due = result.filter((row) => row.activePhase && row.activePublicationId && row.activePhase !== row.effectiveState);
      if (!due.length) break;
      if (pass === 2) throw examError("EXAM_READ_BUSY", "Exam read is busy");
      try {
        await progressDueExamIds(this.repo.client, due.map((row) => ({ examId: row.id, activePublicationId: row.activePublicationId!, candidateAt: row.serverNow, isInCurrentScope: async (_tx, current) => current.teacherId === user.id })));
      } catch (error) { if (isExamReadContention(error)) throw examError("EXAM_READ_BUSY", "Exam read is busy"); throw error; }
    }
    const items = result.slice(0, pageSize).map((row) => this.toListItem(row, row.effectiveState));
    const last = result.length > pageSize ? result[pageSize - 1] : undefined;
    return {
      page: { items, nextCursor: last ? this.encodeCursor({ v: 1, route: "teacher-exams", createdAt: last.createdAt.toISOString(), id: last.id, state: query.state ?? null }) : null },
      now: now ?? await this.databaseClock(),
    };
  }

  async create(user: CurrentUser, body: unknown): Promise<{ detail: TeacherExamDetail; etag: string; now: Date }> {
    this.requireTeacher(user);
    const input = parseCreateRequest(body);
    let result: Awaited<ReturnType<PrismaExamRepository["createDraft"]>>;
    try { result = await this.repo.createDraft({ ...input, teacherId: user.id }); }
    catch (error) { if (isPrismaCode(error, "P2002")) throw examError("EXAM_ALREADY_EXISTS", "Exam id is unavailable"); throw error; }
    if (result.kind === "forbidden") throw examError("FORBIDDEN", "Teacher access required");
    if (result.kind === "collision") throw examError("EXAM_ALREADY_EXISTS", "Exam id is unavailable");
    if (result.kind === "existing") throw examError("EXAM_ALREADY_EXISTS", "Exam already exists; read it for review", [{ field: "id", reason: "OWNED_DUPLICATE" }]);
    const now = await this.databaseClock();
    const detail = this.toDetail(result.exam, "DRAFT");
    return { detail, etag: this.etag(result.exam, "DRAFT"), now };
  }

  async get(user: CurrentUser, id: string): Promise<{ detail: TeacherExamDetail; etag: string; now: Date }> {
    this.requireTeacher(user); this.validateId(id);
    const { exam, state, now } = await advanceAndReadExam(this.repo.client, id, user.id);
    return { detail: this.toDetail(exam, state), etag: this.etag(exam, state), now };
  }

  async write(user: CurrentUser, id: string, ifMatch: string | undefined, body: unknown): Promise<{ detail: TeacherExamDetail; etag: string; now: Date }> {
    this.requireTeacher(user); this.validateId(id);
    const expected = this.requireIfMatch(ifMatch);
    const operation = parseWriteRequest(body);
    let hashedPassword: string | undefined;
    if (operation.op === "saveSettings" && operation.settings.password?.mode === "set") {
      const preflight = await this.get(user, id);
      if (this.revisionFromEtag(preflight.etag) !== expected.revision || preflight.detail.state !== expected.state) throw examError("EXAM_VERSION_CONFLICT", "Exam has changed");
      if (preflight.detail.state !== "DRAFT") throw examError("EXAM_INVALID_STATE", "Only a draft can change its password");
      try { hashedPassword = await hashExamPassword(operation.settings.password.value, user.id); }
      catch (error) { if (error instanceof Error && error.message === "EXAM_HASH_BUSY") throw examError("EXAM_HASH_BUSY", "Password hashing is busy", { retryAfterSeconds: 1 }); throw error; }
    }
    try {
      let deferredRejection: ExamException | undefined;
      await this.repo.withWrite(user.id, id, async (tx, exam, now) => {
        const state = exam.activePhase && exam.opensAt && exam.closesAt
          ? effectiveExamStatus(exam.activePhase, exam.opensAt, exam.closesAt, now) : "DRAFT";
        const phase = state === "DRAFT" ? null : state;
        if (exam.activePublicationId && exam.activePhase !== phase) {
          await tx.$executeRaw`UPDATE "Exam" SET "activePhase" = CAST(${phase} AS "ExamPhase") WHERE "id" = ${id}`;
          exam = { ...exam, activePhase: phase };
        }
        if (exam.revision !== expected.revision || state !== expected.state) {
          deferredRejection = examError("EXAM_VERSION_CONFLICT", "Exam has changed"); return;
        }
        if ((operation.op === "withdraw" && state !== "SCHEDULED") || (operation.op === "closeEarly" && state !== "OPEN") ||
            (state !== "DRAFT" && operation.op !== "withdraw" && operation.op !== "closeEarly")) {
          deferredRejection = examError("EXAM_INVALID_STATE", "Exam state does not allow this operation"); return;
        }
        const newRevision = randomUUID();
        const operationRejection = await this.applyOperation(tx, exam, user.id, operation, now, newRevision, hashedPassword);
        if (operationRejection) deferredRejection = operationRejection;
      });
      if (deferredRejection) throw deferredRejection;
    } catch (error) { this.mapRepositoryError(error); }
    return this.get(user, id);
  }

  async remove(user: CurrentUser, id: string, ifMatch: string | undefined): Promise<{ now: Date }> {
    this.requireTeacher(user); this.validateId(id);
    const expected = this.requireIfMatch(ifMatch);
    try {
      let deferredRejection: ExamException | undefined;
      const now = await this.repo.withWrite(user.id, id, async (tx, exam, now) => {
        const state = exam.activePhase && exam.opensAt && exam.closesAt ? effectiveExamStatus(exam.activePhase, exam.opensAt, exam.closesAt, now) : "DRAFT";
        const phase = state === "DRAFT" ? null : state;
        if (exam.activePublicationId && exam.activePhase !== phase) await tx.$executeRaw`UPDATE "Exam" SET "activePhase" = CAST(${phase} AS "ExamPhase") WHERE "id" = ${id}`;
        if (exam.revision !== expected.revision || state !== expected.state) { deferredRejection = examError("EXAM_VERSION_CONFLICT", "Exam has changed"); return now; }
        if (state !== "DRAFT" || exam.firstPublishedAt) { deferredRejection = examError("EXAM_INVALID_STATE", "Only never-published drafts can be deleted"); return now; }
        await tx.exam.delete({ where: { id } });
        return now;
      });
      if (deferredRejection) throw deferredRejection;
      return { now };
    } catch (error) { this.mapRepositoryError(error); }
  }

  async assignments(user: CurrentUser, id: string, rawQuery: Record<string, unknown> = {}, attempt = 0): Promise<{ page: Page<ExamAssignment>; etag: string; now: Date }> {
    const { etag, now } = await this.get(user, id);
    const page = this.childPageParams(rawQuery, this.revisionFromEtag(etag), "assignment");
    const rows = await this.repo.client.currentExamAssignment.findMany({
      where: { examId: id, exam: { teacherId: user.id }, ...(page.key ? { classroomId: { gt: page.key } } : {}) }, include: { classroom: { select: { name: true } } },
      orderBy: { classroomId: "asc" }, take: page.pageSize + 1,
    });
    const items = rows.slice(0, page.pageSize).map((row) => ({ classroomId: row.classroomId, name: row.classroom.name }));
    const last = rows.length > page.pageSize ? rows[page.pageSize - 1] : undefined;
    const confirmed = await this.get(user, id);
    if (confirmed.etag !== etag) {
      if (attempt >= 1) throw examError("EXAM_READ_BUSY", "Exam assignment page changed while reading");
      return this.assignments(user, id, rawQuery, attempt + 1);
    }
    return { page: { items, nextCursor: last ? this.encodeChildCursor({ revision: page.revision, kind: "assignment", key: last.classroomId }) : null }, etag, now };
  }

  async history(user: CurrentUser, id: string, rawQuery: Record<string, unknown> = {}, attempt = 0): Promise<{ page: Page<ExamAction>; etag: string; now: Date }> {
    const { etag, now } = await this.get(user, id);
    const page = this.childPageParams(rawQuery, this.revisionFromEtag(etag), "history");
    const rows = await this.repo.client.examActionHistory.findMany({ where: { examId: id, exam: { teacherId: user.id }, ...(page.key ? { ordinal: { lt: BigInt(page.key) } } : {}) }, orderBy: { ordinal: "desc" }, take: page.pageSize + 1 });
    const items = rows.slice(0, page.pageSize).map((row) => this.toAction(row));
    const last = rows.length > page.pageSize ? rows[page.pageSize - 1] : undefined;
    const confirmed = await this.get(user, id);
    if (confirmed.etag !== etag) {
      if (attempt >= 1) throw examError("EXAM_READ_BUSY", "Exam history page changed while reading");
      return this.history(user, id, rawQuery, attempt + 1);
    }
    return { page: { items, nextCursor: last ? this.encodeChildCursor({ revision: page.revision, kind: "history", key: last.ordinal.toString() }) : null }, etag, now };
  }

  async snapshots(user: CurrentUser, id: string, rawQuery: Record<string, unknown> = {}, attempt = 0): Promise<{ page: Page<import("@quiz/shared").ExamQuestionSnapshot>; etag: string; now: Date }> {
    this.requireTeacher(user); this.validateId(id);
    const { etag, now } = await this.get(user, id);
    const revision = this.revisionFromEtag(etag);
    if (Object.keys(rawQuery).some((key) => key !== "cursor" && key !== "pageSize")) throw examError("VALIDATION_ERROR", "Invalid snapshot query", [{ field: "query", reason: "SHAPE" }]);
    const cursorValue = rawQuery.cursor;
    const pageSizeValue = rawQuery.pageSize;
    if (cursorValue !== undefined && typeof cursorValue !== "string") throw examError("VALIDATION_ERROR", "Invalid snapshot query", [{ field: "cursor", reason: "STRING" }]);
    if (pageSizeValue !== undefined && (typeof pageSizeValue !== "string" || !/^[1-9][0-9]*$/.test(pageSizeValue) || Number(pageSizeValue) > 100)) throw examError("VALIDATION_ERROR", "Invalid snapshot query", [{ field: "pageSize", reason: "RANGE" }]);
    const query = { cursor: cursorValue as string | undefined, pageSize: pageSizeValue === undefined ? PAGE_SIZE : Number(pageSizeValue) };
    const raw = await this.repo.client.exam.findUnique({ where: { id }, select: { snapshotHeadId: true } });
    if (!raw) throw examError("EXAM_NOT_FOUND", "Exam not found");
    const cursor = this.decodeSnapshotCursor(query.cursor, revision);
    if (cursor && !(await this.repo.client.examQuestionSnapshot.findFirst({ where: { id: cursor.snapshotId, examId: id }, select: { id: true } }))) {
      throw examError("VALIDATION_ERROR", "Snapshot cursor is invalid", [{ field: "cursor", reason: "CURSOR" }]);
    }
    const anchorId = cursor?.snapshotId ?? raw.snapshotHeadId;
    const rows = await this.repo.client.$queryRaw<Array<{ id: string; sourceQuestionId: string; capturedAt: Date; payload: unknown; step: number }>>`
      WITH RECURSIVE chain AS (
        SELECT s."id", s."nextSnapshotId", ${cursor ? 0 : 1}::integer AS step
        FROM "ExamQuestionSnapshot" s WHERE s."examId" = ${id} AND s."id" = ${anchorId}
        UNION ALL
        SELECT next."id", next."nextSnapshotId", chain.step + 1
        FROM chain JOIN "ExamQuestionSnapshot" next ON next."examId" = ${id} AND next."id" = chain."nextSnapshotId"
        WHERE chain.step < ${query.pageSize + 1}
      )
      SELECT s."id", s."sourceQuestionId", s."capturedAt", s."payload", chain.step
      FROM chain JOIN "ExamQuestionSnapshot" s ON s."id" = chain."id"
      WHERE chain.step > 0 ORDER BY chain.step LIMIT ${query.pageSize + 1}
    `;
    const items = rows.slice(0, query.pageSize).map((row) => this.snapshotDto(row));
    const last = rows.length > query.pageSize ? rows[query.pageSize - 1] : undefined;
    const confirmed = await this.get(user, id);
    if (confirmed.etag !== etag) {
      if (attempt >= 1) throw examError("EXAM_READ_BUSY", "Exam snapshot page changed while reading");
      return this.snapshots(user, id, rawQuery, attempt + 1);
    }
    return { page: { items, nextCursor: last ? this.encodeSnapshotCursor({ revision, snapshotId: last.id }) : null }, etag, now };
  }

  private async applyOperation(tx: Prisma.TransactionClient, exam: Exam, teacherId: string, op: TeacherExamWriteRequest, now: Date, revision: string, hashedPassword?: string): Promise<ExamException | undefined> {
    switch (op.op) {
      case "saveSettings": await this.saveSettings(tx, exam, op, revision, hashedPassword); return;
      case "updateAssignments": await this.updateAssignments(tx, exam, teacherId, op, now, revision); return;
      case "addQuestion": await this.addQuestion(tx, exam, teacherId, op, now, revision); return;
      case "removeQuestion": await this.removeQuestion(tx, exam, op, revision); return;
      case "moveQuestion": await this.moveQuestion(tx, exam, op, revision); return;
      case "refreshQuestion": await this.refreshQuestion(tx, exam, teacherId, op, now, revision); return;
      case "publish": await this.publish(tx, exam, teacherId, op, now, revision); return;
      case "withdraw": await this.withdraw(tx, exam, teacherId, op, now, revision); return;
      case "closeEarly": return this.closeEarly(tx, exam, op, now, revision);
    }
  }

  private async saveSettings(tx: Prisma.TransactionClient, exam: Exam, op: Extract<TeacherExamWriteRequest, { op: "saveSettings" }>, revision: string, hashedPassword?: string): Promise<void> {
    const s = op.settings;
    const opensAt = s.opensAt === undefined ? exam.opensAt : s.opensAt === null ? null : this.requireInstant(s.opensAt, "opensAt");
    const closesAt = s.closesAt === undefined ? exam.closesAt : s.closesAt === null ? null : this.requireInstant(s.closesAt, "closesAt");
    const title = s.title === undefined ? exam.title : s.title;
    if (title.includes("\0") || /[\uD800-\uDFFF]/u.test(title) && [...title].some((c) => c.length === 1 && /[\uD800-\uDFFF]/.test(c))) throw examError("VALIDATION_ERROR", "Invalid title", [{ field: "title", reason: "TEXT" }]);
    const data: Prisma.ExamUpdateInput = {
      title, durationMinutes: s.durationMinutes === undefined ? exam.durationMinutes : s.durationMinutes,
      maxAttempts: s.maxAttempts === undefined ? exam.maxAttempts : s.maxAttempts,
      allowAnswerReview: s.allowAnswerReview === undefined ? exam.allowAnswerReview : s.allowAnswerReview,
      opensAt, closesAt, revision, lastMutationId: op.mutationId,
    };
    if (s.password?.mode === "disable") data.passwordHash = null;
    if (hashedPassword) data.passwordHash = hashedPassword;
    await tx.exam.update({ where: { id: exam.id }, data });
  }

  private async updateAssignments(tx: Prisma.TransactionClient, exam: Exam, teacherId: string, op: Extract<TeacherExamWriteRequest, { op: "updateAssignments" }>, now: Date, revision: string): Promise<void> {
    const existing = await tx.currentExamAssignment.findMany({ where: { examId: exam.id }, select: { classroomId: true } });
    const current = new Set(existing.map((row) => row.classroomId));
    if (op.removeClassroomIds.some((id) => !current.has(id))) throw examError("VALIDATION_ERROR", "Invalid assignment update", [{ field: "removeClassroomIds", reason: "CLASSROOM_NOT_ASSIGNED" }]);
    const present = await tx.classroom.findMany({ where: { id: { in: op.addClassroomIds } }, select: { id: true, teacherId: true } });
    if (present.length !== op.addClassroomIds.length) throw examError("CLASSROOM_NOT_FOUND", "Classroom not found");
    const owned = present.filter((row) => row.teacherId === teacherId);
    if (owned.length !== op.addClassroomIds.length) throw examError("FORBIDDEN", "One or more classrooms are unavailable");
    for (const classroomId of op.removeClassroomIds) await tx.currentExamAssignment.delete({ where: { examId_classroomId: { examId: exam.id, classroomId } } });
    for (const classroomId of op.addClassroomIds) await tx.currentExamAssignment.create({ data: { examId: exam.id, classroomId } });
    await tx.exam.update({ where: { id: exam.id }, data: { revision, lastMutationId: op.mutationId } });
    if (exam.firstPublishedAt && (op.addClassroomIds.length || op.removeClassroomIds.length)) await this.appendHistory(tx, exam.id, teacherId, revision, now, "ASSIGNMENTS_UPDATED", { addedClassroomIds: op.addClassroomIds, removedClassroomIds: op.removeClassroomIds });
  }

  private async addQuestion(tx: Prisma.TransactionClient, exam: Exam, teacherId: string, op: Extract<TeacherExamWriteRequest, { op: "addQuestion" }>, now: Date, revision: string): Promise<void> {
    const captured = await captureOwnedQuestion(tx, teacherId, op.sourceQuestionId);
    if (await tx.examQuestionSnapshot.findFirst({ where: { examId: exam.id, sourceQuestionId: op.sourceQuestionId }, select: { id: true } })) throw examError("EXAM_DUPLICATE_SOURCE", "Question is already in this exam");
    const id = randomUUID();
    await tx.examQuestionSnapshot.create({ data: { id, examId: exam.id, sourceQuestionId: op.sourceQuestionId, capturedAt: now, payload: snapshotPayload(captured) } });
    if (exam.snapshotTailId) await tx.examQuestionSnapshot.update({ where: { id: exam.snapshotTailId }, data: { nextSnapshotId: id } });
    await tx.exam.update({ where: { id: exam.id }, data: { snapshotHeadId: exam.snapshotHeadId ?? id, snapshotTailId: id, snapshotCount: exam.snapshotCount + 1n, revision, lastMutationId: op.mutationId } });
  }

  private async removeQuestion(tx: Prisma.TransactionClient, exam: Exam, op: Extract<TeacherExamWriteRequest, { op: "removeQuestion" }>, revision: string): Promise<void> {
    const snapshot = await tx.examQuestionSnapshot.findFirst({ where: { id: op.snapshotId, examId: exam.id } });
    if (!snapshot) throw examError("SNAPSHOT_NOT_FOUND", "Snapshot not found");
    const [previous] = await tx.examQuestionSnapshot.findMany({ where: { examId: exam.id, nextSnapshotId: snapshot.id }, take: 1 });
    if (previous) await tx.examQuestionSnapshot.update({ where: { id: previous.id }, data: { nextSnapshotId: snapshot.nextSnapshotId } });
    await tx.examQuestionSnapshot.delete({ where: { id: snapshot.id } });
    await tx.exam.update({ where: { id: exam.id }, data: { snapshotHeadId: exam.snapshotHeadId === snapshot.id ? snapshot.nextSnapshotId : exam.snapshotHeadId, snapshotTailId: exam.snapshotTailId === snapshot.id ? previous?.id ?? null : exam.snapshotTailId, snapshotCount: exam.snapshotCount - 1n, revision, lastMutationId: op.mutationId } });
  }

  private async moveQuestion(tx: Prisma.TransactionClient, exam: Exam, op: Extract<TeacherExamWriteRequest, { op: "moveQuestion" }>, revision: string): Promise<void> {
    const snapshot = await tx.examQuestionSnapshot.findFirst({ where: { id: op.snapshotId, examId: exam.id } });
    if (!snapshot) throw examError("SNAPSHOT_NOT_FOUND", "Snapshot not found");
    const target = op.beforeSnapshotId ? await tx.examQuestionSnapshot.findFirst({ where: { id: op.beforeSnapshotId, examId: exam.id } }) : null;
    if (op.beforeSnapshotId && !target) throw examError("VALIDATION_ERROR", "Move target is unavailable", [{ field: "beforeSnapshotId", reason: "NOT_IN_EXAM" }]);
    if (snapshot.id === target?.id || snapshot.nextSnapshotId === target?.id || (!target && exam.snapshotTailId === snapshot.id)) {
      await tx.exam.update({ where: { id: exam.id }, data: { revision, lastMutationId: op.mutationId } }); return;
    }
    const [oldPrevious] = await tx.examQuestionSnapshot.findMany({ where: { examId: exam.id, nextSnapshotId: snapshot.id }, take: 1 });
    if (oldPrevious) await tx.examQuestionSnapshot.update({ where: { id: oldPrevious.id }, data: { nextSnapshotId: snapshot.nextSnapshotId } });
    let headId = exam.snapshotHeadId === snapshot.id ? snapshot.nextSnapshotId : exam.snapshotHeadId;
    let tailId = exam.snapshotTailId === snapshot.id ? oldPrevious?.id ?? null : exam.snapshotTailId;
    const previous = target ? await tx.examQuestionSnapshot.findFirst({ where: { examId: exam.id, nextSnapshotId: target.id } }) : null;
    await tx.examQuestionSnapshot.update({ where: { id: snapshot.id }, data: { nextSnapshotId: target?.id ?? null } });
    if (previous) await tx.examQuestionSnapshot.update({ where: { id: previous.id }, data: { nextSnapshotId: snapshot.id } });
    else if (target) headId = snapshot.id;
    else if (tailId) await tx.examQuestionSnapshot.update({ where: { id: tailId }, data: { nextSnapshotId: snapshot.id } });
    else headId = snapshot.id;
    if (!target) tailId = snapshot.id;
    await tx.exam.update({ where: { id: exam.id }, data: { snapshotHeadId: headId, snapshotTailId: tailId, revision, lastMutationId: op.mutationId } });
  }

  private async refreshQuestion(tx: Prisma.TransactionClient, exam: Exam, teacherId: string, op: Extract<TeacherExamWriteRequest, { op: "refreshQuestion" }>, now: Date, revision: string): Promise<void> {
    const snapshot = await tx.examQuestionSnapshot.findFirst({ where: { id: op.snapshotId, examId: exam.id } });
    if (!snapshot) throw examError("SNAPSHOT_NOT_FOUND", "Snapshot not found");
    const captured = await captureOwnedQuestion(tx, teacherId, snapshot.sourceQuestionId);
    await tx.examQuestionSnapshot.update({ where: { id: snapshot.id }, data: { payload: snapshotPayload(captured), capturedAt: now } });
    await tx.exam.update({ where: { id: exam.id }, data: { revision, lastMutationId: op.mutationId } });
  }

  private async publish(tx: Prisma.TransactionClient, exam: Exam, teacherId: string, op: Extract<TeacherExamWriteRequest, { op: "publish" }>, now: Date, revision: string): Promise<void> {
    const classrooms = await tx.currentExamAssignment.findMany({ where: { examId: exam.id }, select: { classroomId: true, classroom: { select: { teacherId: true } } } });
    const { opensAt, closesAt } = exam;
    if (!exam.title.trim()) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "title", reason: "REQUIRED" }]);
    if (exam.snapshotCount < 1n) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "questions", reason: "REQUIRED" }]);
    if (!exam.durationMinutes) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "durationMinutes", reason: "REQUIRED" }]);
    if (!canonicalPositiveInteger(exam.durationMinutes)) throw examError("VALIDATION_ERROR", "Invalid exam duration", [{ field: "durationMinutes", reason: "POSITIVE_INTEGER" }]);
    if (!exam.maxAttempts) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "maxAttempts", reason: "REQUIRED" }]);
    if (!canonicalPositiveInteger(exam.maxAttempts)) throw examError("VALIDATION_ERROR", "Invalid attempt limit", [{ field: "maxAttempts", reason: "POSITIVE_INTEGER" }]);
    if (exam.allowAnswerReview === null) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "allowAnswerReview", reason: "REQUIRED" }]);
    if (!opensAt) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "opensAt", reason: "REQUIRED" }]);
    if (!closesAt) throw examError("VALIDATION_ERROR", "Exam is incomplete", [{ field: "closesAt", reason: "REQUIRED" }]);
    if (closesAt <= opensAt) throw examError("VALIDATION_ERROR", "Closing time must follow opening time", [{ field: "closesAt", reason: "CLOSE_NOT_AFTER_OPEN" }]);
    if (!decimalAtMost(exam.durationMinutes, exactMinuteWindow(opensAt, closesAt))) throw examError("VALIDATION_ERROR", "Schedule is shorter than the exam duration", [{ field: "durationMinutes", reason: "WINDOW_TOO_SHORT" }]);
    if (!classrooms.length || classrooms.some((row) => row.classroom.teacherId !== teacherId)) throw examError("VALIDATION_ERROR", "Assign at least one owned classroom", [{ field: "classroomIds", reason: "REQUIRED" }]);
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!clock) throw examError("EXAM_WRITE_BUSY", "Exam write is busy");
    const publishedAt = clock.now;
    if (opensAt <= publishedAt) throw examError("VALIDATION_ERROR", "Opening time must be in the future", [{ field: "opensAt", reason: "OPEN_NOT_FUTURE" }]);
    const eventId = randomUUID();
    await tx.exam.update({ where: { id: exam.id }, data: { activePublicationId: eventId, activePhase: "SCHEDULED", firstPublishedAt: exam.firstPublishedAt ?? publishedAt, earlyClosedAt: null, revision, lastMutationId: op.mutationId } });
    await this.appendHistory(tx, exam.id, teacherId, revision, publishedAt, "PUBLISHED", { id: eventId, classroomIds: classrooms.map((row) => row.classroomId), opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() }, eventId);
  }

  private async withdraw(tx: Prisma.TransactionClient, exam: Exam, teacherId: string, op: Extract<TeacherExamWriteRequest, { op: "withdraw" }>, now: Date, revision: string): Promise<void> {
    if (exam.activePhase !== "SCHEDULED" || !exam.activePublicationId || !exam.opensAt || now >= exam.opensAt) throw examError("EXAM_INVALID_STATE", "Only a scheduled exam can be withdrawn before opening");
    await tx.exam.update({ where: { id: exam.id }, data: { activePublicationId: null, activePhase: null, revision, lastMutationId: op.mutationId } });
    await this.appendHistory(tx, exam.id, teacherId, revision, now, "WITHDRAWN", { publicationEventId: exam.activePublicationId });
  }

  private async closeEarly(tx: Prisma.TransactionClient, exam: Exam, op: Extract<TeacherExamWriteRequest, { op: "closeEarly" }>, _now: Date, revision: string): Promise<ExamException | undefined> {
    if (exam.activePhase !== "OPEN" || !exam.opensAt || !exam.closesAt) return examError("EXAM_INVALID_STATE", "Only an open exam can be closed early");
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!clock) throw examError("EXAM_WRITE_BUSY", "Exam write is busy");
    if (clock.now >= exam.closesAt) {
      await tx.$executeRaw`UPDATE "Exam" SET "activePhase" = CAST('CLOSED' AS "ExamPhase") WHERE "id" = ${exam.id}`;
      return examError("EXAM_INVALID_STATE", "Exam has already closed");
    }
    const earlyClosedAt = new Date(Math.max(clock.now.getTime(), exam.opensAt.getTime()));
    await tx.exam.update({ where: { id: exam.id }, data: { activePhase: "CLOSED", earlyClosedAt, revision, lastMutationId: op.mutationId } });
  }

  private async appendHistory(tx: Prisma.TransactionClient, examId: string, actorId: string, revision: string, at: Date, action: "PUBLISHED" | "WITHDRAWN" | "ASSIGNMENTS_UPDATED", payload: object, id?: string): Promise<void> {
    const [last] = await tx.$queryRaw<Array<{ ordinal: bigint | null }>>`SELECT MAX("ordinal") AS ordinal FROM "ExamActionHistory" WHERE "examId" = ${examId}`;
    await tx.examActionHistory.create({ data: { ...(id ? { id } : {}), examId, actorId, resultingRevision: revision, actedAt: at, action, ordinal: ((last?.ordinal) ?? 0n) + 1n, payload } });
  }

  private toListItem(exam: Exam, state: ExamState): TeacherExamListItem { return { id: exam.id, title: exam.title, state, questionCount: exam.snapshotCount.toString(), opensAt: exam.opensAt?.toISOString() ?? null, closesAt: exam.closesAt?.toISOString() ?? null }; }
  private async teacherListProjection(teacherId: string, state: string | null, cursor: Cursor | null, pageSize: number): Promise<Array<Exam & { effectiveState: ExamState; serverNow: Date }>> {
    return this.repo.client.$queryRaw<Array<Exam & { effectiveState: ExamState; serverNow: Date }>>`
      WITH sample AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS now)
      SELECT e.*, sample.now AS "serverNow",
        CASE WHEN e."activePublicationId" IS NULL THEN 'DRAFT'
             WHEN e."activePhase" = 'CLOSED' OR e."closesAt" <= sample.now THEN 'CLOSED'
             WHEN e."activePhase" = 'OPEN' OR e."opensAt" <= sample.now THEN 'OPEN'
             ELSE 'SCHEDULED' END AS "effectiveState"
      FROM "Exam" e CROSS JOIN sample
      WHERE e."teacherId" = ${teacherId}
        AND (${state}::text IS NULL OR CASE WHEN e."activePublicationId" IS NULL THEN 'DRAFT'
             WHEN e."activePhase" = 'CLOSED' OR e."closesAt" <= sample.now THEN 'CLOSED'
             WHEN e."activePhase" = 'OPEN' OR e."opensAt" <= sample.now THEN 'OPEN'
             ELSE 'SCHEDULED' END = ${state})
        AND (${cursor?.createdAt ?? null}::timestamptz IS NULL OR
             e."createdAt" < ${cursor?.createdAt ? new Date(cursor.createdAt) : null}::timestamptz OR
             (e."createdAt" = ${cursor?.createdAt ? new Date(cursor.createdAt) : null}::timestamptz AND e."id" < ${cursor?.id ?? null}))
      ORDER BY e."createdAt" DESC, e."id" DESC
      LIMIT ${pageSize + 1}
    `;
  }
  private toDetail(exam: Exam, state: ExamState): TeacherExamDetail { return { ...this.toListItem(exam, state), durationMinutes: exam.durationMinutes, maxAttempts: exam.maxAttempts, allowAnswerReview: exam.allowAnswerReview, passwordRequired: exam.passwordHash !== null, earlyClosedAt: exam.earlyClosedAt?.toISOString() ?? null, everPublished: exam.firstPublishedAt !== null, lastMutationId: exam.lastMutationId }; }
  private toAction(row: { id: string; action: string; actedAt: Date; actorId: string; payload: unknown }): ExamAction {
    const payload = row.payload as Record<string, unknown>;
    if (row.action === "PUBLISHED") return { id: row.id, type: "PUBLISHED", at: row.actedAt.toISOString(), actorId: row.actorId, classroomIds: payload.classroomIds as string[], opensAt: payload.opensAt as string, closesAt: payload.closesAt as string };
    if (row.action === "WITHDRAWN") return { id: row.id, type: "WITHDRAWN", at: row.actedAt.toISOString(), actorId: row.actorId, publicationEventId: payload.publicationEventId as string };
    return { id: row.id, type: "ASSIGNMENTS_UPDATED", at: row.actedAt.toISOString(), actorId: row.actorId, addedClassroomIds: payload.addedClassroomIds as string[], removedClassroomIds: payload.removedClassroomIds as string[] };
  }
  private etag(exam: Exam, state: ExamState): string { return `"${REPRESENTATION_VERSION}-${exam.revision}-${state}"`; }
  private requireIfMatch(value: string | undefined): ExpectedValidator {
    if (value === undefined) throw examError("EXAM_VERSION_REQUIRED", "If-Match is required");
    const match = /^"v1-([0-9a-f-]{36})-(DRAFT|SCHEDULED|OPEN|CLOSED)"$/.exec(value);
    if (!match || !isUuid(match[1])) throw examError("VALIDATION_ERROR", "Invalid If-Match", [{ field: "If-Match", reason: "STRONG_ETAG" }]);
    return { revision: match[1], state: match[2] as ExamState };
  }
  private validateId(id: string): void { if (!isUuid(id)) throw examError("VALIDATION_ERROR", "Invalid exam id", [{ field: "id", reason: "UUID" }]); }
  private requireTeacher(user: CurrentUser): void { if (user.role !== ROLE.TEACHER) throw examError("FORBIDDEN", "Teacher access required"); }
  private requireInstant(value: string, field: string): Date { const parsed = parseExamInstant(value); if (!parsed) throw examError("VALIDATION_ERROR", "Invalid schedule", [{ field, reason: "INSTANT" }]); return parsed; }
  private async databaseClock(): Promise<Date> { const [clock] = await this.repo.client.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`; if (!clock) throw examError("EXAM_READ_BUSY", "Exam read is busy"); return clock.now; }
  private encodeCursor(cursor: Cursor): string { return Buffer.from(JSON.stringify(cursor)).toString("base64url"); }
  private encodeSnapshotCursor(cursor: { revision: string; snapshotId: string }): string { return Buffer.from(JSON.stringify({ v: 1, route: "teacher-exam-snapshots", ...cursor })).toString("base64url"); }
  private encodeChildCursor(cursor: { revision: string; kind: "assignment" | "history"; key: string }): string { return Buffer.from(JSON.stringify({ v: 1, ...cursor })).toString("base64url"); }
  private childPageParams(raw: Record<string, unknown>, revision: string, kind: "assignment" | "history"): { revision: string; key: string | null; pageSize: number } {
    if (Object.keys(raw).some((key) => key !== "cursor" && key !== "pageSize")) throw examError("VALIDATION_ERROR", "Invalid child query", [{ field: "query", reason: "SHAPE" }]);
    const rawSize = raw.pageSize;
    if (rawSize !== undefined && (typeof rawSize !== "string" || !/^[1-9][0-9]*$/.test(rawSize) || Number(rawSize) > 100)) throw examError("VALIDATION_ERROR", "Invalid child page size", [{ field: "pageSize", reason: "RANGE" }]);
    let key: string | null = null;
    if (raw.cursor !== undefined) {
      if (typeof raw.cursor !== "string") throw examError("VALIDATION_ERROR", "Invalid child cursor", [{ field: "cursor", reason: "CURSOR" }]);
      try {
        const value = JSON.parse(Buffer.from(raw.cursor, "base64url").toString("utf8")) as { v?: unknown; revision?: unknown; kind?: unknown; key?: unknown };
        if (value.v !== 1 || value.revision !== revision || value.kind !== kind || typeof value.key !== "string" || !value.key) throw new Error();
        if (kind === "assignment" && !isUuid(value.key)) throw new Error();
        if (kind === "history" && (!/^[1-9][0-9]*$/.test(value.key) || BigInt(value.key) > 9223372036854775807n)) throw new Error();
        key = value.key;
      } catch { throw examError("VALIDATION_ERROR", "Invalid child cursor", [{ field: "cursor", reason: "CURSOR" }]); }
    }
    return { revision, key, pageSize: rawSize === undefined ? PAGE_SIZE : Number(rawSize) };
  }
  private revisionFromEtag(etag: string): string { const match = /^"v1-([0-9a-f-]{36})-/.exec(etag); if (!match) throw examError("EXAM_READ_BUSY", "Exam read is busy"); return match[1]!; }
  private decodeSnapshotCursor(value: string | undefined, revision: string): { snapshotId: string } | null {
    if (!value) return null;
    try {
      if (Buffer.from(value, "base64url").toString("base64url") !== value) throw new Error();
      const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { v?: unknown; route?: unknown; revision?: unknown; snapshotId?: unknown };
      if (Object.keys(cursor).sort().join(",") !== "revision,route,snapshotId,v" || cursor.v !== 1 || cursor.route !== "teacher-exam-snapshots" || cursor.revision !== revision || !isUuid(cursor.snapshotId)) throw new Error();
      return { snapshotId: cursor.snapshotId };
    } catch { throw examError("VALIDATION_ERROR", "Snapshot page changed or cursor is invalid", [{ field: "cursor", reason: "CURSOR" }]); }
  }
  private snapshotDto(row: { id: string; sourceQuestionId: string; capturedAt: Date; payload: unknown }): ExamQuestionSnapshot {
    const payload = row.payload as { version?: number; question?: unknown };
    if (payload.version !== 1 || !payload.question || typeof payload.question !== "object") throw new Error("Invalid stored exam snapshot payload");
    return { id: row.id, sourceQuestionId: row.sourceQuestionId, capturedAt: row.capturedAt.toISOString(), question: payload.question as ExamQuestionSnapshot["question"] };
  }
  private decodeCursor(value: string): Cursor { try {
    if (Buffer.from(value, "base64url").toString("base64url") !== value) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    const keys = Object.keys(parsed).sort().join(",");
    if (keys !== "createdAt,id,route,state,v" || parsed.v !== 1 || parsed.route !== "teacher-exams" || !isUuid(parsed.id) ||
        typeof parsed.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(parsed.createdAt) ||
        new Date(parsed.createdAt).toISOString() !== parsed.createdAt ||
        !(parsed.state === null || parsed.state === "DRAFT" || parsed.state === "SCHEDULED" || parsed.state === "OPEN" || parsed.state === "CLOSED")) throw new Error();
    return parsed;
  } catch { throw examError("VALIDATION_ERROR", "Invalid exam cursor", [{ field: "cursor", reason: "CURSOR" }]); } }
  private mapRepositoryError(error: unknown): never {
    if (error instanceof Error && error.message === "EXAM_FORBIDDEN") throw examError("FORBIDDEN", "Exam belongs to another teacher");
    if (error instanceof Error && error.message === "EXAM_NOT_FOUND") throw examError("EXAM_NOT_FOUND", "Exam not found");
    if (isPrismaCode(error, "P2028") || isPrismaCode(error, "P2024")) throw examError("EXAM_WRITE_BUSY", "Exam write is busy");
    throw error;
  }
}
