export const Role = {
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Difficulty = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const QuestionType = {
  SINGLE_CHOICE: "SINGLE_CHOICE",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  TRUE_FALSE: "TRUE_FALSE",
  FILL_BLANK: "FILL_BLANK",
  MATCHING: "MATCHING",
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const ExamStatus = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;
export type ExamStatus = (typeof ExamStatus)[keyof typeof ExamStatus];

export const ViolationType = {
  TAB_SWITCH: "TAB_SWITCH",
  FULLSCREEN_EXIT: "FULLSCREEN_EXIT",
  COPY: "COPY",
  PASTE: "PASTE",
  CONTEXT_MENU: "CONTEXT_MENU",
} as const;
export type ViolationType = (typeof ViolationType)[keyof typeof ViolationType];
