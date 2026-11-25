# Sprint 0 — Project Setup & Architecture

> **Trạng thái:** **DONE — 8/8 quyết định chốt 2026-11-25; 12/12 đầu việc verified cùng ngày.**
> **Liên kết:** [PRODUCT_BACKLOG_ROADMAP.md](./PRODUCT_BACKLOG_ROADMAP.md) · [CONTEXT.md](../CONTEXT.md) · [adr/](../adr/)
> **Cập nhật:** 2026-11-25

---

## 1. Mục tiêu Sprint

Đưa repo từ trạng thái **"chỉ có scaffolding workflow"** sang **"sẵn sàng bốc `US-AUTH-001` ngay"**: có git, có toolchain chạy được, có kiến trúc & quy ước được ghi thành ADR, có CI baseline xanh, và mọi business rule chặn Sprint 1 đã có quyết định.

**Success statement (Definition of Sprint Success):**
> Một dev mới clone repo → `pnpm install` → `docker compose up -d db` → `pnpm test` xanh trong **≤ 15 phút**, và `/continue` bốc được `US-AUTH-001` mà không gặp cổng `Blocked`.

---

## 2. Phạm vi

### In scope

| Nhóm | Đầu việc |
| :--- | :--- |
| Khảo sát yêu cầu | Trace AC Sprint 1 về brief; phân loại 8 `ASM-BACKLOG-*`; chốt 6 rule chặn Sprint 1 |
| Môi trường | `git init`, Node/pnpm pin, Docker Compose PostgreSQL 16, `.env.example`, editorconfig |
| Khung kiến trúc | ADR-0003/0004/0005, module boundaries, error model, server-clock invariant |
| Cấu trúc thư mục | Monorepo `apps/api`, `apps/web`, `packages/shared`, `docs/`, `.specify/features/` |
| Quy ước code | TS strict, ESLint/Prettier, naming theo `CONTEXT.md`, DTO validation, test layout |
| CI/CD cơ bản | GitHub Actions PR gate: lint → typecheck → prisma validate → unit test → build → Playwright smoke |

### Out of scope

- Code nghiệp vụ của bất kỳ `US-*` nào (Sprint 1 trở đi).
- Deployproduction, domain, secret thật (`ASM-BACKLOG-07` — Go-Live).
- Admin panel, Kahoot, AI, webcam, export, notification, gamification (`[~]`).
- `git add` / `git commit` / `git push` tự động — chỉ thực hiện qua `/command-git-push` khi bạn lệnh.

---

## 3. Pre-flight findings (đã khảo sát 2026-11-25)

| Hạng mục | Hiện trạng | Hệ quả cho Sprint 0 |
| :--- | :--- | :--- |
| Git | **Chưa có `.git`** (`git status` → exit 128) | Bỏ qua Step 0 fetch/rebase của `/continue`; cần `git init` ở S0-02 |
| Manifests | Không có `package.json`, `pnpm-lock.yaml`, `tsconfig.json` | Chưa skill/rule nào của catalog được activate; S0-03 sẽ kích hoạt `typescript-patterns`, `react-rules`, `prisma-patterns` |
| `.github/` | Chỉ có `prompts/*` + `copilot-instructions.md`; **không có `workflows/`** | S0-11 tạo workflow đầu tiên |
| Quy ước sẵn | `.cursorrules`, `.windsurfrules`, `CLAUDE.md`, `GEMINI.md` đều trỏ `AGENTS.md` làm SSoT | Không viết rule trùng; chỉ bổ sung `docs/conventions.md` |
| Framework | `CONTEXT.md` (17 terms + ASM-01..11), `adr/` (0001, 0002, ADR-001) | S0-05 tiếp tục numbering từ `0003` |
| Worktree | Sạch theo nghĩa không có code app; mọi file framework đang nằm ngoài git (local mode) | Giữ nguyên `.gitignore`, không commit workflow files |

---

## 4. Work Breakdown & Priority

