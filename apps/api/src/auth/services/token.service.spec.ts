import "reflect-metadata";
import { Role } from "@quiz/shared";
import { describe, expect, it } from "vitest";
import { TokenService } from "./token.service.js";
import { FakeClock, testAuthConfig } from "../testing/fakes.js";

function setup() {
  const config = testAuthConfig();
  const clock = new FakeClock();
  return { config, clock, tokens: new TokenService(config, clock) };
}

describe("TokenService", () => {
  it("signs and verifies an access token carrying sub/role/tokenVersion/exp", () => {
    const { tokens } = setup();
    const token = tokens.signAccessToken({ id: "u1", role: Role.TEACHER, tokenVersion: 3 });
    expect(token.split(".")).toHaveLength(3);
    const payload = tokens.verifyAccessToken(token);
    expect(payload.sub).toBe("u1");
    expect(payload.role).toBe(Role.TEACHER);
    expect(payload.tokenVersion).toBe(3);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects an expired token", () => {
    const { tokens, clock } = setup();
    const token = tokens.signAccessToken({ id: "u1", role: Role.STUDENT, tokenVersion: 0 });
    clock.advance(901 * 1000);
    expect(() => tokens.verifyAccessToken(token)).toThrow();
  });

  it("rejects a token signed with the wrong secret", () => {
    const { tokens } = setup();
    const impostor = new TokenService(
      testAuthConfig({ accessSecret: "z".repeat(64) }),
      new FakeClock(),
    );
    const token = impostor.signAccessToken({ id: "u1", role: Role.STUDENT, tokenVersion: 0 });
    expect(() => tokens.verifyAccessToken(token)).toThrow();
  });

  it("rejects malformed and tampered tokens", () => {
    const { tokens } = setup();
    expect(() => tokens.verifyAccessToken("")).toThrow();
    expect(() => tokens.verifyAccessToken("a.b")).toThrow();
    const token = tokens.signAccessToken({ id: "u1", role: Role.STUDENT, tokenVersion: 0 });
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    expect(() => tokens.verifyAccessToken(tampered)).toThrow();
  });

  it("generates refresh tokens with a stable, keyed hash and no repeats", () => {
    const { tokens } = setup();
    const a = tokens.generateRefreshToken();
    const b = tokens.generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(tokens.hashRefreshToken(a.raw));
    expect(a.hash).not.toBe(tokens.hashRefreshToken(b.raw));
  });
});
