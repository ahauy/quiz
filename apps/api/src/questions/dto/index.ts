import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import type { Difficulty, QuestionType } from "@quiz/shared";

// Runtime mirrors of the shared enums. The API compiles to CommonJS and runs via
// `node dist/main.js`, which cannot load @quiz/shared's TypeScript source, so
// boundary validation needs local values (same pattern as auth ROLE). `satisfies`
// keeps them in lockstep with the shared enums so a divergence fails typecheck.
const QUESTION_TYPE = {
  SINGLE_CHOICE: "SINGLE_CHOICE",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  TRUE_FALSE: "TRUE_FALSE",
  FILL_BLANK: "FILL_BLANK",
  MATCHING: "MATCHING",
} as const satisfies Record<QuestionType, QuestionType>;

const DIFFICULTY = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
} as const satisfies Record<Difficulty, Difficulty>;

export class MatchingPairInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  leftText: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rightText: string;
}

// Common write fields shared by all five bodies (C-06 / §3).
export class QuestionWriteBaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @IsIn(Object.values(DIFFICULTY))
  difficulty: Difficulty;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  explanation: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subjectName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  chapterName: string;
}

export class SingleChoiceDto extends QuestionWriteBaseDto {
  @Equals(QUESTION_TYPE.SINGLE_CHOICE)
  type: typeof QUESTION_TYPE.SINGLE_CHOICE;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(500, { each: true })
  options: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1) // exactly one correct
  @IsInt({ each: true })
  correctOptionIndexes: number[];
}

export class MultipleChoiceDto extends QuestionWriteBaseDto {
  @Equals(QUESTION_TYPE.MULTIPLE_CHOICE)
  type: typeof QUESTION_TYPE.MULTIPLE_CHOICE;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(500, { each: true })
  options: string[];

  @IsArray()
  @ArrayMinSize(2) // >= 2 correct
  @IsInt({ each: true })
  correctOptionIndexes: number[];
}

export class TrueFalseDto extends QuestionWriteBaseDto {
  @Equals(QUESTION_TYPE.TRUE_FALSE)
  type: typeof QUESTION_TYPE.TRUE_FALSE;

  @IsBoolean()
  correctAnswer: boolean;
}

export class FillBlankDto extends QuestionWriteBaseDto {
  @Equals(QUESTION_TYPE.FILL_BLANK)
  type: typeof QUESTION_TYPE.FILL_BLANK;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  acceptedAnswers: string[];
}

export class MatchingDto extends QuestionWriteBaseDto {
  @Equals(QUESTION_TYPE.MATCHING)
  type: typeof QUESTION_TYPE.MATCHING;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MatchingPairInputDto)
  pairs: MatchingPairInputDto[];
}

export type QuestionWriteDto =
  | SingleChoiceDto
  | MultipleChoiceDto
  | TrueFalseDto
  | FillBlankDto
  | MatchingDto;

export class QuestionListQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  subjectId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  chapterId?: string;

  @IsOptional()
  @IsIn(Object.values(DIFFICULTY))
  difficulty?: Difficulty;

  @IsOptional()
  @IsIn(Object.values(QUESTION_TYPE))
  type?: QuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
