import { describe, expect, it } from "vitest";
import { hashExamPassword, verifyExamPassword } from "./exam-password.js";

describe("exam password verifier", () => {
  it("preserves case and whitespace and verifies the original code units", async () => {
    const stored = await hashExamPassword("  AbC\u0000😀  ");
    expect(await verifyExamPassword("  AbC\u0000😀  ", stored)).toBe(true);
    expect(await verifyExamPassword("  abc\u0000😀  ", stored)).toBe(false);
    expect(await verifyExamPassword("AbC\u0000😀", stored)).toBe(false);
  }, 15_000);

  it("rejects malformed stored verifier data", async () => {
    expect(await verifyExamPassword("x", "not-a-verifier")).toBe(false);
  });

  it("stores the approved encoding identifier and scrypt work factor", async () => {
    const stored = await hashExamPassword("approved-work-factor");
    const [format, n, r, p] = stored.split("$");
    expect(format).toBe("scrypt-utf16le-v1");
    expect([Number(n), Number(r), Number(p)]).toEqual([1 << 15, 8, 3]);
    expect(await verifyExamPassword("approved-work-factor", stored)).toBe(true);
    expect(await verifyExamPassword("approved-work-factor", stored.replace("scrypt-utf16le-v1", "scrypt"))).toBe(false);
    const wrongCost = stored.split("$");
    wrongCost[3] = "1";
    expect(await verifyExamPassword("approved-work-factor", wrongCost.join("$"))).toBe(false);
  });

  it("supports long exact inputs without case folding or trimming", async () => {
    const value = ` ${"Ab9 ".repeat(255)}😀 `;
    const stored = await hashExamPassword(value);
    expect(await verifyExamPassword(value, stored)).toBe(true);
    expect(await verifyExamPassword(value.trim(), stored)).toBe(false);
    expect(await verifyExamPassword(value.toLowerCase(), stored)).toBe(false);
  });

  it("admits one KDF per teacher and two per process", async () => {
    const first = hashExamPassword("one", "teacher-a");
    await expect(hashExamPassword("two", "teacher-a")).rejects.toMatchObject({ message: "EXAM_HASH_BUSY" });
    const second = hashExamPassword("two", "teacher-b");
    await expect(hashExamPassword("three", "teacher-c")).rejects.toMatchObject({ message: "EXAM_HASH_BUSY" });
    await Promise.all([first, second]);
  });
});
