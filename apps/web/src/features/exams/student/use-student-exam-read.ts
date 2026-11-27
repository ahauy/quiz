import { useCallback, useEffect, useReducer, useRef } from "react";
import type { StudentExamMetadata } from "@quiz/shared";
import { ApiError, type ApiResponseProjection } from "@/lib/api-client.js";
import {
  nextStudentExamBoundary,
  studentExamReadReducer,
  type StudentExamReadState,
} from "./student-exam-read.js";

const MAX_TIMER_MS = 2_147_000_000;

export function studentExamReadError(error: unknown, detail: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.";
    if (error.body.code === "EXAM_READ_BUSY") return "Dữ liệu đề thi đang được cập nhật. Vui lòng thử lại.";
    if (detail && (error.status === 403 || error.status === 404)) return "Đề thi không khả dụng hoặc bạn không có quyền xem.";
  }
  return detail ? "Không thể tải thông tin đề thi." : "Không thể tải danh sách đề thi.";
}

export function useStudentExamRead<T>(
  read: () => Promise<ApiResponseProjection<T>>,
  getMetadata: (data: T) => readonly StudentExamMetadata[],
  detail = false,
) {
  const [state, dispatch] = useReducer(studentExamReadReducer<T>, {
    requestId: 0, status: "loading", data: null, error: null,
  } satisfies StudentExamReadState<T>);
  const requestId = useRef(0);
  const timer = useRef<number | null>(null);
  const reload = useCallback(() => {
    const id = ++requestId.current;
    if (timer.current !== null) window.clearTimeout(timer.current);
    dispatch({ type: "started", requestId: id });
    void read().then(({ data, headers }) => {
      if (id !== requestId.current) return;
      dispatch({ type: "succeeded", requestId: id, data });
      const delay = nextStudentExamBoundary(headers, getMetadata(data));
      if (delay !== null) timer.current = window.setTimeout(reload, Math.min(delay, MAX_TIMER_MS));
    }).catch((error: unknown) => {
      if (id === requestId.current) dispatch({ type: "failed", requestId: id, message: studentExamReadError(error, detail) });
    });
  }, [detail, getMetadata, read]);

  useEffect(() => {
    reload();
    return () => {
      requestId.current += 1;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [reload]);

  useEffect(() => {
    const checkCurrentAccess = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", checkCurrentAccess);
    window.addEventListener("pageshow", checkCurrentAccess);
    document.addEventListener("visibilitychange", checkCurrentAccess);
    return () => {
      window.removeEventListener("focus", checkCurrentAccess);
      window.removeEventListener("pageshow", checkCurrentAccess);
      document.removeEventListener("visibilitychange", checkCurrentAccess);
    };
  }, [reload]);

  return { ...state, reload };
}
