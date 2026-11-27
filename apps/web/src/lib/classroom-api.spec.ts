import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnrollmentStatus } from "@quiz/shared";
import { ApiError, configureApiClient } from "./api-client.js";
import {
  approveEnrollment,
  createClassroom,
  deleteClassroom,
  getClassroomEnrollments,
  getClassrooms,
  joinClassroom,
  removeEnrollment,
} from "./classroom-api.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function getCall(index: number): [string, RequestInit] {
  const call = fetchMock.mock.calls[index] as [string, RequestInit] | undefined;
  if (!call) throw new Error(`missing fetch call at ${index}`);
  return call;
}

const classroom = {
  id: "c-1",
  name: "Toán 10A",
  code: "ABC234",
  teacherId: "u-1",
  createdAt: "2026-11-26T00:00:00.000Z",
};

const enrollment = {
  id: "e-1",
  classroomId: "c-1",
  userId: "u-2",
  displayName: "Student",
  email: "student@example.com",
  status: EnrollmentStatus.PENDING,
  createdAt: "2026-11-26T01:00:00.000Z",
};

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  configureApiClient({ getAccessToken: () => null, refresh: async () => null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("classroom-api contract paths", () => {
  it("POST /classrooms sends { name } and parses ClassroomDto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: classroom }, 201));
    const result = await createClassroom({ name: "Toán 10A" });
    expect(result).toEqual(classroom);
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms$/);
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({ name: "Toán 10A" });
  });

  it("GET /classrooms parses a ClassroomDto array", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [classroom] }));
    const result = await getClassrooms();
    expect(result).toEqual([classroom]);
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms$/);
    expect(options.method).toBe("GET");
  });

  it("GET /classrooms/:id/enrollments parses an EnrollmentDto array", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [enrollment] }));
    const result = await getClassroomEnrollments("c-1");
    expect(result).toEqual([enrollment]);
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms\/c-1\/enrollments$/);
    expect(options.method).toBe("GET");
  });

  it("DELETE /classrooms/:id parses { ok: true }", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    await expect(deleteClassroom("c-1")).resolves.toEqual({ ok: true });
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms\/c-1$/);
    expect(options.method).toBe("DELETE");
  });

  it("POST /classrooms/:code/join puts the code in the path and parses PENDING", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: enrollment }, 201));
    const result = await joinClassroom("ABC234");
    expect(result.status).toBe(EnrollmentStatus.PENDING);
    expect(result.approvedAt).toBeUndefined();
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms\/ABC234\/join$/);
    expect(options.method).toBe("POST");
    expect(options.body).toBeUndefined();
  });

  it("PATCH /classrooms/:id/enrollments/:userId/approve parses APPROVED", async () => {
    const approved = { ...enrollment, status: EnrollmentStatus.APPROVED, approvedAt: "2026-11-26T02:00:00.000Z" };
    fetchMock.mockResolvedValue(jsonResponse({ data: approved }));
    const result = await approveEnrollment("c-1", "u-2");
    expect(result).toEqual(approved);
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms\/c-1\/enrollments\/u-2\/approve$/);
    expect(options.method).toBe("PATCH");
  });

  it("DELETE /classrooms/:id/enrollments/:userId parses { ok: true }", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    await expect(removeEnrollment("c-1", "u-2")).resolves.toEqual({ ok: true });
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/classrooms\/c-1\/enrollments\/u-2$/);
    expect(options.method).toBe("DELETE");
  });

  it("propagates the error envelope for an unknown join code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "CLASS_CODE_NOT_FOUND", message: "Mã lớp không tồn tại" }, 404),
    );
    const pending = joinClassroom("ZZZ999");
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({
      status: 404,
      body: { code: "CLASS_CODE_NOT_FOUND" },
    });
  });
});
