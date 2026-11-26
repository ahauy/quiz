import { RESET_TTL_SECONDS } from "./constants.js";

export interface AuthConfig {
  readonly teacherCode: string;
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly googleClientId: string;
  readonly googleClientSecret: string;
  readonly googleRedirectUri: string;
  readonly resetUrlBase: string;
  readonly resetTtlSeconds: number;
  readonly secureCookies: boolean;
}

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export function parseDurationSeconds(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  const amount = Number(match?.[1]);
  const unit = match?.[2];
  if (match === null || !Number.isSafeInteger(amount) || amount <= 0 || unit === undefined) {
    throw new Error(`Invalid duration: ${input}`);
  }
  const factor: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (factor[unit] ?? 1);
}

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
}

export function createAuthConfig(): AuthConfig {
  const firstOrigin = optional("CORS_ORIGINS", "http://localhost:5173")
    .split(",")[0]
    ?.trim();
  const webOrigin =
    firstOrigin !== undefined && firstOrigin.length > 0
      ? firstOrigin
      : "http://localhost:5173";
  return {
    teacherCode: required("TEACHER_CODE"),
    accessSecret: required("JWT_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtlSeconds: parseDurationSeconds(optional("JWT_EXPIRES_IN", "15m")),
    refreshTtlSeconds: parseDurationSeconds(optional("JWT_REFRESH_EXPIRES_IN", "7d")),
    googleClientId: required("OAUTH_GOOGLE_CLIENT_ID"),
    googleClientSecret: required("OAUTH_GOOGLE_CLIENT_SECRET"),
    googleRedirectUri: optional("OAUTH_GOOGLE_REDIRECT_URI", `${webOrigin}/oauth/callback`),
    resetUrlBase: optional("VITE_API_URL", "http://localhost:5173"),
    resetTtlSeconds: RESET_TTL_SECONDS,
    secureCookies: process.env.NODE_ENV === "production",
  };
}
