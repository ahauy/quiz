import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  FillBlankDto,
  MatchingDto,
  MultipleChoiceDto,
  QuestionListQueryDto,
  SingleChoiceDto,
  TrueFalseDto,
} from "./index.js";

const options = { whitelist: true, forbidNonWhitelisted: true } as const;

function errorsFor<T extends object>(
  Ctor: new () => T,
  data: Record<string, unknown>,
): Promise<import("class-validator").ValidationError[]> {
  return validate(plainToInstance(Ctor, data), options);
}

const base = {
  content: "What is 2+2?",
  difficulty: "EASY",
  explanation: "Because addition.",
  subjectName: "Math",
  chapterName: "Arithmetic",
};

describe("question write DTO validation", () => {
  it("accepts one valid body for each of the five types", async () => {
    const cases: [new () => object, Record<string, unknown>][] = [
      [SingleChoiceDto, { ...base, type: "SINGLE_CHOICE", options: ["3", "4", "5"], correctOptionIndexes: [1] }],
      [MultipleChoiceDto, { ...base, type: "MULTIPLE_CHOICE", options: ["a", "b", "c"], correctOptionIndexes: [0, 2] }],
      [TrueFalseDto, { ...base, type: "TRUE_FALSE", correctAnswer: false }],
      [FillBlankDto, { ...base, type: "FILL_BLANK", acceptedAnswers: ["4", "four"] }],
      [MatchingDto, { ...base, type: "MATCHING", pairs: [{ leftText: "a", rightText: "1" }, { leftText: "b", rightText: "2" }] }],
    ];
    for (const [Ctor, data] of cases) {
      expect(await errorsFor(Ctor, data)).toHaveLength(0);
    }
  });

  it("rejects a single choice without exactly one correct index", async () => {
    const errors = await errorsFor(SingleChoiceDto, {
      ...base,
      type: "SINGLE_CHOICE",
      options: ["a", "b"],
      correctOptionIndexes: [0, 1],
    });
    expect(errors.some((e) => e.property === "correctOptionIndexes")).toBe(true);
  });

  it("rejects fewer than two options", async () => {
    const errors = await errorsFor(SingleChoiceDto, {
      ...base,
      type: "SINGLE_CHOICE",
      options: ["only one"],
      correctOptionIndexes: [0],
    });
    expect(errors.some((e) => e.property === "options")).toBe(true);
  });

  it("requires the stem, explanation and difficulty", async () => {
    const errors = await errorsFor(SingleChoiceDto, {
      type: "SINGLE_CHOICE",
      options: ["a", "b"],
      correctOptionIndexes: [0],
      subjectName: "Math",
      chapterName: "Algebra",
    });
    const props = errors.map((e) => e.property);
    expect(props).toContain("content");
    expect(props).toContain("explanation");
    expect(props).toContain("difficulty");
  });

  it("forbids fields that do not belong to the declared type (BR-QB-004)", async () => {
    const errors = await errorsFor(TrueFalseDto, {
      ...base,
      type: "TRUE_FALSE",
      correctAnswer: true,
      options: ["should not be here"],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a wrong type discriminator", async () => {
    const errors = await errorsFor(SingleChoiceDto, {
      ...base,
      type: "MATCHING",
      options: ["a", "b"],
      correctOptionIndexes: [0],
    });
    expect(errors.some((e) => e.property === "type")).toBe(true);
  });

  it("validates nested matching pairs", async () => {
    const errors = await errorsFor(MatchingDto, {
      ...base,
      type: "MATCHING",
      pairs: [{ leftText: "a", rightText: "1" }, { leftText: "b" }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("QuestionListQueryDto validation", () => {
  it("allows an empty query (all fields optional)", async () => {
    expect(await errorsFor(QuestionListQueryDto, {})).toHaveLength(0);
  });

  it("coerces numeric query strings", async () => {
    const instance = plainToInstance(QuestionListQueryDto, { page: "2", pageSize: "10" });
    expect(await validate(instance, options)).toHaveLength(0);
    expect(instance.page).toBe(2);
    expect(instance.pageSize).toBe(10);
  });

  it("rejects pageSize above 50 and page below 1", async () => {
    const big = await errorsFor(QuestionListQueryDto, { pageSize: "51" });
    expect(big.some((e) => e.property === "pageSize")).toBe(true);
    const small = await errorsFor(QuestionListQueryDto, { page: "0" });
    expect(small.some((e) => e.property === "page")).toBe(true);
  });

  it("rejects an unknown type", async () => {
    const errors = await errorsFor(QuestionListQueryDto, { type: "NOT_A_TYPE" });
    expect(errors.some((e) => e.property === "type")).toBe(true);
  });
});
