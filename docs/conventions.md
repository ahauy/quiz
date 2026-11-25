# Code Conventions

> Single source of truth for naming remains `AGENTS.md`; domain identifiers come from `CONTEXT.md`. This file is the practical checklist.

## Naming

| Thing | Rule | Example |
| :--- | :--- | :--- |
| Type / interface / enum value | PascalCase | `QuestionDto`, `TEACHER` |
| Variable / function | camelCase | `deadlineAt`, `submitAttempt()` |
| File / directory | kebab-case | `attempt-autosave.ts`, `question-bank/` |
| Env var | SCREAMING_SNAKE_CASE | `VIOLATION_WARN_AT` |
| API route | kebab-case plural nouns | `/api/questions`, `/api/attempts/:id/submit` |
| Test | `*.spec.ts` colocated; integration in `apps/api/test/`; E2E in `apps/web/e2e/` | `env.schema.spec.ts` |

**Domain terms are fixed** by `CONTEXT.md`: `Exam`, `Attempt`, `Question`, `QuestionBank`, `ExamMatrix`, `Classroom`, `ClassCode`, `Teacher`, `Student`, `Explanation`, `AutoGrading`, `NegativeMarking`, `ServerClock`, `Shuffle`, `Violation`, `AttemptAutosave`. Do not invent synonyms.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` from `tsconfig.base.json`.
- No `any`. Use `unknown` at boundaries and narrow with zod / class-validator DTOs.
- Immutability: return new copies; never mutate input state.
- File < 800 lines, function < 50 lines, nesting < 3 levels.
- `ponytail:` comment required for any deliberate simplification — name the ceiling and upgrade path.

## Boundaries

- Backend: every inbound payload goes through a DTO + schema validator (`class-validator` in Nest; zod in config/shared).
- Frontend: never trust API response shape — parse with zod where it crosses into state.
- `packages/shared` imports nothing from `apps/*`; violation is a build failure.
- Errors are explicit: `{ code, message, details? }`. No silent catch.

## UI

- 1px hairline borders, explicit type hierarchy, stable outer anchor for hover motion.
- No unrequested gradients or glassmorphism.
- shadcn/ui primitives only; no parallel custom button system.

## Testing

- TDD: red → green → refactor per slice.
- No placeholder assertions (`expect(true).toBe(true)`) — a test must fail when the code is wrong.
- E2E smoke runs against a real local server with Postgres healthy.

## Git

- Never `git add`, `commit`, `push`, rebase, or resolve conflicts autonomously.
- Only `/command-git-push` may perform writes to history.
