import "reflect-metadata";
import { randomUUID } from "node:crypto";
import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role as PrismaRole } from "@prisma/client";
import type { Request } from "express";
import * as shared from "@quiz/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator.js";
import { ROLES_KEY } from "../common/decorators/roles.decorator.js";
import { RolesGuard } from "../common/guards/roles.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QuestionException } from "./errors.js";
import { PrismaCatalogRepository } from "./repositories/prisma-catalog.repository.js";
import { PrismaQuestionRepository } from "./repositories/prisma-question.repository.js";
import { QuestionsController } from "./questions.controller.js";
import { QuestionsService } from "./questions.service.js";
import type { CurrentUser, ListQuery } from "./questions.types.js";
import { SubjectsController } from "./subjects.controller.js";
import type { PayloadInput } from "./validators/payload-validator.js";

// Nest's constructor DI relies on `design:paramtypes`, which vitest/esbuild does
// not emit, so the module graph is wired by hand against the real Postgres.
// Controllers are still the real production classes; only the wiring is manual.
const singleBody: PayloadInput = {
  type: "SINGLE_CHOICE",
  content: "What is 2+2?",
  difficulty: "EASY",
  explanation: "Because addition.",
  subjectName: "Math",
  chapterName: "Arithmetic",
  options: ["3", "4", "5"],
  correctOptionIndexes: [1],
};

let prisma: PrismaService;
let teacherA: { id: string };
let teacherB: { id: string };
const userIds: string[] = [];
let questions: QuestionsController;
let subjects: SubjectsController;

function reqFor(id: string): Request {
  return { user: { id, role: "TEACHER" } } as unknown as Request;
}

