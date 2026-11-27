import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { cpus, platform, release, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createExamVerificationClient, verifiedExamDatabaseUrl } from "./exam-verification-db.js";
import { cleanExamListFixture, fixtureAccessToken, seedExamListFixture, type ExamListFixture } from "./exam-list-fixture.js";

const apiDirectory = fileURLToPath(new URL("../", import.meta.url));
const evidenceDirectory = fileURLToPath(new URL("../../../.specify/features/exam-authoring-assignment/implementation/", import.meta.url));
const runId = randomBytes(8).toString("hex");
const secret = randomBytes(32).toString("hex");
const metadataKeys = ["title", "teacherName", "questionCount", "durationMinutes", "opensAt", "closesAt", "state", "maxAttempts", "passwordRequired", "allowAnswerReview", "qualifyingClassroomNames"].sort();
const cases = [
  ["teacher", undefined], ["teacher", "DRAFT"], ["teacher", "SCHEDULED"], ["teacher", "OPEN"], ["teacher", "CLOSED"],
  ["student", undefined], ["student", "SCHEDULED"], ["student", "OPEN"], ["student", "CLOSED"],
] as const;
interface Measurement { audience: string; state: string; page: string; samples: number; p95Ms: number; maxMs: number }
let client: PrismaClient | undefined;
let fixture: ExamListFixture | undefined;
let child: ChildProcess | undefined;
let origin = "";
let temporaryDirectory = "";
let output = "";
let measurements: Measurement[] = [];
let coldMeasurements: Array<{ audience: string; durationMs: number }> = [];
let verifiedFixture = false;

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cannot reserve benchmark port");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForApi(): Promise<void> {
  const deadline = performance.now() + 30_000;
  let lastError: unknown;
  while (performance.now() < deadline) {
    if (child?.exitCode !== null) throw new Error("Compiled benchmark API stopped before readiness");
    try {
      if ((await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Compiled benchmark API did not become ready", { cause: lastError });
}

async function startCompiledApi(): Promise<void> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "quiz-exam-perf-"));
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(apiDirectory, "dist/main.js")], {
    cwd: apiDirectory, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(port), DATABASE_URL: verifiedExamDatabaseUrl(),
      JWT_SECRET: secret, JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
      TEACHER_CODE: "LOCAL-TEACHER-CODE", UPLOAD_DIR: temporaryDirectory,
      CORS_ORIGINS: "http://localhost:5173", OAUTH_GOOGLE_CLIENT_ID: "verification", OAUTH_GOOGLE_CLIENT_SECRET: "verification" },
  });
  child.stdout?.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-32_000); });
  child.stderr?.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-32_000); });
  await once(child, "spawn");
  await waitForApi();
}

function currentFixture(): ExamListFixture {
  if (!fixture) throw new Error("Performance fixture is not initialized");
  return fixture;
}

async function listRequest(audience: "teacher" | "student", state?: string, cursor?: string) {
  const current = currentFixture();
  const query = new URLSearchParams({ pageSize: "25" });
  if (state) query.set("state", state);
  if (cursor) query.set("cursor", cursor);
  const token = audience === "teacher" ? current.teacherToken : current.studentToken;
  const start = performance.now();
  const response = await fetch(`${origin}/${audience}/exams?${query}`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
  });
  const buffer = await response.arrayBuffer();
  const durationMs = performance.now() - start;
  expect(response.status).toBe(200);
  const body: unknown = JSON.parse(Buffer.from(buffer).toString("utf8"));
  expect(body).toHaveProperty("data.items");
  return { durationMs, body, headers: response.headers };
}

function pageFrom(body: unknown): { items: Array<Record<string, unknown>>; nextCursor: string | null } {
  if (!body || typeof body !== "object" || !("data" in body) || !body.data || typeof body.data !== "object") throw new Error("Invalid benchmark envelope");
  const data = body.data;
  if (!("items" in data) || !Array.isArray(data.items) || !("nextCursor" in data)
    || (data.nextCursor !== null && typeof data.nextCursor !== "string")) throw new Error("Invalid benchmark page");
  return { items: data.items, nextCursor: data.nextCursor };
}

async function verifySafePage(audience: "teacher" | "student", body: unknown, headers: Headers, state?: string): Promise<void> {
  const current = currentFixture();
  const page = pageFrom(body);
  expect(page.items).toHaveLength(25);
  expect(headers.get("Cache-Control")).toContain("no-store");
  expect(headers.get("X-Exam-Server-Time")).not.toBeNull();
  if (audience === "teacher") {
    const ids = page.items.map((item) => {
      if (typeof item.id !== "string") throw new Error("Invalid teacher result identity");
      if (state) expect(item.state).toBe(state);
      expect(item.questionCount).toBe("20");
      return item.id;
    });
    expect(await client?.exam.count({ where: { id: { in: ids }, teacherId: current.teacher.id } })).toBe(25);
    return;
  }
  for (const item of page.items) {
    expect(Object.keys(item).sort()).toEqual(["detailPath", "metadata"]);
    const metadata = item.metadata;
    expect(metadata).toBeTypeOf("object");
    if (!metadata || typeof metadata !== "object") throw new Error("Missing metadata");
    expect(Object.keys(metadata).sort()).toEqual(metadataKeys);
    if (state) expect(Reflect.get(metadata, "state")).toBe(state);
    expect(["SCHEDULED", "OPEN", "CLOSED"]).toContain(Reflect.get(metadata, "state"));
    expect(metadata).toMatchObject({ questionCount: "20", allowAnswerReview: false, qualifyingClassroomNames: [current.classroomName] });
  }
}

