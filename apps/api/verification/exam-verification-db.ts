import { PrismaClient } from "@prisma/client";

export function verifiedExamDatabaseUrl(value?: string): string {
  const candidate = value ?? process.env.EXAM_VERIFY_DATABASE_URL;
  if (!candidate) {
    throw new Error("EXAM_VERIFY_DATABASE_URL is required for exam DB verification");
  }

  const target = new URL(candidate);
  const database = decodeURIComponent(target.pathname.slice(1));
  const match = database.match(/^quiz_exam_verify_([a-zA-Z0-9][a-zA-Z0-9_-]*)$/);
  const isExpectedDisposable =
    ["postgres:", "postgresql:"].includes(target.protocol) &&
    target.hostname === "127.0.0.1" &&
    target.username === "exam_verify" &&
    Number(target.port) > 0 &&
    Number(target.port) <= 65535 &&
    match !== null;

  if (!isExpectedDisposable) {
    throw new Error("Refusing DB operation: URL does not match the approved disposable database");
  }

  return candidate;
}

export async function createExamVerificationClient(): Promise<PrismaClient> {
  const prisma = new PrismaClient({ datasourceUrl: verifiedExamDatabaseUrl() });
  try {
    const [identity] = await prisma.$queryRaw<
      Array<{ database: string; marker: string | null }>
    >`
      SELECT current_database() AS database,
             shobj_description(oid, 'pg_database') AS marker
      FROM pg_database
      WHERE datname = current_database()
    `;
    const target = new URL(verifiedExamDatabaseUrl());
    const [, runId] = decodeURIComponent(target.pathname.slice(1)).match(
      /^quiz_exam_verify_([a-zA-Z0-9][a-zA-Z0-9_-]*)$/,
    ) ?? [];
    if (
      identity?.database !== decodeURIComponent(target.pathname.slice(1)) ||
      identity.marker !== `uaw:disposable:US-EXAM-001:${runId}`
    ) {
      throw new Error("Refusing DB operation: disposable identity marker is missing or mismatched");
    }
    return prisma;
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
