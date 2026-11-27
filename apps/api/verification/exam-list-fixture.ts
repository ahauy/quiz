import { randomUUID } from "node:crypto";
import type { Exam, ExamQuestionSnapshot, Prisma, PrismaClient, User } from "@prisma/client";
import { TokenService } from "../src/auth/services/token.service.js";
import type { AuthConfig } from "../src/auth/auth.config.js";

export interface ExamListFixture {
  teacher: User;
  otherTeacher: User;
  student: User;
  teacherToken: string;
  studentToken: string;
  classroomName: string;
}

interface Sample {
  exam: Exam;
  snapshots: ExamQuestionSnapshot[];
  classroomIds: string[];
  classroomName: string;
}

export function fixtureAccessToken(user: User, secret: string): string {
  const config: AuthConfig = {
    accessSecret: secret, refreshSecret: secret, accessTtlSeconds: 3600, refreshTtlSeconds: 3600,
    teacherCode: "LOCAL-TEACHER-CODE", googleClientId: "verification", googleClientSecret: "verification",
    googleRedirectUri: "http://localhost/oauth/callback", resetUrlBase: "http://localhost",
    resetTtlSeconds: 60, secureCookies: false,
  };
  return new TokenService(config, { now: () => new Date() }).signAccessToken(user);
}

