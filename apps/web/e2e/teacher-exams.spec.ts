import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

const API = process.env.EXAM_E2E_API_URL ?? "http://localhost:3000";
const TEACHER_CODE = process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE";
interface Teacher { email: string; password: string; token: string }
async function registerTeacher(request: APIRequestContext): Promise<Teacher> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-exam-${unique}@example.com`;
  const password = "Password123!";
  const register = await request.post(`${API}/auth/register`, { data: { email, password, displayName: `GV ${unique.slice(-6)}`, requestedRole: "TEACHER", teacherCode: TEACHER_CODE } });
  expect(register.status(), await register.text()).toBe(201);
  const login = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(login.status(), await login.text()).toBe(200);
  const body = (await login.json()) as { data: { accessToken: string } };
  return { email, password, token: body.data.accessToken };
}
async function loginViaUi(page: Page, teacher: Teacher): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(teacher.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(teacher.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }
async function fixtureClass(request: APIRequestContext, token: string): Promise<string> {
  const result = await request.post(`${API}/classrooms`, { headers: auth(token), data: { name: `Lớp đề ${Date.now()}` } });
  expect(result.status(), await result.text()).toBe(201);
  return ((await result.json()) as { data: { id: string } }).data.id;
}
async function fixtureQuestion(request: APIRequestContext, token: string): Promise<void> {
  const result = await request.post(`${API}/questions`, {
    headers: auth(token),
    data: {
      type: "SINGLE_CHOICE",
      content: "Câu dùng trong đề E2E: $x^2$",
      difficulty: "EASY",
      explanation: "Giải thích câu hỏi E2E",
      subjectName: `Toán ${Date.now()}`,
      chapterName: "Chương E2E",
      options: ["1", "2"],
      correctOptionIndexes: [0],
    },
  });
  expect(result.status(), await result.text()).toBe(201);
}
function vietnamLocal(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
}
test("teacher exam list renders the empty state at 1024px", async ({ page, request }, testInfo) => {
  const teacher = await registerTeacher(request);
  await loginViaUi(page, teacher);
  await page.goto("/teacher/exams");
  await expect(page.getByRole("heading", { name: "Đề thi của tôi" })).toBeVisible();
  await expect(page.getByText("Chưa có đề thi trong trạng thái này.")).toBeVisible();
  await capture(page, testInfo, "teacher-exams-empty-1024.png");
});
test("teacher saves, configures, assigns, publishes and withdraws a draft", async ({ page, request }, testInfo) => {
  const teacher = await registerTeacher(request);
  const classId = await fixtureClass(request, teacher.token);
  await fixtureQuestion(request, teacher.token);
  const clock = await request.get(`${API}/teacher/exams`, { headers: auth(teacher.token) });
  expect(clock.status()).toBe(200);
  const serverTime = clock.headers()["x-exam-server-time"];
  if (!serverTime) throw new Error("exam API did not return server time");
  const opensAt = vietnamLocal(new Date(Date.parse(serverTime) + 60 * 60_000).toISOString());
  const closesAt = vietnamLocal(new Date(Date.parse(serverTime) + 3 * 60 * 60_000).toISOString());
  await loginViaUi(page, teacher);
  await page.goto("/teacher/exams/new");
  await page.getByLabel("Tên đề").fill("Đề E2E đã lưu");
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/exams\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "Xuất bản" }).click();
  await expect(page.getByRole("alert")).toContainText("Thông tin chưa hợp lệ");
  await expect(page.getByText("Nháp", { exact: true }).first()).toBeVisible();
  await capture(page, testInfo, "teacher-exam-validation-1024.png");
  await page.getByLabel("Thời lượng (phút)").fill("60");
  await page.getByLabel("Số lượt làm bài").fill("2");
  await page.getByLabel("Cho phép xem đáp án sau khi nộp").selectOption("no");
  await page.getByLabel("Giờ mở (giờ Việt Nam)").fill(opensAt);
  await page.getByLabel("Giờ đóng (giờ Việt Nam)").fill(closesAt);
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Đã lưu cấu hình.")).toBeVisible();
  await page.getByRole("button", { name: "Thêm câu" }).click();
  await expect(page.getByText("Câu hỏi trong đề (1)")).toBeVisible();
  const classList = await request.get(`${API}/classrooms`, { headers: auth(teacher.token) });
  expect(classList.status()).toBe(200);
  const classrooms = (await classList.json()) as { data: { id: string; name: string }[] };
  const classroom = classrooms.data.find((item) => item.id === classId);
  if (!classroom) throw new Error("fixture classroom is missing");
  await page.getByLabel(classroom.name, { exact: true }).check();
  await page.getByRole("button", { name: "Lưu giao lớp" }).click();
  await expect(page.getByText("Đã lưu thay đổi.")).toBeVisible();
  await page.getByRole("button", { name: "Xuất bản" }).click();
  await expect(page.getByText("Chờ mở", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Đã xuất bản/)).toBeVisible();
  await capture(page, testInfo, "teacher-exam-scheduled-1024.png");
  await page.getByRole("button", { name: "Thu hồi" }).click();
  await expect(page.getByText("Nháp", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Đã thu hồi")).toBeVisible();
});
