import { Difficulty, QuestionType, type CreateQuestionDto } from "@quiz/shared";
import type { QuestionDtoWire } from "./schemas.js";

// Local editor state. The wire uses option/pair ids, but a client cannot know ids
// before saving, so the editor works with index-based answers (CreateQuestionDto shape).

export interface QuestionFormBase {
  content: string;
  difficulty: Difficulty;
  explanation: string;
  subjectName: string;
  chapterName: string;
}

export interface SingleChoiceFormValue extends QuestionFormBase {
  type: typeof QuestionType.SINGLE_CHOICE;
  options: string[];
  correctOptionIndexes: number[];
}

export interface MultipleChoiceFormValue extends QuestionFormBase {
  type: typeof QuestionType.MULTIPLE_CHOICE;
  options: string[];
  correctOptionIndexes: number[];
}

export interface TrueFalseFormValue extends QuestionFormBase {
  type: typeof QuestionType.TRUE_FALSE;
  correctAnswer: boolean;
}

export interface FillBlankFormValue extends QuestionFormBase {
  type: typeof QuestionType.FILL_BLANK;
  acceptedAnswers: string[];
}

export interface MatchingPairFormValue {
  leftText: string;
  rightText: string;
}

export interface MatchingFormValue extends QuestionFormBase {
  type: typeof QuestionType.MATCHING;
  pairs: MatchingPairFormValue[];
}

export type QuestionFormValue =
  | SingleChoiceFormValue
  | MultipleChoiceFormValue
  | TrueFalseFormValue
  | FillBlankFormValue
  | MatchingFormValue;

// Shared contract for the five type bodies (T024). onChange accepts the union so
// each body can hand back its own narrowed value without a cast.
export interface FormBodyProps<T extends QuestionFormValue> {
  value: T;
  onChange: (next: QuestionFormValue) => void;
  errors: Readonly<Record<string, string>>;
}

// Overrides only base fields on any union member; keeps the discriminant and
// type-specific answers intact (no partial merge, BR-QB-020).
export function updateBaseFields(
  value: QuestionFormValue,
  patch: Partial<QuestionFormBase>,
): QuestionFormValue {
  switch (value.type) {
    case QuestionType.SINGLE_CHOICE:
      return { ...value, ...patch };
    case QuestionType.MULTIPLE_CHOICE:
      return { ...value, ...patch };
    case QuestionType.TRUE_FALSE:
      return { ...value, ...patch };
    case QuestionType.FILL_BLANK:
      return { ...value, ...patch };
    case QuestionType.MATCHING:
      return { ...value, ...patch };
  }
}

export const questionTypeLabels: Record<QuestionType, string> = {
  [QuestionType.SINGLE_CHOICE]: "Một đáp án",
  [QuestionType.MULTIPLE_CHOICE]: "Nhiều đáp án",
  [QuestionType.TRUE_FALSE]: "Đúng / Sai",
  [QuestionType.FILL_BLANK]: "Điền từ",
  [QuestionType.MATCHING]: "Ghép cặp",
};

export const difficultyLabels: Record<Difficulty, string> = {
  [Difficulty.EASY]: "Dễ",
  [Difficulty.MEDIUM]: "Trung bình",
  [Difficulty.HARD]: "Khó",
};

const emptyBase: QuestionFormBase = {
  content: "",
  difficulty: Difficulty.EASY,
  explanation: "",
  subjectName: "",
  chapterName: "",
};

export function emptyFormValue(type: QuestionType): QuestionFormValue {
  const base: QuestionFormBase = { ...emptyBase };
  switch (type) {
    case QuestionType.SINGLE_CHOICE:
      return { ...base, type, options: ["", ""], correctOptionIndexes: [] };
    case QuestionType.MULTIPLE_CHOICE:
      return { ...base, type, options: ["", ""], correctOptionIndexes: [] };
    case QuestionType.TRUE_FALSE:
      return { ...base, type, correctAnswer: true };
    case QuestionType.FILL_BLANK:
      return { ...base, type, acceptedAnswers: [""] };
    case QuestionType.MATCHING:
      return {
        ...base,
        type,
        pairs: [
          { leftText: "", rightText: "" },
          { leftText: "", rightText: "" },
        ],
      };
  }
}

export function baseFields(value: QuestionFormValue): QuestionFormBase {
  return {
    content: value.content,
    difficulty: value.difficulty,
    explanation: value.explanation,
    subjectName: value.subjectName,
    chapterName: value.chapterName,
  };
}

// A type change keeps the shared fields but discards type-specific answers so
// stale indexes/pairs can never be submitted against the new type (T025).
export function changeFormType(current: QuestionFormValue, nextType: QuestionType): QuestionFormValue {
  if (current.type === nextType) return current;
  const base = baseFields(current);
  switch (nextType) {
    case QuestionType.SINGLE_CHOICE:
      return { ...base, type: nextType, options: ["", ""], correctOptionIndexes: [] };
    case QuestionType.MULTIPLE_CHOICE:
      return { ...base, type: nextType, options: ["", ""], correctOptionIndexes: [] };
    case QuestionType.TRUE_FALSE:
      return { ...base, type: nextType, correctAnswer: true };
    case QuestionType.FILL_BLANK:
      return { ...base, type: nextType, acceptedAnswers: [""] };
    case QuestionType.MATCHING:
      return {
        ...base,
        type: nextType,
        pairs: [
          { leftText: "", rightText: "" },
          { leftText: "", rightText: "" },
        ],
      };
  }
}

