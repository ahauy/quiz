import { beforeEach, describe, expect, it } from "vitest";
import { QuestionException } from "./errors.js";
import { CatalogRepository } from "./ports.js";
import type {
  ChapterRecord,
  SubjectRecord,
  SubjectWithChapters,
} from "./ports.js";
import { QuestionsService } from "./questions.service.js";
import type { CurrentUser } from "./questions.types.js";
import { InMemoryCatalogRepository } from "./testing/in-memory-catalog.repository.js";
import { InMemoryQuestionRepository } from "./testing/in-memory-question.repository.js";
import type { PayloadInput } from "./validators/payload-validator.js";

const TEACHER_A = "teacher-a";
const TEACHER_B = "teacher-b";

const common = {
  content: "What is 2+2?",
  difficulty: "EASY" as const,
  explanation: "Because addition.",
  subjectName: "Math",
  chapterName: "Arithmetic",
};

const single: PayloadInput = {
  ...common,
  type: "SINGLE_CHOICE",
  options: ["3", "4", "5"],
  correctOptionIndexes: [1],
};
const multiple: PayloadInput = {
  ...common,
  type: "MULTIPLE_CHOICE",
  options: ["a", "b", "c"],
  correctOptionIndexes: [0, 2],
};
const trueFalse: PayloadInput = { ...common, type: "TRUE_FALSE", correctAnswer: false };
const fill: PayloadInput = {
  ...common,
  content: "The answer is {{blank}}.",
  type: "FILL_BLANK",
  acceptedAnswers: ["four", "4"],
};
const matching: PayloadInput = {
  ...common,
  type: "MATCHING",
  pairs: [
    { leftText: "A", rightText: "1" },
    { leftText: "B", rightText: "2" },
  ],
};

function teacher(id: string): CurrentUser {
  return { id, role: "TEACHER" };
}

async function capture(promise: Promise<unknown>): Promise<QuestionException> {
  let captured: unknown;
  try {
    await promise;
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(QuestionException);
  return captured as QuestionException;
}

let questions: InMemoryQuestionRepository;
let catalog: InMemoryCatalogRepository;
let service: QuestionsService;

beforeEach(() => {
  questions = new InMemoryQuestionRepository();
  catalog = new InMemoryCatalogRepository();
  service = new QuestionsService(questions, catalog);
});

describe("QuestionsService.create / get / list (T017)", () => {
  it("persists a question and maps it to a QuestionDto with ISO dates", async () => {
    const dto = await service.create(teacher(TEACHER_A), single);
    expect(dto.type).toBe("SINGLE_CHOICE");
    expect(dto.teacherId).toBe(TEACHER_A);
    expect(dto.subjectName).toBe("Math");
    expect(dto.chapterName).toBe("Arithmetic");
    expect(dto.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
    expect(dto.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);
    if (dto.type === "SINGLE_CHOICE") {
      expect(dto.options).toHaveLength(3);
      expect(dto.correctOptionId).toBeTruthy();
    }
    expect(questions.size()).toBe(1);
  });

  it("creates all five types", async () => {
    for (const body of [single, multiple, trueFalse, fill, matching]) {
      const dto = await service.create(teacher(TEACHER_A), body);
      expect(dto.type).toBe(body.type);
    }
    expect(questions.size()).toBe(5);
  });

  it("lists created questions with default page metadata", async () => {
    await service.create(teacher(TEACHER_A), single);
    const result = await service.list(teacher(TEACHER_A), {});
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.items).toHaveLength(1);
  });

  it("returns an empty page with totalPages 0 for an empty bank", async () => {
    const result = await service.list(teacher(TEACHER_A), {});
    expect(result).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
  });

  it("gets an owned question, returns 403 for a foreign owner and 404 for unknown", async () => {
    const created = await service.create(teacher(TEACHER_A), single);
    expect((await service.get(teacher(TEACHER_A), created.id)).id).toBe(created.id);
    expect((await capture(service.get(teacher(TEACHER_B), created.id))).code).toBe("FORBIDDEN");
    expect((await capture(service.get(teacher(TEACHER_A), "unknown-id"))).code).toBe(
      "QUESTION_NOT_FOUND",
    );
  });
});

describe("QuestionsService.replace / remove (T017)", () => {
  it("fully replaces a question: new type, cleared children, preserved id", async () => {
    const created = await service.create(teacher(TEACHER_A), single);
    const replaced = await service.replace(teacher(TEACHER_A), created.id, trueFalse);
    expect(replaced.id).toBe(created.id);
    expect(replaced.type).toBe("TRUE_FALSE");
    expect(replaced.createdAt).toBe(created.createdAt);
    if (replaced.type === "TRUE_FALSE") expect(replaced.correctAnswer).toBe(false);
    expect("options" in replaced).toBe(false);
    const record = await questions.findById(TEACHER_A, created.id);
    expect(record?.options).toHaveLength(0);
    expect(questions.size()).toBe(1);
  });

  it("rejects a foreign replace with 403 and leaves the row untouched", async () => {
    const created = await service.create(teacher(TEACHER_A), single);
    expect((await capture(service.replace(teacher(TEACHER_B), created.id, multiple))).code).toBe(
      "FORBIDDEN",
    );
    const record = await questions.findById(TEACHER_A, created.id);
    expect(record?.content).toBe("What is 2+2?");
  });

  it("hard-deletes a question; second delete is 404; foreign delete is 403", async () => {
    const created = await service.create(teacher(TEACHER_A), single);
    expect(await service.remove(teacher(TEACHER_A), created.id)).toEqual({ ok: true });
    expect(questions.size()).toBe(0);
    expect((await capture(service.remove(teacher(TEACHER_A), created.id))).code).toBe(
      "QUESTION_NOT_FOUND",
    );

    const again = await service.create(teacher(TEACHER_A), single);
    expect((await capture(service.remove(teacher(TEACHER_B), again.id))).code).toBe("FORBIDDEN");
    expect(questions.size()).toBe(1);
  });

  it("persists nothing when validation fails (atomic create, BR-QB-020)", async () => {
    const err = await capture(service.create(teacher(TEACHER_A), { ...single, options: ["A", "A"] }));
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.getStatus()).toBe(422);
    expect(questions.size()).toBe(0);
    expect(catalog.countSubjects()).toBe(0);
    expect(catalog.countChapters()).toBe(0);
  });
});

