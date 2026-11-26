import type { AuthConfig } from "../auth.config.js";
import { COOKIE_PATH } from "../constants.js";

interface CookieOptions {
  httpOnly: boolean;
  path: string;
  sameSite: "lax";
  secure: boolean;
  maxAge?: number;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (header === undefined) return result;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key.length === 0) continue;
    const value = part.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function authCookieOptions(
  config: AuthConfig,
  maxAgeMs?: number,
): CookieOptions {
  const base: CookieOptions = {
    httpOnly: true,
    path: COOKIE_PATH,
    sameSite: "lax",
    secure: config.secureCookies,
  };
  return maxAgeMs === undefined ? base : { ...base, maxAge: maxAgeMs };
}

export function clearAuthCookieOptions(config: AuthConfig): CookieOptions {
  return authCookieOptions(config);
}
