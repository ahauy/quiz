import type { Difficulty, QuestionType } from "@quiz/shared";

// ── Persistence records (read shape, id-based) ──────────────────────────────
// A record carries the full question incl. children so the read mapper (Phase 3)
// can build any QuestionDto variant without a second lookup. Labels and ISO dates
// come from joined Subject/Chapter rows.
export interface QuestionOptionRecord {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
}

export interface FillBlankAnswerRecord {
  id: string;
  text: string;
  normalized: string;
  position: number;
}

export interface MatchingPairRecord {
  id: string;
  leftText: string;
  leftNormalized: string;
  rightText: string;
  rightNormalized: string;
  position: number;
}

export interface QuestionRecord {
  id: string;
  teacherId: string;
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  explanation: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  trueFalseAnswer: boolean | null;
  options: readonly QuestionOptionRecord[];
  fillAnswers: readonly FillBlankAnswerRecord[];
  pairs: readonly MatchingPairRecord[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Write shape (children without server-generated ids) ─────────────────────
export interface OptionWrite {
  text: string;
  isCorrect: boolean;
  position: number;
}

export interface FillAnswerWrite {
  text: string;
  normalized: string;
  position: number;
}

export interface PairWrite {
  leftText: string;
  leftNormalized: string;
  rightText: string;
  rightNormalized: string;
  position: number;
}

// Full replacement: create and replace both take the complete child set. The
// resolved catalog labels travel here so an in-memory fake can build a read
// record without a join; the Prisma adapter ignores them (it joins Subject/Chapter).
export interface QuestionWriteInput {
  teacherId: string;
  type: QuestionType;
  content: string;
  difficulty: Difficulty;
  explanation: string;
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
  trueFalseAnswer: boolean | null;
  options: readonly OptionWrite[];
  fillAnswers: readonly FillAnswerWrite[];
  pairs: readonly PairWrite[];
}

// Write shape before the catalog is resolved. Used by createAtomic/replaceAtomic
// so a subject, its chapter and the question children commit in ONE transaction.
export interface QuestionWriteWithCatalog
  extends Omit<
    QuestionWriteInput,
    "subjectId" | "subjectName" | "chapterId" | "chapterName"
  > {
  subjectName: string;
  subjectKey: string;
  chapterName: string;
  chapterKey: string;
}

// ── List / filter ───────────────────────────────────────────────────────────
// Optional filters use `?`; callers omit keys rather than assigning `undefined`
// (exactOptionalPropertyTypes). `q` is an ILIKE substring over content.
export interface QuestionListFilter {
  teacherId: string;
  subjectId?: string;
  chapterId?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  q?: string;
  page: number;
  pageSize: number;
}

// ── Catalog ─────────────────────────────────────────────────────────────────
export interface SubjectRecord {
  id: string;
  teacherId: string;
  name: string;
  nameKey: string;
}

export interface ChapterRecord {
  id: string;
  subjectId: string;
  name: string;
  nameKey: string;
}

export interface ChapterSummary {
  id: string;
  name: string;
  subjectId: string;
}

export interface SubjectWithChapters {
  id: string;
  name: string;
  chapters: readonly ChapterSummary[];
}

// ── Ports (deep-module seams) ───────────────────────────────────────────────
// Every query is owner-scoped: the adapters must carry `teacherId` into each
// Prisma `where`. Ports are implemented by a Prisma adapter (production) and an
// in-memory fake (unit tests).
export abstract class QuestionRepository {
  abstract findMany(filter: QuestionListFilter): Promise<QuestionRecord[]>;
  abstract count(filter: QuestionListFilter): Promise<number>;
  abstract findById(teacherId: string, id: string): Promise<QuestionRecord | null>;
  // Unscoped existence probe used only to distinguish "unknown" (404) from
  // "exists but belongs to another teacher" (403) without leaking its content.
  abstract existsById(id: string): Promise<boolean>;
  abstract create(input: QuestionWriteInput): Promise<QuestionRecord>;
  abstract replace(
    teacherId: string,
    id: string,
    input: QuestionWriteInput,
  ): Promise<QuestionRecord>;
  abstract delete(teacherId: string, id: string): Promise<void>;
  // `catalog` is used by the in-memory adapter; the Prisma adapter resolves the
  // catalog inside its own transaction and ignores this argument.
  abstract createAtomic(
    input: QuestionWriteWithCatalog,
    catalog: CatalogRepository,
  ): Promise<QuestionRecord>;
  abstract replaceAtomic(
    teacherId: string,
    id: string,
    input: QuestionWriteWithCatalog,
    catalog: CatalogRepository,
  ): Promise<QuestionRecord>;
}

export abstract class CatalogRepository {
  abstract listSubjects(teacherId: string): Promise<SubjectWithChapters[]>;
  abstract resolveOrCreateSubject(
    teacherId: string,
    name: string,
    nameKey: string,
  ): Promise<SubjectRecord>;
  abstract resolveOrCreateChapter(
    teacherId: string,
    subjectId: string,
    name: string,
    nameKey: string,
  ): Promise<ChapterRecord>;
}
