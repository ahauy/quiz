import type {
  Difficulty,
  EnrollmentStatus,
  ExamStatus,
  QuestionType,
  Role,
} from "../enums/index.js";

// ── Question bank: read DTOs (id-based) ────────────────────────────────────
// C-05: read metadata (owner, labels, ISO timestamps) so the table/editor need
// no second lookup. `createdAt`/`updatedAt` are ISO-8601 strings on the wire.
export interface QuestionBaseDto {
  id: string;
  teacherId: string; // owner; never accepted from the client
  type: QuestionType;
  content: string; // C-01
  difficulty: Difficulty;
  explanation: string; // C-03 (required)
  subjectId: string;
  subjectName: string; // C-05
  chapterId: string; // C-02 (required)
  chapterName: string; // C-05
  createdAt: string; // C-05
  updatedAt: string; // C-05
}

export interface ChoiceOptionDto {
  id: string;
  text: string;
}

export interface MatchingPairDto {
  id: string; // C-04
  leftText: string; // C-04
  rightText: string; // C-04
}

export interface SingleChoiceQuestionDto extends QuestionBaseDto {
  type: typeof QuestionType.SINGLE_CHOICE;
  options: readonly ChoiceOptionDto[];
  correctOptionId: string;
}

export interface MultipleChoiceQuestionDto extends QuestionBaseDto {
  type: typeof QuestionType.MULTIPLE_CHOICE;
  options: readonly ChoiceOptionDto[];
  correctOptionIds: readonly string[];
}

export interface TrueFalseQuestionDto extends QuestionBaseDto {
  type: typeof QuestionType.TRUE_FALSE;
  correctAnswer: boolean;
}

export interface FillBlankQuestionDto extends QuestionBaseDto {
  type: typeof QuestionType.FILL_BLANK;
  acceptedAnswers: readonly string[];
}

export interface MatchingQuestionDto extends QuestionBaseDto {
  type: typeof QuestionType.MATCHING;
  pairs: readonly MatchingPairDto[];
}

export type QuestionDto =
  | SingleChoiceQuestionDto
  | MultipleChoiceQuestionDto
  | TrueFalseQuestionDto
  | FillBlankQuestionDto
  | MatchingQuestionDto;

export interface ChapterDto {
  id: string;
  name: string;
  subjectId: string;
}

export interface SubjectDto {
  id: string;
  name: string;
  chapters: ChapterDto[];
}