| ID | Đầu việc | Priority | Depends-on | Effort | Artifact chính |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **S0-01** | Khảo sát yêu cầu & ASM triage | **P0** | — | S | `docs/sprint-0/requirements-survey.md` |
| **S0-02** | Bootstrap git repository | **P0** | S0-01 | S | `.git/`, branch `main` |
| **S0-03** | Pin toolchain & workspace scripts | **P0** | S0-02 | S | `package.json`, `pnpm-workspace.yaml`, `.nvmrc` |
| **S0-04** | Môi trường dev & PostgreSQL | **P0** | S0-03 | M | `docker-compose.yml`, `.env.example` |
| **S0-05** | Khung kiến trúc (ADR 0003–0005) | **P0** | S0-01 | M | `adr/0003..0005` |
| **S0-06** | Cấu trúc thư mục & module skeleton | **P0** | S0-05 | M | `apps/`, `packages/shared/`, barrels |
| **S0-07** | Base config Backend (NestJS/Prisma) | P1 | S0-06 | M | `apps/api/src/main.ts`, health endpoint |
| **S0-08** | Base config Frontend (React/Vite/shadcn) | P1 | S0-06 | M | `apps/web/src/main.tsx`, app shell |
| **S0-09** | Quy ước code & linting | P1 | S0-03, S0-06 | S | `docs/conventions.md`, eslint/prettier configs |
| **S0-10** | Test harness (Vitest + Playwright) | P1 | S0-07, S0-08 | M | `vitest.config.*`, `playwright.config.ts`, 1 smoke test |
| **S0-11** | CI baseline (GitHub Actions) | P2 | S0-09, S0-10 | M | `.github/workflows/ci.yml` |
| **S0-12** | Sprint DoD verification & handoff | **P0** | all above | S | Roadmap `SETUP-001..003` checked, handoff note |

**Thứ tự thực thi (dependency chain):**

```text
S0-01 ──► S0-02 ──► S0-03 ──► S0-04 ──┐
   │                                    │
   └────────► S0-05 ──► S0-06 ──┬───────┤
                                ├─► S0-07 ──┐
                                ├─► S0-08 ──┼──► S0-10 ──► S0-11 ──► S0-12
                                └──► S0-09 ─┘
```

S0-07 và S0-08 chạy song song được. S0-09 chạy song song với S0-07/S0-08 sau khi S0-06 xong.

---

## 5. Tiêu chí hoàn thành từng hạng mục

### S0-01 — Khảo sát yêu cầu & ASM triage `[P0]`

- [ ] Mọi AC của 5 story Sprint 1 được trace tới nguồn: brief §1–§2 hoặc câu trả lời grilling 2026-11-25; không có AC nào "treo".
- [ ] 8 `ASM-BACKLOG-01..08` được gán một trong ba trạng thái: `resolve-in-S0` / `defer-to-story` / `already-covered`, kèm lý do.
- [ ] 6 rule chặn Sprint 1 (`01`, `02`, `04`, `05`, `06`, `08`) có **decision slot** + recommended option (xem §8).
- [ ] Không có business rule mới tự sinh; mọi cái mới đều mang id `ASM-S0-NN`.

### S0-02 — Bootstrap git `[P0]`

- [ ] `git init` tại `/Users/vutuanhau/Dev/quiz`; `git status --short --branch` chạy thành công.
- [ ] Branch mặc định là `main`; chưa có commit nào do AI tạo.
- [ ] `.gitignore` giữ nguyên chế độ `local`: `.agents/`, `.specify/`, `adr/`, `CONTEXT.md`, `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules` vẫn bị ignore.
- [ ] Không chạy `git add` / `commit` / `push` — trừ khi có lệnh `/command-git-push`.

### S0-03 — Toolchain & workspace `[P0]`

