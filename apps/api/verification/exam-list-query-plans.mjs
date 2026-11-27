import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { requireDisposableUrl, verifyDatabaseTarget } from "../../web/e2e/run-exam-verification.mjs";

const requireApi = createRequire(new URL("../package.json", import.meta.url));
requireApi("reflect-metadata");
const { PrismaService } = requireApi("./dist/prisma/prisma.service.js");
const { PrismaExamRepository } = requireApi("./dist/exams/prisma-exam.repository.js");
const { ExamsService } = requireApi("./dist/exams/exams.service.js");
const { StudentExamProjection } = requireApi("./dist/exams/student-exam.projection.js");

async function main() {
  const url = requireDisposableUrl(process.env.EXAM_VERIFY_DATABASE_URL);
  await verifyDatabaseTarget(url);
  const prisma = new PrismaService({ datasourceUrl: url, log: [{ level: "query", emit: "event" }] });
  let queries = [];
  prisma.$on("query", (event) => {
    if (event.query.includes('"effectiveState"')) queries = [...queries, event];
  });
  try {
    const teacher = await prisma.user.findFirstOrThrow({ where: { id: process.env.EXAM_PLAN_TEACHER_ID, email: { startsWith: "exam-perf-" }, role: "TEACHER" } });
    const student = await prisma.user.findFirstOrThrow({ where: { id: process.env.EXAM_PLAN_STUDENT_ID, email: { startsWith: "exam-perf-" }, role: "STUDENT" } });
    await new ExamsService(new PrismaExamRepository(prisma)).list(teacher, { state: "OPEN", pageSize: "25" });
    await new StudentExamProjection(prisma).list(student, { state: "OPEN", pageSize: "25" });
    const captured = queries;
    if (captured.length !== 2) throw new Error("Expected the two actual compiled list projection queries");
    let plans = [];
    for (const [index, event] of captured.entries()) {
      const parameters = JSON.parse(event.params);
      if (!Array.isArray(parameters)) throw new Error("Invalid captured query parameters");
      // SQL is emitted by the compiled list projections; original parameters remain bound.
      const plan = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${event.query}`, ...parameters);
      plans = [...plans, { audience: index === 0 ? "teacher" : "student", sql: event.query, parameters, plan }];
    }
    const output = process.env.EXAM_PLAN_OUTPUT;
    if (!output) throw new Error("Missing query-plan evidence path");
    await writeFile(output, JSON.stringify({ capturedFrom: "compiled production list methods", plans }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
