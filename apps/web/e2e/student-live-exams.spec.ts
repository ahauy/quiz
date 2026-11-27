import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
const API = process.env.EXAM_E2E_API_URL ?? "http://localhost:3000";
const PASSWORD = "Password123!";
interface Actor { id: string; email: string; token: string }
async function call<T>(request: APIRequestContext, token: string, method: string, path: string, data?: unknown, etag?: string) {
  const response = await request.fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(etag ? { "If-Match": etag } : {}) },
    ...(data === undefined ? {} : { data }),
  });
  expect(response.ok(), `${method} ${path} status ${response.status()}`).toBeTruthy();
  const body = await response.json() as { data: T };
  return { data: body.data, etag: response.headers().etag };
}
async function actor(request: APIRequestContext, role: "TEACHER" | "STUDENT"): Promise<Actor> {
  const email = `exam-live-${randomUUID()}@example.test`;
  const registered = await request.post(`${API}/auth/register`, { data: {
    email, password: PASSWORD, displayName: role === "TEACHER" ? "Giáo viên thực" : "Học sinh thực",
    ...(role === "TEACHER" ? { requestedRole: role, teacherCode: process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE" } : {}),
  } });
  expect(registered.status()).toBe(201);
  const logged = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(logged.status()).toBe(200);
  const result = await logged.json() as { data: { user: { id: string }; accessToken: string } };
  return { email, id: result.data.user.id, token: result.data.accessToken };
}
async function published(request: APIRequestContext, teacher: Actor) {
  const classroom = await call<{ id: string; code: string; name: string }>(request, teacher.token, "POST", "/classrooms", { name: `Lớp thực ${randomUUID().slice(0, 8)}` });
  const question = await call<{ id: string }>(request, teacher.token, "POST", "/questions", {
    type: "TRUE_FALSE", content: "PRIVATE_SOURCE_QUESTION", correctAnswer: false, difficulty: "EASY", subjectName: "Môn thực", chapterName: "Chương 1", explanation: "PRIVATE_EXPLANATION",
  });
  const id = randomUUID();
  let result = await call<{ id: string }>(request, teacher.token, "POST", "/teacher/exams", { id, title: "Đề học sinh thực", mutationId: randomUUID() });
  const opensAt = new Date(Date.now() + 86_400_000);
  const operations = [
    { op: "addQuestion", sourceQuestionId: question.data.id },
    { op: "saveSettings", settings: { durationMinutes: "1", maxAttempts: "2", allowAnswerReview: false, opensAt: opensAt.toISOString(), closesAt: new Date(opensAt.getTime() + 60_000).toISOString() } },
    { op: "updateAssignments", addClassroomIds: [classroom.data.id], removeClassroomIds: [] },
    { op: "publish" },
  ];
  for (const operation of operations) {
    if (!result.etag) throw new Error("Missing canonical Exam validator");
    result = await call<{ id: string }>(request, teacher.token, "PATCH", `/teacher/exams/${id}`, { ...operation, mutationId: randomUUID() }, result.etag);
  }
  return { id, classroom: classroom.data };
}
test("real approved student sees safe metadata and loses access after enrollment removal", async ({ page, request }, info) => {
  const teacher = await actor(request, "TEACHER");
  const student = await actor(request, "STUDENT");
  const fixture = await published(request, teacher);
  await call(request, student.token, "POST", `/classrooms/${encodeURIComponent(fixture.classroom.code)}/join`);
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/login");
  await page.getByLabel("Email").fill(student.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
  const loaded = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === new URL(API).origin && url.pathname === "/student/exams" && response.request().method() === "GET" && response.status() === 200;
  });
  await page.goto("/student/exams");
  const pending = await loaded;
  expect((await pending.json()).data.items).toHaveLength(0);
  await call(request, teacher.token, "PATCH", `/classrooms/${fixture.classroom.id}/enrollments/${student.id}/approve`);
  await page.reload();
  await page.getByRole("link", { name: "Xem thông tin đề thi: Đề học sinh thực" }).click();
  await expect(page.getByRole("heading", { name: "Đề học sinh thực" })).toBeVisible();
  await expect(page.getByText(fixture.classroom.name, { exact: true })).toBeVisible();
  const direct = await call<Record<string, unknown>>(request, student.token, "GET", `/student/exams/${fixture.id}`);
  expect(Object.keys(direct.data).sort()).toEqual(["title", "teacherName", "questionCount", "durationMinutes", "opensAt", "closesAt", "state", "maxAttempts", "passwordRequired", "allowAnswerReview", "qualifyingClassroomNames"].sort());
  expect(JSON.stringify(direct.data)).not.toMatch(/PRIVATE_SOURCE_QUESTION|PRIVATE_EXPLANATION/);
  await page.screenshot({ path: info.outputPath("student-real-metadata-320.png"), fullPage: true });
  await call(request, teacher.token, "DELETE", `/classrooms/${fixture.classroom.id}/enrollments/${student.id}`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("Đề thi không khả dụng hoặc bạn không có quyền xem.");
  await expect(page.getByRole("heading", { name: "Đề học sinh thực" })).toHaveCount(0);
});
