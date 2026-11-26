import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function hmacSha256(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data, "utf8").digest();
}

export function hmacSha256Hex(secret: string, data: string): string {
  return hmacSha256(secret, data).toString("hex");
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function toBase64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
