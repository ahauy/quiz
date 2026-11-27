import { describe, expect, it } from "vitest";
import {
  examCreateRequestSchema,
  examQuestionSnapshotSchema,
  pageSchema,
  studentExamListItemSchema,
  studentExamMetadataSchema,
  teacherExamDetailSchema,
  teacherExamWriteRequestSchema,
} from "./schemas.js";

const teacherDetail = {
  id: "7d6b91a8-6e23-4da9-b383-476bc40e1e37",
  title: "Bài kiểm tra",
  state: "DRAFT",
  questionCount: "0",
  opensAt: null,
  closesAt: null,
  durationMinutes: null,
  maxAttempts: null,
  allowAnswerReview: null,
  passwordRequired: false,
  earlyClosedAt: null,
  everPublished: false,
  lastMutationId: "b2b32c85-1c67-4881-bc71-620611af4df0",
};

const studentMetadata = {
  title: "Bài kiểm tra",
  teacherName: "Cô An",
  questionCount: "1",
  durationMinutes: "45",
  opensAt: "2026-12-01T02:00:00.000Z",
  closesAt: "2026-12-01T03:00:00.000Z",
  state: "SCHEDULED",
  maxAttempts: "2",
  passwordRequired: false,
  allowAnswerReview: true,
  qualifyingClassroomNames: ["Lớp 7A"],
};

describe("exam response schemas", () => {
  it("accepts exact teacher detail and rejects extra fields", () => {
    expect(teacherExamDetailSchema.safeParse(teacherDetail).success).toBe(true);
    expect(teacherExamDetailSchema.safeParse({ ...teacherDetail, password: "secret" }).success).toBe(false);
  });

  it("validates decimal text without accepting newline, spaces, or non-ASCII digits", () => {
    for (const questionCount of ["1\n", " 1", "１", "01"]) {
      expect(teacherExamDetailSchema.safeParse({ ...teacherDetail, questionCount }).success).toBe(false);
    }
    expect(teacherExamDetailSchema.safeParse({ ...teacherDetail, questionCount: "0" }).success).toBe(true);
    expect(teacherExamDetailSchema.safeParse({ ...teacherDetail, questionCount: "123456789012345678901234567890" }).success).toBe(true);
  });

  it("enforces the exact student metadata projection and list wrapper", () => {
    expect(studentExamMetadataSchema.safeParse(studentMetadata).success).toBe(true);
    expect(studentExamMetadataSchema.safeParse({ ...studentMetadata, id: "leak" }).success).toBe(false);
    expect(studentExamMetadataSchema.safeParse({ ...studentMetadata, question: "leak" }).success).toBe(false);
    expect(studentExamListItemSchema.safeParse({ detailPath: "/student/exams/7d6b91a8-6e23-4da9-b383-476bc40e1e37", metadata: studentMetadata }).success).toBe(true);
    expect(pageSchema(studentExamListItemSchema).safeParse({ items: [{ detailPath: "/student/exams/x", metadata: studentMetadata }], nextCursor: null }).success).toBe(false);
  });

  it("rejects invalid calendar dates and timestamps without an explicit offset", () => {
    expect(studentExamMetadataSchema.safeParse({ ...studentMetadata, opensAt: "2026-02-30T02:00:00.000Z" }).success).toBe(false);
    expect(studentExamMetadataSchema.safeParse({ ...studentMetadata, opensAt: "2026-12-01T02:00:00" }).success).toBe(false);
    expect(studentExamMetadataSchema.safeParse({ ...studentMetadata, opensAt: "2026-12-01T02:00:00.0001Z" }).success).toBe(false);
  });

  it("accepts only the exact snapshot question projection", () => {
    const snapshot = {
      id: "7d6b91a8-6e23-4da9-b383-476bc40e1e37",
      sourceQuestionId: "b2b32c85-1c67-4881-bc71-620611af4df0",
      capturedAt: "2026-11-27T00:00:00.000Z",
      question: {
        type: "TRUE_FALSE",
        content: "2 + 2 = 4?",
        difficulty: "EASY",
        explanation: "Đúng",
        subjectId: "7d6b91a8-6e23-4da9-b383-476bc40e1e37",
        subjectName: "Toán",
        chapterId: "b2b32c85-1c67-4881-bc71-620611af4df0",
        chapterName: "Số học",
        correctAnswer: true,
      },
    };
    expect(examQuestionSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(examQuestionSnapshotSchema.safeParse({ ...snapshot, question: { ...snapshot.question, normalizedContent: "leak" } }).success).toBe(false);
  });

  it("validates all five exact question answer variants", () => {
    const base = {
      content: "Nội dung",
      difficulty: "EASY",
      explanation: "Giải thích",
      subjectId: "7d6b91a8-6e23-4da9-b383-476bc40e1e37",
      subjectName: "Toán",
      chapterId: "b2b32c85-1c67-4881-bc71-620611af4df0",
      chapterName: "Số học",
    };
    const variants = [
      { ...base, type: "SINGLE_CHOICE", options: [{ id: "o1", text: "A" }], correctOptionId: "o1" },
      { ...base, type: "MULTIPLE_CHOICE", options: [{ id: "o1", text: "A" }], correctOptionIds: ["o1"] },
      { ...base, type: "TRUE_FALSE", correctAnswer: true },
      { ...base, type: "FILL_BLANK", acceptedAnswers: ["đáp án"] },
      { ...base, type: "MATCHING", pairs: [{ id: "p1", leftText: "A", rightText: "B" }] },
    ];
    for (const question of variants) expect(examQuestionSnapshotSchema.shape.question.safeParse(question).success).toBe(true);
  });

  it("validates create and write input contracts including title text and assignment sets", () => {
    const create = { id: "7d6b91a8-6e23-4da9-b383-476bc40e1e37", title: " Draft ", mutationId: "b2b32c85-1c67-4881-bc71-620611af4df0" };
    expect(examCreateRequestSchema.safeParse(create).success).toBe(true);
    for (const title of ["  ", "bad\u0000title", "bad\ud800"]) {
      expect(examCreateRequestSchema.safeParse({ ...create, title }).success).toBe(false);
    }
    const assignmentWrite = {
      op: "updateAssignments",
      mutationId: create.mutationId,
      addClassroomIds: [create.id],
      removeClassroomIds: [create.id],
    };
    expect(teacherExamWriteRequestSchema.safeParse(assignmentWrite).success).toBe(false);
    expect(teacherExamWriteRequestSchema.safeParse({ op: "publish", mutationId: create.mutationId, extra: true }).success).toBe(false);
  });
});
