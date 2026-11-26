import type { z } from "zod";
import type { ApiErrorBody } from "./api-types.js";
import { errorEnvelopeSchema, successEnvelope } from "./schemas.js";

const baseUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }
}

interface ApiClientHooks {
  getAccessToken: () => string | null;
  refresh: () => Promise<string | null>;
}

let hooks: ApiClientHooks = {
  getAccessToken: () => null,
  refresh: async () => null,
};

// Single registration point for store <-> client wiring (replaces the old skeleton).
export function configureApiClient(next: ApiClientHooks): void {
  hooks = next;
}

export interface ApiRequestOptions<S extends z.ZodTypeAny> {
  schema: S;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  skipRefresh?: boolean;
}

function send<S extends z.ZodTypeAny>(
  path: string,
  options: ApiRequestOptions<S>,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== null) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  const parsed = errorEnvelopeSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  return { code: "UNKNOWN", message: response.statusText || "Request failed" };
}

async function parseResponse<S extends z.ZodTypeAny>(
  response: Response,
  schema: S,
): Promise<z.infer<S>> {
  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorBody(response));
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(response.status, {
      code: "VALIDATION_ERROR",
      message: "Invalid API response",
    });
  }
  const parsed = successEnvelope(schema).safeParse(json);
  if (!parsed.success) {
    throw new ApiError(response.status, {
      code: "VALIDATION_ERROR",
      message: "Invalid API response",
    });
  }
  return parsed.data.data;
}

export async function apiRequest<S extends z.ZodTypeAny>(
  path: string,
  options: ApiRequestOptions<S>,
): Promise<z.infer<S>> {
  const initialToken = hooks.getAccessToken();
  const first = await send(path, options, initialToken);
  // One refresh retry only on protected 401s; never recurses on the refresh call itself.
  const canRefresh = !options.skipRefresh && initialToken !== null && first.status === 401;
  if (canRefresh) {
    const refreshed = await hooks.refresh();
    if (refreshed !== null) {
      const retry = await send(path, options, refreshed);
      return parseResponse(retry, options.schema);
    }
  }
  return parseResponse(first, options.schema);
}
