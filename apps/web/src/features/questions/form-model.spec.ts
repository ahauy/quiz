import { describe, expect, it } from "vitest";
import { Difficulty, QuestionType } from "@quiz/shared";
import {
  changeFormType,
  emptyFormValue,
  formValueFromQuestion,
  normalizeAnswer,
  toWriteDto,
  updateBaseFields,
  validateFormValue,
  type QuestionFormValue,
} from "./form-model.js";
import type { QuestionDtoWire } from "./schemas.js";

const base = {
  content: "Câu hỏi?",
  difficulty: Difficulty.EASY,
  explanation: "Vì thế",
  subjectName: "Toán",
  chapterName: "Chương 1",
};

const single: QuestionFormValue = {
  ...base,
  type: QuestionType.SINGLE_CHOICE,
  options: ["A", "B"],
  correctOptionIndexes: [0],
};

describe("validateFormValue — client mirrors of BR-QB-005…014", () => {
  it("accepts a valid single-choice question", () => {
    expect(validateFormValue(single)).toEqual({});
  });

  it("requires non-empty content and explanation", () => {
    expect(validateFormValue({ ...single, content: "   " }).content).toBeDefined();
    expect(validateFormValue({ ...single, explanation: "   " }).explanation).toBeDefined();
    expect(validateFormValue({ ...single, content: "x".repeat(5001) }).content).toBeDefined();
  });

  it("rejects two correct answers on single choice", () => {
    const value: QuestionFormValue = { ...single, correctOptionIndexes: [0, 1] };
    expect(validateFormValue(value).correctOptionIndexes).toBeDefined();
  });

  it("rejects options that collide after normalization", () => {
    const value: QuestionFormValue = { ...single, options: ["  A  ", "a"] };
    expect(validateFormValue(value).options).toBeDefined();
  });

  it("requires at least two correct answers on multiple choice", () => {
    const value: QuestionFormValue = {
      ...base,
      type: QuestionType.MULTIPLE_CHOICE,
      options: ["A", "B"],
      correctOptionIndexes: [0],
    };
    expect(validateFormValue(value).correctOptionIndexes).toBeDefined();
  });

  it("requires exactly one {{blank}} token in the stem", () => {
    const value: QuestionFormValue = {
      ...base,
      type: QuestionType.FILL_BLANK,
      acceptedAnswers: ["đáp án"],
    };
    expect(validateFormValue(value).content).toBeDefined();
    expect(
      validateFormValue({ ...value, content: "Điền {{blank}} đây" }),
    ).toEqual({});
  });

  it("rejects fill-blank answers that are duplicates after normalization", () => {
    const value: QuestionFormValue = {
      ...base,
      content: "Điền {{blank}} đây",
      type: QuestionType.FILL_BLANK,
      acceptedAnswers: ["  GIÁ   TRỊ ", "giá trị"],
    };
    expect(validateFormValue(value).acceptedAnswers).toBeDefined();
  });

  it("rejects duplicate matching sides", () => {
    const value: QuestionFormValue = {
      ...base,
      type: QuestionType.MATCHING,
      pairs: [
        { leftText: "A", rightText: "1" },
        { leftText: "A", rightText: "2" },
      ],
    };
    expect(validateFormValue(value).pairs).toBeDefined();
    expect(
      validateFormValue({
        ...value,
        pairs: [
          { leftText: "A", rightText: "1" },
          { leftText: "B", rightText: "2" },
        ],
      }),
    ).toEqual({});
  });
});

describe("changeFormType — no stale type-specific answers survive", () => {
  it("keeps shared fields and discards choice answers", () => {
    const next = changeFormType(single, QuestionType.MATCHING);
    expect(next.type).toBe(QuestionType.MATCHING);
    expect(next.content).toBe(single.content);
    expect(next.explanation).toBe(single.explanation);
    if (next.type === QuestionType.MATCHING) {
      expect(next.pairs).toEqual([
        { leftText: "", rightText: "" },
        { leftText: "", rightText: "" },
      ]);
      expect("options" in next).toBe(false);
    }
  });

  it("is a no-op when the type is unchanged", () => {
    expect(changeFormType(single, QuestionType.SINGLE_CHOICE)).toBe(single);
  });
});

describe("updateBaseFields / toWriteDto / normalizeAnswer", () => {
  it("overrides only base fields on any union member", () => {
    const next = updateBaseFields(single, { content: "Nội dung mới" });
    expect(next.content).toBe("Nội dung mới");
    expect(next.type).toBe(QuestionType.SINGLE_CHOICE);
    if (next.type === QuestionType.SINGLE_CHOICE) expect(next.options).toEqual(["A", "B"]);
  });

  it("maps to the index-based write DTO with no read-only metadata", () => {
    const dto = toWriteDto(single);
    expect(dto).toEqual({
      ...base,
      type: QuestionType.SINGLE_CHOICE,
      options: ["A", "B"],
      correctOptionIndexes: [0],
    });
  });

  it("normalizes NFC, trim, whitespace collapse and lowercase", () => {
    expect(normalizeAnswer("  GIÁ   TRỊ  ")).toBe("giá trị");
  });

  it("seeds a usable empty value for each of the five types", () => {
    for (const type of Object.values(QuestionType)) {
      expect(emptyFormValue(type).type).toBe(type);
    }
  });
});

describe("formValueFromQuestion — id-based wire to index-based editor state", () => {
  it("maps correctOptionId back to its index and keeps the explanation", () => {
    const question: QuestionDtoWire = {
      id: "q-1",
      teacherId: "t-1",
      ...base,
      subjectId: "s-1",
      chapterId: "c-1",
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
      type: QuestionType.SINGLE_CHOICE,
      options: [
        { id: "o-1", text: "A" },
        { id: "o-2", text: "B" },
      ],
      correctOptionId: "o-2",
    };
    const value = formValueFromQuestion(question);
    expect(value.type).toBe(QuestionType.SINGLE_CHOICE);
    expect(value.explanation).toBe("Vì thế");
    if (value.type === QuestionType.SINGLE_CHOICE) {
      expect(value.options).toEqual(["A", "B"]);
      expect(value.correctOptionIndexes).toEqual([1]);
    }
  });
});
