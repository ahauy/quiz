import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Exam } from "@prisma/client";
import type { Page, StudentExamListItem, StudentExamMetadata, StudentExamListQuery } from "@quiz/shared";
import type { CurrentUser } from "../questions/questions.types.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { examError, isPrismaCode } from "./exam-errors.js";
import { isUuid } from "./exam-rules.js";
import { progressDueExamIds } from "./exam-lifecycle-read.js";

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const ROUTE = "student-exams";
type StudentState = StudentExamMetadata["state"];
type Cursor = { v: 1; route: typeof ROUTE; createdAt: string; id: string; state: StudentState | null };

type ProjectionRow = {
  now: Date;
  examId: string;
  activePublicationId: string;
  activePhase: "SCHEDULED" | "OPEN" | "CLOSED";
  effectiveState: StudentState;
  createdAt: Date;
  title: string;
  teacherName: string;
  questionCount: bigint;
  durationMinutes: string;
  opensAt: Date;
  closesAt: Date;
  maxAttempts: string;
  passwordRequired: boolean;
  allowAnswerReview: boolean;
  qualifyingClassroomNames: string[];
};

type DetailRow = ProjectionRow & { exists: boolean };
type PageAttemptRow = Omit<ProjectionRow, "examId"> & { examId: string | null; now: Date | null; sampledAt: Date };

