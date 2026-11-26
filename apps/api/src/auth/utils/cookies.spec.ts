import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { authCookieOptions, clearAuthCookieOptions, parseCookieHeader } from "./cookies.js";
import { testAuthConfig } from "../testing/fakes.js";

describe("parseCookieHeader", () => {
  it("returns an empty object for a missing header", () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it("parses multiple cookies and decodes values", () => {
    expect(parseCookieHeader("a=one; refreshToken=abc%20123; other=x=y")).toEqual({
      a: "one",
      refreshToken: "abc 123",
      other: "x=y",
    });
  });

  it("tolerates malformed segments", () => {
    expect(parseCookieHeader("=nokey; flag; ok=yes")).toEqual({ ok: "yes" });
  });
});

describe("cookie options", () => {
  const config = testAuthConfig({ secureCookies: true });

  it("is httpOnly, scoped to /auth, SameSite=Lax and secure in production", () => {
    expect(authCookieOptions(config, 1000)).toMatchObject({
      httpOnly: true,
      path: "/auth",
      sameSite: "lax",
      secure: true,
      maxAge: 1000,
    });
  });

  it("omits maxAge for clearing so the browser drops the cookie", () => {
    expect(clearAuthCookieOptions(config)).not.toHaveProperty("maxAge");
  });
});
