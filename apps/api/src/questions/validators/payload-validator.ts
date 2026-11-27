import type {
  CreateQuestionDto,
  Difficulty,
  QuestionType,
} from "@quiz/shared";
import { questionError } from "../errors.js";
import { normalize } from "../normalize.js";

// Local runtime mirrors of the shared enums. @quiz/shared ships TS source, so
// boundary code avoids runtime imports from it (same pattern as dto/index.ts).
const DIFFICULTIES: readonly Difficulty[] = ["EASY", "MEDIUM", "HARD"];

const MAX = { short: 500, long: 5000, name: 100 } as const;

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Raw shape of a write body as seen at the HTTP boundary (all type fields optional). */
export interface PayloadInput {
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  explanation: string;
  subjectName: string;
  chapterName: string;
  options?: string[];
  correctOptionIndexes?: number[];
  correctAnswer?: boolean;
  acceptedAnswers?: string[];
  pairs?: readonly { leftText: string; rightText: string }[];
}

const TYPE_FIELDS: Record<QuestionType, readonly string[]> = {
  SINGLE_CHOICE: ["options", "correctOptionIndexes"],
  MULTIPLE_CHOICE: ["options", "correctOptionIndexes"],
  TRUE_FALSE: ["correctAnswer"],
  FILL_BLANK: ["acceptedAnswers"],
  MATCHING: ["pairs"],
};

/** Validate a write payload and narrow it to the discriminated union. */
export function validatePayload(input: PayloadInput): CreateQuestionDto {
  const issues: ValidationIssue[] = [...checkCommon(input)];
  const foreign = foreignFields(input);
  for (const field of foreign) {
    issues.push({ field, message: `${field} does not belong to type ${input.type}` });
  }

  let dto: CreateQuestionDto | null = null;
  switch (input.type) {
    case "SINGLE_CHOICE": {
      const [options, indexes] = checkChoices(input, issues, 1);
      if (options !== null && indexes !== null) {
        dto = {
          type: "SINGLE_CHOICE", ...common(input), options, correctOptionIndexes: indexes,
        };
      }
      break;
    }
    case "MULTIPLE_CHOICE": {
      const [options, indexes] = checkChoices(input, issues, 2);
      if (options !== null && indexes !== null) {
        dto = {
          type: "MULTIPLE_CHOICE", ...common(input), options, correctOptionIndexes: indexes,
        };
      }
      break;
    }
    case "TRUE_FALSE": {
      if (typeof input.correctAnswer !== "boolean") {
        issues.push({ field: "correctAnswer", message: "correctAnswer must be a boolean" });
      } else {
        dto = { type: "TRUE_FALSE", ...common(input), correctAnswer: input.correctAnswer };
      }
      break;
    }
    case "FILL_BLANK": {
      checkBlankToken(input.content, issues);
      const answers = checkAnswers(input, issues);
      if (answers !== null) dto = { type: "FILL_BLANK", ...common(input), acceptedAnswers: answers };
      break;
    }
    case "MATCHING": {
      const pairs = checkPairs(input, issues);
      if (pairs !== null) dto = { type: "MATCHING", ...common(input), pairs };
      break;
    }
    default:
      issues.push({ field: "type", message: "Unsupported question type" });
  }

  if (issues.length > 0 || dto === null) {
    throw questionError("VALIDATION_ERROR", "Invalid question payload", issues);
  }
  return dto;
}

/** BR-QB-013: a question's chapter must belong to its subject. */
export function validateCatalogLink(
  subjectId: string,
  chapterSubjectId: string,
): void {
  if (chapterSubjectId === subjectId) return;
  throw questionError("VALIDATION_ERROR", "Invalid question payload", [
    { field: "chapterId", message: "Chapter does not belong to the subject" },
  ]);
}

function common(input: PayloadInput) {
  return {
    content: input.content,
    difficulty: input.difficulty,
    explanation: input.explanation,
    subjectName: input.subjectName,
    chapterName: input.chapterName,
  };
}

function checkCommon(input: PayloadInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...checkText("content", input.content, MAX.long));
  issues.push(...checkText("explanation", input.explanation, MAX.long));
  issues.push(...checkText("subjectName", input.subjectName, MAX.name));
  issues.push(...checkText("chapterName", input.chapterName, MAX.name));
  if (!DIFFICULTIES.includes(input.difficulty)) {
    issues.push({ field: "difficulty", message: "difficulty must be EASY, MEDIUM or HARD" });
  }
  return issues;
}

