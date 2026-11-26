import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApiClient } from "./api-client.js";
import { forgotPassword, googleAuthUrl, login, register, updateMe } from "./auth-api.js";

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

const user = { id: "u-1", email: "a@b.com", displayName: "Alice", role: "STUDENT" };

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  configureApiClient({ getAccessToken: () => null, refresh: async () => null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth-api contract paths", () => {
  it("POST /auth/register parses UserDto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: user }, 201));
    const result = await register({ email: "a@b.com", password: "password1", displayName: "Alice" });
    expect(result).toEqual(user);
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/auth\/register$/);
    expect(options.method).toBe("POST");
  });

  it("POST /auth/login parses AuthResultDto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { accessToken: "t", user } }));
    const result = await login({ email: "a@b.com", password: "password1" });
    expect(result.accessToken).toBe("t");
    expect(getCall(0)[0]).toMatch(/\/auth\/login$/);
  });

  it("GET /auth/oauth/google/url parses AuthUrlDto", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x" } }),
    );
    const result = await googleAuthUrl();
    expect(result.url).toContain("accounts.google.com");
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/auth\/oauth\/google\/url$/);
    expect(options.method).toBe("GET");
  });

  it("POST /auth/forgot-password parses ForgotPasswordResultDto", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { data: { message: "ok", resetUrl: "http://localhost:5173/reset-password?token=x" } },
        202,
      ),
    );
    const result = await forgotPassword({ email: "a@b.com" });
    expect(result.resetUrl).toContain("reset-password");
    expect(getCall(0)[0]).toMatch(/\/auth\/forgot-password$/);
  });

  it("PATCH /auth/me parses UserDto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { ...user, displayName: "Bob" } }));
    const result = await updateMe({ displayName: "Bob" });
    expect(result.displayName).toBe("Bob");
    const [url, options] = getCall(0);
    expect(url).toMatch(/\/auth\/me$/);
    expect(options.method).toBe("PATCH");
  });
});
