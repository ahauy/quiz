import { describe, expect, it, vi } from "vitest";
import { ROLE } from "../auth/utils/role-value.js";
import { ExamException } from "./exam-errors.js";
import { advanceAndReadExam } from "./exam-lifecycle-read.js";
import { ExamsService } from "./exams.service.js";

describe("exam create collision handling", () => {
  it("maps concurrent Prisma unique conflicts to generic EXAM_ALREADY_EXISTS", async () => {
    const repository = { createDraft: vi.fn().mockRejectedValue({ code: "P2002" }) };
    const service = new ExamsService(repository as never);
    try {
      await service.create({ id: "teacher", role: ROLE.TEACHER }, {
        id: "00000000-0000-4000-8000-000000000001",
        title: "Exam",
        mutationId: "00000000-0000-4000-8000-000000000002",
      });
      throw new Error("Expected unique-key collision");
    } catch (error) {
      expect(error).toBeInstanceOf(ExamException);
      expect((error as ExamException).getResponse()).toMatchObject({ code: "EXAM_ALREADY_EXISTS" });
      expect((error as ExamException).getResponse()).not.toHaveProperty("details");
    }
  });
});

describe("exam lifecycle read progression budget", () => {
  const teacherId = "00000000-0000-4000-8000-000000000001";
  const examId = "00000000-0000-4000-8000-000000000002";
  const publicationId = "00000000-0000-4000-8000-000000000003";
  const now = new Date("2030-01-01T12:00:00.000Z");
  const candidate = {
    id: examId,
    teacherId,
    activePublicationId: publicationId,
    activePhase: "SCHEDULED",
    opensAt: new Date(now.getTime() - 1000),
    closesAt: new Date(now.getTime() + 60_000),
    sampledNow: now,
    serverNow: now,
    createdAt: new Date(now.getTime() - 86_400_000),
    title: "Exam",
    snapshotCount: 0n,
    durationMinutes: null,
    maxAttempts: null,
    allowAnswerReview: null,
    passwordHash: null,
    earlyClosedAt: null,
    firstPublishedAt: now,
    lastMutationId: publicationId,
    revision: publicationId,
  };

  function database(thirdProjection: Partial<typeof candidate> & { effectiveState?: string } = {}) {
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      let query = 0;
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        $queryRaw: vi.fn(async () => (query++ === 0 ? [candidate] : [{ now }])),
      };
      return callback(tx);
    });
    let projection = 0;
    const client = {
      $queryRaw: vi.fn(async () => [
        projection++ === 2 ? { ...candidate, ...thirdProjection } : { ...candidate },
      ]),
      $transaction: transaction,
      exam: { count: vi.fn().mockResolvedValue(1) },
    };
    return { client, transaction };
  }

  it("rejects a still-due third detail projection before another progression transaction", async () => {
    const { client, transaction } = database();
    await expect(advanceAndReadExam(client as never, examId, teacherId)).rejects.toMatchObject({ code: "EXAM_READ_BUSY" });
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("rejects a still-due third list projection before another progression transaction", async () => {
    const { client, transaction } = database();
    const service = new ExamsService({ client } as never);
    await expect(service.list({ id: teacherId, role: ROLE.TEACHER }, {})).rejects.toMatchObject({ code: "EXAM_READ_BUSY" });
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("serves a stable third detail projection without another progression transaction", async () => {
    const { client, transaction } = database({ activePhase: "OPEN" });
    await expect(advanceAndReadExam(client as never, examId, teacherId)).resolves.toMatchObject({ state: "OPEN" });
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("serves a stable third list projection without another progression transaction", async () => {
    const { client, transaction } = database({ activePhase: "OPEN", effectiveState: "OPEN" });
    const service = new ExamsService({ client } as never);
    const result = await service.list({ id: teacherId, role: ROLE.TEACHER }, {});
    expect(result.page.items[0]?.state).toBe("OPEN");
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
