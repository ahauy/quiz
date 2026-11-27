import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Happy path for US-CLS-001 against the real API + Postgres (no Google consent).
const API = "http://localhost:3000";
const WEB = "http://localhost:5173";
// CI sets TEACHER_CODE; local runs read the checked-in .env (LOCAL-TEACHER-CODE).
const TEACHER_CODE = process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE";
const CLASS_NAME = "Lớp Toán E2E";

interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

async function registerUser(
  request: APIRequestContext,
  prefix: string,
  extra: Record<string, string> = {},
): Promise<TestUser> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user: TestUser = {
    email: `e2e-${prefix}-${suffix}@example.com`,
    password: "Password123!",
    displayName: `${prefix}-${suffix.slice(-6)}`,
  };
  const response = await request.post(`${API}/auth/register`, {
    data: { ...user, ...extra },
  });
  expect(response.status()).toBe(201);
  return user;
}

async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/(teacher|student)$/);
}

test("US-CLS-001: teacher creates a class, student joins with code, teacher approves, student sees class", async ({
  browser,
  request,
}) => {
  const teacher = await registerUser(request, "cls-teacher", {
    requestedRole: "TEACHER",
    teacherCode: TEACHER_CODE,
  });
  const student = await registerUser(request, "cls-student");

  // Separate contexts keep the teacher and student sessions isolated in one test.
  const teacherContext = await browser.newContext({ baseURL: WEB });
  const studentContext = await browser.newContext({ baseURL: WEB });
  try {
    const teacherPage = await teacherContext.newPage();
    await loginViaUi(teacherPage, teacher.email, teacher.password);
    await teacherPage.goto("/teacher");
    await teacherPage.getByRole("link", { name: "Quản lý lớp học" }).click();
    await expect(teacherPage).toHaveURL(/\/teacher\/classrooms$/);

    await teacherPage.getByRole("button", { name: "Tạo lớp học" }).click();
    await teacherPage.getByLabel("Tên lớp").fill(CLASS_NAME);
    await teacherPage.getByRole("button", { name: "Tạo lớp", exact: true }).click();
    const classroom = teacherPage.getByTestId("classroom-item").filter({ hasText: CLASS_NAME });
    await expect(classroom).toBeVisible();
    const code = (await classroom.getByTestId("classroom-code").textContent())?.trim();
    if (!code) throw new Error("classroom code was not rendered");
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    const studentPage = await studentContext.newPage();
    await loginViaUi(studentPage, student.email, student.password);
    await studentPage.goto("/student");
    await studentPage.getByRole("link", { name: "Tham gia lớp học bằng mã" }).click();
    await expect(studentPage).toHaveURL(/\/student\/join$/);
    await studentPage.getByLabel("Mã lớp").fill(code.toLowerCase());
    await studentPage.getByRole("button", { name: "Tham gia lớp" }).click();
    await expect(studentPage.getByText(/Chờ giáo viên duyệt/)).toBeVisible();

    // Pending enrollment does not grant classroom visibility.
    await studentPage.goto("/student/classrooms");
    await expect(studentPage.getByText(CLASS_NAME)).toHaveCount(0);

    await teacherPage.goto("/teacher/classrooms");
    const row = teacherPage.getByTestId("roster-row").filter({ hasText: student.displayName });
    await expect(row).toBeVisible();
    await expect(row.getByTestId("roster-status")).toHaveText("Chờ duyệt");
    await row.getByRole("button", { name: `Duyệt ${student.displayName}` }).click();
    await expect(row.getByTestId("roster-status")).toHaveText("Đã duyệt");

    await studentPage.goto("/student/classrooms");
    await expect(studentPage.getByText(CLASS_NAME)).toBeVisible();
  } finally {
    await teacherContext.close();
    await studentContext.close();
  }
});
