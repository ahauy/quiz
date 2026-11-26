import { expect, test, type APIResponse, type Page } from "@playwright/test";

// Default CI E2E: real API + real Postgres, no Google consent.
// Each test gets an isolated browser context, so cookies never leak between tests.
const API = "http://localhost:3000";
// CI sets TEACHER_CODE in the job env; local runs read the checked-in .env (LOCAL-TEACHER-CODE).
const TEACHER_CODE = process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE";

function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  // A usable session navigates to the role home (guard sees the role from the store).
  await expect(page).toHaveURL(/\/(teacher|student)$/);
}

async function assertErrorEnvelope(
  response: APIResponse,
  status: number,
  code: string,
): Promise<void> {
  expect(response.status()).toBe(status);
  const body = await response.json();
  expect(body.code).toBe(code);
  expect(typeof body.message).toBe("string");
  expect(body.message.length).toBeGreaterThan(0);
  // Production-style errors never leak a stack trace or a success envelope.
  expect(body).not.toHaveProperty("stack");
  expect(body).not.toHaveProperty("data");
}

test("TC-001 register then login yields a usable session and STUDENT role", async ({ page, request }) => {
  const email = uniqueEmail("tc001");
  const password = "Password123!";

  const created = await request.post(`${API}/auth/register`, {
    data: { email, password, displayName: "TC-001" },
  });
  expect(created.status()).toBe(201);
  expect((await created.json()).data.role).toBe("STUDENT");

  const duplicate = await request.post(`${API}/auth/register`, {
    data: { email, password, displayName: "TC-001" },
  });
  await assertErrorEnvelope(duplicate, 409, "EMAIL_IN_USE");

  await loginViaUi(page, email, password);
  await expect(page).toHaveURL(/\/student$/);
});

test("TC-003 forgot-password issues a single-use URL; reset succeeds, reuse fails", async ({ page, request }) => {
  const email = uniqueEmail("tc003");
  const oldPassword = "OldPass123!";
  const newPassword = "NewPass123!";
  await request.post(`${API}/auth/register`, {
    data: { email, password: oldPassword, displayName: "TC-003" },
  });

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Gửi liên kết" }).click();

  const resetLink = page.getByTestId("reset-url");
  await expect(resetLink).toBeVisible();
  const resetUrl = await resetLink.getAttribute("href");
  if (!resetUrl) throw new Error("forgot-password did not return a reset URL");
  expect(resetUrl).toContain("/reset-password?token=");

  // The API builds the link host from env; navigate the web app with the token only.
  const token = new URL(resetUrl, "http://localhost").searchParams.get("token");
  if (!token) throw new Error("reset URL has no token");
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("Mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(page.getByText(/Đổi mật khẩu thành công/)).toBeVisible();

  // New password works, old password fails.
  const withNew = await request.post(`${API}/auth/login`, {
    data: { email, password: newPassword },
  });
  expect(withNew.status()).toBe(200);
  const withOld = await request.post(`${API}/auth/login`, {
    data: { email, password: oldPassword },
  });
  expect(withOld.status()).toBe(401);

  // Single use: replaying the consumed token is rejected.
  const reuse = await request.post(`${API}/auth/reset-password`, {
    data: { token, newPassword: "AnotherPass123!" },
  });
  expect(reuse.status()).toBe(400);
  expect((await reuse.json()).code).toBe("INVALID_RESET_TOKEN");
});

test("TC-004 teacherCode role assignment and DTO validation", async ({ page, request }) => {
  const teacherEmail = uniqueEmail("tc004-teacher");

  const teacher = await request.post(`${API}/auth/register`, {
    data: {
      email: teacherEmail,
      password: "Password123!",
      displayName: "Teacher",
      requestedRole: "TEACHER",
      teacherCode: TEACHER_CODE,
    },
  });
  expect(teacher.status()).toBe(201);
  expect((await teacher.json()).data.role).toBe("TEACHER");

  const wrongCode = await request.post(`${API}/auth/register`, {
    data: {
      email: uniqueEmail("tc004-bad"),
      password: "Password123!",
      displayName: "Teacher",
      requestedRole: "TEACHER",
      teacherCode: "definitely-wrong-code",
    },
  });
  await assertErrorEnvelope(wrongCode, 400, "INVALID_TEACHER_CODE");

  const noCode = await request.post(`${API}/auth/register`, {
    data: {
      email: uniqueEmail("tc004-student"),
      password: "Password123!",
      displayName: "Student",
      requestedRole: "STUDENT",
    },
  });
  expect(noCode.status()).toBe(201);
  expect((await noCode.json()).data.role).toBe("STUDENT");

  // ADMIN is out of contract and must be rejected by DTO validation.
  const admin = await request.post(`${API}/auth/register`, {
    data: {
      email: uniqueEmail("tc004-admin"),
      password: "Password123!",
      displayName: "Admin",
      requestedRole: "ADMIN",
    },
  });
  expect(admin.status()).toBe(400);

  // Web guard: a teacher account reaches the teacher-only area.
  await loginViaUi(page, teacherEmail, "Password123!");
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByTestId("teacher-area")).toBeVisible();
});

