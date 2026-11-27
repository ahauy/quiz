import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { Reflector } from "@nestjs/core";
import { ROLE } from "../src/auth/utils/role-value.js";
import { RolesGuard } from "../src/common/guards/roles.guard.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PrismaModule } from "../src/prisma/prisma.module.js";
import { ExamsModule } from "../src/exams/exams.module.js";
import { createExamVerificationClient } from "./exam-verification-db.js";

@Module({ imports: [PrismaModule, ExamsModule] })
class StudentExamHttpModule {}

describe("student exam metadata on PostgreSQL 16", () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let baseUrl: string;
  const teacherId = "00000000-0000-4000-8000-000000000e81";
  const fallbackTeacherId = "00000000-0000-4000-8000-000000000e94";
  const studentId = "00000000-0000-4000-8000-000000000e82";
  const otherStudentId = "00000000-0000-4000-8000-000000000e83";
  const classA = "00000000-0000-4000-8000-000000000e84";
  const classB = "00000000-0000-4000-8000-000000000e85";
  const examId = "00000000-0000-4000-8000-000000000e86";
  const foreignExamId = "00000000-0000-4000-8000-000000000e87";
  const publicationId = "00000000-0000-4000-8000-000000000e88";
  const fallbackClassroomId = "00000000-0000-4000-8000-000000000e95";
  const fallbackExamId = "00000000-0000-4000-8000-000000000e96";

  async function cleanup(): Promise<void> {
    await prisma.exam.deleteMany({ where: { teacherId: { in: [teacherId, fallbackTeacherId] } } });
    await prisma.classroom.deleteMany({ where: { id: { in: [classA, classB, fallbackClassroomId] } } });
    await prisma.enrollment.deleteMany({ where: { userId: { in: [studentId, otherStudentId] } } });
  }

  async function get(path: string, identity?: { id: string; role: string }) {
    return fetch(`${baseUrl}${path}`, {
      headers: identity ? { "x-test-user-id": identity.id, "x-test-role": identity.role } : {},
    });
  }

  async function waitUntilOpen(opensAt: Date): Promise<boolean> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [sample] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      if (sample!.now >= opensAt) return true;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return false;
  }

  async function waitForBlockedReads(): Promise<boolean> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [sample] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count
        FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%FOR UPDATE%'`;
      if ((sample?.count ?? 0) >= 2) return true;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return false;
  }

  async function lockForWithdrawal(outcome: "commit" | "rollback") {
    let signalLocked!: () => void;
    let releaseTransaction!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseTransaction = resolve; });
    const withdrawal = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Exam" WHERE "id" = ${examId} FOR UPDATE`;
      signalLocked();
      await release;
      if (outcome === "commit") {
        await tx.exam.update({ where: { id: examId }, data: { activePublicationId: null, activePhase: null } });
        return;
      }
      throw new Error("intentional withdrawal rollback");
    }, { maxWait: 2000, timeout: 5000 }).catch((error: unknown) => error);
    await locked;
    return { release: releaseTransaction, withdrawal };
  }

  beforeAll(async () => {
    prisma = await createExamVerificationClient();
    await prisma.user.createMany({ data: [
      { id: teacherId, email: "student-exams-owner@example.test", displayName: "Teacher Canonical", role: "TEACHER" },
      { id: fallbackTeacherId, email: "oauth-fallback@example.test", displayName: "oauth-fallback@example.test", role: "TEACHER" },
      { id: studentId, email: "student-exams-student@example.test", displayName: "Student", role: "STUDENT" },
      { id: otherStudentId, email: "student-exams-other@example.test", displayName: "Other Student", role: "STUDENT" },
    ], skipDuplicates: true });
    const module = await Test.createTestingModule({ imports: [StudentExamHttpModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = module.createNestApplication();
    app.use((req: { headers: Record<string, string | undefined>; user?: unknown }, _res: unknown, next: () => void) => {
      const id = req.headers["x-test-user-id"];
      const role = req.headers["x-test-role"];
      if (id && (role === ROLE.STUDENT || role === ROLE.TEACHER)) req.user = { id, role };
      next();
    });
    app.useGlobalGuards(new RolesGuard(app.get(Reflector)));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("HTTP test server did not bind a TCP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.user.update({ where: { id: teacherId }, data: { displayName: "Teacher Canonical" } });
    await prisma.classroom.createMany({ data: [
      { id: classA, name: "Approved Room A", teacherId },
      { id: classB, name: "Not My Room B", teacherId },
    ] });
    await prisma.enrollment.createMany({ data: [
      { classroomId: classA, userId: studentId, status: "APPROVED" },
      { classroomId: classB, userId: studentId, status: "PENDING" },
    ] });
    await prisma.exam.create({ data: {
      id: examId, teacherId, title: "Visible metadata", durationMinutes: "45", maxAttempts: "2",
      allowAnswerReview: false, opensAt: new Date(Date.now() + 3_600_000), closesAt: new Date(Date.now() + 7_200_000),
      activePublicationId: publicationId, activePhase: "SCHEDULED", firstPublishedAt: new Date(), lastMutationId: publicationId,
      assignments: { create: [{ classroomId: classA }, { classroomId: classB }] },
    } });
    await prisma.exam.create({ data: {
      id: foreignExamId, teacherId, title: "Out of scope", lastMutationId: publicationId,
      assignments: { create: [{ classroomId: classB }] },
    } });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!prisma) return;
    await cleanup();
    await prisma.user.deleteMany({ where: { id: { in: [teacherId, fallbackTeacherId, studentId, otherStudentId] } } });
    await prisma.$disconnect();
  });

  it("requires an authenticated student and limits list/detail to current approved assignments", async () => {
    expect((await get("/student/exams")).status).toBe(401);
    expect((await get("/student/exams", { id: teacherId, role: ROLE.TEACHER })).status).toBe(403);

    const list = await get("/student/exams", { id: studentId, role: ROLE.STUDENT });
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect(list.headers.get("x-exam-server-time")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const body = await list.json() as { data: { items: Array<{ detailPath: string; metadata: Record<string, unknown> }>; nextCursor: null } };
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toEqual({
      detailPath: `/student/exams/${examId}`,
      metadata: {
        title: "Visible metadata", teacherName: "Teacher Canonical", questionCount: "0", durationMinutes: "45",
        opensAt: expect.any(String), closesAt: expect.any(String), state: "SCHEDULED", maxAttempts: "2",
        passwordRequired: false, allowAnswerReview: false, qualifyingClassroomNames: ["Approved Room A"],
      },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("Not My Room B");
    expect(serialized).not.toContain("student-exams-owner@example.test");
    expect(Object.keys(body.data.items[0]!.metadata).sort()).toEqual([
      "allowAnswerReview", "closesAt", "durationMinutes", "maxAttempts", "opensAt", "passwordRequired",
      "qualifyingClassroomNames", "questionCount", "state", "teacherName", "title",
    ].sort());

    const detail = await get(`/student/exams/${examId}`, { id: studentId, role: ROLE.STUDENT });
    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toEqual(body.data.items[0]?.metadata);
  });

  it("distinguishes absent IDs from existing out-of-scope exams without projecting metadata", async () => {
    const foreign = await get(`/student/exams/${foreignExamId}`, { id: otherStudentId, role: ROLE.STUDENT });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toMatchObject({ code: "FORBIDDEN" });
    const missing = await get("/student/exams/00000000-0000-4000-8000-000000000e8f", { id: studentId, role: ROLE.STUDENT });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "EXAM_NOT_FOUND" });
  });

  it("uses canonical displayName for chosen email-form and OAuth-fallback profiles", async () => {
    await prisma.user.update({ where: { id: teacherId }, data: { displayName: "chosen-name@example.test" } });
    const chosen = await get(`/student/exams/${examId}`, { id: studentId, role: ROLE.STUDENT });
    expect((await chosen.json()).data.teacherName).toBe("chosen-name@example.test");

    await prisma.classroom.create({ data: { id: fallbackClassroomId, name: "Fallback class", teacherId: fallbackTeacherId } });
    await prisma.enrollment.create({ data: { classroomId: fallbackClassroomId, userId: studentId, status: "APPROVED" } });
    const now = Date.now();
    await prisma.exam.create({ data: {
      id: fallbackExamId, teacherId: fallbackTeacherId, title: "Fallback profile", lastMutationId: publicationId,
      durationMinutes: "5", maxAttempts: "1", allowAnswerReview: true, opensAt: new Date(now + 60_000), closesAt: new Date(now + 120_000),
      activePublicationId: "00000000-0000-4000-8000-000000000e97", activePhase: "SCHEDULED", firstPublishedAt: new Date(),
      assignments: { create: [{ classroomId: fallbackClassroomId }] },
    } });
    const fallback = await get(`/student/exams/${fallbackExamId}`, { id: studentId, role: ROLE.STUDENT });
    expect((await fallback.json()).data.teacherName).toBe("oauth-fallback@example.test");
  });

  it("rechecks current approvals and retains only classes that still qualify", async () => {
    await prisma.enrollment.update({ where: { classroomId_userId: { classroomId: classA, userId: studentId } }, data: { status: "PENDING" } });
    expect((await get("/student/exams", { id: studentId, role: ROLE.STUDENT }).then((response) => response.json())).data.items).toEqual([]);
    expect((await get(`/student/exams/${examId}`, { id: studentId, role: ROLE.STUDENT })).status).toBe(403);
    await prisma.enrollment.update({ where: { classroomId_userId: { classroomId: classA, userId: studentId } }, data: { status: "APPROVED" } });
    await prisma.enrollment.update({ where: { classroomId_userId: { classroomId: classB, userId: studentId } }, data: { status: "APPROVED" } });
    let response = await get(`/student/exams/${examId}`, { id: studentId, role: ROLE.STUDENT });
    expect((await response.json()).data.qualifyingClassroomNames).toEqual(["Approved Room A", "Not My Room B"]);

    await prisma.enrollment.delete({ where: { classroomId_userId: { classroomId: classA, userId: studentId } } });
    response = await get(`/student/exams/${examId}`, { id: studentId, role: ROLE.STUDENT });
    expect((await response.json()).data.qualifyingClassroomNames).toEqual(["Not My Room B"]);

    await prisma.enrollment.delete({ where: { classroomId_userId: { classroomId: classB, userId: studentId } } });
    const list = await get("/student/exams", { id: studentId, role: ROLE.STUDENT });
    expect((await list.json()).data.items).toEqual([]);
    expect((await get(`/student/exams/${examId}`, { id: studentId, role: ROLE.STUDENT })).status).toBe(403);
  });

  it("projects Scheduled, Open, and Closed while keeping Draft hidden on both routes", async () => {
    const student = { id: studentId, role: ROLE.STUDENT };
    const now = Date.now();
    for (const state of ["SCHEDULED", "OPEN", "CLOSED"] as const) {
      const opensAt = state === "SCHEDULED" ? new Date(now + 3_600_000) : new Date(now - 3_600_000);
      const closesAt = state === "CLOSED" ? new Date(now - 1_000) : new Date(now + 7_200_000);
      await prisma.exam.update({ where: { id: examId }, data: { activePhase: state, opensAt, closesAt } });
      const list = await get(`/student/exams?state=${state}`, student);
      const items = (await list.json()).data.items;
      expect(items).toHaveLength(1);
      expect(items[0].metadata.state).toBe(state);
      expect((await get(`/student/exams/${examId}`, student).then((response) => response.json())).data.state).toBe(state);
    }

    const draftId = "00000000-0000-4000-8000-000000000e89";
    await prisma.exam.create({ data: { id: draftId, teacherId, title: "Draft hidden", lastMutationId: publicationId, assignments: { create: [{ classroomId: classA }] } } });
    expect((await get(`/student/exams/${draftId}`, student)).status).toBe(403);
    const unfiltered = (await get("/student/exams", student).then((response) => response.json())).data.items;
    expect(unfiltered.some((item: { detailPath: string }) => item.detailPath.endsWith(draftId))).toBe(false);
    expect((await get("/student/exams?state=DRAFT", student)).status).toBe(400);
  });

  it("uses bound keyset cursors and validates list filters", async () => {
    const olderExamId = "00000000-0000-4000-8000-000000000e8a";
    await prisma.exam.create({ data: {
      id: olderExamId, teacherId, title: "Older eligible", lastMutationId: publicationId,
      activePublicationId: "00000000-0000-4000-8000-000000000e8b", activePhase: "SCHEDULED", firstPublishedAt: new Date(),
      durationMinutes: "10", maxAttempts: "1", allowAnswerReview: false,
      opensAt: new Date(Date.now() + 3_600_000), closesAt: new Date(Date.now() + 7_200_000),
      createdAt: new Date(Date.now() - 60_000), assignments: { create: [{ classroomId: classA }] },
    } });
    const student = { id: studentId, role: ROLE.STUDENT };
    const first = await get("/student/exams?pageSize=1", student);
    const firstPage = (await first.json()).data;
    expect(firstPage.items[0].detailPath).toBe(`/student/exams/${examId}`);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    const second = await get(`/student/exams?pageSize=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`, student);
    expect((await second.json()).data.items[0].detailPath).toBe(`/student/exams/${olderExamId}`);
    expect((await get("/student/exams?pageSize=101", student)).status).toBe(400);
    const cursor = Buffer.from(JSON.stringify({ v: 1, route: "student-exams", createdAt: new Date().toISOString(), id: examId, state: null })).toString("base64url");
    expect((await get(`/student/exams?state=OPEN&cursor=${cursor}`, student)).status).toBe(400);
  });

  it("withholds student list and detail across a due withdrawal lock until commit or rollback", async () => {
    for (const outcome of ["commit", "rollback"] as const) {
      const [clock] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const opensAt = new Date(clock!.now.getTime() + 300);
      const closesAt = new Date(opensAt.getTime() + 3_600_000);
      const publication = outcome === "commit"
        ? "00000000-0000-4000-8000-000000000e8c"
        : "00000000-0000-4000-8000-000000000e8d";
      await prisma.exam.update({ where: { id: examId }, data: {
        activePublicationId: publication, activePhase: "SCHEDULED", opensAt, closesAt,
      } });
      const tx = await lockForWithdrawal(outcome);
      const due = await waitUntilOpen(opensAt);
      if (!due) {
        tx.release();
        await tx.withdrawal;
      }
      expect(due).toBe(true);
      const student = { id: studentId, role: ROLE.STUDENT };
      const listRequest = get("/student/exams", student);
      const detailRequest = get(`/student/exams/${examId}`, student);
      const blockedReads = await waitForBlockedReads();
      if (!blockedReads) {
        tx.release();
        await tx.withdrawal;
        await Promise.all([listRequest, detailRequest]);
      }
      expect(blockedReads).toBe(true);
      tx.release();
      await tx.withdrawal;
      const [list, detail] = await Promise.all([listRequest, detailRequest]);
      const listData = await list.json() as { data?: { items: Array<{ metadata: { state: string } }> } };
      const detailData = await detail.json() as { data?: { state: string } };
      if (outcome === "commit") {
        expect(listData.data?.items).toEqual([]);
        expect(detail.status).toBe(403);
      } else {
        expect(listData.data?.items[0]?.metadata.state).toBe("OPEN");
        expect(detailData.data?.state).toBe("OPEN");
      }
    }
  });
});