describe("QuestionsService catalog (T029, T031)", () => {
  it("reuses subject/chapter rows on a normalized-name match", async () => {
    await service.create(teacher(TEACHER_A), {
      ...single,
      subjectName: "  Toán   10  ",
      chapterName: "Chương 1",
    });
    await service.create(teacher(TEACHER_A), {
      ...single,
      subjectName: "toán 10",
      chapterName: "  chương   1 ",
    });
    expect(catalog.countSubjects()).toBe(1);
    expect(catalog.countChapters()).toBe(1);
  });

  it("scopes a chapter to its subject (same name under two subjects = two rows)", async () => {
    await service.create(teacher(TEACHER_A), { ...single, subjectName: "Math", chapterName: "Ch1" });
    await service.create(teacher(TEACHER_A), {
      ...single,
      subjectName: "Physics",
      chapterName: "Ch1",
    });
    expect(catalog.countSubjects()).toBe(2);
    expect(catalog.countChapters()).toBe(2);
  });

  it("returns only the caller's catalog, name-ordered with nested chapters", async () => {
    await service.create(teacher(TEACHER_A), {
      ...single,
      subjectName: "Zeta",
      chapterName: "B",
    });
    await service.create(teacher(TEACHER_A), {
      ...single,
      subjectName: "Zeta",
      chapterName: "A",
    });
    await service.create(teacher(TEACHER_A), {
      ...single,
      subjectName: "Alpha",
      chapterName: "Intro",
    });

    expect(await service.listSubjects(teacher(TEACHER_B))).toEqual([]);
    const subjects = await service.listSubjects(teacher(TEACHER_A));
    expect(subjects.map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
    expect(subjects[1]?.chapters.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("re-reads the winner on a concurrent P2002 during catalog resolve", async () => {
    const flaky = new FlakyCatalogRepository();
    const svc = new QuestionsService(questions, flaky);
    const dto = await svc.create(teacher(TEACHER_A), single);
    expect(dto.subjectName).toBe("Math");
    expect(questions.size()).toBe(1);
  });
});

describe("QuestionsService list filtering / pagination (T045)", () => {
  it("rejects page below 1 and pageSize above 50 with 422", async () => {
    expect((await capture(service.list(teacher(TEACHER_A), { page: 0 }))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect((await capture(service.list(teacher(TEACHER_A), { page: -1 }))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect((await capture(service.list(teacher(TEACHER_A), { page: "abc" }))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect((await capture(service.list(teacher(TEACHER_A), { pageSize: 51 }))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect((await capture(service.list(teacher(TEACHER_A), { pageSize: 0 }))).code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("rejects invalid difficulty/type enums and an overlong q with 422", async () => {
    expect((await capture(service.list(teacher(TEACHER_A), { difficulty: "NOPE" }))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect((await capture(service.list(teacher(TEACHER_A), { type: "NOPE" }))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect(
      (await capture(service.list(teacher(TEACHER_A), { q: "a".repeat(201) }))).code,
    ).toBe("VALIDATION_ERROR");
  });

  it("coerces numeric querystrings and honours page bounds", async () => {
    for (let i = 0; i < 45; i += 1) {
      await service.create(teacher(TEACHER_A), { ...single, content: `Question ${i}` });
    }
    const first = await service.list(teacher(TEACHER_A), { page: "1", pageSize: "10" });
    expect(first.page).toBe(1);
    expect(first.pageSize).toBe(10);
    expect(first.total).toBe(45);
    expect(first.totalPages).toBe(5);
    expect(first.items).toHaveLength(10);

    const last = await service.list(teacher(TEACHER_A), { page: 5, pageSize: 10 });
    expect(last.items).toHaveLength(5);
    expect(last.total).toBe(45);
  });

  it("AND-combines filters and q (case-insensitive content substring)", async () => {
    await service.create(teacher(TEACHER_A), {
      ...single,
      difficulty: "EASY",
      content: "Alpha theorem",
      subjectName: "Math",
    });
    await service.create(teacher(TEACHER_A), {
      ...single,
      difficulty: "HARD",
      content: "Beta theorem",
      subjectName: "Math",
    });
    await service.create(teacher(TEACHER_A), {
      ...single,
      difficulty: "EASY",
      content: "Gamma lemma",
      subjectName: "Physics",
    });

    const byDifficulty = await service.list(teacher(TEACHER_A), { difficulty: "EASY" });
    expect(byDifficulty.total).toBe(2);

    const combined = await service.list(teacher(TEACHER_A), {
      difficulty: "EASY",
      q: "alpha",
    });
    expect(combined.total).toBe(1);
    expect(combined.items[0]?.content).toBe("Alpha theorem");
  });

  it("returns an empty page (200) for a foreign/unknown subjectId", async () => {
    await service.create(teacher(TEACHER_A), single);
    const result = await service.list(teacher(TEACHER_A), { subjectId: "foreign-id" });
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.totalPages).toBe(0);
  });
});

// Simulates a concurrent first save that loses the unique-key race: the first
// resolve throws P2002 and the service must re-read the winner (BR-QB-012).
class FlakyCatalogRepository extends CatalogRepository {
  private readonly inner = new InMemoryCatalogRepository();
  private throwsOnce = true;

  override async listSubjects(teacherId: string): Promise<SubjectWithChapters[]> {
    return this.inner.listSubjects(teacherId);
  }

  override async resolveOrCreateSubject(
    teacherId: string,
    name: string,
    nameKey: string,
  ): Promise<SubjectRecord> {
    if (this.throwsOnce) {
      this.throwsOnce = false;
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    return this.inner.resolveOrCreateSubject(teacherId, name, nameKey);
  }

  override async resolveOrCreateChapter(
    teacherId: string,
    subjectId: string,
    name: string,
    nameKey: string,
  ): Promise<ChapterRecord> {
    return this.inner.resolveOrCreateChapter(teacherId, subjectId, name, nameKey);
  }
}
