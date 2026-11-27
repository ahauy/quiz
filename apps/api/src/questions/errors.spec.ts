import { describe, expect, it } from "vitest";
import { QUESTION_ERROR_STATUS, QuestionException, questionError } from "./errors.js";

describe("questionError", () => {
  it("maps question codes to the documented HTTP statuses", () => {
    expect(QUESTION_ERROR_STATUS.QUESTION_NOT_FOUND).toBe(404);
    expect(QUESTION_ERROR_STATUS.FORBIDDEN).toBe(403);
    expect(QUESTION_ERROR_STATUS.VALIDATION_ERROR).toBe(422);
    expect(QUESTION_ERROR_STATUS.FILE_TOO_LARGE).toBe(413);
    expect(QUESTION_ERROR_STATUS.UNSUPPORTED_MEDIA_TYPE).toBe(415);
  });

  it("produces a QuestionException with the standard error envelope", () => {
    const error = questionError("QUESTION_NOT_FOUND", "Question not found");
    expect(error).toBeInstanceOf(QuestionException);
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe("QUESTION_NOT_FOUND");
    expect(error.getResponse()).toEqual({ code: "QUESTION_NOT_FOUND", message: "Question not found" });
  });

  it("carries field-level details on validation errors", () => {
    const details = { content: "must not be empty" };
    const error = questionError("VALIDATION_ERROR", "Invalid payload", details);
    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toEqual({
      code: "VALIDATION_ERROR",
      message: "Invalid payload",
      details,
    });
  });

  it("builds the 413 and 415 asset errors", () => {
    expect(questionError("FILE_TOO_LARGE", "File too large").getStatus()).toBe(413);
    expect(
      questionError("UNSUPPORTED_MEDIA_TYPE", "Not an image").getStatus(),
    ).toBe(415);
  });
});
