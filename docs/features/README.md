# Feature documentation index

> Canonical index of feature tech READMEs. Per the roadmap Definition of Done, every User Story ships `docs/features/<slug>/README.md`; register it here when it lands.
> **Status here reflects documentation presence, not the roadmap checkbox state.** The roadmap (`docs/PRODUCT_BACKLOG_ROADMAP.md`) is the source of truth for story progress; the index is the source of truth for where the tech docs live.

## Features

| Story | Slug | Sprint / Epic | Priority | Tech README | Status |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `US-AUTH-001` | `auth-role-foundation` | Sprint 1 · EPIC-01 | Must-Have (P0) | [README](./auth-role-foundation/README.md) | Documented |
| `US-CLS-001` | `classroom-join-code` | Sprint 1 · EPIC-02 | Must-Have (P0) | [README](./classroom-join-code/README.md) | Documented |
| `US-QB-001` | `question-bank-core` | Sprint 1 · EPIC-02 | Must-Have (P0) | [README](./question-bank-core/README.md) | Documented |
| `US-EXAM-001` | `exam-authoring-assignment` | Sprint 1 · EPIC-03 | Must-Have (P0) | [README](./exam-authoring-assignment/README.md) | Documented |
| `US-ATT-001` | `timed-attempt-grading` | Sprint 1 · EPIC-04 | Must-Have (P0) | — | Pending |
| `US-QB-002` | `question-import-rich-content` | Sprint 2 · EPIC-02 | Should-Have (P1) | — | Pending |
| `US-EXAM-002` | `exam-auto-generation-matrix` | Sprint 2 · EPIC-03 | Should-Have (P1) | — | Pending |
| `US-ANA-001` | `teacher-analytics` | Sprint 2 · EPIC-05 | Should-Have (P1) | — | Pending |
| `US-PRA-001` | `practice-mode` | Sprint 2 · EPIC-05 | Could-Have (P2) | — | Pending |
| `US-ANA-002` | `student-progress-analytics` | Sprint 2 · EPIC-05 | Could-Have (P2) | — | Pending |

Dependency chain (Sprint 1): `US-AUTH-001` → `US-CLS-001` + `US-QB-001` → `US-EXAM-001` → `US-ATT-001`.

Not yet indexed (no slug / no per-feature README in the roadmap): Sprint 0 setup (`docs/sprint-0/README.md`), Go-Live stories `US-DEPLOY-01`–`05`, and the `[~]` Future Horizons placeholders.

## Adding a feature README

1. Create `docs/features/<slug>/README.md` (kebab-case slug — see `docs/conventions.md`).
2. Cover: **scope** (in/out), **API contract**, **data model**, **security decisions**, **test evidence**, and **follow-up ASMs**. See [`auth-role-foundation/README.md`](./auth-role-foundation/README.md) as the reference shape.
3. Link it from the table above and, where the DoD requires, add `docs/user-guides/<slug>.md` with real Playwright screenshots.
4. Keep the roadmap and `.specify/**` artifacts as the sources of truth; do not duplicate decisions into the README that belong in `decisions.md` / ADRs.

## Related docs

- `docs/conventions.md` — naming, TypeScript, boundaries, UI, testing, git rules.
- `docs/PRODUCT_BACKLOG_ROADMAP.md` — epic matrix, AC, DoD, ASM log.
- `docs/sprint-0/README.md` — quick start, commands, gates, troubleshooting.
