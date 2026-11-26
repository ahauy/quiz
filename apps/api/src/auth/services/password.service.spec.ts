import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { PasswordService } from "./password.service.js";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes one-way: plaintext is absent and two hashes of the same password differ", async () => {
    const a = await service.hash("correct horse");
    const b = await service.hash("correct horse");
    expect(a).not.toContain("correct horse");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await service.hash("s3cret-pass");
    expect(await service.verify("s3cret-pass", hash)).toBe(true);
    expect(await service.verify("wrong-pass", hash)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await service.verify("x", "not-a-hash")).toBe(false);
    expect(await service.verify("x", "scrypt$aa$zz")).toBe(false);
  });

  it("never logs the plaintext secret (TC-008)", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await service.hash("super-secret-value");
    const printed = [log, warn, error].flatMap((s) => s.mock.calls.flat()).join(" ");
    expect(printed).not.toContain("super-secret-value");
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
