import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  createExamVerificationClient,
  verifiedExamDatabaseUrl,
} from "./exam-verification-db.js";
import { runPreMigrationCompatibilityProof } from "./exam-schema-compatibility.js";

describe("exam verification database guard", () => {
  it("requires the explicit disposable URL and rejects the project DB URL", () => {
    expect(() => verifiedExamDatabaseUrl("")).toThrow(
      "EXAM_VERIFY_DATABASE_URL is required",
    );
    expect(() =>
      verifiedExamDatabaseUrl("postgresql://localhost:5432/quiz"),
    ).toThrow("approved disposable database");
    expect(() =>
      verifiedExamDatabaseUrl(
        "postgresql://exam_verify@127.0.0.1:5432/quiz",
      ),
    ).toThrow("approved disposable database");
  });

  it("accepts only the coordinator-provided disposable target", () => {
    expect(() => verifiedExamDatabaseUrl()).not.toThrow();
  });
});

describe("exam schema on PostgreSQL 16", () => {
  let prisma: PrismaClient;
  const ids = {
    teacher: "00000000-0000-4000-8000-000000000e90",
    exam: "00000000-0000-4000-8000-000000000e91",
    otherExam: "00000000-0000-4000-8000-000000000e92",
    head: "00000000-0000-4000-8000-000000000e93",
    tail: "00000000-0000-4000-8000-000000000e94",
    third: "00000000-0000-4000-8000-000000000e95",
  };

  async function insertExam(
    id: string,
    options: {
      durationMinutes?: string | null;
      maxAttempts?: string | null;
      snapshotCount?: bigint;
      snapshotHeadId?: string | null;
      snapshotTailId?: string | null;
      activePublicationId?: string | null;
      activePhase?: "SCHEDULED" | "OPEN" | "CLOSED" | null;
      opensAt?: Date | null;
      closesAt?: Date | null;
      earlyClosedAt?: Date | null;
    } = {},
  ): Promise<void> {
    const now = new Date("2026-11-27T00:00:00.000Z");
    await prisma.$executeRaw`
      INSERT INTO "Exam" (
        "id", "teacherId", "title", "durationMinutes", "maxAttempts",
        "allowAnswerReview", "opensAt", "closesAt", "activePublicationId",
        "activePhase", "earlyClosedAt", "snapshotHeadId", "snapshotTailId",
        "snapshotCount", "revision", "lastMutationId", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${ids.teacher}, 'Schema verification',
        ${options.durationMinutes ?? "1"}, ${options.maxAttempts ?? "1"},
        true, ${options.opensAt ?? null}, ${options.closesAt ?? null},
        ${options.activePublicationId ?? null}, CAST(${options.activePhase ?? null} AS "ExamPhase"),
        ${options.earlyClosedAt ?? null}, ${options.snapshotHeadId ?? null},
        ${options.snapshotTailId ?? null}, ${options.snapshotCount ?? 0n},
        ${`revision-${id}`}, ${`mutation-${id}`}, ${now}, ${now}
      )
    `;
  }

  async function insertSnapshot(
    id: string,
    examId: string,
    sourceQuestionId: string,
    nextSnapshotId: string | null,
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO "ExamQuestionSnapshot" (
        "id", "examId", "sourceQuestionId", "capturedAt", "payload", "nextSnapshotId"
      ) VALUES (
        ${id}, ${examId}, ${sourceQuestionId}, '2026-11-27T00:00:00Z', '{}'::jsonb, ${nextSnapshotId}
      )
    `;
  }

  beforeAll(async () => {
    prisma = await createExamVerificationClient();
    await prisma.$executeRaw`
      INSERT INTO "User" ("id", "email", "displayName", "role", "createdAt", "updatedAt")
      VALUES (${ids.teacher}, 'exam-schema-test@example.test', 'Schema Test', 'TEACHER', now(), now())
      ON CONFLICT ("id") DO NOTHING
    `;
  });

  beforeEach(async () => {
    await prisma.$executeRaw`DELETE FROM "Exam" WHERE "teacherId" = ${ids.teacher}`;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$executeRaw`DELETE FROM "Exam" WHERE "teacherId" = ${ids.teacher}`;
      await prisma.$executeRaw`DELETE FROM "User" WHERE "id" = ${ids.teacher}`;
      await prisma.$disconnect();
    }
  });

  it("keeps the pre-migration users, classes, enrollments and five question types", async () => {
    const { before, after } = await runPreMigrationCompatibilityProof();
    expect(before).toEqual(after);
    expect(before.users).toHaveLength(2);
    expect(before.questions).toHaveLength(5);
    expect(before.classrooms).toHaveLength(1);
    expect(before.classCodes).toHaveLength(1);
    expect(before.enrollments).toHaveLength(1);
    expect(before.options).toHaveLength(4);
    expect(before.fillBlankAnswers).toHaveLength(1);
    expect(before.matchingPairs).toHaveLength(1);
  });

  it("has additive exam, ordered snapshot, assignment, and append-only action tables", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('Exam', 'ExamQuestionSnapshot', 'CurrentExamAssignment', 'ExamActionHistory')
    `;
    expect(rows.map(({ table_name }) => table_name).sort()).toEqual([
      "CurrentExamAssignment",
      "Exam",
      "ExamActionHistory",
      "ExamQuestionSnapshot",
    ]);
  });

  it("keeps linked-order, same-exam, endpoint, lifecycle and ordinal constraints in PostgreSQL", async () => {
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conrelid IN (
        '"Exam"'::regclass,
        '"ExamQuestionSnapshot"'::regclass,
        '"ExamActionHistory"'::regclass
      )
    `;
    const names = constraints.map(({ conname }) => conname);
    expect(names).toEqual(
      expect.arrayContaining([
        "exam_snapshot_count_nonnegative",
        "exam_snapshot_endpoints_consistent",
        "exam_active_publication_consistent",
        "exam_early_close_consistent",
        "exam_snapshot_same_exam_next_fkey",
        "exam_snapshot_one_predecessor",
        "exam_action_exam_ordinal_key",
        "exam_action_ordinal_positive",
      ]),
    );
  });

  it("round-trips exact digit text beyond JavaScript safe integers", async () => {
    const durationMinutes = "9007199254740993123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890";
    const maxAttempts = "1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890";
    await insertExam(ids.exam, { durationMinutes, maxAttempts });
    const rows = await prisma.$queryRaw<
      Array<{ durationMinutes: string; maxAttempts: string }>
    >`
      SELECT "durationMinutes", "maxAttempts" FROM "Exam" WHERE "id" = ${ids.exam}
    `;
    expect(rows[0]).toEqual({ durationMinutes, maxAttempts });
    await expect(
      insertExam("00000000-0000-4000-8000-000000000e96", {
        durationMinutes: "01",
      }),
    ).rejects.toThrow("exam_duration_positive_digits");
  });

  it("preserves a same-exam ordered chain and enforces count, endpoints and predecessor rules", async () => {
    await insertExam(ids.exam, {
      snapshotCount: 2n,
      snapshotHeadId: ids.head,
      snapshotTailId: ids.tail,
    });
    await insertSnapshot(ids.tail, ids.exam, "00000000-0000-4000-8000-000000000e52", null);
    await insertSnapshot(ids.head, ids.exam, "00000000-0000-4000-8000-000000000e51", ids.tail);
    const chain = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ordered AS (
        SELECT "id", "nextSnapshotId", 1 AS step
        FROM "ExamQuestionSnapshot"
        WHERE "examId" = ${ids.exam} AND "id" = ${ids.head}
        UNION ALL
        SELECT next."id", next."nextSnapshotId", ordered.step + 1
        FROM ordered
        JOIN "ExamQuestionSnapshot" next
          ON next."examId" = ${ids.exam} AND next."id" = ordered."nextSnapshotId"
      ) SELECT "id" FROM ordered ORDER BY step
    `;
    expect(chain.map(({ id }) => id)).toEqual([ids.head, ids.tail]);

    await expect(
      insertExam("00000000-0000-4000-8000-000000000e97", { snapshotCount: 1n }),
    ).rejects.toThrow("exam_snapshot_endpoints_consistent");
    await expect(
      insertExam(ids.otherExam, {
        snapshotCount: 1n,
        snapshotHeadId: ids.third,
        snapshotTailId: ids.third,
      }),
    ).resolves.toBeUndefined();
    await expect(
      insertSnapshot(ids.third, ids.otherExam, "00000000-0000-4000-8000-000000000e53", ids.head),
    ).rejects.toThrow("exam_snapshot_same_exam_next_fkey");
    await expect(
      insertSnapshot("00000000-0000-4000-8000-000000000e98", ids.exam, "00000000-0000-4000-8000-000000000e53", ids.tail),
    ).rejects.toThrow("already exists");
  });

  it("keeps publication, early-close and history ordinal markers consistent", async () => {
    await expect(
      insertExam("00000000-0000-4000-8000-000000000e99", {
        activePublicationId: "publication-without-phase",
      }),
    ).rejects.toThrow("exam_active_publication_consistent");

    const opensAt = new Date("2026-11-27T01:00:00.000Z");
    const closesAt = new Date("2026-11-27T02:00:00.000Z");
    await expect(
      insertExam("00000000-0000-4000-8000-000000000e9a", {
        earlyClosedAt: new Date("2026-11-27T00:30:00.000Z"),
      }),
    ).rejects.toThrow("exam_early_close_consistent");
    await expect(
      insertExam(ids.exam, {
        activePublicationId: "publication-id",
        activePhase: "OPEN",
        opensAt,
        closesAt,
        earlyClosedAt: new Date("2026-11-27T01:30:00.000Z"),
      }),
    ).rejects.toThrow("exam_early_close_consistent");

    await insertExam(ids.exam);
    await expect(
      prisma.$executeRaw`
        INSERT INTO "ExamActionHistory" (
          "id", "examId", "ordinal", "action", "actedAt", "actorId", "resultingRevision", "payload"
        ) VALUES (
          '00000000-0000-4000-8000-000000000e9b', ${ids.exam}, 0, 'PUBLISHED',
          now(), ${ids.teacher}, 'revision', '{}'::jsonb
        )
      `,
    ).rejects.toThrow("exam_action_ordinal_positive");
  });
});
