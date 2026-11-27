import { describe, expect, it } from "vitest";
import type { StudentExamMetadata } from "@quiz/shared";
import { ApiError } from "@/lib/api-client.js";
import {
  nextStudentExamBoundary,
  studentExamReadReducer,
  type StudentExamReadState,
} from "./student-exam-read.js";
import { studentExamReadError } from "./use-student-exam-read.js";

const initial: StudentExamReadState<string> = {
  requestId: 0,
  status: "loading",
  data: null,
  error: null,
};

describe("student exam read state", () => {
  it("ignores an older response after a newer read starts", () => {
    const current = studentExamReadReducer(initial, { type: "started", requestId: 2 });
    const stale = studentExamReadReducer(current, { type: "succeeded", requestId: 1, data: "stale" });
    expect(stale).toEqual(current);
  });

  it("clears previously authorized data when a current read is denied", () => {
    const loaded = studentExamReadReducer(initial, { type: "succeeded", requestId: 1, data: "metadata" });
    const checking = studentExamReadReducer(loaded, { type: "started", requestId: 2 });
    const denied = studentExamReadReducer(checking, { type: "failed", requestId: 2, message: "Không thể xem đề thi này." });
    expect(denied.status).toBe("error");
    expect(denied.data).toBeNull();
    expect(denied.error).toBe("Không thể xem đề thi này.");
  });

  it("maps a busy read to Vietnamese retry guidance without exposing the API message", () => {
    const error = new ApiError(503, { code: "EXAM_READ_BUSY", message: "private server detail" });
    expect(studentExamReadError(error, false)).toBe("Dữ liệu đề thi đang được cập nhật. Vui lòng thử lại.");
  });

  it("uses the raw server header to schedule the next state boundary", () => {
    const scheduled: StudentExamMetadata = {
      title: "Đề", teacherName: "GV", questionCount: "1", durationMinutes: "30",
      opensAt: "2026-11-27T03:00:02.000Z", closesAt: "2026-11-27T03:30:00.000Z",
      state: "SCHEDULED", maxAttempts: "1", passwordRequired: false,
      allowAnswerReview: false, qualifyingClassroomNames: ["10A"],
    };
    const open = { ...scheduled, state: "OPEN" as const };
    const headers = new Headers({ "X-Exam-Server-Time": "2026-11-27T03:00:00.000Z" });
    expect(nextStudentExamBoundary(headers, [scheduled])).toBe(2_000);
    expect(nextStudentExamBoundary(headers, [open])).toBe(1_800_000);
    expect(nextStudentExamBoundary(new Headers(), [scheduled])).toBeNull();
  });
});