async function measureView(audience: "teacher" | "student", state: string | undefined, cursor: string | undefined, page: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) await listRequest(audience, state, cursor);
  let durations: number[] = [];
  for (let index = 0; index < 100; index += 1) {
    const response = await listRequest(audience, state, cursor);
    if (index === 0) await verifySafePage(audience, response.body, response.headers, state);
    durations = [...durations, response.durationMs];
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const p95Ms = sorted[Math.ceil(sorted.length * 0.95) - 1];
  if (p95Ms === undefined) throw new Error("Missing measured samples");
  measurements = [...measurements, { audience, state: state ?? "ALL", page, samples: durations.length, p95Ms, maxMs: Math.max(...durations) }];
  expect(p95Ms, `${audience}/${state ?? "ALL"}/${page} local p95`).toBeLessThanOrEqual(400);
}

async function withProbeDraft(check: (id: string, etag: string) => Promise<void>): Promise<void> {
  const id = randomUUID();
  const token = currentFixture().teacherToken;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const created = await fetch(`${origin}/teacher/exams`, {
      method: "POST", headers, body: JSON.stringify({ id, title: "Đề kiểm tra giao thức", mutationId: randomUUID() }),
    });
    expect(created.status).toBe(201);
    await created.arrayBuffer();
    const etag = created.headers.get("ETag");
    if (!etag) throw new Error("Create response omitted its canonical validator");
    await check(id, etag);
  } finally {
    const current = await fetch(`${origin}/teacher/exams/${id}`, { headers });
    await current.arrayBuffer();
    if (current.ok) {
      const etag = current.headers.get("ETag");
      if (!etag) throw new Error("Cannot clean probe draft without canonical validator");
      const deleted = await fetch(`${origin}/teacher/exams/${id}`, { method: "DELETE", headers: { ...headers, "If-Match": etag } });
      expect(deleted.status).toBe(200);
      await deleted.arrayBuffer();
    }
  }
}

async function stopApi(): Promise<void> {
  if (!child || child.exitCode !== null) return;
  const ended = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child?.kill("SIGKILL"), 5000);
  try { await ended; } finally { clearTimeout(timer); }
}

async function captureQueryPlans(): Promise<void> {
  if (!fixture) return;
  await mkdir(evidenceDirectory, { recursive: true });
  const probe = spawn(process.execPath, [join(apiDirectory, "verification/exam-list-query-plans.mjs")], {
    cwd: apiDirectory, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env,
      EXAM_PLAN_TEACHER_ID: fixture.teacher.id, EXAM_PLAN_STUDENT_ID: fixture.student.id,
      EXAM_PLAN_OUTPUT: join(evidenceDirectory, "query-plans.json") },
  });
  probe.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const [code] = await once(probe, "exit");
  if (code !== 0) throw new Error("Compiled query-plan capture failed; see performance-api.log");
}

async function saveEvidence(): Promise<void> {
  await mkdir(evidenceDirectory, { recursive: true });
  const [version] = client ? await client.$queryRaw<Array<{ version: string }>>`SELECT version() AS version` : [];
  const evidence = {
    status: verifiedFixture && measurements.length === 18 && measurements.every((entry) => entry.p95Ms <= 400) ? "PASS" : "INCOMPLETE_OR_FAILED",
    scope: "Performance measurements; full HTTP smoke and cleanup verdict is in the Vitest run",
    date: new Date().toISOString(), runtime: process.version, platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model, postgres: version?.version, mode: "compiled dist/main.js, NODE_ENV=production",
    fixture: { examsPerTeacher: 5000, teachers: 2, snapshotsPerExam: 20, states: 4, approvedAndPendingClasses: true, verified: verifiedFixture },
    clock: "client dispatch to complete response arrayBuffer; excludes parsing/render", coldMeasurements, measurements,
  };
  await Promise.all([
    writeFile(join(evidenceDirectory, "performance-results.json"), JSON.stringify(evidence, null, 2)),
    writeFile(join(evidenceDirectory, "performance-api.log"), output),
  ]);
}

