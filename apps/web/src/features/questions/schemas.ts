import { z } from "zod";
import { Difficulty, QuestionType } from "@quiz/shared";

// Runtime mirrors of the signed shared DTOs (contracts/00-shared-contracts.md).
// The shared package ships TS interfaces only, so responses are validated here.

export const difficultySchema = z.enum([
  Difficulty.EASY,
  Difficulty.MEDIUM,
  Difficulty.HARD,
]);

export const questionTypeSchema = z.enum([
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
  QuestionType.MATCHING,
]);

export const questionBaseSchema = z.object({
  id: z.string(),
  teacherId: z.string(),
  content: z.string(),
  difficulty: difficultySchema,
  explanation: z.string(),
  subjectId: z.string(),
  subjectName: z.string(),
  chapterId: z.string(),
  chapterName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const choiceOptionSchema = z.object({ id: z.string(), text: z.string() });
export const matchingPairSchema = z.object({
  id: z.string(),
  leftText: z.string(),
  rightText: z.string(),
});

export const singleChoiceQuestionVariantSchema = z.object({
  type: z.literal(QuestionType.SINGLE_CHOICE),
  options: z.array(choiceOptionSchema),
  correctOptionId: z.string(),
});
export const multipleChoiceQuestionVariantSchema = z.object({
  type: z.literal(QuestionType.MULTIPLE_CHOICE),
  options: z.array(choiceOptionSchema),
  correctOptionIds: z.array(z.string()),
});
export const trueFalseQuestionVariantSchema = z.object({
  type: z.literal(QuestionType.TRUE_FALSE),
  correctAnswer: z.boolean(),
});
export const fillBlankQuestionVariantSchema = z.object({
  type: z.literal(QuestionType.FILL_BLANK),
  acceptedAnswers: z.array(z.string()),
});
export const matchingQuestionVariantSchema = z.object({
  type: z.literal(QuestionType.MATCHING),
  pairs: z.array(matchingPairSchema),
});

export const questionDtoSchema = z.discriminatedUnion("type", [
  questionBaseSchema.merge(singleChoiceQuestionVariantSchema),
  questionBaseSchema.merge(multipleChoiceQuestionVariantSchema),
  questionBaseSchema.merge(trueFalseQuestionVariantSchema),
  questionBaseSchema.merge(fillBlankQuestionVariantSchema),
  questionBaseSchema.merge(matchingQuestionVariantSchema),
]);

export const questionListSchema = z.object({
  items: z.array(questionDtoSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

export const chapterSchema = z.object({
  id: z.string(),
  name: z.string(),
  subjectId: z.string(),
});

export const subjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  chapters: z.array(chapterSchema),
});

export const subjectListSchema = z.array(subjectSchema);

export const assetUploadSchema = z.object({
  url: z.string(),
  mimeType: z.string(),
  size: z.number(),
});

export type QuestionDtoWire = z.infer<typeof questionDtoSchema>;
export type QuestionListWire = z.infer<typeof questionListSchema>;
export type SubjectWire = z.infer<typeof subjectSchema>;
export type AssetUploadWire = z.infer<typeof assetUploadSchema>;
