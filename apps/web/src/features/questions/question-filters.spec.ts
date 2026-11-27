import { describe, expect, it } from "vitest";
import { Difficulty, QuestionType } from "@quiz/shared";
import { parseQuestionQuery } from "./question-filters.js";

function parse(query: string) {
  return parseQuestionQuery(new URLSearchParams(query));
}

describe("parseQuestionQuery — URL is the source of truth", () => {
  it("returns an empty query for an empty URL", () => {
    expect(parse("")).toEqual({});
  });

  it("parses every AND filter plus pagination", () => {
    expect(
      parse(
        "subjectId=s-1&chapterId=c-1&difficulty=HARD&type=MATCHING&q=toan&page=3&pageSize=10",
      ),
    ).toEqual({
      subjectId: "s-1",
      chapterId: "c-1",
      difficulty: Difficulty.HARD,
      type: QuestionType.MATCHING,
      q: "toan",
      page: 3,
      pageSize: 10,
    });
  });

  it("ignores invalid enums and out-of-contract values", () => {
    expect(parse("difficulty=NOPE&type=NOPE&page=0&page=-2&pageSize=51")).toEqual({});
  });

  it("accepts the pageSize boundary of 50", () => {
    expect(parse("pageSize=50").pageSize).toBe(50);
  });

  it("trims the search term and drops whitespace-only terms", () => {
    expect(parse("q=%20%20toan%20").q).toBe("toan");
    expect(parse("q=%20%20%20").q).toBeUndefined();
  });

  it("ignores unknown parameters", () => {
    expect(parse("unknown=x&pageSize=20")).toEqual({ pageSize: 20 });
  });
});
