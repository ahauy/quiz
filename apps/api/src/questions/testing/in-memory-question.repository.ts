import { randomUUID } from "node:crypto";
import type {
  QuestionListFilter,
  QuestionRecord,
  QuestionWriteInput,
  QuestionWriteWithCatalog,
} from "../ports.js";
import { CatalogRepository, QuestionRepository } from "../ports.js";

function clone(record: QuestionRecord): QuestionRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
    options: record.options.map((o) => ({ ...o })),
    fillAnswers: record.fillAnswers.map((a) => ({ ...a })),
    pairs: record.pairs.map((p) => ({ ...p })),
  };
}

export class InMemoryQuestionRepository extends QuestionRepository {
  private readonly questions = new Map<string, QuestionRecord>();

  // ── Test helpers ─────────────────────────────────────────────────────────
  size(): number {
    return this.questions.size;
  }

  clear(): void {
    this.questions.clear();
  }

  private matches(record: QuestionRecord, filter: QuestionListFilter): boolean {
    if (record.teacherId !== filter.teacherId) return false;
    if (filter.subjectId !== undefined && record.subjectId !== filter.subjectId) return false;
    if (filter.chapterId !== undefined && record.chapterId !== filter.chapterId) return false;
    if (filter.difficulty !== undefined && record.difficulty !== filter.difficulty) return false;
    if (filter.type !== undefined && record.type !== filter.type) return false;
    if (filter.q !== undefined) {
      const needle = filter.q.toLowerCase();
      const inContent = record.content.toLowerCase().includes(needle);
      const inExplanation = record.explanation.toLowerCase().includes(needle);
      if (!inContent && !inExplanation) return false;
    }
    return true;
  }

  private sorted(filter: QuestionListFilter): QuestionRecord[] {
    return [...this.questions.values()]
      .filter((record) => this.matches(record, filter))
      .sort((a, b) => {
        const byDate = b.updatedAt.getTime() - a.updatedAt.getTime();
        return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
      });
  }

  override async findMany(filter: QuestionListFilter): Promise<QuestionRecord[]> {
    const start = (filter.page - 1) * filter.pageSize;
    return this.sorted(filter)
      .slice(start, start + filter.pageSize)
      .map(clone);
  }

  override async count(filter: QuestionListFilter): Promise<number> {
    return this.sorted(filter).length;
  }

  override async findById(teacherId: string, id: string): Promise<QuestionRecord | null> {
    const record = this.questions.get(id);
    if (record === undefined || record.teacherId !== teacherId) return null;
    return clone(record);
  }

  override async existsById(id: string): Promise<boolean> {
    return this.questions.has(id);
  }

  override async create(input: QuestionWriteInput): Promise<QuestionRecord> {
    const now = new Date();
    const record = this.buildRecord(input, randomUUID(), now, now);
    this.questions.set(record.id, record);
    return clone(record);
  }

  override async replace(
    teacherId: string,
    id: string,
    input: QuestionWriteInput,
  ): Promise<QuestionRecord> {
    const existing = this.questions.get(id);
    if (existing === undefined || existing.teacherId !== teacherId) {
      throw new Error(`Question ${id} not found for teacher ${teacherId}`);
    }
    // Full replacement: fresh child ids, same question id, preserved createdAt.
    const record = this.buildRecord(input, id, existing.createdAt, new Date());
    this.questions.set(id, record);
    return clone(record);
  }

  override async delete(teacherId: string, id: string): Promise<void> {
    const existing = this.questions.get(id);
    if (existing === undefined || existing.teacherId !== teacherId) {
      throw new Error(`Question ${id} not found for teacher ${teacherId}`);
    }
    // Children are embedded in the record, so removing it cascades them (as the
    // schema's ON DELETE CASCADE does for the real question table).
    this.questions.delete(id);
  }

  override async createAtomic(
    input: QuestionWriteWithCatalog,
    catalog: CatalogRepository,
  ): Promise<QuestionRecord> {
    return this.create(await this.resolve(input, catalog));
  }

  override async replaceAtomic(
    teacherId: string,
    id: string,
    input: QuestionWriteWithCatalog,
    catalog: CatalogRepository,
  ): Promise<QuestionRecord> {
    return this.replace(teacherId, id, await this.resolve(input, catalog));
  }

  // Mirrors the Prisma adapter's transactional resolve. A P2002 loser re-reads
  // the winner so the catalog race test stays meaningful without a database.
  private async resolve(
    input: QuestionWriteWithCatalog,
    catalog: CatalogRepository,
  ): Promise<QuestionWriteInput> {
    const subject = await this.withReread(() =>
      catalog.resolveOrCreateSubject(input.teacherId, input.subjectName, input.subjectKey),
    );
    const chapter = await this.withReread(() =>
      catalog.resolveOrCreateChapter(
        input.teacherId,
        subject.id,
        input.chapterName,
        input.chapterKey,
      ),
    );
    return {
      teacherId: input.teacherId,
      type: input.type,
      content: input.content,
      difficulty: input.difficulty,
      explanation: input.explanation,
      trueFalseAnswer: input.trueFalseAnswer,
      options: input.options,
      fillAnswers: input.fillAnswers,
      pairs: input.pairs,
      subjectId: subject.id,
      subjectName: subject.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
    };
  }

  private async withReread<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isPrismaUnique(error)) throw error;
      return await operation();
    }
  }

  private buildRecord(
    input: QuestionWriteInput,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): QuestionRecord {
    return {
      id,
      teacherId: input.teacherId,
      type: input.type,
      content: input.content,
      difficulty: input.difficulty,
      explanation: input.explanation,
      subjectId: input.subjectId,
      subjectName: input.subjectName,
      chapterId: input.chapterId,
      chapterName: input.chapterName,
      trueFalseAnswer: input.trueFalseAnswer,
      options: input.options.map((o) => ({
        id: randomUUID(),
        text: o.text,
        isCorrect: o.isCorrect,
        position: o.position,
      })),
      fillAnswers: input.fillAnswers.map((a) => ({
        id: randomUUID(),
        text: a.text,
        normalized: a.normalized,
        position: a.position,
      })),
      pairs: input.pairs.map((p) => ({
        id: randomUUID(),
        leftText: p.leftText,
        leftNormalized: p.leftNormalized,
        rightText: p.rightText,
        rightNormalized: p.rightNormalized,
        position: p.position,
      })),
      createdAt,
      updatedAt,
    };
  }
}

function isPrismaUnique(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return (error as { code?: unknown }).code === "P2002";
}