async function failing(promise: Promise<unknown>): Promise<HttpException> {
  let captured: unknown;
  try {
    await promise;
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(HttpException);
  return captured as HttpException;
}

beforeAll(async () => {
  prisma = new PrismaService();
  await prisma.$connect();
  const suffix = randomUUID();
  teacherA = await prisma.user.create({
    data: {
      email: `qb-ctrl-a-${suffix}@example.test`,
      displayName: "QB Controller A",
      role: PrismaRole.TEACHER,
    },
    select: { id: true },
  });
  teacherB = await prisma.user.create({
    data: {
      email: `qb-ctrl-b-${suffix}@example.test`,
      displayName: "QB Controller B",
      role: PrismaRole.TEACHER,
    },
    select: { id: true },
  });
  userIds.push(teacherA.id, teacherB.id);

  const service = new QuestionsService(
    new PrismaQuestionRepository(prisma),
    new PrismaCatalogRepository(prisma),
  );
  questions = new QuestionsController(service);
  subjects = new SubjectsController(service);
});

afterAll(async () => {
  // Question.subject/chapter are NoAction FKs: remove questions before their
  // owning users so the user cascade can delete subjects/chapters cleanly.
  await prisma.question.deleteMany({ where: { teacherId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("QuestionsController E-01..E-05 (real Postgres, T018)", () => {
  it("create → list → get → replace → delete → second delete 404", async () => {
    const created = await questions.create(reqFor(teacherA.id), singleBody);
    const id = created.data.id;
    expect(created.data.type).toBe("SINGLE_CHOICE");
    expect(created.data.teacherId).toBe(teacherA.id);
    expect(created.data.content).toBe("What is 2+2?");
    expect(created.data.explanation).toBe("Because addition.");
    expect(created.data.subjectName).toBe("Math");
    expect(created.data.chapterName).toBe("Arithmetic");
    expect(created.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/u);

    const listed = await questions.list(reqFor(teacherA.id), { pageSize: 50 } as ListQuery);
    expect(listed.data.total).toBeGreaterThanOrEqual(1);
    expect(listed.data.items.some((item) => item.id === id)).toBe(true);

    const got = await questions.get(reqFor(teacherA.id), id);
    expect(got.data.id).toBe(id);

    const replaced = await questions.replace(reqFor(teacherA.id), id, {
      ...singleBody,
      content: "Edited content",
      explanation: "Edited explanation",
    });
    expect(replaced.data.content).toBe("Edited content");
    expect(replaced.data.explanation).toBe("Edited explanation");

    const removed = await questions.remove(reqFor(teacherA.id), id);
    expect(removed.data).toEqual({ ok: true });

    const second = await failing(questions.remove(reqFor(teacherA.id), id));
    expect(second.getStatus()).toBe(404);
    expect((second as QuestionException).code).toBe("QUESTION_NOT_FOUND");
  });

  it("q matches both the stem and the explanation (BR-QB-018)", async () => {
    const created = await questions.create(reqFor(teacherA.id), singleBody);
    for (const q of ["2+2", "addition"]) {
      const result = await questions.list(reqFor(teacherA.id), {
        q,
        pageSize: 50,
      } as ListQuery);
      expect(result.data.items.some((item) => item.id === created.data.id), q).toBe(true);
    }
  });

  it("GET /subjects returns only the caller's catalog with nested chapters", async () => {
    await questions.create(reqFor(teacherA.id), singleBody);
    const result = await subjects.list(reqFor(teacherA.id));
    const math = result.data.find((subject) => subject.name === "Math");
    expect(math?.chapters.some((chapter) => chapter.name === "Arithmetic")).toBe(true);
    expect(await subjects.list(reqFor(teacherB.id))).toEqual({ data: [] });
  });

  it("A-vs-B isolation: foreign teacher gets 403 on get/replace/delete", async () => {
    const created = await questions.create(reqFor(teacherA.id), singleBody);
    const id = created.data.id;
    const attempts: [string, () => Promise<unknown>][] = [
      ["get", () => questions.get(reqFor(teacherB.id), id)],
      ["replace", () => questions.replace(reqFor(teacherB.id), id, singleBody)],
      ["delete", () => questions.remove(reqFor(teacherB.id), id)],
    ];
    for (const [label, run] of attempts) {
      const err = await failing(run());
      expect(err.getStatus(), label).toBe(403);
      expect((err as QuestionException).code).toBe("FORBIDDEN");
    }
    expect((await questions.get(reqFor(teacherA.id), id)).data.id).toBe(id);
  });

  it("a partial PATCH body is rejected with 422 (full replacement, no merge)", async () => {
    const created = await questions.create(reqFor(teacherA.id), singleBody);
    const partial = { type: "TRUE_FALSE" } as unknown as PayloadInput;
    const err = await failing(questions.replace(reqFor(teacherA.id), created.data.id, partial));
    expect(err.getStatus()).toBe(422);
    expect((err as QuestionException).code).toBe("VALIDATION_ERROR");
  });

  it("an unknown id is 404, not 403", async () => {
    const err = await failing(questions.get(reqFor(teacherA.id), randomUUID()));
    expect(err.getStatus()).toBe(404);
    expect((err as QuestionException).code).toBe("QUESTION_NOT_FOUND");
  });
});

describe("BR-QB-017 answer secrecy (T043)", () => {
  it("exports no student-facing question variant; owner DTO carries explanation", async () => {
    const names = Object.keys(shared);
    expect(names.filter((name) => /student.*question|question.*student/iu.test(name))).toEqual([]);
    const created = await questions.create(reqFor(teacherA.id), singleBody);
    expect(created.data.explanation).toBe("Because addition.");
  });

  it("a 403 path never leaks the explanation or answer ids", async () => {
    const created = await questions.create(reqFor(teacherA.id), singleBody);
    const err = await failing(questions.get(reqFor(teacherB.id), created.data.id));
    expect(err.getStatus()).toBe(403);
    const body = JSON.stringify(err.getResponse());
    expect(body).not.toContain("Because addition.");
    expect(body).not.toContain("correctOptionId");
    expect(body).not.toContain("explanation");
  });
});

// Teacher-only access is enforced by the global RolesGuard (and anonymous
// requests are rejected earlier by the global JwtAuthGuard, since no bank
// route is @Public). T048 asserts that contract for every bank route.
function ctx(
  cls: object,
  handler: object,
  request: Record<string, unknown>,
): ExecutionContext {
  return {
    getClass: () => cls,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const bankRoutes: readonly [string, object, object][] = [
  ["POST /questions", QuestionsController, QuestionsController.prototype.create],
  ["GET /questions", QuestionsController, QuestionsController.prototype.list],
  ["GET /questions/:id", QuestionsController, QuestionsController.prototype.get],
  ["PATCH /questions/:id", QuestionsController, QuestionsController.prototype.replace],
  ["DELETE /questions/:id", QuestionsController, QuestionsController.prototype.remove],
  ["GET /subjects", SubjectsController, SubjectsController.prototype.list],
];

const rolesGuard = new RolesGuard(new Reflector());

describe("teacher-only / student-negative / anonymous (T048)", () => {
  it("both bank controllers are teacher-only and not @Public", () => {
    for (const cls of [QuestionsController, SubjectsController]) {
      expect(Reflect.getMetadata(ROLES_KEY, cls)).toEqual(["TEACHER"]);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, cls)).toBeUndefined();
    }
  });

  for (const [label, cls, handler] of bankRoutes) {
    it(`allows a TEACHER on ${label}`, () => {
      const user: CurrentUser = { id: "t", role: "TEACHER" };
      expect(rolesGuard.canActivate(ctx(cls, handler, { user }))).toBe(true);
    });

    it(`denies a STUDENT on ${label} with 403`, () => {
      const user: CurrentUser = { id: "s", role: "STUDENT" };
      expect(() => rolesGuard.canActivate(ctx(cls, handler, { user }))).toThrow(
        ForbiddenException,
      );
    });

    it(`denies an anonymous caller on ${label} with 401`, () => {
      expect(() => rolesGuard.canActivate(ctx(cls, handler, {}))).toThrow(
        UnauthorizedException,
      );
    });
  }
});
