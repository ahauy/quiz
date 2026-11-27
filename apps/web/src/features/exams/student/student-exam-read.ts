import type { StudentExamMetadata } from "@quiz/shared";
import { examRefreshDelayMs, readExamServerTime } from "../server-time.js";

export interface StudentExamReadState<T> {
  requestId: number;
  status: "loading" | "ready" | "error";
  data: T | null;
  error: string | null;
}

export type StudentExamReadAction<T> =
  | { type: "started"; requestId: number }
  | { type: "succeeded"; requestId: number; data: T }
  | { type: "failed"; requestId: number; message: string };

export function studentExamReadReducer<T>(
  state: StudentExamReadState<T>,
  action: StudentExamReadAction<T>,
): StudentExamReadState<T> {
  if (action.type === "started") {
    return { requestId: action.requestId, status: "loading", data: null, error: null };
  }
  if (action.requestId !== state.requestId) return state;
  if (action.type === "succeeded") return { ...state, status: "ready", data: action.data, error: null };
  return { ...state, status: "error", data: null, error: action.message };
}

export function nextStudentExamBoundary(
  headers: Pick<Headers, "get">,
  metadata: readonly StudentExamMetadata[],
): number | null {
  const serverTime = readExamServerTime(headers);
  if (serverTime === null) return null;
  const boundaries = metadata
    .map((exam) => exam.state === "SCHEDULED" ? exam.opensAt : exam.state === "OPEN" ? exam.closesAt : null)
    .filter((value): value is string => value !== null);
  const nextBoundary = boundaries.sort((left, right) => Date.parse(left) - Date.parse(right))[0];
  return nextBoundary === undefined ? null : examRefreshDelayMs(serverTime, nextBoundary);
}

export function studentExamStateLabel(state: StudentExamMetadata["state"]): string {
  return { SCHEDULED: "Chờ mở", OPEN: "Đang mở", CLOSED: "Đã đóng" }[state];
}
