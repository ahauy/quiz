import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const N = 1 << 15;
const R = 8;
const P = 3;
const FORMAT = "scrypt-utf16le-v1";
const KEY_LENGTH = 64;
const MAX_ACTIVE_KDFS = 2;
let active = 0;
const activeByTeacher = new Map<string, number>();

async function acquire(teacherId?: string): Promise<void> {
  if (active < MAX_ACTIVE_KDFS && (!teacherId || (activeByTeacher.get(teacherId) ?? 0) < 1)) {
    active += 1;
    if (teacherId) activeByTeacher.set(teacherId, 1);
    return;
  }
  throw new Error("EXAM_HASH_BUSY");
}

function release(teacherId?: string): void {
  active -= 1;
  if (teacherId) activeByTeacher.delete(teacherId);
}

async function derive(value: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(Buffer.from(value, "utf16le"), salt, KEY_LENGTH, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key as Buffer);
    });
  });
}

export async function hashExamPassword(value: string, teacherId?: string): Promise<string> {
  await acquire(teacherId);
  try {
    const salt = randomBytes(16);
    const key = await derive(value, salt, N, R, P);
    return `${FORMAT}$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
  } finally { release(teacherId); }
}

export async function verifyExamPassword(value: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== FORMAT) return false;
  const [algorithm, nText, rText, pText, saltText, keyText] = parts;
  if (!algorithm || !nText || !rText || !pText || !saltText || !keyText) return false;
  const n = Number(nText); const r = Number(rText); const p = Number(pText);
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  if (n !== N || r !== R || p !== P || salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
  await acquire();
  try { return timingSafeEqual(await derive(value, salt, n, r, p), expected); }
  finally { release(); }
}
