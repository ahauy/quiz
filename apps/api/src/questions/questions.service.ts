import { Injectable } from "@nestjs/common";
import type {
  Difficulty,
  OkDto,
  QuestionDto,
  QuestionListDto,
  QuestionType,
  SubjectDto,
} from "@quiz/shared";
import { questionError } from "./errors.js";
import {
  toCatalogWriteInput,
  toQuestionDto,
} from "./mappers/question.mapper.js";
// Value imports matter here: emitDecoratorMetadata needs both port classes at
// runtime for Nest to inject them into this constructor.
import { CatalogRepository, QuestionRepository } from "./ports.js";
import type { QuestionListFilter, QuestionRecord } from "./ports.js";
import type { CurrentUser, ListQuery } from "./questions.types.js";
import { validatePayload } from "./validators/payload-validator.js";
import type { PayloadInput } from "./validators/payload-validator.js";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 200;
const DIFFICULTIES: readonly string[] = ["EASY", "MEDIUM", "HARD"];
const QUESTION_TYPES: readonly string[] = [
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "FILL_BLANK",
  "MATCHING",
];

@Injectable()
export class QuestionsService {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly catalog: CatalogRepository,
  ) {}

  async create(user: CurrentUser, body: PayloadInput): Promise<QuestionDto> {
    const dto = validatePayload(body);
    const record = await this.questions.createAtomic(
      toCatalogWriteInput(user.id, dto),
      this.catalog,
    );
    return toQuestionDto(record);
  }

  async list(user: CurrentUser, query: ListQuery): Promise<QuestionListDto> {
    const filter = this.buildFilter(user.id, query);
    const [records, total] = await Promise.all([
      this.questions.findMany(filter),
      this.questions.count(filter),
    ]);
    return {
      items: records.map(toQuestionDto),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filter.pageSize),
    };
  }

  async get(user: CurrentUser, id: string): Promise<QuestionDto> {
    return toQuestionDto(await this.requireOwned(user.id, id));
  }

  async replace(user: CurrentUser, id: string, body: PayloadInput): Promise<QuestionDto> {
    await this.requireOwned(user.id, id);
    const dto = validatePayload(body);
    const record = await this.questions.replaceAtomic(
      user.id,
      id,
      toCatalogWriteInput(user.id, dto),
      this.catalog,
    );
    return toQuestionDto(record);
  }

  async remove(user: CurrentUser, id: string): Promise<OkDto> {
    await this.requireOwned(user.id, id);
    await this.questions.delete(user.id, id);
    return { ok: true };
  }

  async listSubjects(user: CurrentUser): Promise<SubjectDto[]> {
    const subjects = await this.catalog.listSubjects(user.id);
    return subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      chapters: subject.chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        subjectId: chapter.subjectId,
      })),
    }));
  }

  // An unscoped existence probe distinguishes an unknown id (404) from a row
  // owned by another teacher (403) without leaking its content (BR-QB-001).
  private async requireOwned(teacherId: string, id: string): Promise<QuestionRecord> {
    const record = await this.questions.findById(teacherId, id);
    if (record !== null) return record;
    if (await this.questions.existsById(id)) {
      throw questionError("FORBIDDEN", "Question belongs to another teacher");
    }
    throw questionError("QUESTION_NOT_FOUND", "Question not found");
  }

  // BR-QB-018: AND-combined owner-scoped filters, validated here so 422 holds
  // even when the global validation pipe is bypassed. `page`/`pageSize` arrive
  // as querystrings and are coerced explicitly.
  private buildFilter(teacherId: string, query: ListQuery): QuestionListFilter {
    const filter: QuestionListFilter = {
      teacherId,
      page: this.intParam("page", query.page, DEFAULT_PAGE, 1, Number.MAX_SAFE_INTEGER),
      pageSize: this.intParam("pageSize", query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    };
    if (query.subjectId !== undefined && query.subjectId !== "") filter.subjectId = query.subjectId;
    if (query.chapterId !== undefined && query.chapterId !== "") filter.chapterId = query.chapterId;
    if (query.difficulty !== undefined) {
      if (!DIFFICULTIES.includes(query.difficulty)) {
        throw this.queryError("difficulty", "difficulty must be EASY, MEDIUM or HARD");
      }
      filter.difficulty = query.difficulty as Difficulty;
    }
    if (query.type !== undefined) {
      if (!QUESTION_TYPES.includes(query.type)) {
        throw this.queryError("type", "type is not a valid question type");
      }
      filter.type = query.type as QuestionType;
    }
    if (query.q !== undefined && query.q !== "") {
      if ([...query.q].length > MAX_QUERY_LENGTH) {
        throw this.queryError("q", `q must be at most ${MAX_QUERY_LENGTH} characters`);
      }
      filter.q = query.q;
    }
    return filter;
  }

  private intParam(
    field: string,
    raw: number | string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (raw === undefined || raw === "") return fallback;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw this.queryError(field, `${field} must be an integer between ${min} and ${max}`);
    }
    return value;
  }

  private queryError(field: string, message: string) {
    return questionError("VALIDATION_ERROR", "Invalid list query", [{ field, message }]);
  }
}
