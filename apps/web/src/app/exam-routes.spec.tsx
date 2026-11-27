import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./router.js";

const session = vi.hoisted(() => ({ role: null as "TEACHER" | "STUDENT" | null }));
vi.mock("@/stores/auth-store.js", () => ({
  useAuthStore: (selector: (state: { role: typeof session.role }) => unknown) => selector({ role: session.role }),
}));
vi.mock("@/pages/teacher-exams/teacher-exams-page.js", () => ({ TeacherExamsPage: () => <h1>exam-list-target</h1> }));
vi.mock("@/pages/teacher-exams/teacher-exam-editor-page.js", () => ({ TeacherExamEditorPage: () => <h1>exam-editor-target</h1> }));
vi.mock("@/pages/student-exams/student-exams-page.js", () => ({ StudentExamsPage: () => <h1>student-exam-list-target</h1> }));
vi.mock("@/pages/student-exams/student-exam-detail-page.js", () => ({ StudentExamDetailPage: () => <h1>student-exam-detail-target</h1> }));

function rendered(path: string): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);
}

afterEach(() => { session.role = null; });

describe("US-EXAM-001 guarded teacher navigation", () => {
  it("routes an authorized teacher to list and both editor entries", () => {
    session.role = "TEACHER";
    expect(rendered("/teacher/exams")).toContain("exam-list-target");
    expect(rendered("/teacher/exams/new")).toContain("exam-editor-target");
    expect(rendered("/teacher/exams/d49817af-3431-40a4-840a-e89187bb5c14")).toContain("exam-editor-target");
  });
  it.each(["STUDENT", null] as const)("does not grant teacher pages to %s", (role) => {
    session.role = role;
    expect(rendered("/teacher/exams")).not.toContain("exam-list-target");
    expect(rendered("/teacher/exams/new")).not.toContain("exam-editor-target");
  });
});

describe("US-EXAM-001 guarded student navigation", () => {
  it("routes an authorized student to list and direct detail", () => {
    session.role = "STUDENT";
    expect(rendered("/student/exams")).toContain("student-exam-list-target");
    expect(rendered("/student/exams/d49817af-3431-40a4-840a-e89187bb5c14")).toContain("student-exam-detail-target");
  });
  it.each(["TEACHER", null] as const)("does not grant student pages to %s", (role) => {
    session.role = role;
    expect(rendered("/student/exams")).not.toContain("student-exam-list-target");
    expect(rendered("/student/exams/d49817af-3431-40a4-840a-e89187bb5c14")).not.toContain("student-exam-detail-target");
  });
});
