import { expect, test, type APIRequestContext, type Page, type Route, type TestInfo } from "@playwright/test";
import type { StudentExamMetadata } from "@quiz/shared";

const API = process.env.EXAM_E2E_API_URL ?? "http://localhost:3000";
const API_ORIGIN = new URL(API).origin;
const STUDENT_PASSWORD = "Password123!";
const EXAM_ID = "7d6b91a8-6e23-4da9-b383-476bc40e1e37";

function metadata(state: StudentExamMetadata["state"] = "SCHEDULED"): StudentExamMetadata {
  return {
    title: "Đề giữa kỳ môn Toán",
    teacherName: "teacher@example.com",
    questionCount: "18",
    durationMinutes: "90",
    opensAt: "2026-11-27T03:00:02.000Z",
    closesAt: "2026-11-27T04:30:00.000Z",
    state,
    maxAttempts: "2",
    passwordRequired: true,
    allowAnswerReview: false,
    qualifyingClassroomNames: ["Lớp 10A"],
  };
}

async function registerStudent(request: APIRequestContext): Promise<string> {
  const email = "student-exams-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "@example.com";
  const response = await request.post(API + "/auth/register", {
    data: { email, password: STUDENT_PASSWORD, displayName: "Học sinh kiểm thử" },
  });
  expect(response.status(), await response.text()).toBe(201);
  return email;
}

async function loginViaUi(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(STUDENT_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/student$/);
}

async function routeStudentExams(page: Page, respond: (route: Route) => Promise<void>): Promise<void> {
  await page.route((url) => url.origin === API_ORIGIN && url.pathname.startsWith("/student/exams"), async (route) => {
    if (route.request().isNavigationRequest()) {
      await route.continue();
      return;
    }
    await respond(route);
  });
}

async function fulfillData(route: Route, data: unknown, serverTime = "2026-11-27T03:00:00.000Z"): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "X-Exam-Server-Time": serverTime },
    body: JSON.stringify({ data }),
  });
}

async function saveScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}

test("student can filter, open and read only safe metadata at 320px", async ({ page, request }, testInfo) => {
  const email = await registerStudent(request);
  await routeStudentExams(page, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/" + EXAM_ID)) {
      await fulfillData(route, metadata("SCHEDULED"));
      return;
    }
    if (url.searchParams.get("state") === "CLOSED") {
      await fulfillData(route, { items: [], nextCursor: null });
      return;
    }
    await fulfillData(route, {
      items: [{ detailPath: "/student/exams/" + EXAM_ID, metadata: metadata() }],
      nextCursor: null,
    });
  });
  await loginViaUi(page, email);
  await page.setViewportSize({ width: 320, height: 760 });
  const listResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === API_ORIGIN && url.pathname === "/student/exams" && response.request().method() === "GET";
  });
  await page.goto("/student/exams");
  const listResponse = await listResponsePromise;
  const body = await listResponse.json();
  expect(body.data.items[0].metadata).toEqual(metadata());
  expect(JSON.stringify(body)).not.toMatch(/secret-pass|secret-question|Lớp 10Z/);
  await expect(page.getByRole("link", { name: "Xem thông tin đề thi: Đề giữa kỳ môn Toán" })).toBeVisible();
  await page.getByLabel("Lọc trạng thái").selectOption("CLOSED");
  await expect(page.getByText("Chưa có đề thi trong trạng thái này.")).toBeVisible();
  await saveScreenshot(page, testInfo, "student-exams-empty.png");
  await page.getByLabel("Lọc trạng thái").selectOption("ALL");
  await page.getByRole("link", { name: "Xem thông tin đề thi: Đề giữa kỳ môn Toán" }).click();
  await expect(page.getByRole("heading", { name: "Đề giữa kỳ môn Toán" })).toBeVisible();
  for (const text of ["teacher@example.com", "18 câu", "90 phút", "Chờ mở", "2", "Lớp 10A"]) {
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByText(/secret-question|secret-pass|Lớp 10Z/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await saveScreenshot(page, testInfo, "student-exam-detail-320.png");
});

test("student detail rechecks current access on focus and clears prior metadata when access is revoked", async ({ page, request }, testInfo) => {
  const email = await registerStudent(request);
  let detailReads = 0;
  let accessRevoked = false;
  await routeStudentExams(page, async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/" + EXAM_ID)) {
      detailReads += 1;
      if (accessRevoked) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "FORBIDDEN", message: "Exam is outside the student scope" }),
        });
      } else {
        await fulfillData(route, metadata("OPEN"));
      }
      return;
    }
    await fulfillData(route, { items: [], nextCursor: null });
  });
  await loginViaUi(page, email);
  await page.goto("/student/exams/" + EXAM_ID);
  await expect(page.getByRole("heading", { name: "Đề giữa kỳ môn Toán" })).toBeVisible();
  accessRevoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toContainText("Đề thi không khả dụng hoặc bạn không có quyền xem.");
  await expect(page.getByRole("heading", { name: "Đề giữa kỳ môn Toán" })).toHaveCount(0);
  expect(detailReads).toBeGreaterThanOrEqual(2);
  await saveScreenshot(page, testInfo, "student-exam-detail-denied.png");
});

test("student list refreshes at the server-reported schedule boundary", async ({ page, request }) => {
  const email = await registerStudent(request);
  let listReads = 0;
  await routeStudentExams(page, async (route) => {
    if (new URL(route.request().url()).pathname !== "/student/exams") {
      await fulfillData(route, metadata("OPEN"));
      return;
    }
    listReads += 1;
    const current = listReads === 1 ? {
      ...metadata("SCHEDULED"),
      opensAt: "2026-11-27T03:00:00.150Z",
    } : metadata("OPEN");
    await fulfillData(route, { items: [{ detailPath: "/student/exams/" + EXAM_ID, metadata: current }], nextCursor: null });
  });
  await loginViaUi(page, email);
  await page.goto("/student/exams");
  await expect(page.getByRole("list", { name: "Danh sách đề thi" }).getByText("Đang mở", { exact: true })).toBeVisible();
  expect(listReads).toBeGreaterThanOrEqual(2);
});
