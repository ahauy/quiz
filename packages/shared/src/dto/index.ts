import type { Difficulty, QuestionType, Role } from "../enums/index.js";

export interface BaseQuestionDto {
  id: string;
  subjectId: string;
  chapterId?: string;
  difficulty: Difficulty;
  explanation?: string;
}

export interface ChoiceOptionDto {
  id: string;
  text: string;
}

export interface SingleChoiceQuestionDto extends BaseQuestionDto {
  type: typeof QuestionType.SINGLE_CHOICE;
  options: readonly ChoiceOptionDto[];
  correctOptionId: string;
}

export interface MultipleChoiceQuestionDto extends BaseQuestionDto {
  type: typeof QuestionType.MULTIPLE_CHOICE;
  options: readonly ChoiceOptionDto[];
  correctOptionIds: readonly string[];
}

export interface TrueFalseQuestionDto extends BaseQuestionDto {
  type: typeof QuestionType.TRUE_FALSE;
  correctAnswer: boolean;
}

export interface FillBlankQuestionDto extends BaseQuestionDto {
  type: typeof QuestionType.FILL_BLANK;
  acceptedAnswers: readonly string[];
}

export interface MatchingPairDto {
  leftId: string;
  rightId: string;
}

export interface MatchingQuestionDto extends BaseQuestionDto {
  type: typeof QuestionType.MATCHING;
  pairs: readonly MatchingPairDto[];
}

export type QuestionDto =
  | SingleChoiceQuestionDto
  | MultipleChoiceQuestionDto
  | TrueFalseQuestionDto
  | FillBlankQuestionDto
  | MatchingQuestionDto;

export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
  teacherCode?: string;
  requestedRole?: Role;
}
