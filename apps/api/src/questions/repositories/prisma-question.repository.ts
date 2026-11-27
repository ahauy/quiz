import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { questionError } from "../errors.js";
import type {
  QuestionListFilter,
  QuestionRecord,
  QuestionWriteInput,
  QuestionWriteWithCatalog,
} from "../ports.js";
import { CatalogRepository, QuestionRepository } from "../ports.js";

// `satisfies` keeps the literal type so GetPayload can infer the included
// relations; type-annotating it as QuestionInclude would erase that inference.
const QUESTION_INCLUDE = {
  subject: true,
  chapter: true,
  options: { orderBy: { position: "asc" } },
  fillAnswers: { orderBy: { position: "asc" } },
  pairs: { orderBy: { position: "asc" } },
} satisfies Prisma.QuestionInclude;

type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof QUESTION_INCLUDE }>;

@Injectable()
export class PrismaQuestionRepository extends QuestionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async findMany(filter: QuestionListFilter): Promise<QuestionRecord[]> {
    const rows = await this.prisma.question.findMany({
      where: this.whereFor(filter),
      include: QUESTION_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
    return rows.map((row) => this.toRecord(row));
  }

  override async count(filter: QuestionListFilter): Promise<number> {
    return this.prisma.question.count({ where: this.whereFor(filter) });
  }

  override async findById(teacherId: string, id: string): Promise<QuestionRecord | null> {
    const row = await this.prisma.question.findFirst({
      where: { id, teacherId },
      include: QUESTION_INCLUDE,
    });
    return row === null ? null : this.toRecord(row);
  }

  override async existsById(id: string): Promise<boolean> {
    const count = await this.prisma.question.count({ where: { id } });
    return count > 0;
  }

  override async create(input: QuestionWriteInput): Promise<QuestionRecord> {
    const row = await this.prisma.question.create({
      data: questionCreateData(input),
      include: QUESTION_INCLUDE,
    });
    return this.toRecord(row);
  }

  override async replace(
    teacherId: string,
    id: string,
    input: QuestionWriteInput,
  ): Promise<QuestionRecord> {
    // `where` carries teacherId (extendedWhereUnique) so a foreign owner can
    // never mutate the row. Full replacement = delete all children + recreate.
    const row = await this.prisma.question.update({
      where: { id, teacherId },
      data: questionReplaceData(input),
      include: QUESTION_INCLUDE,
    });
    return this.toRecord(row);
  }

  override async delete(teacherId: string, id: string): Promise<void> {
    // Hard delete; child rows cascade via the schema. teacherId scopes the owner.
    await this.prisma.question.delete({ where: { id, teacherId } });
  }

  // BR-QB-012: subject, chapter, question and children commit together. The
  // catalog argument belongs to the in-memory seam; here upserts run on the
  // transaction client so a failed child write rolls the catalog back too.
  override async createAtomic(
    input: QuestionWriteWithCatalog,
    _catalog: CatalogRepository,
  ): Promise<QuestionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const resolved = await this.resolveCatalogInTx(tx, input);
      const row = await tx.question.create({
        data: questionCreateData(withResolvedCatalog(input, resolved)),
        include: QUESTION_INCLUDE,
      });
      return this.toRecord(row);
    });
  }

  override async replaceAtomic(
    teacherId: string,
    id: string,
    input: QuestionWriteWithCatalog,
    _catalog: CatalogRepository,
  ): Promise<QuestionRecord> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.question.findFirst({
        where: { id },
        select: { teacherId: true },
      });
      if (existing === null) throw questionError("QUESTION_NOT_FOUND", "Question not found");
      if (existing.teacherId !== teacherId) {
        throw questionError("FORBIDDEN", "Question belongs to another teacher");
      }
      const resolved = await this.resolveCatalogInTx(tx, input);
      const row = await tx.question.update({
        where: { id, teacherId },
        data: questionReplaceData(withResolvedCatalog(input, resolved)),
        include: QUESTION_INCLUDE,
      });
      return this.toRecord(row);
    });
  }

  private async resolveCatalogInTx(
    tx: Prisma.TransactionClient,
    input: QuestionWriteWithCatalog,
  ): Promise<ResolvedCatalogIds> {
    const subject = await tx.subject.upsert({
      where: {
        teacherId_nameKey: { teacherId: input.teacherId, nameKey: input.subjectKey },
      },
      create: { teacherId: input.teacherId, name: input.subjectName, nameKey: input.subjectKey },
      update: {},
    });
    const chapter = await tx.chapter.upsert({
      where: {
        subjectId_nameKey: { subjectId: subject.id, nameKey: input.chapterKey },
      },
      create: { subjectId: subject.id, name: input.chapterName, nameKey: input.chapterKey },
      update: {},
    });
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      chapterId: chapter.id,
      chapterName: chapter.name,
    };
  }

  private whereFor(filter: QuestionListFilter): Prisma.QuestionWhereInput {
    const where: Prisma.QuestionWhereInput = { teacherId: filter.teacherId };
    if (filter.subjectId !== undefined) where.subjectId = filter.subjectId;
    if (filter.chapterId !== undefined) where.chapterId = filter.chapterId;
    if (filter.difficulty !== undefined) where.difficulty = filter.difficulty;
    if (filter.type !== undefined) where.type = filter.type;
    if (filter.q !== undefined) {
      // BR-QB-018 / contracts/questions-api.md: q is an accent-sensitive ILIKE
      // substring over both the stem and the explanation.
      where.OR = [
        { content: { contains: filter.q, mode: "insensitive" } },
        { explanation: { contains: filter.q, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private toRecord(row: QuestionRow): QuestionRecord {
    return {
      id: row.id,
      teacherId: row.teacherId,
      type: row.type,
      content: row.content,
      difficulty: row.difficulty,
      explanation: row.explanation,
      subjectId: row.subjectId,
      subjectName: row.subject.name,
      chapterId: row.chapterId,
      chapterName: row.chapter.name,
      trueFalseAnswer: row.trueFalseAnswer,
      options: row.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        position: o.position,
      })),
      fillAnswers: row.fillAnswers.map((a) => ({
        id: a.id,
        text: a.text,
        normalized: a.normalized,
        position: a.position,
      })),
      pairs: row.pairs.map((p) => ({
        id: p.id,
        leftText: p.leftText,
        leftNormalized: p.leftNormalized,
        rightText: p.rightText,
        rightNormalized: p.rightNormalized,
        position: p.position,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

interface ResolvedCatalogIds {
  subjectId: string;
  subjectName: string;
  chapterId: string;
  chapterName: string;
}

function withResolvedCatalog(
  input: QuestionWriteWithCatalog,
  resolved: ResolvedCatalogIds,
): QuestionWriteInput {
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
    ...resolved,
  };
}

function questionCreateData(input: QuestionWriteInput): Prisma.QuestionUncheckedCreateInput {
  return {
    teacherId: input.teacherId,
    type: input.type,
    content: input.content,
    difficulty: input.difficulty,
    explanation: input.explanation,
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    trueFalseAnswer: input.trueFalseAnswer,
    options: { create: input.options.map(optionData) },
    fillAnswers: { create: input.fillAnswers.map(fillAnswerData) },
    pairs: { create: input.pairs.map(pairData) },
  };
}

function questionReplaceData(input: QuestionWriteInput): Prisma.QuestionUncheckedUpdateInput {
  return {
    type: input.type,
    content: input.content,
    difficulty: input.difficulty,
    explanation: input.explanation,
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    trueFalseAnswer: input.trueFalseAnswer,
    options: { deleteMany: {}, create: input.options.map(optionData) },
    fillAnswers: { deleteMany: {}, create: input.fillAnswers.map(fillAnswerData) },
    pairs: { deleteMany: {}, create: input.pairs.map(pairData) },
  };
}

// Nested-create input mappers (children get server-generated ids from Prisma).
function optionData(o: { text: string; isCorrect: boolean; position: number }) {
  return { text: o.text, isCorrect: o.isCorrect, position: o.position };
}
function fillAnswerData(a: { text: string; normalized: string; position: number }) {
  return { text: a.text, normalized: a.normalized, position: a.position };
}
function pairData(p: {
  leftText: string;
  leftNormalized: string;
  rightText: string;
  rightNormalized: string;
  position: number;
}) {
  return {
    leftText: p.leftText,
    leftNormalized: p.leftNormalized,
    rightText: p.rightText,
    rightNormalized: p.rightNormalized,
    position: p.position,
  };
}
