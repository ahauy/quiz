import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StudentExamMetadata } from "@quiz/shared";
import { StudentExamMetadataView } from "./student-exam-metadata.js";

const metadata: StudentExamMetadata = {
  title: "Đề giữa kỳ môn Toán",
  teacherName: "teacher@example.com",
  questionCount: "18",
  durationMinutes: "90",
  opensAt: "2026-11-27T03:00:00.000Z",
  closesAt: "2026-11-27T04:30:00.000Z",
  state: "SCHEDULED",
  maxAttempts: "2",
  passwordRequired: true,
  allowAnswerReview: false,
  qualifyingClassroomNames: ["Lớp 10A", "Lớp 10B"],
};

describe("student exam metadata view", () => {
  it("shows the complete safe metadata in Vietnamese, preserving the canonical teacher name", () => {
    const html = renderToStaticMarkup(<StudentExamMetadataView metadata={metadata} />);

    for (const text of [
      "Đề giữa kỳ môn Toán", "teacher@example.com", "18", "90", "Chờ mở", "2",
      "Có", "Không", "Lớp 10A", "Lớp 10B", "Thời gian mở", "Thời gian đóng",
    ]) expect(html).toContain(text);
  });

  it.each([
    ["SCHEDULED", "Chờ mở"],
    ["OPEN", "Đang mở"],
    ["CLOSED", "Đã đóng"],
  ] as const)("labels %s as %s", (state, label) => {
    const html = renderToStaticMarkup(<StudentExamMetadataView metadata={{ ...metadata, state }} />);
    expect(html).toContain(label);
  });

  it("renders only the safe allowlist even if an untyped payload has extra fields", () => {
    const unsafe = { ...metadata, password: "secret-pass", questions: ["secret-question"], otherClass: "Lớp 10Z" } as StudentExamMetadata;
    const html = renderToStaticMarkup(<StudentExamMetadataView metadata={unsafe} />);
    expect(html).not.toContain("secret-pass");
    expect(html).not.toContain("secret-question");
    expect(html).not.toContain("Lớp 10Z");
  });
});