export function formValueFromQuestion(question: QuestionDtoWire): QuestionFormValue {
  const base: QuestionFormBase = {
    content: question.content,
    difficulty: question.difficulty,
    explanation: question.explanation,
    subjectName: question.subjectName,
    chapterName: question.chapterName,
  };
  switch (question.type) {
    case QuestionType.SINGLE_CHOICE: {
      const index = question.options.findIndex((option) => option.id === question.correctOptionId);
      return {
        ...base,
        type: question.type,
        options: question.options.map((option) => option.text),
        correctOptionIndexes: index >= 0 ? [index] : [],
      };
    }
    case QuestionType.MULTIPLE_CHOICE: {
      const indexes = question.options
        .map((option, index) => (question.correctOptionIds.includes(option.id) ? index : -1))
        .filter((index) => index >= 0);
      return {
        ...base,
        type: question.type,
        options: question.options.map((option) => option.text),
        correctOptionIndexes: indexes,
      };
    }
    case QuestionType.TRUE_FALSE:
      return { ...base, type: question.type, correctAnswer: question.correctAnswer };
    case QuestionType.FILL_BLANK:
      return { ...base, type: question.type, acceptedAnswers: [...question.acceptedAnswers] };
    case QuestionType.MATCHING:
      return {
        ...base,
        type: question.type,
        pairs: question.pairs.map((pair) => ({
          leftText: pair.leftText,
          rightText: pair.rightText,
        })),
      };
  }
}

export function toWriteDto(value: QuestionFormValue): CreateQuestionDto {
  const base = baseFields(value);
  switch (value.type) {
    case QuestionType.SINGLE_CHOICE:
      return { ...base, type: value.type, options: value.options, correctOptionIndexes: value.correctOptionIndexes };
    case QuestionType.MULTIPLE_CHOICE:
      return { ...base, type: value.type, options: value.options, correctOptionIndexes: value.correctOptionIndexes };
    case QuestionType.TRUE_FALSE:
      return { ...base, type: value.type, correctAnswer: value.correctAnswer };
    case QuestionType.FILL_BLANK:
      return { ...base, type: value.type, acceptedAnswers: value.acceptedAnswers };
    case QuestionType.MATCHING:
      return {
        ...base,
        type: value.type,
        pairs: value.pairs.map((pair) => ({ leftText: pair.leftText, rightText: pair.rightText })),
      };
  }
}

// Mirrors ASM-QB-003 / BR-QB-019 for client-side duplicate detection.
export function normalizeAnswer(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

function hasDuplicates(values: string[]): boolean {
  const normalized = values.map(normalizeAnswer);
  return normalized.some((value, index) => normalized.indexOf(value) !== index);
}

// Client-side mirrors of the server rules so field-level errors render before a
// round trip. The server remains authoritative (BR-QB-005…BR-QB-014).
export function validateFormValue(value: QuestionFormValue): Record<string, string> {
  const errors: Record<string, string> = {};
  if (value.content.trim().length === 0) errors.content = "Nội dung câu hỏi là bắt buộc";
  else if (value.content.trim().length > 5000) errors.content = "Nội dung không vượt quá 5 000 ký tự";
  if (value.explanation.trim().length === 0) errors.explanation = "Lời giải là bắt buộc";
  else if (value.explanation.trim().length > 5000) errors.explanation = "Lời giải không vượt quá 5 000 ký tự";
  if (value.subjectName.trim().length === 0) errors.subjectName = "Môn học là bắt buộc";
  if (value.chapterName.trim().length === 0) errors.chapterName = "Chương là bắt buộc";

  switch (value.type) {
    case QuestionType.SINGLE_CHOICE:
    case QuestionType.MULTIPLE_CHOICE: {
      const filled = value.options.filter((option) => option.trim().length > 0);
      if (filled.length < 2 || value.options.length < 2) errors.options = "Cần ít nhất 2 phương án";
      else if (value.options.length > 10) errors.options = "Tối đa 10 phương án";
      else if (hasDuplicates(filled)) errors.options = "Các phương án không được trùng nhau";
      const indexes = value.correctOptionIndexes;
      if (value.type === QuestionType.SINGLE_CHOICE && indexes.length !== 1) {
        errors.correctOptionIndexes = "Chọn đúng 1 đáp án";
      }
      if (value.type === QuestionType.MULTIPLE_CHOICE && indexes.length < 2) {
        errors.correctOptionIndexes = "Chọn ít nhất 2 đáp án";
      }
      if (indexes.some((index) => index < 0 || index >= value.options.length)) {
        errors.correctOptionIndexes = "Đáp án đúng không hợp lệ";
      }
      break;
    }
    case QuestionType.TRUE_FALSE:
      break;
    case QuestionType.FILL_BLANK: {
      const blanks = value.content.match(/\{\{blank\}\}/g) ?? [];
      if (blanks.length !== 1) errors.content = "Nội dung phải có đúng một {{blank}}";
      const filled = value.acceptedAnswers.filter((answer) => answer.trim().length > 0);
      if (filled.length === 0) errors.acceptedAnswers = "Cần ít nhất 1 đáp án";
      else if (filled.length > 10) errors.acceptedAnswers = "Tối đa 10 đáp án";
      else if (hasDuplicates(filled)) errors.acceptedAnswers = "Các đáp án không được trùng nhau";
      break;
    }
    case QuestionType.MATCHING: {
      if (value.pairs.length < 2) errors.pairs = "Cần ít nhất 2 cặp";
      else if (value.pairs.length > 10) errors.pairs = "Tối đa 10 cặp";
      else {
        const left = value.pairs.map((pair) => pair.leftText);
        const right = value.pairs.map((pair) => pair.rightText);
        if (left.some((text) => text.trim().length === 0) || right.some((text) => text.trim().length === 0)) {
          errors.pairs = "Vế trái và vế phải đều bắt buộc";
        } else if (hasDuplicates(left) || hasDuplicates(right)) {
          errors.pairs = "Các vế không được trùng nhau";
        }
      }
      break;
    }
  }
  return errors;
}
