import { expect, test, type APIRequestContext } from "@playwright/test";

// US-QB-001: real API + real Postgres. No mocks. Every user is unique so the
// suite can run fully parallel without cross-test interference.
const API = "http://localhost:3000";
const TEACHER_CODE = process.env.TEACHER_CODE ?? "LOCAL-TEACHER-CODE";

interface Session {
  email: string;
  password: string;
  token: string;
}

async function registerAndLogin(
  request: APIRequestContext,
  prefix: string,
  requestedRole?: "TEACHER",
): Promise<Session> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${prefix}-${suffix}@example.com`;
  const password = "Password123!";
  const registered = await request.post(`${API}/auth/register`, {
    data: {
      email,
      password,
      displayName: `${prefix}-${suffix.slice(-6)}`,
      ...(requestedRole === "TEACHER"
        ? { requestedRole, teacherCode: TEACHER_CODE }
        : {}),
    },
  });
  expect(registered.status(), await registered.text()).toBe(201);
  const loggedIn = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(loggedIn.status(), await loggedIn.text()).toBe(200);
  const body = (await loggedIn.json()) as { data: { accessToken: string } };
  return { email, password, token: body.data.accessToken };
}

function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

const base = {
  content: "Nội dung câu hỏi $x^2$",
  difficulty: "EASY",
  explanation: "Lời giải chi tiết",
  subjectName: "  Toán   10  ",
  chapterName: "Chương 1",
};

const payloads = [
  {
    ...base,
    type: "SINGLE_CHOICE",
    options: ["A", "B"],
    correctOptionIndexes: [0],
  },
  {
    ...base,
    type: "MULTIPLE_CHOICE",
    options: ["A", "B", "C"],
    correctOptionIndexes: [0, 1],
  },
  { ...base, type: "TRUE_FALSE", correctAnswer: true },
  {
    content: "Điền vào {{blank}} đây",
    difficulty: "MEDIUM",
    explanation: "Lời giải",
    subjectName: "Toán",
    chapterName: "Chương 1",
    type: "FILL_BLANK",
    acceptedAnswers: ["  GIÁ TRỊ ", "Đáp án"],
  },
  {
    ...base,
    type: "MATCHING",
    pairs: [
      { leftText: "A", rightText: "1" },
      { leftText: "B", rightText: "2" },
    ],
  },
];

async function createQuestion(request: APIRequestContext, token: string, payload: object) {
  const response = await request.post(`${API}/questions`, {
    headers: auth(token),
    data: payload,
  });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data;
}

test("US-QB-001: teacher creates all five types, replaces, filters and deletes", async ({
  request,
}) => {
  const teacher = await registerAndLogin(request, "qb-teacher", "TEACHER");
  const ids: string[] = [];
  for (const payload of payloads) {
    const created = await createQuestion(request, teacher.token, payload);
    ids.push(created.id);
  }

  const listed = await request.get(`${API}/questions?pageSize=50`, {
    headers: auth(teacher.token),
  });
  expect(listed.status()).toBe(200);
  const list = (await listed.json()) as {
    data: { items: { id: string; content: string }[]; total: number };
  };
  expect(list.data.total).toBe(5);
  expect(new Set(list.data.items.map((item) => item.id)).size).toBe(5);

  const filtered = await request.get(`${API}/questions?difficulty=EASY&pageSize=50`, {
    headers: auth(teacher.token),
  });
  const filteredBody = (await filtered.json()) as { data: { total: number } };
  expect(filteredBody.data.total).toBe(4);

  const first = ids[0];
  if (first === undefined) throw new Error("created question id missing");
  const replaced = await request.patch(`${API}/questions/${first}`, {
    headers: auth(teacher.token),
    data: { ...payloads[0], content: "Nội dung đã sửa" },
  });
  expect(replaced.status(), await replaced.text()).toBe(200);
  const replacedBody = (await replaced.json()) as { data: { content: string } };
  expect(replacedBody.data.content).toBe("Nội dung đã sửa");

  for (const id of ids) {
    const deleted = await request.delete(`${API}/questions/${id}`, {
      headers: auth(teacher.token),
    });
    expect(deleted.status(), await deleted.text()).toBe(200);
    const second = await request.delete(`${API}/questions/${id}`, {
      headers: auth(teacher.token),
    });
    expect(second.status()).toBe(404);
  }
});

test("US-QB-001: validation, ownership isolation and student denial", async ({ request }) => {
  const teacherA = await registerAndLogin(request, "qb-owner-a", "TEACHER");
  const teacherB = await registerAndLogin(request, "qb-owner-b", "TEACHER");
  const student = await registerAndLogin(request, "qb-student");

  const created = await createQuestion(request, teacherA.token, payloads[0]);

  const foreignPatch = await request.patch(`${API}/questions/${created.id}`, {
    headers: auth(teacherB.token),
    data: payloads[0],
  });
  expect(foreignPatch.status()).toBe(403);
  const foreignDelete = await request.delete(`${API}/questions/${created.id}`, {
    headers: auth(teacherB.token),
  });
  expect(foreignDelete.status()).toBe(403);

  const studentList = await request.get(`${API}/questions`, { headers: auth(student.token) });
  expect(studentList.status()).toBe(403);
  const studentSubject = await request.get(`${API}/subjects`, { headers: auth(student.token) });
  expect(studentSubject.status()).toBe(403);
  const anonymous = await request.get(`${API}/questions`);
  expect(anonymous.status()).toBe(401);

  const bad = await request.post(`${API}/questions`, {
    headers: auth(teacherA.token),
    data: {
      ...payloads[0],
      options: ["A", "A"],
      correctOptionIndexes: [0, 1],
    },
  });
  expect(bad.status()).toBe(422);

  const blankExplanation = await request.post(`${API}/questions`, {
    headers: auth(teacherA.token),
    data: { ...payloads[0], explanation: "   " },
  });
  expect(blankExplanation.status()).toBe(422);
});

test("US-QB-001: image upload accepts PNG and refuses spoofed and oversized files", async ({
  request,
}) => {
  const teacher = await registerAndLogin(request, "qb-assets", "TEACHER");
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
      "01f15c4890000000a49444154789c636000020000050001a5f645400000000049454e44ae426082",
    "hex",
  );

  const uploaded = await request.post(`${API}/assets`, {
    headers: auth(teacher.token),
    multipart: { file: { name: "answer.png", mimeType: "image/png", buffer: png } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const uploadedBody = (await uploaded.json()) as { data: { url: string; mimeType: string } };
  expect(uploadedBody.data.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
  expect(uploadedBody.data.mimeType).toBe("image/png");
  const publicFile = await request.get(`${API}${uploadedBody.data.url}`);
  expect(publicFile.status()).toBe(200);

  const spoofed = await request.post(`${API}/assets`, {
    headers: auth(teacher.token),
    multipart: {
      file: {
        name: "fake.png",
        mimeType: "image/png",
        buffer: Buffer.from("MZ\x90\x00this is not an image"),
      },
    },
  });
  expect(spoofed.status()).toBe(415);

  const oversized = await request.post(`${API}/assets`, {
    headers: auth(teacher.token),
    multipart: {
      file: {
        name: "big.png",
        mimeType: "image/png",
        buffer: Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]),
      },
    },
  });
  expect(oversized.status()).toBe(413);
});
