import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export function requireDisposableUrl(value) {
  let target;
  try { target = new URL(value); } catch { throw new Error("EXAM_VERIFY_DATABASE_URL must name a disposable target"); }
  const database = decodeURIComponent(target.pathname.slice(1));
  const allowedOptions = new Set(["schema", "connection_limit", "pool_timeout", "connect_timeout"]);
  if (!["postgres:", "postgresql:"].includes(target.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
    || !/^quiz_exam_verify_[A-Za-z0-9_]+$/.test(database)
    || [...target.searchParams.keys()].some((key) => !allowedOptions.has(key))) {
    throw new Error("Refusing non-disposable or remote database target");
  }
  return value;
}

function checkBinding(port, host) {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (host === "::1" && error.code === "EAFNOSUPPORT") resolvePort();
      else reject(new Error(`Port ${port} is occupied; refusing to reuse a server`));
    });
    server.listen({ port, host }, () => {
      server.close((error) => error ? reject(error) : resolvePort());
    });
  });
}

export async function assertPortAvailable(port) {
  await checkBinding(port, "127.0.0.1");
  await checkBinding(port, "::1");
}

export async function assertFixtureMarker({ apiUrl, examId, title, accessToken }) {
  const target = new URL(apiUrl);
  if (target.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
    throw new Error("Refusing remote fixture identity probe");
  }
  const response = await fetch(new URL(`/teacher/exams/${encodeURIComponent(examId)}`, target), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("Fixture marker identity was not found on the API");
  const body = await response.json();
  if (body?.data?.id !== examId || body.data.title !== title || body.data.state !== "DRAFT") {
    throw new Error("Fixture marker identity does not match the isolated database");
  }
}

export async function verifyDatabaseTarget(url) {
  const requireApi = createRequire(join(root, "apps/api/package.json"));
  const { PrismaClient } = requireApi("@prisma/client");
  const client = new PrismaClient({ datasourceUrl: url });
  const database = decodeURIComponent(new URL(url).pathname.slice(1));
  const marker = `uaw:disposable:US-EXAM-001:${database.slice("quiz_exam_verify_".length)}`;
  try {
    const [actual] = await client.$queryRaw`
      SELECT current_database() AS database,
        shobj_description(oid, 'pg_database') AS marker,
        current_setting('server_version_num')::int AS version
      FROM pg_database WHERE datname = current_database()
    `;
    if (actual?.database !== database || actual.marker !== marker || actual.version < 160000 || actual.version >= 170000) {
      throw new Error("Refusing database writes: disposable PostgreSQL 16 identity does not match");
    }
  } finally { await client.$disconnect(); }
}

function run(command, args, environment) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      if (code === 0) resolveRun();
      else reject(new Error(`${command} ${args.slice(0, 4).join(" ")} failed (${signal ?? code})`));
    });
  });
}

function environmentFor(directory, databaseUrl) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && key !== "E2E_GOOGLE_REAL"));
  return {
    ...inherited,
    NODE_ENV: "test", DATABASE_URL: databaseUrl, EXAM_VERIFY_DATABASE_URL: databaseUrl,
    PORT: "3000", CORS_ORIGINS: "http://localhost:5173",
    JWT_SECRET: randomBytes(32).toString("hex"), JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
    TEACHER_CODE: "LOCAL-TEACHER-CODE", UPLOAD_DIR: join(directory, "uploads"),
    OAUTH_GOOGLE_CLIENT_ID: "isolated-verification", OAUTH_GOOGLE_CLIENT_SECRET: "isolated-verification",
    VITE_API_URL: "http://localhost:3000", EXAM_E2E_API_URL: "http://localhost:3000",
    EXAM_VERIFY_SETUP_FILE: join(directory, "fixture.json"), EXAM_VERIFY_NONCE: randomBytes(24).toString("hex"),
    EXAM_VERIFY_ARTIFACT_DIR: join(root, ".specify/features/exam-authoring-assignment/implementation/browser-runs", randomBytes(8).toString("hex")),
  };
}

async function main(testPaths) {
  const databaseUrl = requireDisposableUrl(process.env.EXAM_VERIFY_DATABASE_URL);
  if (testPaths.some((path) => !/^e2e\/[A-Za-z0-9_.-]+\.spec\.ts$/.test(path))) {
    throw new Error("Pass only e2e/*.spec.ts test paths; the isolated config cannot be overridden");
  }
  await Promise.all([assertPortAvailable(3000), assertPortAvailable(5173)]);
  await verifyDatabaseTarget(databaseUrl);
  const directory = await mkdtemp(join(tmpdir(), "quiz-exam-stack-"));
  const environment = environmentFor(directory, databaseUrl);
  try {
    await mkdir(environment.UPLOAD_DIR);
    await run("corepack", ["pnpm", "--filter", "@quiz/api", "exec", "prisma", "migrate", "deploy"], environment);
    await run("corepack", ["pnpm", "--filter", "@quiz/api", "build"], environment);
    await run("corepack", ["pnpm", "--filter", "@quiz/api", "exec", "vitest", "run", "--config", "vitest.exam-db.config.ts", "verification/exam-browser-fixture.exam-db.spec.ts"], environment);
    await run("corepack", ["pnpm", "--filter", "@quiz/web", "exec", "playwright", "test", "--config", "playwright.exam-verification.config.ts", ...testPaths], environment);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Exam verification failed"}\n`);
    process.exitCode = 1;
  });
}
