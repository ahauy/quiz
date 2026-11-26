import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthConfig, parseDurationSeconds } from "./auth.config.js";

describe("parseDurationSeconds", () => {
  it("parses s/m/h/d suffixes", () => {
    expect(parseDurationSeconds("30s")).toBe(30);
    expect(parseDurationSeconds("15m")).toBe(900);
    expect(parseDurationSeconds("2h")).toBe(7200);
    expect(parseDurationSeconds("7d")).toBe(604800);
  });

  it("rejects zero, negative, fractional and malformed durations", () => {
    expect(() => parseDurationSeconds("0s")).toThrow();
    expect(() => parseDurationSeconds("-5m")).toThrow();
    expect(() => parseDurationSeconds("1.5h")).toThrow();
    expect(() => parseDurationSeconds("15")).toThrow();
    expect(() => parseDurationSeconds("10w")).toThrow();
  });
});

describe("createAuthConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubBaseEnv(): void {
    vi.stubEnv("JWT_SECRET", "a".repeat(64));
    vi.stubEnv("JWT_REFRESH_SECRET", "b".repeat(64));
    vi.stubEnv("JWT_EXPIRES_IN", "15m");
    vi.stubEnv("JWT_REFRESH_EXPIRES_IN", "7d");
    vi.stubEnv("TEACHER_CODE", "TEACH-2026");
    vi.stubEnv("CORS_ORIGINS", "http://localhost:5173");
    vi.stubEnv("OAUTH_GOOGLE_CLIENT_ID", "client-id");
    vi.stubEnv("OAUTH_GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITE_API_URL", "http://localhost:5173");
    vi.stubEnv("OAUTH_GOOGLE_REDIRECT_URI", "");
  }

  it("derives TTLs, teacher code and secure-cookie flag from env", () => {
    stubBaseEnv();
    const config = createAuthConfig();
    expect(config.teacherCode).toBe("TEACH-2026");
    expect(config.accessSecret).toBe("a".repeat(64));
    expect(config.accessTtlSeconds).toBe(900);
    expect(config.refreshTtlSeconds).toBe(604800);
    expect(config.resetTtlSeconds).toBe(900);
    expect(config.secureCookies).toBe(false);
  });

  it("uses VITE_API_URL for the reset link base and CORS origin for the redirect uri", () => {
    stubBaseEnv();
    const config = createAuthConfig();
    expect(config.resetUrlBase).toBe("http://localhost:5173");
    expect(config.googleRedirectUri).toBe("http://localhost:5173/oauth/callback");
  });

  it("honours an explicit OAUTH_GOOGLE_REDIRECT_URI override", () => {
    stubBaseEnv();
    vi.stubEnv("OAUTH_GOOGLE_REDIRECT_URI", "https://example.com/oauth/callback");
    expect(createAuthConfig().googleRedirectUri).toBe("https://example.com/oauth/callback");
  });

  it("enables secure cookies only in production", () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "production");
    expect(createAuthConfig().secureCookies).toBe(true);
  });

  it("fails fast when a required secret is missing", () => {
    stubBaseEnv();
    vi.stubEnv("JWT_SECRET", "");
    expect(() => createAuthConfig()).toThrow(/JWT_SECRET/);
  });
});