@Injectable()
export class StudentExamProjection {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: CurrentUser, rawQuery: Record<string, unknown>): Promise<{ page: Page<StudentExamListItem>; now: Date }> {
    this.requireStudent(user);
    const query = parseQuery(rawQuery);
    const pageSize = query.pageSize ?? PAGE_SIZE;
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor, query.state ?? null);
    for (let pass = 0; pass < 2; pass += 1) {
      const projection = await this.projectPage(user.id, query, cursor, pageSize);
      const rows = projection.rows;
      const due = rows.filter((row) => row.effectiveState !== row.activePhase);
      if (!due.length) return { page: this.toPage(rows, pageSize, query.state ?? null), now: projection.now };
      if (pass === 1) throw examError("EXAM_READ_BUSY", "Exam read is busy");
      await this.progress(user.id, due);
    }
    throw examError("EXAM_READ_BUSY", "Exam read is busy");
  }

  async detail(user: CurrentUser, id: string): Promise<{ metadata: StudentExamMetadata; now: Date }> {
    this.requireStudent(user);
    if (!isUuid(id)) throw examError("VALIDATION_ERROR", "Invalid exam id", [{ field: "id", reason: "UUID" }]);
    for (let pass = 0; pass < 2; pass += 1) {
      const result = await this.projectDetail(user.id, id);
      if (!result.row) {
        if (result.exists) throw examError("FORBIDDEN", "Exam is outside the student scope");
        throw examError("EXAM_NOT_FOUND", "Exam not found");
      }
      if (result.row.effectiveState === result.row.activePhase) {
        return { metadata: this.toMetadata(result.row), now: result.row.now };
      }
      if (pass === 1) throw examError("EXAM_READ_BUSY", "Exam read is busy");
      await this.progress(user.id, [result.row]);
    }
    throw examError("EXAM_READ_BUSY", "Exam read is busy");
  }

  private async projectPage(userId: string, query: StudentExamListQuery, cursor: Cursor | null, pageSize: number): Promise<{ rows: ProjectionRow[]; now: Date }> {
    const stateFilter = query.state ? Prisma.sql`AND q."effectiveState" = CAST(${query.state} AS "ExamPhase")` : Prisma.empty;
    const cursorFilter = cursor ? Prisma.sql`AND (q."createdAt" < ${new Date(cursor.createdAt)} OR (q."createdAt" = ${new Date(cursor.createdAt)} AND q."examId" < ${cursor.id}))` : Prisma.empty;
    const result = await this.prisma.$queryRaw<PageAttemptRow[]>(Prisma.sql`
      WITH clock AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS sampled_at),
      qualified AS (
        SELECT e."id" AS "examId", e."activePublicationId", e."activePhase",
          CASE WHEN e."activePhase" = 'CLOSED' OR c.sampled_at >= e."closesAt" THEN 'CLOSED'::"ExamPhase"
            WHEN e."activePhase" = 'OPEN' OR c.sampled_at >= e."opensAt" THEN 'OPEN'::"ExamPhase"
            ELSE 'SCHEDULED'::"ExamPhase" END AS "effectiveState",
          e."createdAt", e."title", u."displayName" AS "teacherName", e."snapshotCount" AS "questionCount",
          e."durationMinutes", e."opensAt", e."closesAt", e."maxAttempts", (e."passwordHash" IS NOT NULL) AS "passwordRequired",
          e."allowAnswerReview", c.sampled_at AS "now",
          COALESCE((SELECT array_agg(cl."name" ORDER BY cl."name", cl."id")
            FROM "CurrentExamAssignment" a JOIN "Enrollment" en ON en."classroomId" = a."classroomId"
              AND en."userId" = ${userId} AND en."status" = 'APPROVED'
            JOIN "Classroom" cl ON cl."id" = a."classroomId"
            WHERE a."examId" = e."id"), ARRAY[]::text[]) AS "qualifyingClassroomNames"
        FROM "Exam" e JOIN "User" u ON u."id" = e."teacherId" CROSS JOIN clock c
        WHERE e."activePublicationId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "CurrentExamAssignment" a JOIN "Enrollment" en ON en."classroomId" = a."classroomId"
          WHERE a."examId" = e."id" AND en."userId" = ${userId} AND en."status" = 'APPROVED')
      ), page AS (SELECT q.* FROM qualified q WHERE TRUE ${stateFilter} ${cursorFilter}
        ORDER BY q."createdAt" DESC, q."examId" DESC LIMIT ${pageSize + 1})
      SELECT c.sampled_at AS "sampledAt", page.* FROM clock c LEFT JOIN page ON TRUE
      ORDER BY page."createdAt" DESC NULLS LAST, page."examId" DESC NULLS LAST
    `);
    const rows = result.filter((row): row is PageAttemptRow & { examId: string } => row.examId !== null)
      .map((row) => ({ ...row, now: row.sampledAt } as ProjectionRow));
    if (!result[0]) throw examError("EXAM_READ_BUSY", "Exam read is busy");
    return { rows, now: result[0].sampledAt };
  }

  private async projectDetail(userId: string, examId: string): Promise<{ row: DetailRow | null; exists: boolean }> {
    const rows = await this.prisma.$queryRaw<Array<DetailRow | { exists: boolean; now: Date }>>(Prisma.sql`
      WITH clock AS (SELECT date_trunc('milliseconds', clock_timestamp()) AS sampled_at),
      present AS (SELECT EXISTS (SELECT 1 FROM "Exam" WHERE "id" = ${examId}) AS "exists"),
      qualified AS (
        SELECT e."id" AS "examId", e."activePublicationId", e."activePhase",
          CASE WHEN e."activePhase" = 'CLOSED' OR c.sampled_at >= e."closesAt" THEN 'CLOSED'::"ExamPhase"
            WHEN e."activePhase" = 'OPEN' OR c.sampled_at >= e."opensAt" THEN 'OPEN'::"ExamPhase"
            ELSE 'SCHEDULED'::"ExamPhase" END AS "effectiveState",
          e."createdAt", e."title", u."displayName" AS "teacherName", e."snapshotCount" AS "questionCount",
          e."durationMinutes", e."opensAt", e."closesAt", e."maxAttempts", (e."passwordHash" IS NOT NULL) AS "passwordRequired",
          e."allowAnswerReview", c.sampled_at AS "now",
          COALESCE((SELECT array_agg(cl."name" ORDER BY cl."name", cl."id")
            FROM "CurrentExamAssignment" a JOIN "Enrollment" en ON en."classroomId" = a."classroomId"
              AND en."userId" = ${userId} AND en."status" = 'APPROVED'
            JOIN "Classroom" cl ON cl."id" = a."classroomId"
            WHERE a."examId" = e."id"), ARRAY[]::text[]) AS "qualifyingClassroomNames"
        FROM "Exam" e JOIN "User" u ON u."id" = e."teacherId" CROSS JOIN clock c
        WHERE e."id" = ${examId} AND e."activePublicationId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "CurrentExamAssignment" a JOIN "Enrollment" en ON en."classroomId" = a."classroomId"
          WHERE a."examId" = e."id" AND en."userId" = ${userId} AND en."status" = 'APPROVED')
      )
      SELECT p."exists", c.sampled_at AS "now", q.* FROM present p CROSS JOIN clock c LEFT JOIN qualified q ON TRUE
    `);
    const result = rows[0];
    if (!result) throw examError("EXAM_READ_BUSY", "Exam read is busy");
    return { row: "examId" in result && typeof result.examId === "string" ? result as DetailRow : null, exists: result.exists };
  }

  private async progress(userId: string, rows: readonly ProjectionRow[]): Promise<void> {
    try {
      await progressDueExamIds(this.prisma, rows.map((row) => ({
        examId: row.examId,
        activePublicationId: row.activePublicationId,
        candidateAt: row.now,
        isInCurrentScope: async (tx, exam: Exam) => {
          const [scope] = await tx.$queryRaw<Array<{ allowed: boolean }>>`SELECT EXISTS (
            SELECT 1 FROM "CurrentExamAssignment" a JOIN "Enrollment" en ON en."classroomId" = a."classroomId"
            WHERE a."examId" = ${exam.id} AND en."userId" = ${userId} AND en."status" = 'APPROVED'
          ) AS allowed`;
          return Boolean(scope?.allowed);
        },
      })));
    } catch (error) {
      if (isReadContention(error)) throw examError("EXAM_READ_BUSY", "Exam read is busy");
      throw error;
    }
  }

  private toPage(rows: ProjectionRow[], pageSize: number, state: StudentState | null): Page<StudentExamListItem> {
    const items = rows.slice(0, pageSize).map((row) => ({
      detailPath: `/student/exams/${row.examId}`,
      metadata: this.toMetadata(row),
    }));
    const last = rows.length > pageSize ? rows[pageSize - 1] : undefined;
    return { items, nextCursor: last ? encodeCursor({ v: 1, route: ROUTE, createdAt: last.createdAt.toISOString(), id: last.examId, state }) : null };
  }

  private toMetadata(row: ProjectionRow): StudentExamMetadata {
    return {
      title: row.title,
      teacherName: row.teacherName,
      questionCount: row.questionCount.toString(),
      durationMinutes: row.durationMinutes,
      opensAt: row.opensAt.toISOString(),
      closesAt: row.closesAt.toISOString(),
      state: row.effectiveState,
      maxAttempts: row.maxAttempts,
      passwordRequired: row.passwordRequired,
      allowAnswerReview: row.allowAnswerReview,
      qualifyingClassroomNames: row.qualifyingClassroomNames,
    };
  }

  private requireStudent(user: CurrentUser): void {
    if (user.role !== "STUDENT") throw examError("FORBIDDEN", "Student access required");
  }
}

