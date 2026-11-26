import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

const KEY_LENGTH = 64;

function derive(plain: string, salt: string, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(plain, salt, length, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = await derive(plain, salt, KEY_LENGTH);
    return `scrypt$${salt}$${derived.toString("hex")}`;
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const salt = parts[1];
    const hex = parts[2];
    if (salt === undefined || hex === undefined) return false;
    const expected = Buffer.from(hex, "hex");
    if (expected.length === 0) return false;
    const derived = await derive(plain, salt, expected.length);
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }
}