- [ ] `.nvmrc` = `22` (LTS) và `engines.node >= 22` trong `package.json`.
- [ ] `packageManager: pnpm@9.x` + `engine-strict=true` trong `.npmrc` `ASM-S0-01`.
- [ ] `pnpm-workspace.yaml` khai báo `apps/*`, `packages/*`.
- [ ] Scripts root: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:up`, `db:migrate`.
- [ ] `rm -rf node_modules && pnpm install` từ sạch chạy thành công, sinh `pnpm-lock.yaml`.

### S0-04 — Môi trường dev & DB `[P0]`

- [ ] `docker-compose.yml` định nghĩa service `db` dùng `postgres:16`, port `5432`, named volume, `healthcheck` (`pg_isready`).
- [ ] `.env.example` có `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `OAUTH_GOOGLE_CLIENT_ID/SECRET`; **không có giá trị thật**.
- [ ] `docker compose up -d db` → service đạt trạng thái `healthy`; kết nối bằng `psql` được.
- [ ] Thiếu biến bắt buộc → app fail-fast khi boot (không chạy với default ngầm).

### S0-05 — Khung kiến trúc `[P0]`

- [ ] `adr/0003-application-topology.md`: monorepo pnpm, `apps/api` (NestJS modular monolith), `apps/web` (React/Vite), `packages/shared` (DTO/enum dùng chung) — Status `Accepted` sau khi bạn duyệt.
- [ ] `adr/0004-server-authoritative-exam-clock.md`: deadline lấy từ `Exam` config ở server; client chỉ render; nộp bài sau deadline bị từ chối; lưu `ServerClock` vào `CONTEXT.md` glossary link.
- [ ] `adr/0005-auth-rbac-boundary.md`: 2 role Teacher/Student; scope theo `Classroom`; không có Admin ở MVP; rule cấp quyền GV theo `ASM-BACKLOG-06`.
- [ ] Error model thống nhất: `{ code, message, details? }` + global exception filter; không lộ stack trace production.
- [ ] Mọi ADR dùng `adr/adr-template.md`, không sửa ADR đã Accepted.

### S0-06 — Cấu trúc thư mục `[P0]`

```text
apps/
  api/src/
    main.ts  app.module.ts
    auth/  classroom/  questions/  exams/  attempts/  analytics/
    common/ (filters, guards, interceptors, decorators)
    prisma/ (PrismaModule, schema.prisma, migrations/)
  web/src/
    main.tsx  app/ (router, providers)
    components/ui/ (shadcn)
    features/ (auth, classroom, questions, exams, attempts, analytics)
    stores/  lib/ (api client, utils)
packages/shared/src/
  dto/  enums/  index.ts
docs/
  features/  user-guides/  sprint-0/  conventions.md
.specify/features/   (trống, chờ /continue)
```

- [ ] Cây thư mục trên tồn tại; mỗi package có `index.ts` barrel (không có file rác `.gitkeep` khi đã có barrel).
- [ ] `packages/shared` chỉ chứa type/DTO/enum — **zero import** từ `apps/*` (kiểm tra bằng dependency-cruiser hoặc grep).
- [ ] `pnpm -r exec node -e "console.log('ok')"` chạy qua cả 3 workspace.

### S0-07 — Base config Backend `[P1]`

- [ ] NestJS boot được; `GET /health` → 200 kèm trạng thái kết nối DB.
- [ ] `ConfigModule` validate env bằng schema; sai kiểu → fail-fast có message rõ.
- [ ] `PrismaModule` khởi tạo client; `prisma validate` + `prisma migrate dev` chạy được.
- [ ] Global exception filter + ValidationPipe(`whitelist: true`, `transform: true`) active.
- [ ] JWT guard skeleton + RBAC decorator skeleton (chưa gắn business logic).

### S0-08 — Base config Frontend `[P1]`

- [ ] Vite + React + TS strict chạy `pnpm --filter web dev`, render app shell không console error.
- [ ] Tailwind + shadcn/ui init; 1 component mẫu (Button) render đúng.
- [ ] API client có baseURL từ `VITE_API_URL` + intercept refresh token skeleton.
- [ ] Router có placeholder route guard cho Teacher/Student; ErrorBoundary bọc root.

### S0-09 — Quy ước code `[P1]`