export interface QuestionListDto {
  items: QuestionDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AssetUploadResultDto {
  url: string; // relative: /uploads/<uuid>.<ext>
  mimeType: string; // e.g. image/png
  size: number; // bytes
}

// ── Question bank: write DTOs (index-based, create AND full replace) ────────
// A client cannot know option ids before creation, so choice answers are
// expressed as indexes into `options`. There is deliberately no student-facing
// DTO: adding one would leak answers (BR-QB-017).
export interface QuestionWriteBase {
  content: string; // 1..5000 chars after trim
  difficulty: Difficulty;
  explanation: string; // 1..5000 chars after trim
  subjectName: string; // 1..100 chars after trim
  chapterName: string; // 1..100 chars after trim
}

export interface SingleChoiceWrite extends QuestionWriteBase {
  type: typeof QuestionType.SINGLE_CHOICE;
  options: string[]; // 2..10, unique after normalization
  correctOptionIndexes: number[]; // exactly 1, in range
}

export interface MultipleChoiceWrite extends QuestionWriteBase {
  type: typeof QuestionType.MULTIPLE_CHOICE;
  options: string[]; // 2..10, unique after normalization
  correctOptionIndexes: number[]; // >= 2, distinct, in range
}

export interface TrueFalseWrite extends QuestionWriteBase {
  type: typeof QuestionType.TRUE_FALSE;
  correctAnswer: boolean;
}

export interface FillBlankWrite extends QuestionWriteBase {
  type: typeof QuestionType.FILL_BLANK; // content has exactly one {{blank}}
  acceptedAnswers: string[]; // 1..10, unique after normalization
}

export interface MatchingWrite extends QuestionWriteBase {
  type: typeof QuestionType.MATCHING;
  pairs: { leftText: string; rightText: string }[]; // 2..10, left/right unique
}

export type CreateQuestionDto =
  | SingleChoiceWrite
  | MultipleChoiceWrite
  | TrueFalseWrite
  | FillBlankWrite
  | MatchingWrite;

export type UpdateQuestionDto = CreateQuestionDto; // full replacement (BR-QB-020)

export interface QuestionListQueryDto {
  subjectId?: string;
  chapterId?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  q?: string; // 1..200 chars
  page?: number; // >= 1, default 1
  pageSize?: number; // 1..50, default 20
}

// ── Auth / classroom DTOs (unchanged) ──────────────────────────────────────
export interface RegisterDto {
  email: string;
  password: string;
  displayName: string;
  teacherCode?: string;
  requestedRole?: Role;
}

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export interface AuthResultDto {
  accessToken: string;
  user: UserDto;
}

export interface AuthUrlDto {
  url: string;
}

export interface ForgotPasswordResultDto {
  message: string;
  resetUrl?: string;
}

export interface OkDto {
  ok: true;
}

export interface ClassroomDto {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  createdAt: string;
}

export interface EnrollmentDto {
  id: string;
  classroomId: string;
  userId: string;
  displayName: string;
  email: string;
  status: EnrollmentStatus;
  createdAt: string;
  approvedAt?: string;
}

export interface CreateClassroomDto {
  name: string;
}

export interface JoinClassroomDto {
  code: string;
}

// Exam authoring and student read contracts. These remain type-only exports.
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TeacherExamListItem {
  id: string;
  title: string;
  state: ExamStatus;
  questionCount: string;
  opensAt: string | null;
  closesAt: string | null;
}

export interface TeacherExamDetail extends TeacherExamListItem {
  durationMinutes: string | null;
  maxAttempts: string | null;
  allowAnswerReview: boolean | null;
  passwordRequired: boolean;
  earlyClosedAt: string | null;
  everPublished: boolean;
  lastMutationId: string;
}

export interface ExamSnapshotQuestionBase {
  content: string;
  difficulty: Difficulty;
  explanation: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
}

export type ExamSnapshotQuestion =
  | (ExamSnapshotQuestionBase & {
      type: "SINGLE_CHOICE";
      options: readonly ChoiceOptionDto[];
      correctOptionId: string;
    })
  | (ExamSnapshotQuestionBase & {
      type: "MULTIPLE_CHOICE";
      options: readonly ChoiceOptionDto[];
      correctOptionIds: readonly string[];
    })
  | (ExamSnapshotQuestionBase & {
      type: "TRUE_FALSE";
      correctAnswer: boolean;
    })
  | (ExamSnapshotQuestionBase & {
      type: "FILL_BLANK";
      acceptedAnswers: readonly string[];
    })
  | (ExamSnapshotQuestionBase & {
      type: "MATCHING";
      pairs: readonly MatchingPairDto[];
    });

export interface ExamQuestionSnapshot {
  id: string;
  sourceQuestionId: string;
  capturedAt: string;
  question: ExamSnapshotQuestion;
}

export interface ExamAssignment {
  classroomId: string;
  name: string;
}

interface ExamActionBase {
  id: string;
  at: string;
  actorId: string;
}

export type ExamAction =
  | (ExamActionBase & {
      type: "PUBLISHED";
      classroomIds: string[];
      opensAt: string;
      closesAt: string;
    })
  | (ExamActionBase & {
      type: "WITHDRAWN";
      publicationEventId: string;
    })
  | (ExamActionBase & {
      type: "ASSIGNMENTS_UPDATED";
      addedClassroomIds: string[];
      removedClassroomIds: string[];
    });

export interface StudentExamMetadata {
  title: string;
  teacherName: string;
  questionCount: string;
  durationMinutes: string;
  opensAt: string;
  closesAt: string;
  state: Exclude<ExamStatus, "DRAFT">;
  maxAttempts: string;
  passwordRequired: boolean;
  allowAnswerReview: boolean;
  qualifyingClassroomNames: string[];
}

export interface StudentExamListItem {
  detailPath: string;
  metadata: StudentExamMetadata;
}

export interface ExamCreateRequest {
  id: string;
  title: string;
  mutationId: string;
}

export interface ExamListQuery {
  state?: ExamStatus;
  cursor?: string;
  pageSize?: number;
}

export interface StudentExamListQuery extends Omit<ExamListQuery, "state"> {
  state?: Exclude<ExamStatus, "DRAFT">;
}

export type ExamPasswordInstruction =
  | { mode: "set"; value: string }
  | { mode: "disable" };

export interface ExamSaveSettings {
  title?: string;
  durationMinutes?: string | null;
  maxAttempts?: string | null;
  allowAnswerReview?: boolean | null;
  opensAt?: string | null;
  closesAt?: string | null;
  password?: ExamPasswordInstruction;
}

interface ExamMutationBase {
  mutationId: string;
}

export type TeacherExamWriteRequest =
  | (ExamMutationBase & { op: "saveSettings"; settings: ExamSaveSettings })
  | (ExamMutationBase & { op: "addQuestion"; sourceQuestionId: string })
  | (ExamMutationBase & { op: "removeQuestion"; snapshotId: string })
  | (ExamMutationBase & {
      op: "moveQuestion";
      snapshotId: string;
      beforeSnapshotId: string | null;
    })
  | (ExamMutationBase & { op: "refreshQuestion"; snapshotId: string })
  | (ExamMutationBase & {
      op: "updateAssignments";
      addClassroomIds: string[];
      removeClassroomIds: string[];
    })
  | (ExamMutationBase & { op: "publish" })
  | (ExamMutationBase & { op: "withdraw" })
  | (ExamMutationBase & { op: "closeEarly" });
