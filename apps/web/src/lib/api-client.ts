import type { ApiErrorBody } from "./api-types.js";

const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      code: "UNKNOWN",
      message: response.statusText,
    }))) as ApiErrorBody;
    throw new ApiError(response.status, body);
  }
  return (await response.json()) as T;
}

// Refresh-token interceptor skeleton for US-AUTH-001.
export function attachRefreshHandler(handler: () => Promise<string | null>): void {
  void handler;
}
