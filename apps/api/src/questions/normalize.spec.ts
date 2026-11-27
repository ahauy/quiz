import { describe, expect, it } from "vitest";
import { normalize } from "./normalize.js";

describe("normalize (BR-QB-019)", () => {
  it("applies NFC normalization before casing", () => {
    // "é" as e + combining acute (NFD) must compose to the NFC precomposed "é".
    expect(normalize("e\u0301")).toBe("é");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalize("  hello  ")).toBe("hello");
  });

  it("collapses runs of whitespace to a single space", () => {
    expect(normalize("a \t\n  b")).toBe("a b");
  });

  it("lowercases with a locale-independent toLowerCase", () => {
    expect(normalize("TOÁN")).toBe("toán");
  });

  it("produces one canonical key for catalog dedupe", () => {
    expect(normalize("  TOÁN   10  ")).toBe("toán 10");
    expect(normalize("Toán 10")).toBe("toán 10");
    expect(normalize("toán\t10")).toBe("toán 10");
  });

  it("keeps accents (no unaccent extension in MVP)", () => {
    expect(normalize("CAFÉ")).toBe("café");
    expect(normalize("café")).toBe("café");
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   \t\n ")).toBe("");
  });

  it("is pure and idempotent", () => {
    const input = "  A   B  ";
    const once = normalize(input);
    expect(once).toBe("a b");
    expect(normalize(once)).toBe(once);
    expect(input).toBe("  A   B  ");
  });
});
