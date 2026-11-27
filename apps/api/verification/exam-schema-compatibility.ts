import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createExamVerificationClient, verifiedExamDatabaseUrl } from "./exam-verification-db.js";

const migrationNames = [
  "20261125070502_sprint0_baseline",
  "20261125082639_add_auth_foundation",
  "20261126032044_question_bank_core",
  "20261126093000_add_classrooms",
  "20261127000000_exam_authoring_assignment",
];

type LegacySnapshot = {
  users: unknown[];
  subjects: unknown[];
  chapters: unknown[];
  questions: unknown[];
  options: unknown[];
  fillBlankAnswers: unknown[];
  matchingPairs: unknown[];
  classrooms: unknown[];
  classCodes: unknown[];
  enrollments: unknown[];
};

export async function runPreMigrationCompatibilityProof(): Promise<{
  before: LegacySnapshot;
  after: LegacySnapshot;
}> {
  const databaseUrl = verifiedExamDatabaseUrl();
  const identityClient = await createExamVerificationClient();
  const schemaName = `exam_compat_${randomUUID().replaceAll("-", "")}`;
  const schemaUrl = new URL(databaseUrl);
  schemaUrl.searchParams.set("schema", schemaName);
  const schemaClient = new PrismaClient({ datasourceUrl: schemaUrl.toString() });
  const tempRoot = mkdtempSync(join(tmpdir(), "exam-schema-proof-"));

  try {
    await identityClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    stageMigrations(tempRoot, migrationNames.slice(0, -1));
    deployMigrations(tempRoot, schemaUrl.toString());
    await seedLegacyGraph(schemaClient);
    const before = await snapshotLegacyGraph(schemaClient);
    stageMigrations(tempRoot, migrationNames);
    deployMigrations(tempRoot, schemaUrl.toString());
    const after = await snapshotLegacyGraph(schemaClient);
    return { before, after };
  } finally {
    await schemaClient.$disconnect();
    await identityClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await identityClient.$disconnect();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function stageMigrations(destination: string, names: string[]): void {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationRoot = join(destination, "migrations");
  rmSync(migrationRoot, { recursive: true, force: true });
  mkdirSync(migrationRoot, { recursive: true });
  cpSync(join(apiRoot, "prisma/migrations/migration_lock.toml"), join(migrationRoot, "migration_lock.toml"));
  for (const name of names) {
    cpSync(join(apiRoot, "prisma/migrations", name), join(migrationRoot, name), { recursive: true });
  }
  writeFileSync(
    join(destination, "schema.prisma"),
    'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n',
  );
}

function deployMigrations(schemaRoot: string, databaseUrl: string): void {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  execFileSync(resolve(apiRoot, "node_modules/.bin/prisma"), [
    "migrate", "deploy", "--schema", join(schemaRoot, "schema.prisma"),
  ], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}

async function seedLegacyGraph(prisma: PrismaClient): Promise<void> {
  const teacherId = "legacy-teacher";
  const studentId = "legacy-student";
  const subjectId = "legacy-subject";
  const chapterId = "legacy-chapter";
  const now = new Date("2026-11-26T12:00:00.000Z");
  await prisma.$executeRaw`
    INSERT INTO "User" ("id", "email", "displayName", "role", "createdAt", "updatedAt") VALUES
      (${teacherId}, 'legacy-teacher@example.test', 'Legacy Teacher', 'TEACHER', ${now}, ${now}),
      (${studentId}, 'legacy-student@example.test', 'Legacy Student', 'STUDENT', ${now}, ${now})
  `;
  await prisma.$executeRaw`
    INSERT INTO "Subject" ("id", "teacherId", "name", "nameKey", "createdAt", "updatedAt")
    VALUES (${subjectId}, ${teacherId}, 'Legacy Science', 'legacy science', ${now}, ${now})
  `;
  await prisma.$executeRaw`
    INSERT INTO "Chapter" ("id", "subjectId", "name", "nameKey", "createdAt", "updatedAt")
    VALUES (${chapterId}, ${subjectId}, 'Legacy Chapter', 'legacy chapter', ${now}, ${now})
  `;
  await seedQuestionRows(prisma, teacherId, subjectId, chapterId, now);
  await prisma.$executeRaw`
    INSERT INTO "Classroom" ("id", "name", "teacherId", "createdAt", "updatedAt")
    VALUES ('legacy-class', 'Legacy Class', ${teacherId}, ${now}, ${now})
  `;
  await prisma.$executeRaw`
    INSERT INTO "ClassCode" ("id", "code", "classroomId", "createdAt")
    VALUES ('legacy-code', 'LEGACY-CODE', 'legacy-class', ${now})
  `;
  await prisma.$executeRaw`
    INSERT INTO "Enrollment" ("id", "classroomId", "userId", "status", "createdAt", "approvedAt")
    VALUES ('legacy-enrollment', 'legacy-class', ${studentId}, 'APPROVED', ${now}, ${now})
  `;
}

async function seedQuestionRows(
  prisma: PrismaClient,
  teacherId: string,
  subjectId: string,
  chapterId: string,
  now: Date,
): Promise<void> {
  const types = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "MATCHING"] as const;
  for (const [index, type] of types.entries()) {
    const questionId = `legacy-question-${index + 1}`;
    await prisma.$executeRaw`
      INSERT INTO "Question" (
        "id", "teacherId", "type", "content", "difficulty", "explanation", "subjectId", "chapterId",
        "trueFalseAnswer", "createdAt", "updatedAt"
      ) VALUES (
        ${questionId}, ${teacherId}, CAST(${type} AS "QuestionType"), ${`Legacy prompt ${type}`}, 'MEDIUM',
        ${`Legacy explanation ${type}`}, ${subjectId}, ${chapterId}, ${type === "TRUE_FALSE" ? true : null}, ${now}, ${now}
      )
    `;
    await seedQuestionVariant(prisma, questionId, type);
  }
}

async function seedQuestionVariant(
  prisma: PrismaClient,
  questionId: string,
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "FILL_BLANK" | "MATCHING",
): Promise<void> {
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
    await prisma.$executeRaw`
      INSERT INTO "QuestionOption" ("id", "questionId", "text", "isCorrect", "position") VALUES
        (${`${questionId}-option-a`}, ${questionId}, 'Answer A', true, 0),
        (${`${questionId}-option-b`}, ${questionId}, 'Answer B', false, 1)
    `;
  } else if (type === "FILL_BLANK") {
    await prisma.$executeRaw`
      INSERT INTO "FillBlankAnswer" ("id", "questionId", "text", "normalized", "position")
      VALUES (${`${questionId}-answer`}, ${questionId}, 'Answer', 'answer', 0)
    `;
  } else if (type === "MATCHING") {
    await prisma.$executeRaw`
      INSERT INTO "MatchingPair" (
        "id", "questionId", "leftText", "leftNormalized", "rightText", "rightNormalized", "position"
      ) VALUES (${`${questionId}-pair`}, ${questionId}, 'Left', 'left', 'Right', 'right', 0)
    `;
  }
}

async function snapshotLegacyGraph(prisma: PrismaClient): Promise<LegacySnapshot> {
  return {
    users: await tableRows(prisma, "User"),
    subjects: await tableRows(prisma, "Subject"),
    chapters: await tableRows(prisma, "Chapter"),
    questions: await tableRows(prisma, "Question"),
    options: await tableRows(prisma, "QuestionOption"),
    fillBlankAnswers: await tableRows(prisma, "FillBlankAnswer"),
    matchingPairs: await tableRows(prisma, "MatchingPair"),
    classrooms: await tableRows(prisma, "Classroom"),
    classCodes: await tableRows(prisma, "ClassCode"),
    enrollments: await tableRows(prisma, "Enrollment"),
  };
}

async function tableRows(prisma: PrismaClient, table: keyof TableMap): Promise<unknown[]> {
  const queries: Record<keyof TableMap, string> = {
    User: 'SELECT to_jsonb(row_data) AS row FROM "User" row_data ORDER BY "id"',
    Subject: 'SELECT to_jsonb(row_data) AS row FROM "Subject" row_data ORDER BY "id"',
    Chapter: 'SELECT to_jsonb(row_data) AS row FROM "Chapter" row_data ORDER BY "id"',
    Question: 'SELECT to_jsonb(row_data) AS row FROM "Question" row_data ORDER BY "id"',
    QuestionOption: 'SELECT to_jsonb(row_data) AS row FROM "QuestionOption" row_data ORDER BY "id"',
    FillBlankAnswer: 'SELECT to_jsonb(row_data) AS row FROM "FillBlankAnswer" row_data ORDER BY "id"',
    MatchingPair: 'SELECT to_jsonb(row_data) AS row FROM "MatchingPair" row_data ORDER BY "id"',
    Classroom: 'SELECT to_jsonb(row_data) AS row FROM "Classroom" row_data ORDER BY "id"',
    ClassCode: 'SELECT to_jsonb(row_data) AS row FROM "ClassCode" row_data ORDER BY "id"',
    Enrollment: 'SELECT to_jsonb(row_data) AS row FROM "Enrollment" row_data ORDER BY "id"',
  };
  const rows = await prisma.$queryRawUnsafe<Array<{ row: unknown }>>(queries[table]);
  return rows.map(({ row }) => row);
}

type TableMap = Record<
  "User" | "Subject" | "Chapter" | "Question" | "QuestionOption" | "FillBlankAnswer" |
  "MatchingPair" | "Classroom" | "ClassCode" | "Enrollment",
  unknown
>;
