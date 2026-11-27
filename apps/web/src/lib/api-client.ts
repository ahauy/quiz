import type { z } from "zod";
import type { ApiErrorBody } from "./api-types.js";
import { errorEnvelopeSchema, successEnvelope } from "./schemas.js";

const baseUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
    readonly source: "http" | "invalid-success" = "http",
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

interface ApiRequestBase<S extends z.ZodTypeAny> {
  schema: S;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
  skipRefresh?: boolean;
}

export type ApiRequestOptions<S extends z.ZodTypeAny> = ApiRequestBase<S> &
  ({ includeResponse: true } | { includeResponse?: false });

export interface ApiResponseProjection<T> {
  data: T;
  headers: Headers;
}

function send(
  path: string,
  method: ApiRequestBase<z.ZodTypeAny>["method"],
  body: string | undefined,
  hasBody: boolean,
  headers: Headers,
  signal: AbortSignal | undefined,
  token: string | null,
): Promise<Response> {
  const attemptHeaders = new Headers(headers);
  if (token === null) attemptHeaders.delete("Authorization");
  else attemptHeaders.set("Authorization", `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, {
    method: method ?? "GET",
    credentials: "include",
    headers: attemptHeaders,
    ...(hasBody && body !== undefined ? { body } : {}),
    ...(signal !== undefined ? { signal } : {}),
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
  includeResponse: true,
): Promise<ApiResponseProjection<z.infer<S>>>;
async function parseResponse<S extends z.ZodTypeAny>(
  response: Response,
  schema: S,
  includeResponse?: false,
): Promise<z.infer<S>>;
async function parseResponse<S extends z.ZodTypeAny>(
  response: Response,
  schema: S,
  includeResponse = false,
): Promise<z.infer<S> | ApiResponseProjection<z.infer<S>>> {
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
    }, "invalid-success");
  }
  const parsed = successEnvelope(schema).safeParse(json);
  if (!parsed.success) {
    throw new ApiError(response.status, {
      code: "VALIDATION_ERROR",
      message: "Invalid API response",
    }, "invalid-success");
  }
  return includeResponse
    ? { data: parsed.data.data, headers: response.headers }
    : parsed.data.data;
}

export function apiRequest<S extends z.ZodTypeAny>(
  path: string,
  options: ApiRequestBase<S> & { includeResponse: true },
): Promise<ApiResponseProjection<z.infer<S>>>;
export async function apiRequest<S extends z.ZodTypeAny>(
  path: string,
  options: ApiRequestBase<S> & { includeResponse?: false },
): Promise<z.infer<S>>;
export async function apiRequest<S extends z.ZodTypeAny>(
  path: string,
  options: ApiRequestOptions<S>,
): Promise<z.infer<S> | ApiResponseProjection<z.infer<S>>> {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Serialize once so an auth-refresh replay has the exact original request bytes.
  const hasBody = options.body !== undefined;
  const body = hasBody ? JSON.stringify(options.body) : undefined;
  const initialToken = hooks.getAccessToken();
  const first = await send(path, options.method, body, hasBody, headers, options.signal, initialToken);
  // One refresh retry only on protected 401s; never recurses on the refresh call itself.
  const canRefresh = !options.skipRefresh && initialToken !== null && first.status === 401;
  if (canRefresh) {
    const refreshed = await hooks.refresh();
    if (refreshed !== null) {
      const retry = await send(path, options.method, body, hasBody, headers, options.signal, refreshed);
      return options.includeResponse
        ? parseResponse(retry, options.schema, true)
        : parseResponse(retry, options.schema, false);
    }
  }
  return options.includeResponse
    ? parseResponse(first, options.schema, true)
    : parseResponse(first, options.schema, false);
}
