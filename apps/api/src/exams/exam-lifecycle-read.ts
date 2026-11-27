import type { Exam, Prisma } from "@prisma/client";
import type { ExamStatus } from "@quiz/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { effectiveExamStatus } from "./exam-rules.js";
import { examError, isPrismaCode } from "./exam-errors.js";
const PHASE_RANK = { SCHEDULED: 0, OPEN: 1, CLOSED: 2 } as const;

export interface DueExamCandidate {
  examId: string;
  activePublicationId: string;
  candidateAt: Date;
  isInCurrentScope?: (tx: Prisma.TransactionClient, exam: Exam) => Promise<boolean>;
}

export async function progressDueExamIds(prisma: PrismaService, candidates: readonly DueExamCandidate[]): Promise<void> {
  if (!candidates.length) return;
  const ordered = [...candidates].sort((a, b) => a.examId.localeCompare(b.examId));
  const examIds = ordered.map(({ examId }) => examId);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    const rows = await tx.$queryRaw<Array<Exam>>`
      SELECT * FROM "Exam" WHERE "id" = ANY(${examIds}::text[]) ORDER BY "id" FOR UPDATE
    `;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!clock) throw examError("EXAM_READ_BUSY", "Exam read is busy");
    for (const candidate of ordered) {
      const current = byId.get(candidate.examId);
      if (!current || !current.activePublicationId || current.activePublicationId !== candidate.activePublicationId ||
          !current.activePhase || !current.opensAt || !current.closesAt) continue;
      if (candidate.isInCurrentScope && !(await candidate.isInCurrentScope(tx, current))) continue;
      const observed = effectiveExamStatus(current.activePhase, current.opensAt, current.closesAt, candidate.candidateAt);
      const afterLock = effectiveExamStatus(current.activePhase, current.opensAt, current.closesAt, clock.now);
      const next = PHASE_RANK[observed] > PHASE_RANK[afterLock] ? observed : afterLock;
      if (next !== current.activePhase) await tx.$executeRaw`
        UPDATE "Exam" SET "activePhase" = CAST(${next} AS "ExamPhase")
        WHERE "id" = ${current.id} AND "activePublicationId" = ${candidate.activePublicationId}
      `;
    }
  }, { maxWait: 2000, timeout: 5000 });
}

export async function advanceAndReadExam(prisma: PrismaService, examId: string, teacherId: string): Promise<{ exam: Exam; state: ExamStatus; now: Date }> {
  for (let pass = 0; pass < 3; pass += 1) {
    const [projection] = await prisma.$queryRaw<Array<Exam & { sampledNow: Date }>>`
      SELECT e.*, clock_timestamp() AS "sampledNow"
      FROM "Exam" e WHERE e."id" = ${examId} AND e."teacherId" = ${teacherId}
    `;
    const candidate = projection;
    if (!candidate) {
      if (await prisma.exam.count({ where: { id: examId } })) throw examError("FORBIDDEN", "Exam belongs to another teacher");
      throw examError("EXAM_NOT_FOUND", "Exam not found");
    }
    const sample = { now: projection.sampledNow };
    if (!candidate.activePhase || !candidate.opensAt || !candidate.closesAt) {
      return { exam: candidate, state: "DRAFT", now: sample.now };
    }
    const sampled = effectiveExamStatus(candidate.activePhase, candidate.opensAt, candidate.closesAt, sample.now);
    if (sampled === candidate.activePhase) return { exam: candidate, state: sampled, now: sample.now };
    if (!candidate.activePublicationId) throw examError("EXAM_READ_BUSY", "Exam publication state is inconsistent");
    if (pass === 2) throw examError("EXAM_READ_BUSY", "Exam lifecycle is changing; retry the read");
    try {
      await progressDueExamIds(prisma, [{
        examId, activePublicationId: candidate.activePublicationId, candidateAt: sample.now,
        isInCurrentScope: async (_tx, current) => current.teacherId === teacherId,
      }]);
    } catch (error) {
      if (isExamReadContention(error)) throw examError("EXAM_READ_BUSY", "Exam read is busy");
      throw error;
    }
  }
  throw examError("EXAM_READ_BUSY", "Exam lifecycle is changing; retry the read");
}

export function isExamReadContention(error: unknown): boolean {
  if (isPrismaCode(error, "P2024") || isPrismaCode(error, "P2028")) return true;
  if (!isPrismaCode(error, "P2010") || typeof error !== "object" || error === null || !("meta" in error)) return false;
  return (error as { meta?: { code?: unknown } }).meta?.code === "55P03";
}
