import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, configureApiClient } from "@/lib/api-client.js";
import {
  classifyExamWriteOutcome,
  createTeacherExam,
  getStudentExam,
  getTeacherExam,
  listExamHistory,
  listStudentExams,
  listTeacherExams,
  patchTeacherExam,
  strongExamETag,
} from "./api.js";
import {
  examRefreshDelayMs,
  formatExamInstantInVietnam,
  readExamServerTime,
  vietnamLocalDateTimeToIso,
} from "./server-time.js";

const teacherId = "7d6b91a8-6e23-4da9-b383-476bc40e1e37";
const mutationId = "b2b32c85-1c67-4881-bc71-620611af4df0";
const detail = {
  id: teacherId,
  title: "Bài kiểm tra",
  state: "DRAFT",
  questionCount: "0",
  opensAt: null,
  closesAt: null,
  durationMinutes: null,
  maxAttempts: null,
  allowAnswerReview: null,
  passwordRequired: false,
  earlyClosedAt: null,
  everPublished: false,
  lastMutationId: mutationId,
};
const metadata = {
  title: "Bài kiểm tra",
  teacherName: "Cô An",
  questionCount: "1",
  durationMinutes: "45",
  opensAt: "2026-12-01T02:00:00.000Z",
  closesAt: "2026-12-01T03:00:00.000Z",
  state: "SCHEDULED",
  maxAttempts: "2",
  passwordRequired: false,
  allowAnswerReview: true,
  qualifyingClassroomNames: ["Lớp 7A"],
};

let fetchMock: ReturnType<typeof vi.fn>;

function response(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function request(index = 0): [string, RequestInit] {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  configureApiClient({ getAccessToken: () => null, refresh: async () => null });
});

afterEach(() => vi.unstubAllGlobals());

describe("exam API", () => {
  it("returns teacher detail with its validator and server-time headers", async () => {
    fetchMock.mockResolvedValue(response({ data: detail }, {
      ETag: '"v1-r3-DRAFT"',
      "X-Exam-Server-Time": "2026-11-27T00:00:00.123Z",
    }));
    const result = await getTeacherExam(teacherId);
    expect(result.data).toEqual(detail);
    expect(result.headers.get("ETag")).toBe('"v1-r3-DRAFT"');
    expect(result.headers.get("X-Exam-Server-Time")).toBe("2026-11-27T00:00:00.123Z");
  });

  it("exposes the canonical exam validator on history page reads", async () => {
    fetchMock.mockResolvedValue(response({ data: { items: [], nextCursor: null } }, { "X-Exam-ETag": '"v1-r3-DRAFT"' }));
    const result = await listExamHistory(teacherId);
    expect(result.data.items).toEqual([]);
    expect(result.headers.get("X-Exam-ETag")).toBe('"v1-r3-DRAFT"');
  });

  it("sends caller mutation identity and canonical If-Match on writes", async () => {
    fetchMock.mockResolvedValue(response({ data: detail }, { ETag: '"v1-r3-DRAFT"' }));
    const etag = strongExamETag('"v1-r2-DRAFT"');
    const result = await patchTeacherExam(teacherId, etag, { op: "publish", mutationId });
    const [url, options] = request();
    expect(url).toMatch(/\/teacher\/exams\/[0-9a-f-]+$/);
    expect(options.method).toBe("PATCH");
    expect(new Headers(options.headers).get("if-match")).toBe(etag);
    expect(JSON.parse(String(options.body))).toEqual({ op: "publish", mutationId });
    expect(result.headers.get("ETag")).toBe('"v1-r3-DRAFT"');
  });

  it("sends client-generated create controls and preserves returned Location", async () => {
    fetchMock.mockResolvedValue(response({ data: detail }, { Location: `/teacher/exams/${teacherId}`, ETag: '"v1-r1-DRAFT"' }));
    const result = await createTeacherExam({ id: teacherId, title: "Bài kiểm tra", mutationId });
    expect(JSON.parse(String(request()[1].body))).toEqual({ id: teacherId, title: "Bài kiểm tra", mutationId });
    expect(result.headers.get("Location")).toBe(`/teacher/exams/${teacherId}`);
  });

  it("uses strict student list projection and exposes the server clock", async () => {
    fetchMock.mockResolvedValue(response({ data: { items: [{ detailPath: `/student/exams/${teacherId}`, metadata }], nextCursor: null } }, {
      "X-Exam-Server-Time": "2026-11-27T00:00:00.123Z",
    }));
    const result = await listStudentExams({ state: "SCHEDULED", pageSize: 10 });
    expect(result.data.items[0]?.metadata.teacherName).toBe("Cô An");
    expect(result.headers.get("X-Exam-Server-Time")).toBe("2026-11-27T00:00:00.123Z");
    expect(request()[0]).toContain("state=SCHEDULED");
    expect(request()[0]).toContain("pageSize=10");
  });

  it("returns exact student detail metadata and validates ids before dispatch", async () => {
    fetchMock.mockResolvedValue(response({ data: metadata }, {
      "X-Exam-Server-Time": "2026-11-27T00:00:00.123Z",
    }));
    const result = await getStudentExam(teacherId);
    expect(result.data).toEqual(metadata);
    expect(result.headers.get("X-Exam-Server-Time")).toBe("2026-11-27T00:00:00.123Z");
    expect(() => getStudentExam("not-a-uuid")).toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns teacher-list server time without changing the page data shape", async () => {
    const page = { items: [], nextCursor: null };
    fetchMock.mockResolvedValue(response({ data: page }, {
      "X-Exam-Server-Time": "2026-11-27T00:00:00.123Z",
    }));
    const result = await listTeacherExams();
    expect(result.data).toEqual(page);
    expect(result.headers.get("X-Exam-Server-Time")).toBe("2026-11-27T00:00:00.123Z");
  });

  it("classifies only known rollback and ordinary 4xx errors as definite", () => {
    expect(classifyExamWriteOutcome(new ApiError(503, { code: "EXAM_WRITE_BUSY", message: "busy" }))).toBe("rejected");
    expect(classifyExamWriteOutcome(new ApiError(412, { code: "EXAM_VERSION_CONFLICT", message: "stale" }))).toBe("rejected");
    expect(classifyExamWriteOutcome(new ApiError(500, { code: "UNKNOWN", message: "unknown" }))).toBe("unknown");
    expect(classifyExamWriteOutcome(new ApiError(408, { code: "UNKNOWN", message: "timeout" }))).toBe("unknown");
    expect(classifyExamWriteOutcome(new ApiError(200, { code: "VALIDATION_ERROR", message: "bad" }, "invalid-success"))).toBe("unknown");
    expect(classifyExamWriteOutcome(new Error("network lost"))).toBe("unknown");
    expect(classifyExamWriteOutcome(new TypeError("fetch failed"))).toBe("unknown");
    expect(classifyExamWriteOutcome(new TypeError("local schema error"), false)).toBe("rejected");
  });
});

