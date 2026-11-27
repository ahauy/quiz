import { describe, expect, it } from "vitest";
import { canonicalPositiveInteger, parseExamInstant, effectiveExamStatus } from "./exam-rules.js";

describe("exam rules", () => {
  it("accepts only canonical positive ASCII decimal strings", () => {
    expect(canonicalPositiveInteger("1")).toBe(true);
    expect(canonicalPositiveInteger("9".repeat(80))).toBe(true);
    for (const value of ["0", "01", "1\n", " 1", "1 ", "١", "1.0", "+1"]) {
      expect(canonicalPositiveInteger(value)).toBe(false);
    }
  });

  it("parses valid explicit-offset instants without rollover", () => {
    expect(parseExamInstant("2026-11-27T12:00:00.123+07:00")?.toISOString()).toBe(
      "2026-11-27T05:00:00.123Z",
    );
    expect(parseExamInstant("2026-02-30T12:00:00Z")).toBeNull();
    expect(parseExamInstant("2026-11-27T12:00:00")).toBeNull();
    expect(parseExamInstant("2026-11-27T12:00:00.1234Z")).toBeNull();
  });

  it("never regresses an already committed lifecycle phase", () => {
    expect(effectiveExamStatus("SCHEDULED", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z", new Date("2026-11-27T02:30:00Z"))).toBe("OPEN");
    expect(effectiveExamStatus("OPEN", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z", new Date("2026-11-27T01:00:00Z"))).toBe("OPEN");
    expect(effectiveExamStatus("CLOSED", "2026-11-27T02:00:00Z", "2026-11-27T03:00:00Z", new Date("2026-11-27T01:00:00Z"))).toBe("CLOSED");
  });
});
