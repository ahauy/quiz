import { randomUUID } from "node:crypto";
import type { ChapterRecord, SubjectRecord, SubjectWithChapters } from "../ports.js";
import { CatalogRepository } from "../ports.js";

export class InMemoryCatalogRepository extends CatalogRepository {
  private readonly subjects = new Map<string, SubjectRecord>();
  private readonly chapters = new Map<string, ChapterRecord>();

  // ── Test helpers ─────────────────────────────────────────────────────────
  countSubjects(): number {
    return this.subjects.size;
  }

  countChapters(): number {
    return this.chapters.size;
  }

  clear(): void {
    this.subjects.clear();
    this.chapters.clear();
  }

  override async listSubjects(teacherId: string): Promise<SubjectWithChapters[]> {
    return [...this.subjects.values()]
      .filter((subject) => subject.teacherId === teacherId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((subject) => ({
        id: subject.id,
        name: subject.name,
        chapters: [...this.chapters.values()]
          .filter((chapter) => chapter.subjectId === subject.id)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((chapter) => ({
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
    const existing = [...this.subjects.values()].find(
      (subject) => subject.teacherId === teacherId && subject.nameKey === nameKey,
    );
    if (existing !== undefined) return { ...existing };
    const record: SubjectRecord = { id: randomUUID(), teacherId, name, nameKey };
    this.subjects.set(record.id, record);
    return { ...record };
  }

  override async resolveOrCreateChapter(
    teacherId: string,
    subjectId: string,
    name: string,
    nameKey: string,
  ): Promise<ChapterRecord> {
    // Owner guard: mirror the Prisma adapter's teacherId scoping.
    const subject = this.subjects.get(subjectId);
    if (subject === undefined || subject.teacherId !== teacherId) {
      throw new Error(`Subject ${subjectId} is not owned by teacher ${teacherId}`);
    }
    const existing = [...this.chapters.values()].find(
      (chapter) => chapter.subjectId === subjectId && chapter.nameKey === nameKey,
    );
    if (existing !== undefined) return { ...existing };
    const record: ChapterRecord = { id: randomUUID(), subjectId, name, nameKey };
    this.chapters.set(record.id, record);
    return { ...record };
  }
}
