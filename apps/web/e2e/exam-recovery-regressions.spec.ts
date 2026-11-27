import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API = process.env.EXAM_E2E_API_URL ?? "http://localhost:3000";
const TEACHER_CODE = process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE";
interface Teacher { email: string; password: string; token: string }

async function registerTeacher(request: APIRequestContext): Promise<Teacher> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `exam-recovery-${unique}@example.com`;
  const password = "Password123!";
  const registered = await request.post(`${API}/auth/register`, { data: { email, password, displayName: `GV ${unique.slice(-6)}`, requestedRole: "TEACHER", teacherCode: TEACHER_CODE } });
  expect(registered.status(), await registered.text()).toBe(201);
  const loggedIn = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(loggedIn.status(), await loggedIn.text()).toBe(200);
  const body = (await loggedIn.json()) as { data: { accessToken: string } };
  return { email, password, token: body.data.accessToken };
}

async function login(page: Page, teacher: Teacher): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(teacher.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(teacher.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

async function createDraft(request: APIRequestContext, token: string, title = "Đề phục hồi E2E") {
  const id = crypto.randomUUID();
  const mutationId = crypto.randomUUID();
  const response = await request.post(`${API}/teacher/exams`, { headers: auth(token), data: { id, title, mutationId } });
  expect(response.status(), await response.text()).toBe(201);
  return { id, mutationId, etag: response.headers().etag };
}

async function writeExam(request: APIRequestContext, teacher: Teacher, id: string, etag: string, body: object) {
  const response = await request.patch(`${API}/teacher/exams/${id}`, { headers: { ...auth(teacher.token), "If-Match": etag }, data: { ...body, mutationId: crypto.randomUUID() } });
  expect(response.status(), await response.text()).toBe(200);
  return response.headers().etag ?? "";
}

async function createSourceQuestion(request: APIRequestContext, teacher: Teacher) {
  const response = await request.post(`${API}/questions`, { headers: auth(teacher.token), data: {
    type: "SINGLE_CHOICE", content: `Câu ${Date.now()}`, difficulty: "EASY", explanation: "Giải thích",
    subjectName: `Môn ${Date.now()}`, chapterName: "Chương", options: ["A", "B"], correctOptionIndexes: [0],
  } });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).data.id as string;
}

async function createHistoryDraft(request: APIRequestContext, teacher: Teacher) {
  const draft = await createDraft(request, teacher.token, "Nháp có lịch sử");
  const classroom = await request.post(`${API}/classrooms`, { headers: auth(teacher.token), data: { name: `Lớp phục hồi ${Date.now()}` } });
  expect(classroom.status(), await classroom.text()).toBe(201);
  const question = await request.post(`${API}/questions`, { headers: auth(teacher.token), data: {
    type: "SINGLE_CHOICE", content: "Câu hỏi phục hồi", difficulty: "EASY", explanation: "Giải thích",
    subjectName: `Môn ${Date.now()}`, chapterName: "Chương", options: ["A", "B"], correctOptionIndexes: [0],
  } });
  expect(question.status(), await question.text()).toBe(201);
  const clock = await request.get(`${API}/teacher/exams`, { headers: auth(teacher.token) });
  const serverTime = clock.headers()["x-exam-server-time"];
  if (!serverTime) throw new Error("exam API did not return server time");
  const opensAt = new Date(Date.parse(serverTime) + 60 * 60_000).toISOString();
  const closesAt = new Date(Date.parse(serverTime) + 3 * 60 * 60_000).toISOString();
  let etag = await writeExam(request, teacher, draft.id, draft.etag, { op: "saveSettings", settings: { durationMinutes: "30", maxAttempts: "1", allowAnswerReview: true, opensAt, closesAt } });
  const questionId = (await question.json()).data.id as string;
  etag = await writeExam(request, teacher, draft.id, etag, { op: "addQuestion", sourceQuestionId: questionId });
  const classroomId = (await classroom.json()).data.id as string;
  etag = await writeExam(request, teacher, draft.id, etag, { op: "updateAssignments", addClassroomIds: [classroomId], removeClassroomIds: [] });
  etag = await writeExam(request, teacher, draft.id, etag, { op: "publish" });
  await writeExam(request, teacher, draft.id, etag, { op: "withdraw" });
  return draft.id;
}

async function createPaginatedAssignmentDraft(request: APIRequestContext, teacher: Teacher) {
  const ids: string[] = [];
  for (let index = 0; index < 103; index += 1) {
    const response = await request.post(`${API}/classrooms`, { headers: auth(teacher.token), data: { name: `Cursor ${index} ${Date.now()}` } });
    expect(response.status(), await response.text()).toBe(201);
    ids.push((await response.json()).data.id as string);
  }
  const draft = await createDraft(request, teacher.token, "Đề có nhiều lớp");
  const etag = await writeExam(request, teacher, draft.id, draft.etag, { op: "updateAssignments", addClassroomIds: ids.slice(0, 101), removeClassroomIds: [] });
  return { id: draft.id, etag, ids };
}

async function openEditor(page: Page, teacher: Teacher, examId: string): Promise<void> {
  await login(page, teacher);
  await page.goto(`/teacher/exams/${examId}`);
  await expect(page.getByLabel("Tên đề", { exact: true })).toBeEnabled();
  await expect(page.getByText("Đề chưa có câu hỏi. Chọn câu từ ngân hàng bên dưới.")).toBeVisible();
  await expect(page.getByText("Chưa có lịch sử thao tác.")).toBeVisible();
}

async function deferRouteResponse(page: Page, url: string) {
  let signalReady = () => {};
  let releaseResponse = () => {};
  const ready = new Promise<void>((resolve) => { signalReady = resolve; });
  const released = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(url, async (route) => { const response = await route.fetch(); signalReady(); await released; await route.fulfill({ response }); });
  return { ready, release: releaseResponse };
}

async function deferRejectedSettingsWrite(page: Page, examId: string) {
  let signalStarted = () => {};
  let releaseResponse = () => {};
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const released = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(`**/teacher/exams/${examId}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    signalStarted(); await released;
    return route.fulfill({ status: 400, contentType: "application/json", headers: {
      "access-control-allow-origin": "http://localhost:5173", "access-control-allow-credentials": "true",
    }, body: JSON.stringify({ code: "VALIDATION_ERROR", message: "Rejected without commit", details: [], path: `/teacher/exams/${examId}`, timestamp: new Date().toISOString() }) });
  });
  return { started, release: releaseResponse };
}

test("invalid duration stays local, names its field, and dispatches no PATCH", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  let patchCount = 0;
  page.on("request", (outgoing) => { if (outgoing.method() === "PATCH" && outgoing.url().includes(`/teacher/exams/${draft.id}`)) patchCount += 1; });
  const duration = page.getByLabel("Thời lượng (phút)");
  await duration.fill("0");
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(duration).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Thời lượng phải là số nguyên dương.", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Có 1 lỗi cần sửa" })).toBeVisible();
  await expect(duration).toBeFocused();
  await expect(duration).toHaveAttribute("aria-describedby", "exam-duration-error");
  await page.getByRole("button", { name: "Lưu cấu hình" }).focus();
  await page.keyboard.press("Enter");
  await expect(duration).toBeFocused();
  await expect(page.getByRole("alert").filter({ hasText: "Có 1 lỗi cần sửa" })).toBeVisible();
  const title = page.getByLabel("Tên đề", { exact: true });
  await title.fill("Tiêu đề hợp lệ giữ nguyên");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue("Tiêu đề hợp lệ giữ nguyên");
  await expect(duration).toHaveValue("0");
  await expect(page.getByLabel("Số lượt làm bài")).toHaveValue("");
  expect(patchCount).toBe(0);
});

test("a matching history read survives a rejected write that was pending on response", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const examId = await createHistoryDraft(request, teacher);
  const beforeResponse = await request.get(`${API}/teacher/exams/${examId}`, { headers: auth(teacher.token) });
  const before = (await beforeResponse.json()).data as { lastMutationId: string };
  const beforeETag = beforeResponse.headers().etag;
  const history = await deferRouteResponse(page, `**/teacher/exams/${examId}/history**`);
  const snapshots = await deferRouteResponse(page, `**/teacher/exams/${examId}/questions**`);
  await login(page, teacher);
  await page.goto(`/teacher/exams/${examId}`);
  await Promise.all([history.ready, snapshots.ready]);
  const write = await deferRejectedSettingsWrite(page, examId);
  try {
    await page.getByLabel("Tên đề", { exact: true }).fill("Thay đổi bị từ chối");
    await page.getByRole("button", { name: "Lưu cấu hình" }).click();
    await write.started;
    history.release(); snapshots.release();
    await expect(page.getByText("Đã thu hồi", { exact: true })).toBeVisible();
    await expect(page.getByText(/Bản chụp/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu cấu hình" })).toBeDisabled();
    write.release();
    await expect(page.getByRole("alert")).toBeVisible();
  } finally {
    history.release(); snapshots.release(); write.release();
  }
  await expect(page.getByText("Chưa có lịch sử thao tác.")).toHaveCount(0);
  const afterResponse = await request.get(`${API}/teacher/exams/${examId}`, { headers: auth(teacher.token) });
  const after = (await afterResponse.json()).data as { lastMutationId: string };
  expect(afterResponse.headers().etag).toBe(beforeETag);
  expect(after.lastMutationId).toBe(before.lastMutationId);
});

test("a rejected assignment cursor refreshes from page one and keeps staged removals", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const { id, etag, ids } = await createPaginatedAssignmentDraft(request, teacher);
  await login(page, teacher);
  await page.goto(`/teacher/exams/${id}`);
  const firstClass = page.getByLabel(new RegExp(`Cursor 0 `));
  await expect(firstClass).toBeVisible();
  await firstClass.uncheck();
  await expect(page.getByRole("button", { name: "Lưu giao lớp" })).toBeEnabled();
  const nextEtag = await writeExam(request, teacher, id, etag, { op: "updateAssignments", addClassroomIds: [ids[101]], removeClassroomIds: [] });
  let restartedFromFirstPage = false;
  let firstPageRequests = 0;
  page.on("request", (outgoing) => {
    if (outgoing.method() === "GET" && outgoing.url().startsWith(`${API}/teacher/exams/${id}/assignments`) && !new URL(outgoing.url()).searchParams.has("cursor")) firstPageRequests += 1;
  });
  await page.route(`**/teacher/exams/${id}/assignments**`, async (route) => {
    if (!new URL(route.request().url()).searchParams.has("cursor") || restartedFromFirstPage) return route.continue();
    restartedFromFirstPage = true;
    await writeExam(request, teacher, id, nextEtag, { op: "updateAssignments", addClassroomIds: [ids[102]], removeClassroomIds: [] });
    const stalePage = await route.fetch();
    expect(stalePage.status()).toBe(400);
    return route.fulfill({ response: stalePage });
  });
  const priorFirstPageRequests = firstPageRequests;
  await page.getByRole("button", { name: "Tải lại danh sách" }).click();
  await expect.poll(() => restartedFromFirstPage).toBe(true);
  await expect.poll(() => firstPageRequests).toBeGreaterThan(priorFirstPageRequests);
  await expect(page.getByRole("button", { name: "Lưu giao lớp" })).toBeEnabled({ timeout: 15_000 });
  await expect(firstClass).not.toBeChecked();
  await page.getByRole("button", { name: "Lưu giao lớp" }).click();
  await expect(page.getByText("Đã lưu thay đổi.")).toBeVisible();
  const pageOne = await request.get(`${API}/teacher/exams/${id}/assignments?pageSize=100`, { headers: auth(teacher.token) });
  expect(pageOne.status()).toBe(200);
  const firstPage = (await pageOne.json()).data as { items: Array<{ classroomId: string }>; nextCursor: string | null };
  const pageTwo = firstPage.nextCursor
    ? await request.get(`${API}/teacher/exams/${id}/assignments?pageSize=100&cursor=${encodeURIComponent(firstPage.nextCursor)}`, { headers: auth(teacher.token) })
    : null;
  const remaining = [...firstPage.items, ...(pageTwo ? ((await pageTwo.json()).data.items as Array<{ classroomId: string }>) : [])];
  expect(remaining.some((item) => item.classroomId === ids[0])).toBe(false);
  expect(remaining.some((item) => item.classroomId === ids[101])).toBe(true);
  expect(remaining.some((item) => item.classroomId === ids[102])).toBe(true);
});

test("a real 412 fetches canonical settings and lets the teacher rebase without losing local edits", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token, "Tiêu đề gốc");
  await openEditor(page, teacher, draft.id);
  await page.getByLabel("Tên đề", { exact: true }).fill("Tiêu đề cục bộ");
  const remote = await request.patch(`${API}/teacher/exams/${draft.id}`, {
    headers: { ...auth(teacher.token), "If-Match": draft.etag },
    data: { op: "saveSettings", mutationId: crypto.randomUUID(), settings: { title: "Tiêu đề đã lưu ở nơi khác", durationMinutes: "45" } },
  });
  expect(remote.status(), await remote.text()).toBe(200);
  let canonicalReads = 0;
  page.on("request", (outgoing) => { if (outgoing.method() === "GET" && outgoing.url().endsWith(`/teacher/exams/${draft.id}`)) canonicalReads += 1; });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("heading", { name: "Cần xem lại thay đổi" })).toBeVisible();
  await expect(page.getByText("Đã lưu: Tiêu đề đã lưu ở nơi khác")).toBeVisible();
  await expect(page.getByText("Nhập của bạn: Tiêu đề cục bộ")).toBeVisible();
  expect(canonicalReads).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Dùng bản mới làm gốc, giữ thay đổi của tôi" }).click();
  await expect(page.getByLabel("Tên đề", { exact: true })).toHaveValue("Tiêu đề cục bộ");
  await expect(page.getByLabel("Thời lượng (phút)")).toHaveValue("45");
  let submitted: { body: string | null; ifMatch: string | undefined } | null = null;
  page.on("request", (outgoing) => { if (outgoing.method() === "PATCH" && outgoing.url().endsWith(`/teacher/exams/${draft.id}`)) submitted = { body: outgoing.postData(), ifMatch: outgoing.headers()["if-match"] }; });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Đã lưu cấu hình.")).toBeVisible();
  expect(submitted?.ifMatch).not.toBe(draft.etag);
  expect(JSON.parse(submitted?.body ?? "{}")).toMatchObject({ settings: { title: "Tiêu đề cục bộ" } });
  expect(JSON.parse(submitted?.body ?? "{}").settings).not.toHaveProperty("durationMinutes");
  const stored = await request.get(`${API}/teacher/exams/${draft.id}`, { headers: auth(teacher.token) });
  expect(stored.status()).toBe(200);
  expect((await stored.json()).data).toMatchObject({ title: "Tiêu đề cục bộ", durationMinutes: "45" });
});

test("a committed PATCH with an aborted response is confirmed by its mutation correlation", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  await page.getByLabel("Tên đề", { exact: true }).fill("Đã lưu trước khi mất phản hồi");
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("connectionreset");
  }, { times: 1 });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Kết quả thao tác chưa rõ.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu cấu hình" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Xuất bản" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Xóa nháp" })).toBeDisabled();
  await page.getByRole("button", { name: "Kiểm tra trạng thái" }).click();
  await expect(page.getByText("Đã xác nhận thay đổi được lưu.")).toBeVisible();
  await expect(page.getByLabel("Tên đề", { exact: true })).toHaveValue("Đã lưu trước khi mất phản hồi");
  await expect(page.getByLabel("Tên đề", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Xuất bản", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Xóa nháp", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Tìm câu", { exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Thử lại đúng yêu cầu cũ" })).toHaveCount(0);
});

test("a superseded successful PATCH keeps review data and adopts its canonical validator", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  await page.getByLabel("Tên đề", { exact: true }).fill("Tên đã ghi trước phản hồi");
  let canonicalEtag = "";
  let patchBody = "";
  let patchIfMatch = "";
  let supersededOnce = false;
  let detailReadCount = 0;
  page.on("response", (incoming) => { if (incoming.request().method() === "GET" && incoming.url().endsWith(`/teacher/exams/${draft.id}`)) detailReadCount += 1; });
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    if (route.request().method() !== "PATCH" || supersededOnce) return route.continue();
    supersededOnce = true;
    patchBody = route.request().postData() ?? "";
    patchIfMatch = route.request().headers()["if-match"] ?? "";
    const first = await route.fetch();
    expect(first.status()).toBe(200);
    const nextWriter = await request.patch(`${API}/teacher/exams/${draft.id}`, {
      headers: { ...auth(teacher.token), "If-Match": first.headers()["etag"] ?? "" },
      data: { op: "saveSettings", mutationId: crypto.randomUUID(), settings: { title: "Tên mới hơn", durationMinutes: "45" } },
    });
    expect(nextWriter.status(), await nextWriter.text()).toBe(200);
    const latest = await request.get(`${API}/teacher/exams/${draft.id}`, { headers: auth(teacher.token) });
    canonicalEtag = latest.headers()["etag"] ?? "";
    const latestHeaders = await latest.headers();
    return route.fulfill({
      status: latest.status(),
      headers: { "content-type": latestHeaders["content-type"] ?? "application/json", etag: canonicalEtag, "x-exam-server-time": latestHeaders["x-exam-server-time"] ?? "", "access-control-allow-origin": "http://localhost:5173", "access-control-allow-credentials": "true", "access-control-expose-headers": "ETag, X-Exam-Server-Time" },
      body: await latest.text(),
    });
  });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByRole("heading", { name: "Cần xem lại thay đổi" })).toBeVisible();
  await expect(page.getByText("Đã lưu: Tên mới hơn")).toBeVisible();
  await expect(page.getByLabel("Tên đề", { exact: true })).toHaveValue("Tên đã ghi trước phản hồi");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => detailReadCount).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: "Cần xem lại thay đổi" })).toBeVisible();
  await expect(page.getByText("Đã lưu: Tên mới hơn")).toBeVisible();
  await expect(page.getByLabel("Thời lượng (phút)")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Lưu cấu hình" })).toBeDisabled();
  await page.getByRole("button", { name: "Dùng bản mới làm gốc, giữ thay đổi của tôi" }).click();
  await expect(page.getByLabel("Thời lượng (phút)")).toHaveValue("45");
  await page.getByLabel("Tên đề", { exact: true }).fill("Tên cuối cùng");
  let finalRequest: { body: string | null; ifMatch: string | undefined } | null = null;
  page.on("request", (outgoing) => { if (outgoing.method() === "PATCH" && outgoing.url().endsWith(`/teacher/exams/${draft.id}`)) finalRequest = { body: outgoing.postData(), ifMatch: outgoing.headers()["if-match"] }; });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Đã lưu cấu hình.")).toBeVisible();
  expect(patchIfMatch).toBe(draft.etag);
  expect(JSON.parse(patchBody)).toMatchObject({ settings: { title: "Tên đã ghi trước phản hồi" } });
  expect(canonicalEtag).not.toBe(draft.etag);
  expect(finalRequest?.ifMatch).toBe(canonicalEtag);
  expect(JSON.parse(finalRequest?.body ?? "{}").settings).not.toHaveProperty("durationMinutes");
  const stored = await request.get(`${API}/teacher/exams/${draft.id}`, { headers: auth(teacher.token) });
  expect((await stored.json()).data).toMatchObject({ title: "Tên cuối cùng", durationMinutes: "45" });
});

test("an in-flight focus read cannot acknowledge or regress a superseded child write review", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token, "Tiêu đề gốc");
  const sourceQuestionId = await createSourceQuestion(request, teacher);
  await openEditor(page, teacher, draft.id);
  let readStarted = () => {};
  const reading = new Promise<void>((resolve) => { readStarted = resolve; });
  let releaseRead = () => {};
  const release = new Promise<void>((resolve) => { releaseRead = resolve; });
  let holdCanonical = true;
  let childWriteStarted = () => {};
  const childWriteCaptured = new Promise<void>((resolve) => { childWriteStarted = resolve; });
  let releaseChildWrite = () => {};
  const continueChildWrite = new Promise<void>((resolve) => { releaseChildWrite = resolve; });
  let canonicalETag = "";
  let childETag = "";
  let mutationBody = "";
  let mutationIfMatch = "";
  let childRequestHandled = false;
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    const outgoing = route.request();
    if (outgoing.method() === "GET" && holdCanonical) {
      holdCanonical = false;
      const response = await route.fetch();
      readStarted();
      await release;
      return route.fulfill({ response });
    }
    if (outgoing.method() !== "PATCH") return route.continue();
    if (childRequestHandled) return route.continue();
    childRequestHandled = true;
    mutationBody = outgoing.postData() ?? "";
    mutationIfMatch = outgoing.headers()["if-match"] ?? "";
    const first = await route.fetch();
    expect(first.status()).toBe(200);
    childETag = first.headers()["etag"] ?? "";
    childWriteStarted();
    await continueChildWrite;
    const latest = await request.get(`${API}/teacher/exams/${draft.id}`, { headers: auth(teacher.token) });
    canonicalETag = latest.headers()["etag"] ?? "";
    return route.fulfill({ status: latest.status(), headers: {
      "content-type": "application/json", etag: canonicalETag,
      "x-exam-server-time": latest.headers()["x-exam-server-time"] ?? "",
      "access-control-allow-origin": "http://localhost:5173", "access-control-allow-credentials": "true",
      "access-control-expose-headers": "ETag, X-Exam-Server-Time",
    }, body: await latest.text() });
  });
  const addQuestion = page.getByRole("button", { name: "Thêm câu", exact: true }).first();
  await expect(addQuestion).toBeEnabled();
  const clickPendingWrite = addQuestion.click();
  await childWriteCaptured;
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    window.dispatchEvent(new Event("focus"));
  });
  await reading;
  const superseding = await request.patch(`${API}/teacher/exams/${draft.id}`, {
    headers: { ...auth(teacher.token), "If-Match": childETag },
    data: { op: "saveSettings", mutationId: crypto.randomUUID(), settings: { title: "Tiêu đề mới nhất", durationMinutes: "45" } },
  });
  expect(superseding.status(), await superseding.text()).toBe(200);
  releaseChildWrite();
  await clickPendingWrite;
  await expect(page.getByRole("heading", { name: "Cần xem lại thay đổi" })).toBeVisible();
  releaseRead();
  await expect(page.getByText("Đã lưu: Tiêu đề mới nhất")).toBeVisible();
  await expect(page.getByLabel("Tên đề", { exact: true })).toBeDisabled();
  expect(JSON.parse(mutationBody)).toMatchObject({ op: "addQuestion", sourceQuestionId });
  expect(mutationIfMatch).toBe(draft.etag);
  await page.getByRole("button", { name: "Bỏ thay đổi chưa lưu" }).click();
  await page.getByLabel("Tên đề", { exact: true }).fill("Tiêu đề sau xem lại");
  let finalRequest: { body: string | null; ifMatch: string | undefined } | null = null;
  page.on("request", (outgoing) => {
    if (outgoing.method() === "PATCH" && outgoing.url().endsWith(`/teacher/exams/${draft.id}`)) finalRequest = { body: outgoing.postData(), ifMatch: outgoing.headers()["if-match"] };
  });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Đã lưu cấu hình.")).toBeVisible();
  expect(canonicalETag).not.toBe(draft.etag);
  expect(finalRequest?.ifMatch).toBe(canonicalETag);
  expect(JSON.parse(finalRequest?.body ?? "{}").settings).not.toHaveProperty("durationMinutes");
  const stored = await request.get(`${API}/teacher/exams/${draft.id}`, { headers: auth(teacher.token) });
  expect((await stored.json()).data).toMatchObject({ title: "Tiêu đề sau xem lại", durationMinutes: "45" });
});

test("a superseded ambiguous create keeps input for explicit review before opening", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  await login(page, teacher);
  await page.goto("/teacher/exams/new");
  const title = page.getByLabel("Tên đề");
  await title.fill("Tên đã nhập khi tạo");
  let createdId = "";
  await page.route("**/teacher/exams", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    createdId = (await response.json()).data.id;
    const etag = response.headers()["etag"] ?? "";
    const superseding = await request.patch(`${API}/teacher/exams/${createdId}`, {
      headers: { ...auth(teacher.token), "If-Match": etag },
      data: { op: "saveSettings", mutationId: crypto.randomUUID(), settings: { title: "Tên khác đã lưu" } },
    });
    expect(superseding.status(), await superseding.text()).toBe(200);
    await route.abort("connectionreset");
  }, { times: 1 });
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByText("Chưa xác nhận được kết quả tạo nháp.")).toBeVisible();
  await title.fill("Tên mới chưa gửi");
  await page.getByRole("button", { name: "Kiểm tra trạng thái" }).click();
  await expect(page.getByRole("heading", { name: "Cần xem lại đề hiện tại" })).toBeVisible();
  await expect(page).toHaveURL(/\/teacher\/exams\/new$/);
  await expect(title).toHaveValue("Tên mới chưa gửi");
  await expect(page.getByText("Tên đã gửi: Tên đã nhập khi tạo")).toBeVisible();
  await expect(page.getByText("Tên bạn vừa nhập: Tên mới chưa gửi")).toBeVisible();
  await expect(page.getByText("Đã lưu: Tên khác đã lưu · Nháp")).toBeVisible();
  await page.getByRole("button", { name: "Mở đề hiện tại để xem" }).click();
  await expect(page).toHaveURL(new RegExp(`/teacher/exams/${createdId}$`));
  const stored = await request.get(`${API}/teacher/exams/${createdId}`, { headers: auth(teacher.token) });
  expect((await stored.json()).data.title).toBe("Tên khác đã lưu");
});

test("a committed PATCH without a response ETag remains unknown until correlation is checked", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  await page.getByLabel("Tên đề", { exact: true }).fill("Thiếu validator phản hồi");
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers.etag;
    await route.fulfill({ response, headers });
  }, { times: 1 });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Kết quả thao tác chưa rõ.")).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra trạng thái" }).click();
  await expect(page.getByText("Đã xác nhận thay đổi được lưu.")).toBeVisible();
});

test("an unchanged status read enables only the exact original request retry", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  await page.getByLabel("Tên đề", { exact: true }).fill("Yêu cầu cần thử lại");
  const attempts: Array<{ body: string | null; ifMatch: string | undefined }> = [];
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    const outgoing = route.request();
    if (outgoing.method() !== "PATCH") return route.continue();
    attempts.push({ body: outgoing.postData(), ifMatch: outgoing.headers()["if-match"] });
    if (attempts.length === 1) return route.abort("connectionreset");
    return route.continue();
  });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  await expect(page.getByText("Kết quả thao tác chưa rõ.")).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra trạng thái" }).click();
  await expect(page.getByText("Trạng thái hiện tại chưa xác nhận lần ghi trước.")).toBeVisible();
  await page.getByRole("button", { name: "Thử lại đúng yêu cầu cũ" }).click();
  await expect(page.getByText("Đã lưu cấu hình.")).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test("a committed delete response loss confirms absence only after the owner-scoped 404", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  let absenceReadStatus: number | undefined;
  page.on("response", (response) => {
    if (response.request().method() === "GET" && response.url().endsWith(`/teacher/exams/${draft.id}`)) absenceReadStatus = response.status();
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("connectionreset");
  }, { times: 1 });
  await page.getByRole("button", { name: "Xóa nháp", exact: true }).click();
  await expect(page.getByText("Kết quả thao tác chưa rõ.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu cấu hình" })).toBeDisabled();
  await page.getByRole("button", { name: "Kiểm tra trạng thái" }).click();
  await expect(page).toHaveURL(/\/teacher\/exams$/);
  expect(absenceReadStatus).toBe(404);
  const stored = await request.get(`${API}/teacher/exams/${draft.id}`, { headers: auth(teacher.token) });
  expect(stored.status()).toBe(404);
});

test("a failed canonical read after 412 keeps review adoption and editor mutations locked", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  const draft = await createDraft(request, teacher.token);
  await openEditor(page, teacher, draft.id);
  await page.getByLabel("Tên đề", { exact: true }).fill("Giá trị cần giữ");
  const remote = await request.patch(`${API}/teacher/exams/${draft.id}`, {
    headers: { ...auth(teacher.token), "If-Match": draft.etag },
    data: { op: "saveSettings", mutationId: crypto.randomUUID(), settings: { title: "Tiêu đề từ nơi khác" } },
  });
  expect(remote.status()).toBe(200);
  let staleWriteObserved = false;
  await page.route(`**/teacher/exams/${draft.id}`, async (route) => {
    if (route.request().method() === "PATCH") {
      staleWriteObserved = true;
      return route.fulfill({ status: 412, contentType: "application/json", headers: { "access-control-allow-origin": "http://localhost:5173", "access-control-allow-credentials": "true" }, body: JSON.stringify({ code: "EXAM_VERSION_CONFLICT", message: "Conflict", details: [] }) });
    }
    if (route.request().method() === "GET" && staleWriteObserved) return route.abort("connectionreset");
    return route.continue();
  });
  await page.getByRole("button", { name: "Lưu cấu hình" }).click();
  expect(staleWriteObserved).toBe(true);
  await expect(page.getByRole("heading", { name: "Cần xem lại thay đổi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dùng bản mới làm gốc, giữ thay đổi của tôi" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Xuất bản", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Tên đề", { exact: true })).toHaveValue("Giá trị cần giữ");
});

test("an ambiguous create 404 preserves the title and requires an explicit new create", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  await login(page, teacher);
  await page.goto("/teacher/exams/new");
  const title = page.getByLabel("Tên đề");
  await title.fill("Tên đề cần giữ lại");
  const creates: Array<{ body: string | null }> = [];
  await page.route("**/teacher/exams", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    creates.push({ body: route.request().postData() });
    if (creates.length === 1) return route.abort("connectionreset");
    return route.continue();
  });
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByText("Chưa xác nhận được kết quả tạo nháp.")).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra trạng thái" }).click();
  await expect(page.getByRole("button", { name: "Tạo nháp mới" })).toBeVisible();
  await expect(title).toHaveValue("Tên đề cần giữ lại");
  expect(creates).toHaveLength(1);
  await page.getByRole("button", { name: "Tạo nháp mới" }).click();
  await expect(page).toHaveURL(/\/teacher\/exams\/[0-9a-f-]+$/);
  expect(creates).toHaveLength(2);
  const oldRequest = JSON.parse(creates[0]!.body ?? "{}") as { id: string; title: string };
  const newRequest = JSON.parse(creates[1]!.body ?? "{}") as { id: string; title: string };
  expect(newRequest.title).toBe(oldRequest.title);
  expect(newRequest.id).not.toBe(oldRequest.id);
});

test("an owned duplicate create reads the existing draft and waits for an explicit open choice", async ({ page, request }) => {
  const teacher = await registerTeacher(request);
  await login(page, teacher);
  await page.goto("/teacher/exams/new");
  const title = page.getByLabel("Tên đề");
  await title.fill("Tên do tôi vừa nhập");
  let submittedId = "";
  let postCount = 0;
  const existing = {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    title: "Tên của nháp hiện có", state: "DRAFT", questionCount: "0", opensAt: null, closesAt: null,
    durationMinutes: null, maxAttempts: null, allowAnswerReview: null, passwordRequired: false,
    earlyClosedAt: null, everPublished: false, lastMutationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  };
  await page.route("**/teacher/exams**", async (route) => {
    const outgoing = route.request();
    if (outgoing.method() === "POST") {
      postCount += 1;
      submittedId = (JSON.parse(outgoing.postData() ?? "{}") as { id: string }).id;
      return route.fulfill({ status: 409, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "http://localhost:5173", "Access-Control-Allow-Credentials": "true" }, body: JSON.stringify({ code: "EXAM_ALREADY_EXISTS", message: "Duplicate", details: [{ field: "id", reason: "OWNED_DUPLICATE" }] }) });
    }
    if (outgoing.method() === "GET" && submittedId && outgoing.url().endsWith(`/teacher/exams/${submittedId}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", headers: { ...{ "Access-Control-Allow-Origin": "http://localhost:5173", "Access-Control-Allow-Credentials": "true", "Access-Control-Expose-Headers": "ETag, X-Exam-Server-Time" }, ETag: '"v1-r1-DRAFT"', "X-Exam-Server-Time": "2026-11-27T00:00:00.000Z" }, body: JSON.stringify({ data: { ...existing, id: submittedId } }) });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Đã có đề cùng mã" })).toBeVisible();
  await expect(page.getByText("Đã lưu: Tên của nháp hiện có")).toBeVisible();
  await expect(page.getByText("Tên bạn vừa nhập: Tên do tôi vừa nhập")).toBeVisible();
  await expect(title).toHaveValue("Tên do tôi vừa nhập");
  expect(postCount).toBe(1);
  await page.getByRole("button", { name: "Mở đề hiện có để xem" }).click();
  await expect(page).toHaveURL(new RegExp(`/teacher/exams/${submittedId}$`));
  expect(postCount).toBe(1);
});