test("TC-005 profile update and password change invalidate old credentials", async ({ page, request }) => {
  const email = uniqueEmail("tc005");
  const oldPassword = "OldPass123!";
  const newPassword = "NewPass123!";
  await request.post(`${API}/auth/register`, {
    data: { email, password: oldPassword, displayName: "Before" },
  });

  // Wrong currentPassword is rejected by the API (needs a bearer token).
  const apiLogin = await request.post(`${API}/auth/login`, { data: { email, password: oldPassword } });
  const token = (await apiLogin.json()).data.accessToken as string;
  const badChange = await request.patch(`${API}/auth/me`, {
    data: { currentPassword: "wrong-password", newPassword: "Whatever123!" },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(badChange.status()).toBe(401);
  expect((await badChange.json()).code).toBe("INVALID_CREDENTIALS");

  await loginViaUi(page, email, oldPassword);
  await page.goto("/profile");
  await expect(page.getByLabel("Tên hiển thị")).toHaveValue("Before");
  await page.getByLabel("Tên hiển thị").fill("After");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByText(/Cập nhật hồ sơ thành công/)).toBeVisible();

  await page.getByLabel("Mật khẩu hiện tại").fill(oldPassword);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
  await page.getByLabel("Xác nhận mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  // Password change revokes tokens (ASM-AUTH-003): session is dropped -> /login.
  await expect(page).toHaveURL(/\/login$/);

  const withOld = await request.post(`${API}/auth/login`, {
    data: { email, password: oldPassword },
  });
  expect(withOld.status()).toBe(401);
  const withNew = await request.post(`${API}/auth/login`, {
    data: { email, password: newPassword },
  });
  expect(withNew.status()).toBe(200);
});

test("TC-006 logout invalidates access/refresh and guarded pages redirect", async ({ page, request }) => {
  const email = uniqueEmail("tc006");
  const password = "Password123!";
  await request.post(`${API}/auth/register`, {
    data: { email, password, displayName: "TC-006" },
  });

  // Obtain an access token that logout must invalidate (tokenVersion bump).
  const apiLogin = await request.post(`${API}/auth/login`, { data: { email, password } });
  const oldToken = (await apiLogin.json()).data.accessToken as string;

  await loginViaUi(page, email, password);
  const cookies = await page.context().cookies();
  const refreshCookie = cookies.find((cookie) => cookie.name.toLowerCase().includes("refresh"));

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Unauthenticated guard redirect.
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login$/);

  // Old access token rejected after tokenVersion bump.
  const me = await request.get(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${oldToken}` },
  });
  expect(me.status()).toBe(401);

  // Refresh token revoked: replaying the captured cookie fails.
  if (!refreshCookie) throw new Error("refresh cookie was not captured at login");
  const replay = await request.post(`${API}/auth/refresh`, {
    headers: refreshCookie ? { Cookie: `${refreshCookie.name}=${refreshCookie.value}` } : {},
  });
  expect(replay.status()).toBe(401);
});

test("TC-009 role guards render role areas and redirect unauthenticated users", async ({ page, request }) => {
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/student");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login$/);

  const studentEmail = uniqueEmail("tc009-student");
  await request.post(`${API}/auth/register`, {
    data: { email: studentEmail, password: "Password123!", displayName: "Student" },
  });
  await loginViaUi(page, studentEmail, "Password123!");
  await expect(page.getByTestId("student-area")).toBeVisible();
  await page.goto("/teacher");
  await expect(page.getByTestId("teacher-area")).toHaveCount(0);

  const teacherEmail = uniqueEmail("tc009-teacher");
  await request.post(`${API}/auth/register`, {
    data: {
      email: teacherEmail,
      password: "Password123!",
      displayName: "Teacher",
      requestedRole: "TEACHER",
      teacherCode: TEACHER_CODE,
    },
  });
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginViaUi(page, teacherEmail, "Password123!");
  await expect(page.getByTestId("teacher-area")).toBeVisible();
});

test("TC-010 auth errors follow the { code, message } envelope without stack traces", async ({ request }) => {
  const email = uniqueEmail("tc010");
  await request.post(`${API}/auth/register`, {
    data: { email, password: "Password123!", displayName: "TC-010" },
  });

  const wrongLogin = await request.post(`${API}/auth/login`, {
    data: { email, password: "wrong-password" },
  });
  await assertErrorEnvelope(wrongLogin, 401, "INVALID_CREDENTIALS");

  const duplicate = await request.post(`${API}/auth/register`, {
    data: { email, password: "Password123!", displayName: "TC-010" },
  });
  await assertErrorEnvelope(duplicate, 409, "EMAIL_IN_USE");

  const invalidEmail = await request.post(`${API}/auth/forgot-password`, {
    data: { email: "not-an-email" },
  });
  await assertErrorEnvelope(invalidEmail, 400, "VALIDATION_ERROR");
});
