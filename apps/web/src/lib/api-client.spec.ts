import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiRequest, configureApiClient } from "./api-client.js";

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

function headersOf(options: RequestInit): Record<string, string> {
  const headers = new Headers(options.headers);
  return Object.fromEntries(headers.entries());
}

const okSchema = z.object({ ok: z.literal(true) });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  configureApiClient({ getAccessToken: () => null, refresh: async () => null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("uses credentials: include and returns validated data", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    const result = await apiRequest("/auth/me", { schema: okSchema });
    expect(result).toEqual({ ok: true });
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/auth\/me$/);
    expect(options.credentials).toBe("include");
    expect(options.method).toBe("GET");
  });

  it("adds a Bearer header when a token is available", async () => {
    configureApiClient({ getAccessToken: () => "tok-123", refresh: async () => null });
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    await apiRequest("/auth/me", { schema: okSchema });
    expect(headersOf(getCall(0)[1]).authorization).toBe("Bearer tok-123");
  });

  it("omits the Authorization header when there is no token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    await apiRequest("/auth/me", { schema: okSchema });
    expect(headersOf(getCall(0)[1]).Authorization).toBeUndefined();
  });

  it("serializes JSON bodies with the requested method", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ok: true } }));
    await apiRequest("/auth/login", {
      method: "POST",
      body: { email: "a@b.com", password: "secret12" },
      schema: okSchema,
    });
    const [, options] = getCall(0);
    expect(options.method).toBe("POST");
    expect(headersOf(options)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(options.body))).toEqual({ email: "a@b.com", password: "secret12" });
  });

  it("throws ApiError with code/message from the error envelope", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ code: "INVALID_TEACHER_CODE", message: "Mã giáo viên sai" }, 400),
    );
    try {
      await apiRequest("/auth/register", { method: "POST", body: {}, schema: okSchema });
      expect.unreachable("expected ApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.body.code).toBe("INVALID_TEACHER_CODE");
      expect(apiError.body.message).toBe("Mã giáo viên sai");
    }
  });

  it("retries exactly once after 401 using the refreshed token", async () => {
    const refresh = vi.fn(async () => "new-token");
    configureApiClient({ getAccessToken: () => "old-token", refresh });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const result = await apiRequest("/auth/me", { schema: okSchema });
    expect(result).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOf(getCall(1)[1]).authorization).toBe("Bearer new-token");
  });

  it("preserves caller headers and the serialized body across the 401 replay", async () => {
    const refresh = vi.fn(async () => "new-token");
    configureApiClient({ getAccessToken: () => "old-token", refresh });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { ok: true } }));
    const body = { mutationId: "m-1", nested: { title: "Draft A" } };
    const request = apiRequest("/teacher/exams/e-1", {
      method: "PATCH",
      body,
      headers: { "If-Match": '"rep-1-2-DRAFT"', "X-Caller": "kept" },
      schema: okSchema,
    });
    body.nested.title = "mutated after dispatch";
    await request;
    const [, first] = getCall(0);
    const [, retry] = getCall(1);
    expect(headersOf(first)).toMatchObject({
      "if-match": '"rep-1-2-DRAFT"',
      "x-caller": "kept",
      authorization: "Bearer old-token",
    });
    expect(headersOf(retry)).toMatchObject({
      "if-match": '"rep-1-2-DRAFT"',
      "x-caller": "kept",
      authorization: "Bearer new-token",
    });
    expect(retry.body).toBe(first.body);
    expect(JSON.parse(String(retry.body))).toEqual({ mutationId: "m-1", nested: { title: "Draft A" } });
  });

  it("projects successful response headers only when requested", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"rep-1-2-DRAFT"' },
      }),
    );
    const projected = await apiRequest("/teacher/exams/e-1", {
      schema: okSchema,
      includeResponse: true,
    });
    expect(projected.data).toEqual({ ok: true });
    expect(projected.headers.get("ETag")).toBe('"rep-1-2-DRAFT"');
  });

  it("keeps malformed successful bodies distinguishable from definite HTTP errors", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { wrong: 1 } }));
    await expect(apiRequest("/teacher/exams", { schema: z.object({ id: z.string() }) })).rejects.toMatchObject({
      source: "invalid-success",
    });
  });

  it("does not loop when the retry also returns 401", async () => {
    const refresh = vi.fn(async () => "new-token");
    configureApiClient({ getAccessToken: () => "old-token", refresh });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "still" }, 401));
    await expect(apiRequest("/auth/me", { schema: okSchema })).rejects.toBeInstanceOf(ApiError);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws the original 401 when refresh fails, without a retry", async () => {
    const refresh = vi.fn(async () => null);
    configureApiClient({ getAccessToken: () => "old-token", refresh });
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "expired" }, 401));
    try {
      await apiRequest("/auth/me", { schema: okSchema });
      expect.unreachable("expected ApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).body.code).toBe("UNAUTHORIZED");
    }
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not attempt refresh for public 401s when there is no token", async () => {
    const refresh = vi.fn(async () => "new-token");
    configureApiClient({ getAccessToken: () => null, refresh });
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "INVALID_CREDENTIALS", message: "sai" }, 401));
    await expect(
      apiRequest("/auth/login", { method: "POST", body: {}, schema: okSchema }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honours skipRefresh (used by the refresh endpoint itself)", async () => {
    const refresh = vi.fn(async () => "new-token");
    configureApiClient({ getAccessToken: () => "old-token", refresh });
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "UNAUTHORIZED", message: "no cookie" }, 401));
    await expect(
      apiRequest("/auth/refresh", { method: "POST", schema: okSchema, skipRefresh: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed success envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { wrong: 1 } }));
    try {
      await apiRequest("/auth/me", { schema: z.object({ id: z.string() }) });
      expect.unreachable("expected ApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).body.code).toBe("VALIDATION_ERROR");
    }
  });

  it("falls back to UNKNOWN when the error body is not a valid envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse("not-an-object", 500));
    try {
      await apiRequest("/auth/me", { schema: okSchema });
      expect.unreachable("expected ApiError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).body.code).toBe("UNKNOWN");
    }
  });
});
