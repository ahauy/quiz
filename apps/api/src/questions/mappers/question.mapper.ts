import type { CreateQuestionDto, QuestionDto } from "@quiz/shared";
import { normalize } from "../normalize.js";
import type {
  ChapterRecord,
  QuestionRecord,
  QuestionWriteInput,
  QuestionWriteWithCatalog,
  SubjectRecord,
} from "../ports.js";

// Write boundary: the client expresses choice answers as indexes into `options`;
// persistence stores per-option `isCorrect` flags. Catalog labels are carried in
// the write input so the in-memory fake can build a read record without a join.
type QuestionChildren = Pick<
  QuestionWriteInput,
  "type" | "trueFalseAnswer" | "options" | "fillAnswers" | "pairs"
>;

// One place owns the index-based write body -> per-type child rows mapping.
function childrenOf(dto: CreateQuestionDto): QuestionChildren {
  switch (dto.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE": {
      const correct = new Set(dto.correctOptionIndexes);
      return {
        type: dto.type,
        trueFalseAnswer: null,
        options: dto.options.map((text, position) => ({
          text,
          isCorrect: correct.has(position),
          position,
        })),
        fillAnswers: [],
        pairs: [],
      };
    }
    case "TRUE_FALSE":
      return {
        type: dto.type,
        trueFalseAnswer: dto.correctAnswer,
        options: [],
        fillAnswers: [],
        pairs: [],
      };
    case "FILL_BLANK":
      return {
        type: dto.type,
        trueFalseAnswer: null,
        options: [],
        fillAnswers: dto.acceptedAnswers.map((text, position) => ({
          text,
          normalized: normalize(text),
          position,
        })),
        pairs: [],
      };
    case "MATCHING":
      return {
        type: dto.type,
        trueFalseAnswer: null,
        options: [],
        fillAnswers: [],
        pairs: dto.pairs.map((pair, position) => ({
          leftText: pair.leftText,
          leftNormalized: normalize(pair.leftText),
          rightText: pair.rightText,
          rightNormalized: normalize(pair.rightText),
          position,
        })),
      };
  }
}

export function toWriteInput(
  teacherId: string,
  dto: CreateQuestionDto,
  subject: SubjectRecord,
  chapter: ChapterRecord,
): QuestionWriteInput {
  return {
    teacherId,
    content: dto.content,
    difficulty: dto.difficulty,
    explanation: dto.explanation,
    subjectId: subject.id,
    subjectName: subject.name,
    chapterId: chapter.id,
    chapterName: chapter.name,
    ...childrenOf(dto),
  };
}

// Pre-catalog write shape: the adapter resolves the subject/chapter inside the
// same transaction that writes the question and its children (BR-QB-012).
export function toCatalogWriteInput(
  teacherId: string,
  dto: CreateQuestionDto,
): QuestionWriteWithCatalog {
  return {
    teacherId,
    content: dto.content,
    difficulty: dto.difficulty,
    explanation: dto.explanation,
    subjectName: dto.subjectName,
    subjectKey: normalize(dto.subjectName),
    chapterName: dto.chapterName,
    chapterKey: normalize(dto.chapterName),
    ...childrenOf(dto),
  };
}

// Read boundary: child ids are now known, ISO dates are wire strings, and the
// per-type answer fields are projected from the stored children.
export function toQuestionDto(record: QuestionRecord): QuestionDto {
  const base = {
    id: record.id,
    teacherId: record.teacherId,
    content: record.content,
    difficulty: record.difficulty,
    explanation: record.explanation,
    subjectId: record.subjectId,
    subjectName: record.subjectName,
    chapterId: record.chapterId,
    chapterName: record.chapterName,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };

  switch (record.type) {
    case "SINGLE_CHOICE": {
      const correct = record.options.find((option) => option.isCorrect);
      if (correct === undefined) {
        throw new Error(`Corrupt question ${record.id}: no correct option`);
      }
      return {
        ...base,
        type: "SINGLE_CHOICE",
        options: record.options.map((option) => ({ id: option.id, text: option.text })),
        correctOptionId: correct.id,
      };
    }
    case "MULTIPLE_CHOICE":
      return {
        ...base,
        type: "MULTIPLE_CHOICE",
        options: record.options.map((option) => ({ id: option.id, text: option.text })),
        correctOptionIds: record.options
          .filter((option) => option.isCorrect)
          .map((option) => option.id),
      };
    case "TRUE_FALSE": {
      if (record.trueFalseAnswer === null) {
        throw new Error(`Corrupt question ${record.id}: missing trueFalseAnswer`);
      }
      return { ...base, type: "TRUE_FALSE", correctAnswer: record.trueFalseAnswer };
    }
    case "FILL_BLANK":
      return {
        ...base,
        type: "FILL_BLANK",
        acceptedAnswers: record.fillAnswers.map((answer) => answer.text),
      };
    case "MATCHING":
      return {
        ...base,
        type: "MATCHING",
        pairs: record.pairs.map((pair) => ({
          id: pair.id,
          leftText: pair.leftText,
          rightText: pair.rightText,
        })),
      };
  }
}