- [ ] `docs/conventions.md` ghi rõ: PascalCase type, camelCase biến/hàm, kebab-case file/thư mục, env SCREAMING_SNAKE — **khớp 100% identifier trong `CONTEXT.md`**.
- [ ] ESLint (TS + react-hooks) + Prettier + `.editorconfig`; `pnpm lint` xanh trên scaffold.
- [ ] Backend DTO dùng `class-validator`; frontend form dùng `zod`; không nhận object thô từ boundary.
- [ ] Giới hạn từ `AGENTS.md`: file < 800 dòng, function < 50 dòng, nesting < 3; immutability, return copy.
- [ ] Test convention: `*.spec.ts` colocates, integration ở `apps/api/test/`, E2E ở `apps/web/e2e/`.

### S0-10 — Test harness `[P1]`

- [ ] Vitest config cho `api` và `web`; `pnpm test` chạy both workspace.
- [ ] Ít nhất 1 unit test thật (không phải `expect(true).toBe(true)`) cho error filter hoặc config validation.
- [ ] Playwright config + 1 smoke spec: mở app shell → gọi `/health` → assert response 200.
- [ ] `pnpm test:e2e` xanh khi chạy local với `db` healthy.

### S0-11 — CI baseline `[P2]`

- [ ] `.github/workflows/ci.yml` trigger trên `pull_request` và `push` tới `main`.
- [ ] Job order: `install --frozen-lockfile` → `lint` → `typecheck` → `prisma validate` → `test` → `build` → `test:e2e` (với service Postgres).
- [ ] Không có secret hardcoded; dùng `secrets.*`; **không có deploy job** cho tới khi resolve `ASM-BACKLOG-07`.
- [ ] YAML parse thành công; danh sách job được ghi vào `docs/sprint-0/ci-baseline.md`.
- [ ] Lưu ý: không thể verify remote run cho tới khi bạn commit/push — acceptance ở mức config hợp lệ + chạy local tương đương.

### S0-12 — DoD & handoff `[P0]`

- [ ] Tất cả item P0/P1 ở trạng thái done; zero Critical finding.
- [ ] Roadmap `SETUP-001..003` được đánh `[x]` **chỉ sau khi verify** (không đánh dấu giả).
- [ ] `docs/sprint-0/README.md` ghi command khởi động + troubleshooting 3 lỗi thường gặp.
- [ ] `/continue` bốc `US-AUTH-001` mà không dính dependency gate (`Depends-on: _(none)_`).

---

## 6. Definition of Done — Sprint 0