function checkText(field: string, value: string, max: number): ValidationIssue[] {
  if (typeof value !== "string") return [{ field, message: `${field} is required` }];
  const count = [...value.trim()].length;
  if (count === 0) return [{ field, message: `${field} must not be blank` }];
  if (count > max) return [{ field, message: `${field} must be at most ${max} characters` }];
  return [];
}

function checkChoices(
  input: PayloadInput,
  issues: ValidationIssue[],
  minCorrect: number,
): [string[] | null, number[] | null] {
  const options = checkUniqueTexts("options", input.options, issues, 2, 10);
  const indexes = input.correctOptionIndexes;
  let validIndexes: number[] | null = null;
  if (!isNumberArray(indexes)) {
    issues.push({ field: "correctOptionIndexes", message: "correctOptionIndexes must be an array of integers" });
  } else {
    const distinct = new Set(indexes).size;
    if (indexes.length < minCorrect || (minCorrect === 1 && indexes.length !== 1) || distinct !== indexes.length) {
      issues.push({
        field: "correctOptionIndexes",
        message: minCorrect === 1 ? "Exactly one correct option is required" : "At least two distinct correct options are required",
      });
    } else if (options !== null && indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= options.length)) {
      issues.push({ field: "correctOptionIndexes", message: "correctOptionIndexes are out of range" });
    } else {
      validIndexes = indexes;
    }
  }
  return [options, validIndexes];
}

function checkAnswers(input: PayloadInput, issues: ValidationIssue[]): string[] | null {
  return checkUniqueTexts("acceptedAnswers", input.acceptedAnswers, issues, 1, 10);
}

function checkPairs(
  input: PayloadInput,
  issues: ValidationIssue[],
): { leftText: string; rightText: string }[] | null {
  const pairs = input.pairs;
  if (!isPairArray(pairs)) {
    issues.push({ field: "pairs", message: "pairs must be an array of left/right text pairs" });
    return null;
  }
  if (pairs.length < 2 || pairs.length > 10) {
    issues.push({ field: "pairs", message: "pairs must contain between 2 and 10 entries" });
  }
  const lefts = pairs.map((pair) => normalize(pair.leftText));
  const rights = pairs.map((pair) => normalize(pair.rightText));
  for (const [field, values] of [["pairs.leftText", lefts], ["pairs.rightText", rights]] as const) {
    if (new Set(values).size !== values.length) {
      issues.push({ field, message: `${field} values must be unique after normalization` });
    }
  }
  for (const pair of pairs) {
    issues.push(...checkText("pairs.leftText", pair.leftText, MAX.short));
    issues.push(...checkText("pairs.rightText", pair.rightText, MAX.short));
  }
  return pairs;
}

function checkBlankToken(content: string, issues: ValidationIssue[]): void {
  const count = content.split("{{blank}}").length - 1;
  if (count !== 1) {
    issues.push({ field: "content", message: "content must contain exactly one {{blank}}" });
  }
}

function checkUniqueTexts(
  field: string,
  value: string[] | undefined,
  issues: ValidationIssue[],
  min: number,
  max: number,
): string[] | null {
  if (!isStringArray(value)) {
    issues.push({ field, message: `${field} must be an array of strings` });
    return null;
  }
  if (value.length < min || value.length > max) {
    issues.push({ field, message: `${field} must contain between ${min} and ${max} entries` });
  }
  if (new Set(value.map(normalize)).size !== value.length) {
    issues.push({ field, message: `${field} entries must be unique after normalization` });
  }
  for (const entry of value) issues.push(...checkText(field, entry, MAX.short));
  return value;
}

function foreignFields(input: PayloadInput): string[] {
  const allowed = new Set<string>(TYPE_FIELDS[input.type]);
  const candidates: readonly string[] = [
    "options", "correctOptionIndexes", "correctAnswer", "acceptedAnswers", "pairs",
  ];
  return candidates.filter(
    (field) => !allowed.has(field) && present(input[field as keyof PayloadInput]),
  );
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isPairArray(
  value: unknown,
): value is { leftText: string; rightText: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { leftText?: unknown }).leftText === "string" &&
        typeof (item as { rightText?: unknown }).rightText === "string",
    )
  );
}
