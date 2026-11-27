import type { CreateQuestionDto, QuestionListQueryDto } from "@quiz/shared";
import { ApiError, apiRequest } from "@/lib/api-client.js";
import { errorEnvelopeSchema, okSchema, successEnvelope } from "@/lib/schemas.js";
import { useAuthStore } from "@/stores/auth-store.js";
import {
  assetUploadSchema,
  questionDtoSchema,
  questionListSchema,
  subjectListSchema,
  type AssetUploadWire,
  type QuestionDtoWire,
  type QuestionListWire,
  type SubjectWire,
} from "./schemas.js";

// Typed wrappers over the question-bank API contracts (unprefixed paths).
// Every response is validated with the runtime mirrors in ./schemas.ts.

const baseUrl: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function queryString(query: QuestionListQueryDto): string {
  const params = new URLSearchParams();
  if (query.subjectId !== undefined) params.set("subjectId", query.subjectId);
  if (query.chapterId !== undefined) params.set("chapterId", query.chapterId);
  if (query.difficulty !== undefined) params.set("difficulty", query.difficulty);
  if (query.type !== undefined) params.set("type", query.type);
  if (query.q !== undefined && query.q.trim().length > 0) params.set("q", query.q.trim());
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));
  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function listQuestions(query: QuestionListQueryDto = {}): Promise<QuestionListWire> {
  return apiRequest(`/questions${queryString(query)}`, { schema: questionListSchema });
}

export function getQuestion(id: string): Promise<QuestionDtoWire> {
  return apiRequest(`/questions/${encodeURIComponent(id)}`, { schema: questionDtoSchema });
}

export function createQuestion(input: CreateQuestionDto): Promise<QuestionDtoWire> {
  return apiRequest("/questions", { method: "POST", body: input, schema: questionDtoSchema });
}

export function replaceQuestion(id: string, input: CreateQuestionDto): Promise<QuestionDtoWire> {
  return apiRequest(`/questions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
    schema: questionDtoSchema,
  });
}

export function deleteQuestion(id: string): Promise<{ ok: true }> {
  return apiRequest(`/questions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    schema: okSchema,
  });
}

export function listSubjects(): Promise<SubjectWire[]> {
  return apiRequest("/subjects", { schema: subjectListSchema });
}

// Multipart upload needs progress reporting, so it cannot go through the JSON-only
// apiRequest. This mirrors its auth/refresh behaviour and error envelope handling.
function uploadAttempt(
  file: File,
  token: string | null,
  onProgress?: (percent: number) => void,
): Promise<AssetUploadWire> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/assets`);
    xhr.responseType = "text";
    if (token !== null) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onerror = () => reject(new Error("Không thể tải ảnh lên"));
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = successEnvelope(assetUploadSchema).safeParse(json);
        if (parsed.success) {
          resolve(parsed.data.data);
          return;
        }
        reject(
          new ApiError(xhr.status, {
            code: "VALIDATION_ERROR",
            message: "Phản hồi tải ảnh không hợp lệ",
          }),
        );
        return;
      }
      const parsedError = errorEnvelopeSchema.safeParse(json);
      const body = parsedError.success
        ? parsedError.data
        : { code: "UNKNOWN", message: xhr.statusText || "Tải ảnh thất bại" };
      reject(new ApiError(xhr.status, body));
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export async function uploadImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<AssetUploadWire> {
  const token = useAuthStore.getState().accessToken;
  try {
    return await uploadAttempt(file, token, onProgress);
  } catch (error) {
    const canRefresh = error instanceof ApiError && error.status === 401 && token !== null;
    if (canRefresh) {
      const refreshed = await useAuthStore.getState().refresh();
      if (refreshed !== null) return uploadAttempt(file, refreshed, onProgress);
    }
    throw error;
  }
}

// One human-readable message for the bank pages; the API keeps its typed
// { code, message } envelope, so never swallow the server's text.
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.body.message;
  if (error instanceof Error) return error.message;
  return "Không thể kết nối tới máy chủ";
}
