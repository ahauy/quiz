import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { questionError } from "../errors.js";
import type { ChapterRecord, SubjectRecord, SubjectWithChapters } from "../ports.js";
import { CatalogRepository } from "../ports.js";

@Injectable()
export class PrismaCatalogRepository extends CatalogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async listSubjects(teacherId: string): Promise<SubjectWithChapters[]> {
    const rows = await this.prisma.subject.findMany({
      where: { teacherId },
      include: {
        chapters: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, subjectId: true },
        },
      },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      chapters: row.chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        subjectId: chapter.subjectId,
      })),
    }));
  }

  override async resolveOrCreateSubject(
    teacherId: string,
    name: string,
    nameKey: string,
  ): Promise<SubjectRecord> {
    // Upsert on the teacher-scoped unique key is atomic: concurrent first saves
    // reuse one row instead of racing into P2002.
    const row = await this.prisma.subject.upsert({
      where: { teacherId_nameKey: { teacherId, nameKey } },
      create: { teacherId, name, nameKey },
      update: {},
    });
    return {
      id: row.id,
      teacherId: row.teacherId,
      name: row.name,
      nameKey: row.nameKey,
    };
  }

  override async resolveOrCreateChapter(
    teacherId: string,
    subjectId: string,
    name: string,
    nameKey: string,
  ): Promise<ChapterRecord> {
    // Owner guard: every catalog query carries teacherId. A subject from another
    // teacher must never be extended with a chapter.
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, teacherId },
    });
    if (subject === null) {
      throw questionError("FORBIDDEN", "Subject belongs to another teacher");
    }
    const row = await this.prisma.chapter.upsert({
      where: { subjectId_nameKey: { subjectId, nameKey } },
      create: { subjectId, name, nameKey },
      update: {},
    });
    return {
      id: row.id,
      subjectId: row.subjectId,
      name: row.name,
      nameKey: row.nameKey,
    };
  }
}