async function seedRequest(origin: string, token: string, method: string, path: string, body: unknown, etag?: string) {
  const response = await fetch(`${origin}${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(etag ? { "If-Match": etag } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
  });
  const result: unknown = await response.json();
  if (!response.ok || !result || typeof result !== "object" || !("data" in result)
    || !result.data || typeof result.data !== "object" || !("id" in result.data)
    || typeof result.data.id !== "string") throw new Error(`Performance fixture request failed: ${method} ${path} (${response.status})`);
  return { id: result.data.id, etag: response.headers.get("ETag") ?? undefined };
}

function questionPayload(index: number): Record<string, unknown> {
  const common = {
    content: `Câu hỏi hiệu năng ${index}: $x^2 + 2x + 1$`, difficulty: "EASY",
    explanation: "Giải thích câu trả lời trong bộ dữ liệu kiểm thử hiệu năng.",
    subjectName: "Môn kiểm thử hiệu năng", chapterName: "Chương mẫu",
  };
  const variants = [
    { type: "SINGLE_CHOICE", options: ["A", "B", "C"], correctOptionIndexes: [0] },
    { type: "MULTIPLE_CHOICE", options: ["A", "B", "C"], correctOptionIndexes: [0, 2] },
    { type: "TRUE_FALSE", correctAnswer: false },
    { type: "FILL_BLANK", content: `Điền vào {{blank}} số ${index}`, acceptedAnswers: ["Đáp án", "Trả lời"] },
    { type: "MATCHING", pairs: [{ leftText: "A", rightText: "1" }, { leftText: "B", rightText: "2" }] },
  ];
  return { ...common, ...variants[index % variants.length] };
}

async function sampleThroughApi(client: PrismaClient, origin: string, teacher: User, secret: string): Promise<Sample> {
  const token = fixtureAccessToken(teacher, secret);
  const firstClass = await seedRequest(origin, token, "POST", "/classrooms", { name: `Lớp hiệu năng A ${teacher.id.slice(0, 8)}` });
  const secondClass = await seedRequest(origin, token, "POST", "/classrooms", { name: `Lớp hiệu năng B ${teacher.id.slice(0, 8)}` });
  const created = await seedRequest(origin, token, "POST", "/teacher/exams", {
    id: randomUUID(), title: "Đề mẫu hiệu năng", mutationId: randomUUID(),
  });
  let etag = created.etag;
  for (let index = 0; index < 20; index += 1) {
    const question = await seedRequest(origin, token, "POST", "/questions", questionPayload(index));
    etag = (await seedRequest(origin, token, "PATCH", `/teacher/exams/${created.id}`, {
      op: "addQuestion", mutationId: randomUUID(), sourceQuestionId: question.id,
    }, etag)).etag;
  }
  const opensAt = new Date(Date.now() + 86_400_000);
  etag = (await seedRequest(origin, token, "PATCH", `/teacher/exams/${created.id}`, {
    op: "saveSettings", mutationId: randomUUID(), settings: {
      durationMinutes: "30", maxAttempts: "3", allowAnswerReview: false,
      opensAt: opensAt.toISOString(), closesAt: new Date(opensAt.getTime() + 3_600_000).toISOString(),
    },
  }, etag)).etag;
  const classroomIds = [firstClass.id, secondClass.id];
  etag = (await seedRequest(origin, token, "PATCH", `/teacher/exams/${created.id}`, {
    op: "updateAssignments", mutationId: randomUUID(), addClassroomIds: classroomIds, removeClassroomIds: [],
  }, etag)).etag;
  await seedRequest(origin, token, "PATCH", `/teacher/exams/${created.id}`, { op: "publish", mutationId: randomUUID() }, etag);
  return {
    exam: await client.exam.findUniqueOrThrow({ where: { id: created.id } }),
    snapshots: await client.examQuestionSnapshot.findMany({ where: { examId: created.id } }),
    classroomIds, classroomName: (await client.classroom.findUniqueOrThrow({ where: { id: firstClass.id } })).name,
  };
}

function orderedSnapshots(sample: Sample): ExamQuestionSnapshot[] {
  const byId = new Map(sample.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  let id = sample.exam.snapshotHeadId;
  let result: ExamQuestionSnapshot[] = [];
  while (id !== null && result.length < 21) {
    const snapshot = byId.get(id);
    if (!snapshot) throw new Error("Invalid API sample chain");
    result = [...result, snapshot];
    id = snapshot.nextSnapshotId;
  }
  if (result.length !== 20 || id !== null) throw new Error("API sample must contain an ordered chain of20 snapshots");
  return result;
}

function publication(index: number, now: number) {
  const phase = (["SCHEDULED", "OPEN", "CLOSED", null] as const)[index % 4] ?? null;
  const opensAt = new Date(now + (phase === "SCHEDULED" ? 3_600_000 : -14_400_000));
  const closesAt = new Date(now + (phase === "CLOSED" ? -7_200_000 : 7_200_000));
  return { phase, opensAt, closesAt, firstPublishedAt: phase ? new Date(now - 18_000_000) : null };
}

function copiedPayload(payload: Prisma.JsonValue): Prisma.InputJsonValue {
  if (payload === null) throw new Error("A captured API snapshot cannot have a null payload");
  return payload;
}

function clonedExam(sample: Sample, index: number, now: number) {
  const id = randomUUID();
  const revision = randomUUID();
  const eventId = randomUUID();
  const source = orderedSnapshots(sample);
  const snapshotIds = source.map(() => randomUUID());
  const schedule = publication(index, now);
  const cold = schedule.phase === "OPEN" && index < 205;
  const exam: Prisma.ExamCreateManyInput = {
    id, teacherId: sample.exam.teacherId, title: `Đề hiệu năng ${index}`, durationMinutes: "30", maxAttempts: "3",
    allowAnswerReview: false, opensAt: schedule.opensAt, closesAt: schedule.closesAt,
    activePublicationId: schedule.phase ? eventId : null, activePhase: cold ? "SCHEDULED" : schedule.phase,
    firstPublishedAt: schedule.firstPublishedAt, revision, lastMutationId: randomUUID(), snapshotCount: 20n,
    snapshotHeadId: snapshotIds[0] ?? null, snapshotTailId: snapshotIds[19] ?? null,
    createdAt: new Date(now - index * 1000), updatedAt: new Date(now - index * 1000),
  };
  const snapshots: Prisma.ExamQuestionSnapshotCreateManyInput[] = source.map((snapshot, ordinal) => {
    const snapshotId = snapshotIds[ordinal];
    if (!snapshotId) throw new Error("Missing fixture snapshot identity");
    return {
      id: snapshotId, examId: id, sourceQuestionId: snapshot.sourceQuestionId,
      capturedAt: snapshot.capturedAt, payload: copiedPayload(snapshot.payload), nextSnapshotId: snapshotIds[ordinal + 1] ?? null,
    };
  });
  const history: Prisma.ExamActionHistoryCreateManyInput[] = schedule.phase ? [{
    id: eventId, examId: id, ordinal: 1n, action: "PUBLISHED", actorId: sample.exam.teacherId,
    actedAt: schedule.firstPublishedAt ?? new Date(now), resultingRevision: revision,
    payload: { classroomIds: sample.classroomIds, opensAt: schedule.opensAt.toISOString(), closesAt: schedule.closesAt.toISOString() },
  }] : [];
  const assignments = sample.classroomIds.map((classroomId) => ({ examId: id, classroomId }));
  return { exam, snapshots, history, assignments };
}

async function cloneTeacher(client: PrismaClient, sample: Sample): Promise<void> {
  const now = Date.now();
  for (let start = 1; start < 5000; start += 100) {
    const group = Array.from({ length: Math.min(100, 5000 - start) }, (_, offset) => clonedExam(sample, start + offset, now));
    await client.$transaction(async (tx) => {
      await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
      await tx.exam.createMany({ data: group.map((entry) => entry.exam) });
      await tx.examQuestionSnapshot.createMany({ data: group.flatMap((entry) => entry.snapshots) });
      await tx.currentExamAssignment.createMany({ data: group.flatMap((entry) => entry.assignments) });
      await tx.examActionHistory.createMany({ data: group.flatMap((entry) => entry.history) });
    }, { timeout: 30_000 });
  }
}

export async function seedExamListFixture(client: PrismaClient, origin: string, secret: string, runId: string): Promise<ExamListFixture> {
  const teacher = await client.user.create({ data: { email: `exam-perf-${runId}-teacher@example.test`, displayName: "Giáo viên hiệu năng", role: "TEACHER" } });
  const otherTeacher = await client.user.create({ data: { email: `exam-perf-${runId}-other@example.test`, displayName: "Giáo viên ngoài phạm vi", role: "TEACHER" } });
  const student = await client.user.create({ data: { email: `exam-perf-${runId}-student@example.test`, displayName: "Học sinh hiệu năng" } });
  const sample = await sampleThroughApi(client, origin, teacher, secret);
  await client.enrollment.createMany({ data: sample.classroomIds.map((classroomId, index) => ({
    classroomId, userId: student.id, status: index === 0 ? "APPROVED" : "PENDING", approvedAt: index === 0 ? new Date() : null,
  })) });
  await cloneTeacher(client, sample);
  await cloneTeacher(client, await sampleThroughApi(client, origin, otherTeacher, secret));
  return {
    teacher, otherTeacher, student, classroomName: sample.classroomName,
    teacherToken: fixtureAccessToken(teacher, secret), studentToken: fixtureAccessToken(student, secret),
  };
}

export async function cleanExamListFixture(client: PrismaClient, runId: string): Promise<void> {
  if (runId.length !== 16 || !/^[a-f0-9]+$/.test(runId)) throw new Error("Invalid private fixture namespace");
  const users = await client.user.findMany({ where: { email: { startsWith: `exam-perf-${runId}-` } } });
  const teacherIds = users.filter((user) => user.role === "TEACHER").map((user) => user.id);
  await client.$transaction(async (tx) => {
    await tx.$executeRaw`SET CONSTRAINTS ALL DEFERRED`;
    await tx.examActionHistory.deleteMany({ where: { exam: { teacherId: { in: teacherIds } } } });
    await tx.exam.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await tx.question.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await tx.chapter.deleteMany({ where: { subject: { teacherId: { in: teacherIds } } } });
    await tx.subject.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await tx.classroom.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await tx.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
  }, { timeout: 30_000 });
}
