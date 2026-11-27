import "reflect-metadata";
import { EnrollmentStatus, Role } from "@quiz/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "./classroom.types.js";
import { ClassroomService } from "./classroom.service.js";
import { ClassroomException } from "./errors.js";
import type { ClassroomErrorCode } from "./errors.js";
import { CryptoClassCodeGenerator } from "./ports.js";
import { FakeClassCodeGenerator, InMemoryClassroomRepository } from "./testing/fakes.js";

const TEACHER_A: CurrentUser = { id: "teacher-a", role: Role.TEACHER };
const TEACHER_B: CurrentUser = { id: "teacher-b", role: Role.TEACHER };
const STUDENT: CurrentUser = { id: "student-1", role: Role.STUDENT };

async function expectError(
  promise: Promise<unknown>,
  code: ClassroomErrorCode,
  status: number,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ClassroomException);
  const exception = caught as ClassroomException;
  expect(exception.code).toBe(code);
  expect(exception.getStatus()).toBe(status);
}

describe("ClassroomService", () => {
  let repo: InMemoryClassroomRepository;
  let codes: FakeClassCodeGenerator;
  let service: ClassroomService;

  beforeEach(() => {
    repo = new InMemoryClassroomRepository();
    repo.seedUser({ id: TEACHER_A.id, displayName: "Teacher A", email: "a@school.test" });
    repo.seedUser({ id: TEACHER_B.id, displayName: "Teacher B", email: "b@school.test" });
    repo.seedUser({ id: STUDENT.id, displayName: "Student One", email: "student@school.test" });
    codes = new FakeClassCodeGenerator(["ABC234", "BCD345", "CDE456", "DEF567", "EFG678"]);
    service = new ClassroomService(repo, codes);
  });

  it("generates six-character codes from the ambiguity-free alphabet", () => {
    const generator = new CryptoClassCodeGenerator();
    for (let i = 0; i < 20; i += 1) {
      expect(generator.generate()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("TC-001 creates a classroom with the generated code and owner", async () => {
    const created = await service.create(TEACHER_A, { name: "Mathematics" });
    expect(created).toMatchObject({
      name: "Mathematics",
      teacherId: TEACHER_A.id,
      code: "ABC234",
    });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBe(new Date(created.createdAt).toISOString());
  });

  it("TC-001 retries a code collision and persists only the successful row", async () => {
    const failingRepo = new InMemoryClassroomRepository();
    await failingRepo.createClassroom({ name: "Taken", teacherId: TEACHER_B.id, code: "ABC234" });
    const generator = new FakeClassCodeGenerator(["ABC234", "XYZ789"]);
    const failingService = new ClassroomService(failingRepo, generator);

    const created = await failingService.create(TEACHER_A, { name: "Mathematics" });

    expect(created.code).toBe("XYZ789");
    expect(generator.calls).toEqual(["ABC234", "XYZ789"]);
    expect(await failingService.list(TEACHER_B)).toHaveLength(1);
    expect(await failingService.list(TEACHER_A)).toHaveLength(1);
  });

  it("TC-001 stops after five code-generation attempts", async () => {
    const failingRepo = new InMemoryClassroomRepository();
    await failingRepo.createClassroom({ name: "Taken", teacherId: TEACHER_B.id, code: "ABC234" });
    const generator = new FakeClassCodeGenerator(Array<string>(5).fill("ABC234"));
    const failingService = new ClassroomService(failingRepo, generator);

    await expect(failingService.create(TEACHER_A, { name: "Mathematics" })).rejects.toThrow(
      /unique class code/i,
    );
    expect(generator.calls).toHaveLength(5);
    expect(await failingService.list(TEACHER_A)).toHaveLength(0);
  });

  it("TC-002 rejects classroom creation from a student with FORBIDDEN", async () => {
    await expectError(service.create(STUDENT, { name: "Mathematics" }), "FORBIDDEN", 403);
    expect(await service.list(TEACHER_A)).toHaveLength(0);
  });

  it("TC-003 joins a valid code with a PENDING enrollment visible to the teacher", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    const enrollment = await service.join(STUDENT, classroom.code);

    expect(enrollment).toMatchObject({
      classroomId: classroom.id,
      userId: STUDENT.id,
      displayName: "Student One",
      email: "student@school.test",
      status: EnrollmentStatus.PENDING,
    });
    expect(enrollment.id).toBeTruthy();
    expect(enrollment.approvedAt).toBeUndefined();
    expect(await service.listEnrollments(TEACHER_A, classroom.id)).toEqual([enrollment]);
  });

  it("TC-004 rejects an unknown code with CLASS_CODE_NOT_FOUND", async () => {
    await expectError(service.join(STUDENT, "ZZZ999"), "CLASS_CODE_NOT_FOUND", 404);
    expect(repo.countEnrollments()).toBe(0);
  });

  it("TC-005 returns the same enrollment when a student joins twice", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    const first = await service.join(STUDENT, classroom.code);
    const second = await service.join(STUDENT, classroom.code);

    expect(second.id).toBe(first.id);
    expect(second.status).toBe(EnrollmentStatus.PENDING);
    expect(await service.listEnrollments(TEACHER_A, classroom.id)).toHaveLength(1);
  });

  it("TC-005 survives a concurrent join that loses the unique-enrollment race", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    const first = await service.join(STUDENT, classroom.code);
    const find = vi.spyOn(repo, "findEnrollment").mockImplementationOnce(async () => null);
    const create = vi
      .spyOn(repo, "createEnrollment")
      .mockRejectedValueOnce({ code: "P2002" });

    const raced = await service.join(STUDENT, classroom.code);

    expect(raced.id).toBe(first.id);
    expect(find).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledOnce();
    expect(await repo.countEnrollments()).toBe(1);
    create.mockRestore();
    find.mockRestore();
  });

  it("TC-006 approval sets APPROVED and grants the student classroom visibility", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    await service.join(STUDENT, classroom.code);
    expect(await service.list(STUDENT)).toEqual([]);

    const approved = await service.approve(TEACHER_A, classroom.id, STUDENT.id);
    expect(approved.status).toBe(EnrollmentStatus.APPROVED);
    const approvedAt = approved.approvedAt;
    if (approvedAt === undefined) throw new Error("approvedAt must be set");
    expect(approvedAt).toBe(new Date(approvedAt).toISOString());
    expect(await service.list(STUDENT)).toEqual([classroom]);
  });

  it("TC-007 removing an enrollment revokes the student's classroom access", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    await service.join(STUDENT, classroom.code);
    await service.approve(TEACHER_A, classroom.id, STUDENT.id);

    expect(await service.removeEnrollment(TEACHER_A, classroom.id, STUDENT.id)).toEqual({
      ok: true,
    });
    expect(await service.listEnrollments(TEACHER_A, classroom.id)).toEqual([]);
    expect(await service.list(STUDENT)).toEqual([]);
  });

  it("TC-008 denies teacher B every read and write on teacher A's classroom", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    await service.join(STUDENT, classroom.code);

    await expectError(service.listEnrollments(TEACHER_B, classroom.id), "FORBIDDEN", 403);
    await expectError(service.approve(TEACHER_B, classroom.id, STUDENT.id), "FORBIDDEN", 403);
    await expectError(
      service.removeEnrollment(TEACHER_B, classroom.id, STUDENT.id),
      "FORBIDDEN",
      403,
    );
    await expectError(service.removeClassroom(TEACHER_B, classroom.id), "FORBIDDEN", 403);
  });

  it("TC-009 lists only classrooms owned by the requesting teacher", async () => {
    const first = await service.create(TEACHER_A, { name: "Mathematics" });
    const second = await service.create(TEACHER_A, { name: "Physics" });
    await service.create(TEACHER_B, { name: "Chemistry" });

    const listed = await service.list(TEACHER_A);
    expect(listed.map((classroom) => classroom.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("TC-010 lists only approved classrooms for a student", async () => {
    const pending = await service.create(TEACHER_A, { name: "Mathematics" });
    const approved = await service.create(TEACHER_A, { name: "Physics" });
    await service.create(TEACHER_B, { name: "Chemistry" });
    await service.join(STUDENT, pending.code);
    await service.join(STUDENT, approved.code);
    await service.approve(TEACHER_A, approved.id, STUDENT.id);

    expect(await service.list(STUDENT)).toEqual([approved]);
  });

  it("returns CLASSROOM_NOT_FOUND for a missing classroom", async () => {
    await expectError(service.listEnrollments(TEACHER_A, "missing"), "CLASSROOM_NOT_FOUND", 404);
    await expectError(service.removeClassroom(TEACHER_A, "missing"), "CLASSROOM_NOT_FOUND", 404);
    await expectError(
      service.approve(TEACHER_A, "missing", STUDENT.id),
      "CLASSROOM_NOT_FOUND",
      404,
    );
    await expectError(
      service.removeEnrollment(TEACHER_A, "missing", STUDENT.id),
      "CLASSROOM_NOT_FOUND",
      404,
    );
  });

  it("returns ENROLLMENT_NOT_FOUND when the target student is not enrolled", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    await expectError(
      service.approve(TEACHER_A, classroom.id, STUDENT.id),
      "ENROLLMENT_NOT_FOUND",
      404,
    );
    await expectError(
      service.removeEnrollment(TEACHER_A, classroom.id, STUDENT.id),
      "ENROLLMENT_NOT_FOUND",
      404,
    );
  });

  it("deletes an owned classroom and removes it from all listings", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    await service.join(STUDENT, classroom.code);

    expect(await service.removeClassroom(TEACHER_A, classroom.id)).toEqual({ ok: true });
    expect(await service.list(TEACHER_A)).toEqual([]);
    expect(await service.list(STUDENT)).toEqual([]);
    await expectError(service.join(STUDENT, classroom.code), "CLASS_CODE_NOT_FOUND", 404);
  });

  it("rejects a teacher joining a classroom with FORBIDDEN", async () => {
    const classroom = await service.create(TEACHER_A, { name: "Mathematics" });
    await expectError(service.join(TEACHER_B, classroom.code), "FORBIDDEN", 403);
  });
});
