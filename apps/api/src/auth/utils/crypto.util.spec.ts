import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  fromBase64Url,
  hmacSha256Hex,
  randomHex,
  sha256Hex,
  timingSafeEqualBuf,
  toBase64Url,
} from "./crypto.util.js";

describe("crypto.util", () => {
  it("sha256Hex is deterministic and input-sensitive", () => {
    expect(sha256Hex("same")).toBe(sha256Hex("same"));
    expect(sha256Hex("same")).not.toBe(sha256Hex("other"));
    expect(sha256Hex("same")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hmacSha256Hex depends on both secret and data", () => {
    expect(hmacSha256Hex("secret", "data")).toBe(hmacSha256Hex("secret", "data"));
    expect(hmacSha256Hex("secret", "data")).not.toBe(hmacSha256Hex("other", "data"));
    expect(hmacSha256Hex("secret", "data")).not.toBe(hmacSha256Hex("secret", "other"));
  });

  it("randomHex returns the requested byte length and never repeats", () => {
    expect(randomHex(32)).toMatch(/^[0-9a-f]{64}$/);
    expect(randomHex(32)).not.toBe(randomHex(32));
  });

  it("base64url round-trips bytes without padding", () => {
    const encoded = toBase64Url(Buffer.from([251, 255, 254, 0, 1]));
    expect(encoded).not.toContain("=");
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(fromBase64Url(encoded).equals(Buffer.from([251, 255, 254, 0, 1]))).toBe(true);
  });

  it("timingSafeEqualBuf is false for unequal or different-length buffers without throwing", () => {
    expect(timingSafeEqualBuf(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
    expect(timingSafeEqualBuf(Buffer.from("abc"), Buffer.from("abd"))).toBe(false);
    expect(timingSafeEqualBuf(Buffer.from("abc"), Buffer.from("abcd"))).toBe(false);
  });
});
