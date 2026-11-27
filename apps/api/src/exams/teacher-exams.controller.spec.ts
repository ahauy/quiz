import { describe, expect, it, vi } from "vitest";
import { TeacherExamsController } from "./teacher-exams.controller.js";

describe("TeacherExamsController history headers", () => {
  it("returns the canonical child validator with the history page", async () => {
    const etag = '"v1-00000000-0000-4000-8000-000000000001-DRAFT"';
    const now = new Date("2026-11-27T03:00:00.000Z");
    const page = { items: [], nextCursor: null };
    const exams = { history: vi.fn().mockResolvedValue({ page, etag, now }) };
    const controller = new TeacherExamsController(exams as never);
    const setHeader = vi.fn();
    const result = await controller.history(
      { user: { id: "teacher", role: "TEACHER" } } as never,
      "00000000-0000-4000-8000-000000000002",
      {},
      { setHeader } as never,
    );

    expect(result).toEqual({ data: page });
    expect(setHeader).toHaveBeenCalledWith("X-Exam-ETag", etag);
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(setHeader).toHaveBeenCalledWith("X-Exam-Server-Time", now.toISOString());
  });
});
