import { describe, expect, it } from "vitest";
import { QuestionException } from "../errors.js";
import {
  validateCatalogLink,
  validatePayload,
} from "./payload-validator.js";
import type { PayloadInput, ValidationIssue } from "./payload-validator.js";

// Boundary bodies are plain JSON; casting keeps the "invalid shape" cases
// honest without weakening the validator's typed signature.
function check(input: Record<string, unknown>): unknown {
  return validatePayload(input as unknown as PayloadInput);
}

function issues(input: Record<string, unknown>): ValidationIssue[] {
  let captured: unknown;
  try {
    check(input);
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(QuestionException);
  const error = captured as QuestionException;
  expect(error.getStatus()).toBe(422);
  expect(error.code).toBe("VALIDATION_ERROR");
  return (error.getResponse() as { details: ValidationIssue[] }).details;
}

function fields(details: ValidationIssue[]): string[] {
  return details.map((issue) => issue.field);
}

const base = {
  content: "What is 2+2?",
  difficulty: "EASY",
  explanation: "Because addition.",
  subjectName: "Math",
  chapterName: "Arithmetic",
};

const single = {
  ...base,
  type: "SINGLE_CHOICE",
  options: ["3", "4", "5"],
  correctOptionIndexes: [1],
};

describe("validatePayload — valid payloads for all five types", () => {
  it("accepts a valid SINGLE_CHOICE", () => {
    expect(check(single)).toMatchObject({ type: "SINGLE_CHOICE", correctOptionIndexes: [1] });
  });

  it("accepts a valid MULTIPLE_CHOICE", () => {
    expect(
      check({ ...base, type: "MULTIPLE_CHOICE", options: ["a", "b", "c"], correctOptionIndexes: [0, 2] }),
    ).toMatchObject({ type: "MULTIPLE_CHOICE", correctOptionIndexes: [0, 2] });
  });

  it("accepts a valid TRUE_FALSE (including false)", () => {
    expect(check({ ...base, type: "TRUE_FALSE", correctAnswer: false })).toMatchObject({
      type: "TRUE_FALSE",
      correctAnswer: false,
    });
  });

  it("accepts a valid FILL_BLANK with exactly one {{blank}}", () => {
    expect(
      check({
        ...base,
        content: "The capital is {{blank}}.",
        type: "FILL_BLANK",
        acceptedAnswers: ["Hanoi", "Ha Noi"],
      }),
    ).toMatchObject({ type: "FILL_BLANK" });
  });

  it("accepts a valid MATCHING", () => {
    expect(
      check({
        ...base,
        type: "MATCHING",
        pairs: [
          { leftText: "A", rightText: "1" },
          { leftText: "B", rightText: "2" },
        ],
      }),
    ).toMatchObject({ type: "MATCHING" });
  });
});

describe("validatePayload — common fields (BR-QB-010, BR-QB-011, BR-QB-014)", () => {
  it("rejects blank content", () => {
    expect(fields(issues({ ...single, content: "   " }))).toContain("content");
  });

  it("rejects content longer than 5000 characters", () => {
    expect(fields(issues({ ...single, content: "a".repeat(5001) }))).toContain("content");
  });

  it("accepts content of exactly 5000 characters", () => {
    expect(check({ ...single, content: "a".repeat(5000) })).toBeTruthy();
  });

  it("rejects an empty/whitespace explanation", () => {
    expect(fields(issues({ ...single, explanation: "   " }))).toContain("explanation");
  });

  it("rejects an explanation longer than 5000 characters", () => {
    expect(fields(issues({ ...single, explanation: "x".repeat(5001) }))).toContain("explanation");
  });

  it("accepts an explanation of exactly 5000 characters", () => {
    expect(check({ ...single, explanation: "x".repeat(5000) })).toBeTruthy();
  });

  it("rejects a non-string explanation", () => {
    expect(fields(issues({ ...single, explanation: 42 }))).toContain("explanation");
  });

  it("rejects a subjectName longer than 100 characters", () => {
    expect(fields(issues({ ...single, subjectName: "s".repeat(101) }))).toContain("subjectName");
  });

  it("rejects a blank chapterName", () => {
    expect(fields(issues({ ...single, chapterName: " " }))).toContain("chapterName");
  });

  it("rejects a difficulty outside the closed set", () => {
    expect(fields(issues({ ...single, difficulty: "IMPOSSIBLE" }))).toContain("difficulty");
  });

  it("rejects a missing difficulty", () => {
    expect(fields(issues({ ...single, difficulty: undefined }))).toContain("difficulty");
  });

  it("rejects an unsupported type discriminator", () => {
    expect(fields(issues({ ...single, type: "NOT_A_TYPE" }))).toContain("type");
  });
});

describe("validatePayload — SINGLE_CHOICE (BR-QB-005)", () => {
  it("rejects fewer than two options", () => {
    expect(fields(issues({ ...single, options: ["only"] }))).toContain("options");
  });

  it("rejects more than ten options", () => {
    const options = Array.from({ length: 11 }, (_, i) => `o${i}`);
    expect(fields(issues({ ...single, options }))).toContain("options");
  });

  it("rejects normalization-equivalent duplicate options", () => {
    expect(fields(issues({ ...single, options: ["A", "  a  "] }))).toContain("options");
  });

  it("rejects non-string options", () => {
    expect(fields(issues({ ...single, options: ["A", 7] }))).toContain("options");
  });

  it("rejects two correct indexes (exactly one required)", () => {
    expect(fields(issues({ ...single, correctOptionIndexes: [0, 1] }))).toContain("correctOptionIndexes");
  });

  it("rejects zero correct indexes", () => {
    expect(fields(issues({ ...single, correctOptionIndexes: [] }))).toContain("correctOptionIndexes");
  });

  it("rejects duplicate correct indexes", () => {
    expect(fields(issues({ ...single, correctOptionIndexes: [0, 0] }))).toContain("correctOptionIndexes");
  });

  it("rejects an out-of-range correct index", () => {
    expect(fields(issues({ ...single, correctOptionIndexes: [9] }))).toContain("correctOptionIndexes");
  });

  it("rejects a non-integer correct index", () => {
    expect(fields(issues({ ...single, correctOptionIndexes: [0.5] }))).toContain("correctOptionIndexes");
  });

  it("rejects a non-number correct index array", () => {
    expect(fields(issues({ ...single, correctOptionIndexes: ["0"] }))).toContain("correctOptionIndexes");
  });

  it("rejects a foreign field belonging to another type", () => {
    expect(fields(issues({ ...single, correctAnswer: true }))).toContain("correctAnswer");
  });
});

describe("validatePayload — MULTIPLE_CHOICE (BR-QB-006)", () => {
  const multiple = {
    ...base,
    type: "MULTIPLE_CHOICE",
    options: ["a", "b", "c"],
    correctOptionIndexes: [0, 1],
  };

  it("accepts at least two distinct correct indexes", () => {
    expect(check(multiple)).toMatchObject({ type: "MULTIPLE_CHOICE" });
  });

  it("rejects a single correct index", () => {
    expect(fields(issues({ ...multiple, correctOptionIndexes: [0] }))).toContain("correctOptionIndexes");
  });

  it("rejects duplicate correct indexes", () => {
    expect(fields(issues({ ...multiple, correctOptionIndexes: [1, 1] }))).toContain("correctOptionIndexes");
  });
});

describe("validatePayload — TRUE_FALSE (BR-QB-007)", () => {
  it("rejects a missing boolean answer", () => {
    expect(fields(issues({ ...base, type: "TRUE_FALSE" }))).toContain("correctAnswer");
  });

  it("rejects a non-boolean answer", () => {
    expect(fields(issues({ ...base, type: "TRUE_FALSE", correctAnswer: "true" }))).toContain("correctAnswer");
  });

  it("rejects a foreign options field", () => {
    expect(
      fields(issues({ ...base, type: "TRUE_FALSE", correctAnswer: true, options: ["x", "y"] })),
    ).toContain("options");
  });
});

describe("validatePayload — FILL_BLANK (BR-QB-008)", () => {
  const fill = {
    ...base,
    content: "The capital is {{blank}}.",
    type: "FILL_BLANK",
    acceptedAnswers: ["Hanoi", "Ha Noi"],
  };

  it("rejects content without a {{blank}} token", () => {
    expect(fields(issues({ ...fill, content: "No token here" }))).toContain("content");
  });

  it("rejects content with two {{blank}} tokens", () => {
    expect(fields(issues({ ...fill, content: "{{blank}} and {{blank}}" }))).toContain("content");
  });

  it("rejects an empty acceptedAnswers array", () => {
    expect(fields(issues({ ...fill, acceptedAnswers: [] }))).toContain("acceptedAnswers");
  });

  it("rejects normalization-equivalent duplicate accepted answers", () => {
    expect(
      fields(issues({ ...fill, acceptedAnswers: ["  GIÁ TRỊ ", "giá trị"] })),
    ).toContain("acceptedAnswers");
  });

  it("rejects a foreign options field", () => {
    expect(fields(issues({ ...fill, options: ["x"] }))).toContain("options");
  });
});

describe("validatePayload — MATCHING (BR-QB-009)", () => {
  const matching = {
    ...base,
    type: "MATCHING",
    pairs: [
      { leftText: "A", rightText: "1" },
      { leftText: "B", rightText: "2" },
    ],
  };

  it("rejects a single pair", () => {
    expect(fields(issues({ ...matching, pairs: [{ leftText: "A", rightText: "1" }] }))).toContain("pairs");
  });

  it("rejects duplicate left texts after normalization", () => {
    expect(
      fields(issues({ ...matching, pairs: [{ leftText: "A", rightText: "1" }, { leftText: "  a ", rightText: "2" }] })),
    ).toContain("pairs.leftText");
  });

  it("rejects duplicate right texts after normalization", () => {
    expect(
      fields(issues({ ...matching, pairs: [{ leftText: "A", rightText: "X" }, { leftText: "B", rightText: " x " }] })),
    ).toContain("pairs.rightText");
  });

  it("rejects a malformed pair missing rightText", () => {
    expect(fields(issues({ ...matching, pairs: [{ leftText: "A" }, { leftText: "B" }] }))).toContain("pairs");
  });

  it("rejects a foreign acceptedAnswers field", () => {
    expect(fields(issues({ ...matching, acceptedAnswers: ["x"] }))).toContain("acceptedAnswers");
  });
});

describe("validateCatalogLink (BR-QB-013)", () => {
  it("accepts a chapter whose subject matches", () => {
    expect(() => validateCatalogLink("subject-1", "subject-1")).not.toThrow();
  });

  it("rejects a chapter scoped to a different subject with 422", () => {
    let captured: unknown;
    try {
      validateCatalogLink("subject-1", "subject-2");
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(QuestionException);
    const error = captured as QuestionException;
    expect(error.getStatus()).toBe(422);
    expect(fields((error.getResponse() as { details: ValidationIssue[] }).details)).toContain("chapterId");
  });
});