function parseQuery(value: Record<string, unknown>): StudentExamListQuery {
  if (Object.keys(value).some((key) => !["state", "cursor", "pageSize"].includes(key))) invalidQuery("query", "SHAPE");
  let state: StudentState | undefined;
  if (value.state !== undefined) {
    if (typeof value.state !== "string" || !["SCHEDULED", "OPEN", "CLOSED"].includes(value.state)) invalidQuery("state", "ENUM");
    state = value.state as StudentState;
  }
  let pageSize: number | undefined;
  if (value.pageSize !== undefined) {
    if (typeof value.pageSize !== "string" || !/^[1-9][0-9]*$/.test(value.pageSize)) invalidQuery("pageSize", "INTEGER");
    pageSize = Number(value.pageSize);
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) invalidQuery("pageSize", "RANGE");
  }
  if (value.cursor !== undefined && typeof value.cursor !== "string") invalidQuery("cursor", "STRING");
  return { ...(state ? { state } : {}), ...(typeof value.cursor === "string" ? { cursor: value.cursor } : {}), ...(pageSize ? { pageSize } : {}) };
}

function decodeCursor(value: string, state: StudentState | null): Cursor {
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Partial<Cursor>;
    if (Buffer.from(json, "utf8").toString("base64url") !== value || parsed.v !== 1 || parsed.route !== ROUTE ||
      parsed.state !== state || typeof parsed.createdAt !== "string" || new Date(parsed.createdAt).toISOString() !== parsed.createdAt || !isUuid(parsed.id) ||
      Object.keys(parsed).some((key) => !["v", "route", "createdAt", "id", "state"].includes(key))) invalidQuery("cursor", "INVALID");
    return parsed as Cursor;
  } catch {
    return invalidQuery("cursor", "INVALID");
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function invalidQuery(field: string, reason: string): never {
  throw examError("VALIDATION_ERROR", "Invalid student exam query", [{ field, reason }]);
}

function isReadContention(error: unknown): boolean {
  if (isPrismaCode(error, "P2024") || isPrismaCode(error, "P2028")) return true;
  if (!isPrismaCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  const meta = (error as { meta?: { code?: unknown } }).meta;
  return meta?.code === "55P03";
}
