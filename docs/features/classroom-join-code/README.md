# US-CLS-001 — Classroom & Join Code

Teacher-created classrooms with a unique 6-character code; students request to join and teachers approve or remove them. Scope is limited to teacher-owned classrooms and approved student visibility.

## Scope

**In:** create/delete classroom, unique code generation, join by code, pending roster, approve/remove enrollment, role-scoped listings.

**Out:** code rotation/expiry, bulk student import, approval notifications, admin-wide class listing (explicitly out of MVP).

## API contract

All routes are protected by the global JWT guard and require `Authorization: Bearer <access-token>`. Responses use `{ data: ... }`; errors use `{ code, message, details? }`.

| Method | Path | Role | Result |
| :-- | :-- | :-- | :-- |
| `POST` | `/classrooms` | Teacher | `201 ClassroomDto` with generated `code` |
| `GET` | `/classrooms` | Teacher / Student | Teacher: owned classrooms; Student: approved enrollments only |
| `GET` | `/classrooms/:id/enrollments` | Teacher owner | `200 EnrollmentDto[]` (pending and approved) |
| `POST` | `/classrooms/:code/join` | Student | `201 EnrollmentDto` with `status: PENDING` (idempotent) |
| `PATCH` | `/classrooms/:id/enrollments/:userId/approve` | Teacher owner | `200 EnrollmentDto` with `status: APPROVED` |
| `DELETE` | `/classrooms/:id/enrollments/:userId` | Teacher owner | `200 { ok: true }` |
| `DELETE` | `/classrooms/:id` | Teacher owner | `200 { ok: true }` |

Error codes: `CLASS_CODE_NOT_FOUND` (404), `CLASSROOM_NOT_FOUND` (404), `ENROLLMENT_NOT_FOUND` (404), `FORBIDDEN` (403), `UNAUTHORIZED` (401).

## Data model

- `Classroom(id, name, teacherId, createdAt, updatedAt)` — index on `teacherId`.
- `ClassCode(id, code @unique, classroomId @unique, createdAt)` — one code per classroom.
- `Enrollment(id, classroomId, userId, status, createdAt, approvedAt?)` — unique on `(classroomId, userId)`, index on `userId`.
- `EnrollmentStatus`: `PENDING` → `APPROVED`.

Migration: `apps/api/prisma/migrations/20261126093000_add_classrooms/migration.sql`.

## Web surface

- `/teacher/classrooms` — create dialog, classroom list with code, per-class `StudentRoster` with approve/remove.
- `/student/classrooms` — approved classrooms, join entry point.
- `/student/join` — 6-character code form, lower-case input normalized to upper-case.
- Links added from home, teacher and student landing pages.

Shared DTOs/enums live in `packages/shared/src/{dto,enums}/index.ts`. Zod mirrors are in `apps/web/src/lib/schemas.ts`; typed wrappers are in `apps/web/src/lib/classroom-api.ts`.

## Verification

| Gate | Result |
| :-- | :-- |
| `corepack pnpm lint` | pass |
| `corepack pnpm typecheck` | pass |
| `corepack pnpm test` | 165 unit tests pass (108 API + 57 web) |
| `corepack pnpm build` | pass |
| `prisma migrate deploy` | 3 migrations applied, schema current |
| `playwright test e2e/classrooms.spec.ts` | 1 passed (teacher create → student join → teacher approve → student sees class) |
| Code review / UI review | zero Critical; all findings resolved |

Note: the sandbox blocks bulk deletion of `apps/api/dist` and Playwright `test-results`. During verification the API was compiled with `tsc`, servers were started directly, and Playwright ran with `--trace off --output /tmp/...`. CI is unaffected.

## Decisions

See `.specify/features/classroom-join-code/decisions.md`. In particular: pending enrollments are hidden from the student list, join is idempotent and race-safe, and US-AUTH-001 remains `[/]` under the user's Google-E2E waiver.

## User guide

[`docs/user-guides/classroom-join-code.md`](../user-guides/classroom-join-code.md) — includes real Playwright screenshots.
