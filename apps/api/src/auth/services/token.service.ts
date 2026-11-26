import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "@quiz/shared";
import { AUTH_CONFIG } from "../auth.config.js";
import type { AuthConfig } from "../auth.config.js";
import {
  fromBase64Url,
  hmacSha256,
  randomHex,
  timingSafeEqualBuf,
  toBase64Url,
} from "../utils/crypto.util.js";
import { ROLE } from "../utils/role-value.js";
import { Clock } from "../ports.js";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  tokenVersion: number;
  iat: number;
  exp: number;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly clock: Clock,
  ) {}

  signAccessToken(user: { id: string; role: Role; tokenVersion: number }): string {
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const payload: AccessTokenPayload = {
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      iat: now,
      exp: now + this.config.accessTtlSeconds,
    };
    return this.sign(payload, this.config.accessSecret);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const parts = token.split(".");
    const header = parts[0];
    const body = parts[1];
    const signature = parts[2];
    if (header === undefined || body === undefined || signature === undefined) {
      throw new Error("Malformed token");
    }
    const expected = hmacSha256(this.config.accessSecret, `${header}.${body}`);
    if (!timingSafeEqualBuf(fromBase64Url(signature), expected)) {
      throw new Error("Bad signature");
    }
    const parsedHeader = this.decodeJson<{ alg?: unknown }>(header);
    if (parsedHeader.alg !== "HS256") throw new Error("Unsupported algorithm");
    const payload = this.decodeJson<AccessTokenPayload>(body);
    if (
      typeof payload.sub !== "string" ||
      (payload.role !== ROLE.TEACHER && payload.role !== ROLE.STUDENT) ||
      typeof payload.tokenVersion !== "number" ||
      typeof payload.exp !== "number"
    ) {
      throw new Error("Invalid claims");
    }
    const now = Math.floor(this.clock.now().getTime() / 1000);
    if (payload.exp <= now) throw new Error("Expired token");
    return payload;
  }

  generateRefreshToken(): { raw: string; hash: string } {
    const raw = randomHex(32);
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    return hmacSha256(this.config.refreshSecret, raw).toString("hex");
  }

  get refreshTtlMs(): number {
    return this.config.refreshTtlSeconds * 1000;
  }

  private sign(payload: AccessTokenPayload, secret: string): string {
    const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = toBase64Url(JSON.stringify(payload));
    const signature = toBase64Url(hmacSha256(secret, `${header}.${body}`));
    return `${header}.${body}.${signature}`;
  }

  private decodeJson<T>(segment: string): T {
    let value: unknown;
    try {
      value = JSON.parse(fromBase64Url(segment).toString("utf8")) as unknown;
    } catch {
      throw new Error("Malformed token segment");
    }
    if (typeof value !== "object" || value === null) {
      throw new Error("Malformed token segment");
    }
    return value as T;
  }
}
