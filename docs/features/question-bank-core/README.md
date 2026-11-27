# US-QB-001 — Question Bank Core

A teacher-owned, teacher-only question bank: five question types, a teacher-scoped
subject/chapter catalog created implicitly while authoring, mandatory difficulty and
explanation, rich stems (images, KaTeX, fenced code), and filter + pagination. This README
is the contract-level view; decisions and rationale stay in the signed artifacts under
`.specify/features/question-bank-core/` and the roadmap. The source of truth is
`baseline.md` **SIGNED-OFF v1.0** (2026-11-26) — code that contradicts it is a defect.

> Sources: `.specify/features/question-bank-core/` (`baseline.md`, `spec.md`,
> `data-model.md`, `contracts/`, `plan.md` ADR-QB-06, `04-risk-register.md`,
> `test-plan.md`, `CHANGELOG.md`, `decisions.md`), `docs/PRODUCT_BACKLOG_ROADMAP.md`.

---

## Scope

**In** (baseline §2 scope lock): question CRUD · five types · subject/chapter/difficulty
classification · images, math, code in the stem · mandatory explanation · filtering,
search, pagination · teacher-scoped catalog · teacher-only access.

**Out** (contractual Won't-Have, enforced not merely unbuilt): admin panel · catalog
management screen · Excel/Word import (`US-QB-002`) · export · AI · student access ·
practice mode · exam/attempt/grading · question versioning · draft/publish · trash/restore
· object storage/CDN/signed URLs · image resizing · multi-blank fill-in-the-blank · sharing
a bank between teachers · notifications · analytics · rate-limiting infrastructure. Any
scope change requires a `CHANGELOG.md` v1.1 bump, never an edit to v1.0.

---

## API contract

All routes are protected by the global JWT guard and require
`Authorization: Bearer <access-token>`, except the single public image route. Success
responses use `{ data: ... }`; errors use `{ code, message, details?, path, timestamp }`.
No `/api` prefix. Students are refused at every bank endpoint (class-level
`@Roles(Role.TEACHER)`).

| # | Method | Path | Role | Result |
| :-- | :-- | :-- | :-- | :-- |
| E-01 | `POST` | `/questions` | Teacher | `201 QuestionDto` — atomic create |
| E-02 | `GET` | `/questions` | Teacher | `200 QuestionListDto` — own rows, AND filters, `pageSize ≤ 50` |
| E-03 | `GET` | `/questions/:id` | Teacher owner | `200 QuestionDto` (404 unknown / 403 foreign) |
| E-04 | `PATCH` | `/questions/:id` | Teacher owner | `200 QuestionDto` — full replace, type may change |
| E-05 | `DELETE` | `/questions/:id` | Teacher owner | `200 { ok: true }` — hard delete + child cascade |
| E-06 | `GET` | `/subjects` | Teacher | `200 SubjectDto[]` with nested chapters (own catalog, name-ordered) |
| E-07 | `POST` | `/assets` | Teacher | `201 AssetUploadResultDto` — image ≤ 5 MB, magic-byte sniffed |
| E-08 | `GET` | `/uploads/:filename` | Public | image bytes, UUID-pattern filename only |

`QuestionDto` is a five-member union (single choice, multiple choice, true/false, fill
blank, matching). Write DTOs are index-based (`correctOptionIndexes`); read DTOs are
id-based (`correctOptionId(s)`). Shared shapes live in
`packages/shared/src/{dto,enums}/index.ts` (deltas C-01…C-06); Zod mirrors in
`apps/web/src/lib/schemas.ts`; typed wrappers in the web API client.

### Error codes

| Code | HTTP | When |
| :-- | :-- | :-- |
| `UNAUTHORIZED` | 401 | missing/invalid token on any protected route |
| `FORBIDDEN` | 403 | student, or non-owner on an existing question/catalog row |
| `QUESTION_NOT_FOUND` | 404 | unknown id, already-deleted id, or second delete |
| `VALIDATION_ERROR` | 422 | any rule violation (body, query, zero-byte upload); `details` names the field |
| `FILE_TOO_LARGE` | 413 | upload > 5 MB (Multer `LIMIT_FILE_SIZE` is mapped to this, never a 500) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | disallowed MIME or magic-byte mismatch (spoofed/executable file) |

Foreign/unknown `subjectId`/`chapterId` filters return `200` with an empty page (not 404),
so filter ids cannot be enumerated. A foreign existing row resolves to `403` — never
`404` — for read/replace/delete, preventing id enumeration.

---

## Atomic create / replace transaction

`POST /questions` and `PATCH /questions/:id` each run **one Prisma transaction**
(ADR-QB-03, `BR-QB-012`/`BR-QB-020`):

1. Normalize names with `BR-QB-019` (`NFC → trim → collapse whitespace → lowercase`).
2. Resolve-or-create `Subject` by unique `(teacherId, nameKey)`, then `Chapter` by
   `(subjectId, nameKey)`; catch Prisma `P2002` and re-read the existing row (no 500 on a
   concurrent duplicate).
3. Insert the `Question` + its type-specific child rows (`QuestionOption` /
   `FillBlankAnswer` / `MatchingPair`); on `PATCH`, delete the old children and clear
   stale fields (`trueFalseAnswer = null`) when the type changes.

`PATCH` is a **full replacement**, not a merge (partial body → `422`). The write is
all-or-nothing: a validation failure persists nothing. `teacherId` always comes from the
verified JWT, never the body. `DELETE` is permanent, cascades child rows only, and leaves
catalog rows and uploaded files untouched.

---

## Data model

Six entities (`apps/api/prisma/schema.prisma`); `User` gains `subjects Subject[]` and
`questions Question[]` back-relations. There is **no `Asset` table** — an uploaded image
is a file `<uuid>.<ext>` under `UPLOAD_DIR`.

| Entity | Key fields | Indexes / constraints |
| :-- | :-- | :-- |
| `Subject` | `teacherId`, `name`, `nameKey` | `@@unique([teacherId, nameKey])`, `@@index([teacherId])` |
| `Chapter` | `subjectId`, `name`, `nameKey` | `@@unique([subjectId, nameKey])`, `@@index([subjectId])` |
| `Question` | `teacherId`, `type`, `difficulty`, `content`, `explanation`, `subjectId`, `chapterId`, `trueFalseAnswer?` | `@@index([teacherId, updatedAt])`, `@@index([teacherId, subjectId, chapterId])`, `@@index([teacherId, difficulty])`, `@@index([teacherId, type])` |
| `QuestionOption` | `questionId`, `text`, `isCorrect`, `position` | `@@index([questionId])` |
| `FillBlankAnswer` | `questionId`, `text`, `normalized`, `position` | `@@unique([questionId, normalized])`, `@@index([questionId])` |
| `MatchingPair` | `questionId`, `leftText`, `leftNormalized`, `rightText`, `rightNormalized`, `position` | `@@unique([questionId, leftNormalized])`, `@@unique([questionId, rightNormalized])` (bijection), `@@index([questionId])` |

- **Enums**: `QuestionType { SINGLE_CHOICE MULTIPLE_CHOICE TRUE_FALSE FILL_BLANK MATCHING }`,
  `Difficulty { EASY MEDIUM HARD }`.
- **Foreign keys**: children (`QuestionOption`/`FillBlankAnswer`/`MatchingPair`) and
  `Subject`/`Chapter` → `Question` are `onDelete: Cascade` at the question level;
  `Question.subject`/`Question.chapter` use `onDelete: NoAction` (not `Restrict`) so a
  `User` cascade does not fail mid-statement; `Subject`/`Question` → `User` is `Cascade`.
- The four `Question` indexes cover list ordering (`updatedAt DESC`) and every AND-combined
  filter (`BR-QB-018`). The teacher's original text is always stored and displayed
  unchanged; only `nameKey` / `normalized` / `*Normalized` hold the key.
- Migration: one additive migration; `prisma migrate status` reports 4 migrations current.
  Rollback is a forward fix (drop the six new tables in reverse FK order, or restore the
  pre-migration snapshot) — the additive nature means old code keeps working.

---

## Security decisions

- **Teacher-only.** Class-level `@Roles(Role.TEACHER)` on `QuestionsController`,
  `SubjectsController` and `AssetsController`; a student is rejected before any handler
  runs (`403`), anonymous gets `401` (`BR-QB-002`).
- **Owner scope.** Ownership is data-derived, never client-supplied: every repository
  query carries `teacherId` from the verified JWT as a required argument (`BR-QB-001`). A
  chapter's owner is derived through its subject. Foreign existing rows → `403`;
  foreign/unknown filter ids → empty page.
- **Cascade hard delete.** `DELETE` is permanent and cascades child rows only
  (`BR-QB-020`); catalog rows and uploaded files are retained. No soft delete, no
  trash/restore.
- **Public UUID images only.** `GET /uploads/:filename` is the single unauthenticated
  route. Uploads are magic-byte sniffed (whitelist `png/jpeg/webp/gif`), capped at 5 MB,
  stored under a server-generated UUID v4 filename with the extension derived from the
  sniffed type; the static route enforces
  `^[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$`, serves image bytes only, and has no
  directory listing (`BR-QB-015`/`017`, `RISK-QB-002`). Raw HTML and `javascript:` URLs in
  content render as escaped text, never execute (`RISK-QB-003`).
- **No student DTO / route.** There is no student-facing DTO (it would leak answers,
  `BR-QB-017`) and no student web route or link; the three `/teacher/questions*` routes
  sit behind `RoleGuard([TEACHER])` (`RISK-QB-012`). Request bodies for question routes are
  never logged.

---

## Web surface

- `/teacher/questions` — table + filters + delete dialog (`QuestionTable`,
  `QuestionFilters`, `DeleteQuestionDialog`); URL query is the source of truth, filter
  change resets `page` to 1.
- `/teacher/questions/new` and `/teacher/questions/:id/edit` — one `QuestionEditor` with
  five mutually-exclusive type bodies; type change prompts a confirmation and resets
  type-specific answers.
- Shared `RichContentRenderer`: `$…$`/`$$…$$` → KaTeX (with MathML), fenced code →
  escaped `<pre><code>`, images only from the `/uploads/` pattern, everything else
  escaped.

---

## Downstream handover — RISK-QB-005

This story hard-deletes questions and has no exam tables, so nothing references a question
yet. The risk is **downstream** and cannot be closed here; it is a documented contract
(ADR-QB-06, `data-model.md` §7, `baseline.md` §10.4):

- **`US-EXAM-001`** must either **snapshot question content into its own `ExamQuestion`
  rows**, or add a **`Restrict`/`NoAction` FK** from exam rows to `Question`. A bare FK to
  a hard-deleted question would break the exam.
- **`US-ATT-001`** must reuse **`BR-QB-019`** (normalization: NFC → trim → collapse
  whitespace → lowercase) for fill-blank grading and **`ASM-BACKLOG-01`** (case/whitespace
  normalized, per-pair matching scoring) for matching grading. This story stores the
  normalized keys but does not grade.
- `US-QB-002` (import) must call the same validation rules, not a parallel parser.

---

## Verification

| Gate | Result |
| :-- | :-- |
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| Unit / integration (Vitest) | 230 API + 92 web tests pass |
| `prisma migrate status` | 4 migrations applied, schema current |
| Playwright `e2e/questions.spec.ts` | 3 passed against real API + DB |
| Build | API compiled with `tsc`; web built into a temp `outDir` (only a non-blocking 583 kB KaTeX chunk warning) |
| Code review | Round 1 CONDITIONAL APPROVE → Round 2 PASS — zero Critical |
| UI/UX review | WARN — zero Critical |
| 5 000-row list p95 (`NFR-QB-001`) | 8.3 ms (median 5.5 ms, 30 requests) — well under 400 ms |

The sandbox blocks bulk deletion of `dist` / `test-results`, so the API was compiled with
`tsc` and the web built into a temporary `outDir` instead of a clean `dist`; CI is
unaffected. Index coverage for the list/filter path was verified, then a 5 000-row
benchmark was run against real Postgres with the benchmark rows deleted afterwards.
Test plan: `.specify/features/question-bank-core/test-plan.md`.

---

## Follow-up debt (CHANGELOG.md `[Unreleased]`)

No baseline version bump — these are implementation follow-ups, not scope changes. Review
verdicts were CONDITIONAL APPROVE (code) and WARN (UI/UX), zero Critical.

- `REL-002` — `q` uses Prisma `contains`, so `%` and `_` are treated as SQL LIKE wildcards.
  All queries remain owner-scoped, so this is a search-precision issue, not a leak; fix by
  escaping with raw SQL or a trigram index before exposing search to untrusted bulk input.
- UI — the type `<select>` fires a confirmation per arrow-key step when answers are
  present; replace with a dedicated "Đổi dạng" commit button or an `onBlur`-committed
  picker.
- `RISK-QB-008` — KaTeX is bundled eagerly; the web chunk is 583 kB (171 kB gzip) and
  students download a teacher-only feature; lazy-load the editor route or dynamically
  import `katex` if the bundle budget tightens.
- UI — the table skeleton uses three stacked bars instead of a table-shaped row.

Known recorded constraints: public UUID image URLs (`RISK-QB-002`), accent-sensitive
search (`OBS-02`, no `unaccent`), and the hard-delete snapshot/restrict obligation
(`RISK-QB-005`, see above).

---

## Decisions & references

- `.specify/features/question-bank-core/decisions.md` — locked answers (`ASM-QB-001…003`,
  `ASM-BACKLOG-01`, `ADR-0005`) and gate authorization.
- `.specify/features/question-bank-core/plan.md` — ADR-QB-01…07 (transaction, repository
  port, uploads, renderer, index strategy).
- `.specify/features/question-bank-core/contracts/` — copy-ready DTOs, endpoint and error
  definitions.
- `.specify/features/question-bank-core/CHANGELOG.md` — version history and the
  `[Unreleased]` review debt above.
- `docs/features/README.md` — feature documentation index.
