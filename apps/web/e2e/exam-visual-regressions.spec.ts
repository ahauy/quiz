import { expect, test, type APIRequestContext, type Page, type Route, type TestInfo } from "@playwright/test";

const API = process.env.EXAM_E2E_API_URL ?? "http://localhost:3000";
const API_ORIGIN = new URL(API).origin;
const PASSWORD = "Password123!";
const EXAM_ID = "7d6b91a8-6e23-4da9-b383-476bc40e1e37";
const TEACHER_TITLE = "T".repeat(260);
const STUDENT_NAME = "N".repeat(90);

async function register(request: APIRequestContext, role: "TEACHER" | "STUDENT"): Promise<string> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `visual-${role.toLowerCase()}-${unique}@example.com`;
  const response = await request.post(`${API}/auth/register`, {
    data: { email, password: PASSWORD, displayName: "Visual test", ...(role === "TEACHER" ? { requestedRole: role, teacherCode: process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE" } : {}) },
  });
  expect(response.status(), await response.text()).toBe(201);
  return email;
}

async function login(page: Page, email: string, home: "teacher" | "student"): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${home}$`));
}

async function routeExams(page: Page, respond: (route: Route) => Promise<void>): Promise<void> {
  await page.route((url) => url.origin === API_ORIGIN && url.pathname.startsWith("/teacher/exams"), async (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    await respond(route);
  });
  await page.route((url) => url.origin === API_ORIGIN && url.pathname.startsWith("/student/exams"), async (route) => {
    if (route.request().isNavigationRequest()) return route.continue();
    await respond(route);
  });
}

async function fulfill(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", headers: { "X-Exam-Server-Time": "2026-11-27T03:00:00.000Z" }, body: JSON.stringify({ data }) });
}

async function screenshot(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
    const [r, g, b] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("teacher exam list wraps long titles and keeps initial loading separate from empty", async ({ page, request }, info) => {
  const email = await register(request, "TEACHER");
  await login(page, email, "teacher");
  await page.setViewportSize({ width: 1024, height: 768 });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await routeExams(page, async (route) => {
    if (new URL(route.request().url()).pathname !== "/teacher/exams") return route.continue();
    await hold;
    await fulfill(route, { items: [{ id: EXAM_ID, title: TEACHER_TITLE, state: "DRAFT", questionCount: "0", opensAt: null, closesAt: null }], nextCursor: null });
  });
  await page.goto("/teacher/exams");
  await expect(page.getByText("Đang tải danh sách đề thi…")).toBeVisible();
  await expect(page.getByText("Chưa có đề thi trong trạng thái này.")).toHaveCount(0);
  await screenshot(page, info, "teacher-exams-loading-1024.png");
  release();
  await expect(page.getByText(TEACHER_TITLE)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await screenshot(page, info, "teacher-exams-long-title-1024.png");
});

test("student long display name wraps in list and detail at supported widths", async ({ page, request }, info) => {
  const email = await register(request, "STUDENT");
  await login(page, email, "student");
  await routeExams(page, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === `/student/exams/${EXAM_ID}`) {
      await fulfill(route, { title: "Đề thi thị giác", teacherName: STUDENT_NAME, questionCount: "18", durationMinutes: "90", opensAt: "2026-11-27T03:00:00.000Z", closesAt: "2026-11-27T04:30:00.000Z", state: "SCHEDULED", maxAttempts: "2", passwordRequired: false, allowAnswerReview: false, qualifyingClassroomNames: ["Lớp 10A"] });
      return;
    }
    await fulfill(route, { items: [{ detailPath: `/student/exams/${EXAM_ID}`, metadata: { title: "Đề thi thị giác", teacherName: STUDENT_NAME, questionCount: "18", durationMinutes: "90", opensAt: "2026-11-27T03:00:00.000Z", closesAt: "2026-11-27T04:30:00.000Z", state: "SCHEDULED", maxAttempts: "2", passwordRequired: false, allowAnswerReview: false, qualifyingClassroomNames: ["Lớp 10A"] } }], nextCursor: null });
  });
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/student/exams");
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();
    await expect(page.getByText(STUDENT_NAME)).toContainText(STUDENT_NAME);
    for (const text of ["18", "90 phút", "Thời gian mở:", "Thời gian đóng:", "Số lượt tối đa: 2", "Yêu cầu mật khẩu: Không", "Cho xem lại đáp án: Không", "Lớp học đủ điều kiện: Lớp 10A"]) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await screenshot(page, info, `student-exams-long-name-${width}.png`);
    await page.getByRole("link", { name: /Xem thông tin đề thi/ }).click();
    await expect(page.getByText(STUDENT_NAME)).toBeVisible();
    if (width === 320) await expect(page.getByRole("link", { name: "Quay lại danh sách đề thi" })).toHaveCSS("min-height", "44px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await screenshot(page, info, `student-exam-detail-long-name-${width}.png`);
  }
});

test("student compact controls meet touch target and enabled boundaries are discernible", async ({ page, request }) => {
  const email = await register(request, "STUDENT");
  await login(page, email, "student");
  await routeExams(page, async (route) => fulfill(route, { items: [], nextCursor: null }));
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/student/exams");
  await expect(page.getByText("Chưa có đề thi trong trạng thái này.")).toBeVisible();
  const select = page.getByLabel("Lọc trạng thái");
  const selectMetrics = await select.evaluate((element) => {
    const style = getComputedStyle(element);
    let ancestor: HTMLElement | null = element as HTMLElement;
    let background = "rgb(255, 255, 255)";
    while (ancestor) {
      const candidate = getComputedStyle(ancestor).backgroundColor;
      if (!candidate.includes("rgba(0, 0, 0, 0)") && !candidate.endsWith(", 0)")) { background = candidate; break; }
      ancestor = ancestor.parentElement;
    }
    return { height: element.getBoundingClientRect().height, border: style.borderTopColor, background };
  });
  expect(selectMetrics.height).toBeGreaterThanOrEqual(44);
  expect(contrastRatio(selectMetrics.border, selectMetrics.background)).toBeGreaterThanOrEqual(3);
});

test("teacher exam list uses a bounded boundary timer and refreshes when focused", async ({ page, request }) => {
  const email = await register(request, "TEACHER");
  await login(page, email, "teacher");
  let reads = 0;
  await routeExams(page, async (route) => {
    if (new URL(route.request().url()).pathname !== "/teacher/exams") return route.continue();
    reads += 1;
    await fulfill(route, { items: [{ id: EXAM_ID, title: "Đề xa", state: "SCHEDULED", questionCount: "1", opensAt: "2099-01-01T00:00:00.000Z", closesAt: null }], nextCursor: null });
  });
  await page.goto("/teacher/exams");
  await expect(page.getByText("Đề xa")).toBeVisible();
  const readsAfterLoad = reads;
  await page.waitForTimeout(150);
  expect(reads).toBe(readsAfterLoad);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBe(readsAfterLoad + 1);
});

test("teacher list and question picker show enabled control boundaries", async ({ page, request }, info) => {
  const email = await register(request, "TEACHER");
  await login(page, email, "teacher");
  await page.goto("/teacher/exams/new");
  await page.getByLabel("Tên đề").fill("Bản nháp kiểm tra đường viền");
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/exams\/[0-9a-f-]+$/);
  const examPath = new URL(page.url()).pathname;
  await routeExams(page, async (route) => {
    if (new URL(route.request().url()).pathname !== "/teacher/exams") return route.continue();
    await fulfill(route, { items: [], nextCursor: null });
  });
  const checkBoundary = async (label: string) => {
    const control = page.getByLabel(label);
    const colors = await control.evaluate((element) => {
      const border = getComputedStyle(element).borderTopColor;
      let ancestor: HTMLElement | null = element as HTMLElement;
      let background = "rgb(255, 255, 255)";
      while (ancestor) {
        const candidate = getComputedStyle(ancestor).backgroundColor;
        if (!candidate.includes("rgba(0, 0, 0, 0)") && !candidate.endsWith(", 0)")) { background = candidate; break; }
        ancestor = ancestor.parentElement;
      }
      return { border, background };
    });
    expect(contrastRatio(colors.border, colors.background), label).toBeGreaterThanOrEqual(3);
  };
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/teacher/exams");
  await expect(page.getByLabel("Lọc trạng thái")).toBeVisible();
  await checkBoundary("Lọc trạng thái");
  await page.goto(examPath);
  await expect(page.getByLabel("Tìm câu")).toBeVisible();
  await checkBoundary("Tìm câu");
  await checkBoundary("Môn");
  await screenshot(page, info, "teacher-question-picker-boundaries-1024.png");
});
