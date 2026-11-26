import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../utils/crypto.util.js";
import { ResetService } from "./reset.service.js";
import { FakeClock, testAuthConfig } from "../testing/fakes.js";

function setup() {
  const config = testAuthConfig();
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  return { config, clock, reset: new ResetService(config, clock) };
}

describe("ResetService", () => {
  it("issues a raw token, its hash and a 15-minute expiry from the clock", () => {
    const { reset, clock } = setup();
    const issued = reset.issue();
    expect(issued.hash).toBe(sha256Hex(issued.raw));
    expect(issued.hash).toBe(reset.hash(issued.raw));
    expect(issued.expiresAt.getTime()).toBe(clock.now().getTime() + 900 * 1000);
  });

  it("issues unique tokens on each call", () => {
    const { reset } = setup();
    expect(reset.issue().raw).not.toBe(reset.issue().raw);
  });

  it("builds a reset URL carrying the raw token under the configured base", () => {
    const { reset } = setup();
    expect(reset.buildUrl("tok123")).toBe(
      "http://localhost:5173/reset-password?token=tok123",
    );
    expect(reset.buildUrl("a b&c")).toBe(
      "http://localhost:5173/reset-password?token=a%20b%26c",
    );
  });
});