describe("exam server-time helpers", () => {
  it("keeps the server clock raw and schedules refresh from that clock sample", () => {
    const raw = "2026-11-27T00:00:00.123Z";
    expect(readExamServerTime(new Headers({ "X-Exam-Server-Time": raw }))).toBe(raw);
    expect(readExamServerTime(new Headers({ "X-Exam-Server-Time": "bad" }))).toBeNull();
    expect(examRefreshDelayMs(raw, "2026-11-27T01:00:00.123Z")).toBe(3_600_000);
    expect(examRefreshDelayMs(raw, "2026-11-26T23:59:00.000Z")).toBe(0);
  });

  it("parses full Vietnam calendar values with an explicit offset and formats instants in Vietnam", () => {
    expect(vietnamLocalDateTimeToIso("2026-12-01T09:30")).toBe("2026-12-01T02:30:00.000Z");
    expect(vietnamLocalDateTimeToIso("2026-12-01T09:30:12.345")).toBe("2026-12-01T02:30:12.345Z");
    expect(vietnamLocalDateTimeToIso("1970-01-01T08:00")).toBe("1970-01-01T00:00:00.000Z");
    expect(vietnamLocalDateTimeToIso("1900-01-01T07:06:30")).toBe("1900-01-01T00:00:00.000Z");
    expect(formatExamInstantInVietnam("0001-01-02T00:00:00.000Z")).toBe("0001-01-02T07:06:30.000");
    expect(vietnamLocalDateTimeToIso("0001-01-02T07:06:30.000")).toBe("0001-01-02T00:00:00.000Z");
    expect(vietnamLocalDateTimeToIso("2026-02-30T09:30")).toBeNull();
    expect(vietnamLocalDateTimeToIso("2026-12-01T24:00")).toBeNull();
    expect(formatExamInstantInVietnam("2026-12-01T02:30:12.345Z")).toBe("2026-12-01T09:30:12.345");
  });
});