beforeAll(async () => {
  client = await createExamVerificationClient();
  await startCompiledApi();
  fixture = await seedExamListFixture(client, origin, secret, runId);
  expect(await client.exam.count({ where: { teacherId: fixture.teacher.id } })).toBe(5000);
  expect(await client.exam.count({ where: { teacherId: fixture.otherTeacher.id } })).toBe(5000);
  verifiedFixture = true;
  const teacherCold = await listRequest("teacher", "OPEN");
  await verifySafePage("teacher", teacherCold.body, teacherCold.headers, "OPEN");
  const firstStudent = await listRequest("student", "OPEN");
  const next = pageFrom(firstStudent.body).nextCursor;
  if (!next) throw new Error("Cold student fixture must have a later page");
  const studentCold = await listRequest("student", "OPEN", next);
  await verifySafePage("student", studentCold.body, studentCold.headers, "OPEN");
  coldMeasurements = [{ audience: "teacher", durationMs: teacherCold.durationMs }, { audience: "student", durationMs: studentCold.durationMs }];
}, 180_000);

it("compiled HTTP preserves canonical create validators, explicit defaults and state preconditions", async () => {
  await withProbeDraft(async (id, etag) => {
    const headers = { Authorization: `Bearer ${currentFixture().teacherToken}`, "Content-Type": "application/json" };
    const read = await fetch(`${origin}/teacher/exams/${id}`, { headers });
    expect(read.headers.get("ETag")).toBe(etag);
    expect(await read.json()).toMatchObject({ data: { id, maxAttempts: null, allowAnswerReview: null, state: "DRAFT" } });
    const body = JSON.stringify({ op: "saveSettings", mutationId: randomUUID(), settings: { durationMinutes: "1" } });
    for (const [validator, expected] of [[undefined, 428], [`W/${etag}`, 400], [etag.replace('-DRAFT"', '-OPEN"'), 412]] as const) {
      const rejected = await fetch(`${origin}/teacher/exams/${id}`, { method: "PATCH", headers: { ...headers, ...(validator ? { "If-Match": validator } : {}) }, body });
      expect(rejected.status).toBe(expected);
      await rejected.arrayBuffer();
    }
    const options = await fetch(`${origin}/teacher/exams/${id}`, { method: "OPTIONS", headers: {
      Origin: "http://localhost:5173", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "If-Match,Authorization,Content-Type",
    } });
    expect(options.status).toBe(204);
    expect(options.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain("if-match");
    expect(options.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    await options.arrayBuffer();
  });
});

it("compiled HTTP denies foreign roles and safely maps oversized/malformed JSON", async () => {
  await withProbeDraft(async (id) => {
    for (const token of [currentFixture().studentToken]) {
      const denied = await fetch(`${origin}/teacher/exams/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(denied.status).toBe(403);
      await denied.arrayBuffer();
    }
    const marker = `${runId}-private-input`;
    const headers = { Authorization: `Bearer ${currentFixture().teacherToken}`, "Content-Type": "application/json" };
    for (const [body, expected, code] of [
      [JSON.stringify({ title: marker.repeat(10_000) }), 413, "EXAM_REQUEST_TOO_LARGE"],
      [`${marker}{`, 400, "VALIDATION_ERROR"],
    ] as const) {
      const response = await fetch(`${origin}/teacher/exams`, { method: "POST", headers, body });
      expect(response.status).toBe(expected);
      const text = await response.text();
      expect(JSON.parse(text)).toMatchObject({ code });
      expect(text).not.toContain(marker);
      expect(text).not.toContain(runId.slice(0, 8));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(output).not.toContain(marker);
    expect(output).not.toContain(runId.slice(0, 8));
  });
});

it("compiled password writes admit one hash per teacher and expose retry feedback", async () => {
  await withProbeDraft(async (id, etag) => {
    const current = currentFixture();
    const password = `private-hash-${runId}`;
    const write = (token: string) => fetch(`${origin}/teacher/exams/${id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "If-Match": etag },
      body: JSON.stringify({ op: "saveSettings", mutationId: randomUUID(), settings: { password: { mode: "set", value: password } } }),
    });
    const responses = await Promise.all([write(current.teacherToken), write(current.teacherToken), write(fixtureAccessToken(current.otherTeacher, secret))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 403, 429]);
    const busy = responses.find((response) => response.status === 429);
    expect(busy?.headers.get("Retry-After")).toMatch(/^[1-9][0-9]*$/);
    for (const response of responses) expect(await response.text()).not.toContain(password);
  });
});

it.each(cases)("REQ-EXAM-053/063 %s state=%s, first and later pages meet p95", async (audience, state) => {
  const first = await listRequest(audience, state);
  const next = pageFrom(first.body).nextCursor;
  if (!next) throw new Error("Expected fixture to cover later cursor pages");
  await measureView(audience, state, undefined, "first");
  await measureView(audience, state, next, "later");
}, 60_000);

afterAll(async () => {
  const plans = await Promise.allSettled([captureQueryPlans()]);
  const work = await Promise.allSettled([
    saveEvidence(), stopApi(),
    ...(client ? [cleanExamListFixture(client, runId)] : []),
  ]);
  await client?.$disconnect();
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  const failures = [...plans, ...work].filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Benchmark cleanup/evidence failed");
}, 60_000);