1. Mọi checklist §5 của item **P0 + P1** được verify bằng lệnh chạy thật, không phải bằng nhận định.
2. `pnpm install` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` đều exit 0.
3. Zero secret thật trong repo; `.env.example` chỉ chứa placeholder.
4. ADR 0003–0005 có Status `Accepted` (do bạn duyệt) và được link từ `CONTEXT.md`.
5. Không có `git add/commit/push` do AI thực hiện.
6. 6 decision slot ở §8 đã có answer; nếu chưa, story tương ứng mang `[!]` và `/continue` sẽ dừng đúng luật.

---

## 7. Rủi ro & guardrails

| Rủi ro | Guardrail |
| :--- | :--- |
| AI tự commit/push | Chỉ `/command-git-push` được phép; mọi lệnh git khác trong sprint này dừng ở `git init` + `git status` |
| Over-engineering scaffold | Ladder: `packages/shared` chỉ khi có DTO dùng chung thật (có — question discriminated union); không thêm auth abstraction khi chưa có story |
| Baseline gate bị bỏ qua | Sprint 0 là setup, không phải Tier 3 feature; ngay khi sang `US-QB-001` (L) / `US-ATT-001` (XL) → baseline SIGNED-OFF bắt buộc |
| Skill/catalog lạc hậu | Sau S0-03 chạy lại catalog detection để activate `typescript-patterns`, `react-rules`, `prisma-patterns`, `postgres-patterns` |
| WorkBuddy không đăng ký subagent UAW tên | Dùng agent type built-in + `model=` rõ ràng, nhúng persona UAW vào prompt (theo phát hiện 2026-11-25) |

---

## 8. Quyết định — ĐÃ CHỐT 2026-11-25 (8/8 theo recommended)

| Slot | Liên quan | Quyết định | Ghi chú thực thi |
| :--- | :--- | :--- | :--- |
| **ASM-S0-01** ✅ | S0-03 | `pnpm 9` | Máy có pnpm 11.21.0 global; pin `packageManager: pnpm@9.15.9` qua corepack 0.34.6 (đã có sẵn, trả `9.15.9`). Dùng `corepack pnpm` cho mọi lệnh. |
| **ASM-S0-02** ✅ | S0-05 | Monorepo pnpm | `apps/api`, `apps/web`, `packages/shared` — một lockfile, một lần test. |
| **ASM-S0-03** ✅ | S0-11 | GitHub Actions | `.github/workflows/ci.yml`. |
| **ASM-BACKLOG-01** ✅ | US-QB-001, US-ATT-001 | Normalize hoa/thường + khoảng trắng; ghép cặp tính từng cặp | Rule chấm điểm vào `baseline.md` của story tương ứng. |
| **ASM-BACKLOG-02** ✅ | US-QB-001 | KaTeX | Dùng `katex` + `react-katex` ở frontend, CSS `katex/dist/katex.min.css`. |
| **ASM-BACKLOG-04** ✅ | US-AUTH-001 | Google only | `OAUTH_GOOGLE_CLIENT_ID/SECRET` trong `.env`; provider khác defer. |
| **ASM-BACKLOG-05** ✅ | US-ATT-001 | Cảnh báo lần 2, tự nộp lần 3 | Hằng số `VIOLATION_WARN_AT=2`, `VIOLATION_SUBMIT_AT=3` (config được, không hardcode ở service). |
| **ASM-BACKLOG-06** ✅ | US-AUTH-001 | Mã giáo viên pre-seed, nhập lúc đăng ký | Seed script tạo `TEACHER_CODE`; register DTO có field optional `teacherCode`. |

> `ASM-BACKLOG-03` (template import), `07` (deploy target), `08` (default cấu hình đề) được **defer** tới story tương ứng / Go-Live; không chặn Sprint 0.

---

## 8b. Execution result (2026-11-25)

| Gate | Kết quả |
| :--- | :--- |
| `pnpm install` (corepack 9.15.9) | ✅ 589 packages, lockfile created |
| `prisma validate` | ✅ schema valid |
| `prisma migrate deploy` | ✅ baseline `20261125070502_sprint0_baseline` applied |
| `pnpm lint` | ✅ 3/3 workspaces |
| `pnpm typecheck` | ✅ 3/3 workspaces |
| `pnpm test` | ✅ 6 tests passed (api 5, web 1, shared 0) |
| `pnpm build` | ✅ api + web (vite 29 modules) |
| `docker compose up -d db` | ✅ container `quiz-postgres` healthy |
| `GET /health` (live) | ✅ `{"status":"ok","database":"connected"}` |
| `pnpm test:e2e` | ✅ 1/1 Playwright chromium smoke |

**Issues hit & resolved during execution (recorded in `docs/sprint-0/README.md` troubleshooting):**

1. `ERR_PNPM_EIO` on install — corrupted partial `node_modules`; fixed by clean reinstall.
2. Nested `pnpm` invoked global v11.21.0 — root scripts changed to `corepack pnpm`.
3. Prisma `validate` missing env — `apps/api/.env` added (gitignored).
4. `class-validator` missing at Nest boot — added `class-validator` + `class-transformer`.
5. Vite `504 Outdated Optimize Dep` after reinstall — dev server restarted.
6. Docker daemon not running — started Docker Desktop.
7. Strict TS `override` modifiers + unused test destructure — fixed in source.

**No git writes performed** beyond `git init -b main`. Working tree has untracked files only; user commits via `/command-git-push`.

---

## 9. Handoff sang Sprint 1

Sau S0-12, story đầu tiên là **`US-AUTH-001`** (Effort M, single-session, `Depends-on: none`) → theo routing của `/continue`: **Tier 2 Lean Task**, đọc AC + Tasks từ roadmap, seed `test-plan.md`, vào TDD — không cần BA ceremony 8 stage.
