---
project: "Web thi trắc nghiệm online"
tech-stack:
  language: "TypeScript"
  backend: "NestJS + Prisma ORM"
  frontend: "React + Vite + shadcn/ui + Tailwind CSS + Zustand"
  database: "PostgreSQL 16"
  infra: "Docker Compose (local) / production deploy target TBD (ASM-BACKLOG-07)"
  test: "Vitest + Playwright"
git-mode: "local"
schema-version: "1.2"
---

# 🗺️ Product Backlog & Execution Roadmap

> **Sản phẩm:** Web thi trắc nghiệm online — Giáo viên ra đề, học sinh làm bài có giới hạn thời gian, chấm điểm tự động.
> **Cập nhật lần cuối:** 2026-11-25
> **Nguồn scope:** `/Users/vutuanhau/Downloads/chuc-nang-web-thi-trac-nghiem.md` + xác nhận grilling 2026-11-25.
> **Trạng thái tài liệu:** Living Document — Quản lý tiến độ và đồng bộ với `/command-continue-project`.
>
> **Ký hiệu trạng thái:**
>
> - `[x]` **Hoàn thành (Done)** — Đã hoàn thiện code, test pass và tài liệu kỹ thuật/hướng dẫn đầy đủ.
> - `[/]` **Đang triển khai (In Progress)** — `/continue` sẽ ưu tiên tiếp tục xử lý cho xong.
> - `[ ]` **Chưa triển khai (To Do / Backlog)** — Đã có đặc tả, sẵn sàng bốc theo thứ tự từ trên xuống.
> - `[!]` **Bị chặn / Cần làm rõ (Blocked / Review Needed)** — Cần quyết định kiến trúc hoặc phụ thuộc module khác.
> - `[~]` **Dự kiến dài hạn (Deferred / Future Phase)** — Tính năng đã ghi nhận nhưng chủ động hoãn lại sang phiên bản sau.

<!--
ASM-BACKLOG-01: RESOLVED 2026-11-25 — normalize hoa/thường + khoảng trắng; ghép cặp tính từng cặp. Rule vào baseline của US-QB-001/US-ATT-001.
ASM-BACKLOG-02: RESOLVED 2026-11-25 — KaTeX (katex + react-katex, CSS katex.min.css).
ASM-BACKLOG-03: Template import Excel/Word — cột, kiểu dữ liệu, quy ước đáp án đúng chưa định nghĩa. Baseline tại US-QB-002.
ASM-BACKLOG-04: RESOLVED 2026-11-25 — Google OAuth only cho MVP.
ASM-BACKLOG-05: RESOLVED 2026-11-25 — cảnh báo lần 2, tự nộp lần 3 (VIOLATION_WARN_AT=2, VIOLATION_SUBMIT_AT=3).
ASM-BACKLOG-06: RESOLVED 2026-11-25 — mã giáo viên pre-seed, nhập lúc đăng ký (TEACHER_CODE).
ASM-BACKLOG-07: Môi trường production (hosting, domain, CI) chưa chọn — defer tới Go-Live sprint.
ASM-BACKLOG-08: Số lượt làm tối đa và điểm trừ mặc định khi tạo đề — để GV tự cấu hình, không có default cố định.
Decision log: docs/SPRINT_0_PLAN.md section 8 (8/8 locked 2026-11-25).
-->

---

## 🚫 Explicitly Out of Scope — Won't-Have for MVP

> **CRITICAL:** Scope fence bắt buộc. Mọi ý tưởng ngoài fence này chỉ được ghi ở Future Horizons `[~]`.

- **NO** native mobile app (iOS/Android) và **NO** PWA / offline mode — web-only (Q1).
- **NO** vai trò Quản trị viên, admin panel, quản lý user, quản lý danh mục môn học, thống kê toàn hệ thống — dời Phase 2 (ASM-07, user chọn phương án 3).
- **NO** billing / thanh toán / Stripe — free MVP (Q5).
- **NO** nguồn nội dung từ API bên ngoài và **NO** AI sinh câu hỏi / AI giải thích (Q3).
- **NO** thi trực tiếp kiểu Kahoot, bảng xếp hạng realtime (brief §3.1).
- **NO** chụp ảnh webcam ngẫu nhiên (brief §2 — nâng cao).
- **NO** xuất Excel / xuất PDF (brief §3.2).
- **NO** thông báo đề mới / nhắc hết hạn (brief §3.5).
- **NO** gamification: huy hiệu, streak, leaderboard (brief §3.6).
- **NO** multi-tenancy, enterprise SSO (SAML/LDAP/AD), real-time collaborative editing.

---

## 📊 Bảng Ma Trận Ưu Tiên MoSCoW & RICE Score

| Mã Epic | Nghiệp vụ / Tính năng | Phân loại MoSCoW | RICE Score | Mức ưu tiên | Sprint khuyến nghị |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **EPIC-01** | Auth & Role Foundation — đăng ký/đăng nhập/OAuth, 2 vai trò, profile | **Must Have** | 9.0 | **P0 (Critical)** | Sprint 1 |
| **EPIC-02** | Classroom & Question Bank — lớp học, mã lớp, 5 dạng câu, import | **Must Have** | 8.5 | **P0 (Core)** | Sprint 1 / 2 |
| **EPIC-03** | Exam Authoring & Assignment — tạo đề, cấu hình, sinh theo ma trận, giao lớp | **Must Have** | 8.0 | **P0 (Core)** | Sprint 1 / 2 |
| **EPIC-04** | Attempt, Grading & Integrity — làm bài, giờ máy chủ, chống gian lận, chấm điểm | **Must Have** | 9.5 | **P0 (Core USP)** | Sprint 1 |
| **EPIC-05** | Analytics & Practice — thống kê GV, tiến bộ HS, chế độ luyện tập | **Could Have** | 5.5 | **P2 (Medium)** | Sprint 2 |

> Công thức RICE dùng: `(Reach × Impact × Confidence) / Effort`. Điểm là ước tính sơ bộ, cập nhật khi có dữ liệu thật.

---

## 🗺️ Lộ Trình Phát Hành (Release Roadmap)

```text
[ Sprint 0 - Setup & Architecture ] ──► [ TO DO 📋 ]
  ├── SETUP-001: Git init + cấu hình .agents/.specify, Git mode = local
  ├── SETUP-002: Docker Compose (PostgreSQL 16) + scaffold NestJS/React/Vite + Prisma
  └── SETUP-003: CI lint + Vitest + Playwright smoke skeleton

[ Sprint 1 - MVP Core (P0) ] ──► [ TO DO 📋 ]
  ├── US-AUTH-001: Đăng ký/đăng nhập (Email+Password + OAuth) & 2 vai trò
  ├── US-CLS-001: Tạo lớp, mã lớp, học sinh tham gia & duyệt/xóa
  ├── US-QB-001:  Ngân hàng câu hỏi — 5 dạng, phân loại, lời giải
  ├── US-EXAM-001: Tạo đề thủ công, cấu hình & giao cho lớp
  └── US-ATT-001: Làm bài có giờ máy chủ, chống gian lận, tự lưu & chấm điểm

[ Sprint 2 - Feature Expansion (P1/P2) ] ──► [ TO DO 📋 ]
  ├── US-QB-002:   Import câu hỏi Excel/Word + nội dung phong phú
  ├── US-EXAM-002: Sinh đề tự động theo ma trận
  ├── US-ANA-001:  Thống kê & phân tích đề cho giáo viên
  ├── US-PRA-001:  Chế độ luyện tập, feedback ngay
  └── US-ANA-002:  Biểu đồ tiến bộ & chủ đề yếu cho học sinh

[ Future Horizons - [~] Deferred ] ──► [ BACKLOG 🔮 ]
  ├── Admin panel, quản lý user, danh mục môn học, thống kê toàn hệ thống
  ├── Kahoot live, AI sinh đề, webcam, export Excel/PDF
  └── Notification, gamification, billing, PWA

[ Sprint Go-Live - Production Hardening ] ──► [ PLANNED 🚀 ]
  ├── US-DEPLOY-01: Security Hardening (SEC-01 → SEC-03)
  ├── US-DEPLOY-02: Cloud Database & Migration
  ├── US-DEPLOY-03: Backend API Deploy + Health Check
  ├── US-DEPLOY-04: Frontend Deploy + SPA Routing Fallback
  └── US-DEPLOY-05: End-to-End Smoke Test trên production URL
```

---

## ⚙️ Sprint 0: Project Setup & Architecture (Không phải User Story)

> Sprint 0 là công việc setup một lần, không cần BA pipeline đầy đủ.
> Reproduce → Fix → Verify → Commit. Chưa có item nào được đánh dấu xong.
>
> **Chi tiết Sprint 0** (mục tiêu, phạm vi, 12 đầu việc, tiêu chí hoàn thành, thứ tự ưu tiên, decision slots): [`docs/SPRINT_0_PLAN.md`](./SPRINT_0_PLAN.md).

- [x] **SETUP-001**: `git init` trên `main` ✅, `.gitignore` chế độ `local` (workflow + `.env` + `node_modules` bị ignore), `CONTEXT.md` + `adr/0001..0005` seeded.
- [x] **SETUP-002**: Docker Compose PostgreSQL 16 `healthy`; scaffold NestJS (Prisma, config validation, exception filter, RBAC guard skeleton, `/health`) + React/Vite (Tailwind, shadcn Button, Zustand, ErrorBoundary, RoleGuard skeleton). Migration baseline `20261125070502_sprint0_baseline` applied.
- [x] **SETUP-003**: `.github/workflows/ci.yml` (install → quality → e2e) + local gates xanh: lint, typecheck, 6 unit tests, build, Playwright smoke, `/health` 200 + DB connected. Chi tiết: `docs/sprint-0/README.md`.

---

## 🎯 Sprint 1: MVP Core — Ra đề, làm bài, chấm điểm

> **Mục tiêu Sprint:** Giáo viên tạo được đề và giao cho lớp; học sinh làm bài trong giới hạn thời gian, nộp bài và nhận điểm tự động — không cần Admin, không cần module mở rộng.

- [/] **US-AUTH-001**: Đăng ký, đăng nhập (Email+Password + OAuth), quên mật khẩu & phân quyền 2 vai trò
  - **Slug:** `auth-role-foundation`
  - **Effort:** M
  - **Context-budget:** single-session
  - **Priority:** Must-Have (P0)
  - **Depends-on:** _(none)_
  - **Blocks:** `US-CLS-001`, `US-QB-001`, `US-EXAM-001`, `US-ATT-001`
  - **Mô tả:** Giáo viên và học sinh có tài khoản riêng, đăng nhập được bằng mật khẩu hoặc OAuth, và chỉ thấy chức năng phù hợp với vai trò của mình.
  - **Acceptance Criteria (AC):**
    - [x] Người dùng đăng ký bằng email/password và đăng nhập được ngay sau đó.
    - [ ] Người dùng đăng nhập được bằng tài khoản OAuth `ASM-BACKLOG-04`. _(Code hoàn thành + unit test; chưa chạy E2E Google thật — cần tài khoản test và consent. Xem ghi chú dưới.)_
    - [x] Người dùng quên mật khẩu yêu cầu đặt lại và dùng liên kết đặt lại thành công trong thời hạn.
    - [x] Hệ thống chỉ có 2 vai trò Giáo viên / Học sinh; người dùng không tự cấp được quyền Quản trị viên.
    - [x] Người dùng cập nhật thông tin cá nhân và đổi mật khẩu; mật khẩu cũ không còn sử dụng được.
    - [x] Sau khi đăng xuất, phiếu đăng nhập hết hiệu lực và trang yêu cầu đăng nhập từ chối truy cập.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [x] **Backend:** `POST /auth/register`, `/auth/login`, `/auth/oauth/google/url`, `/auth/oauth/google/callback`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/logout`, `/auth/refresh`, `GET/PATCH /auth/me`; DTO class-validator; Prisma `User`/`Role`/`RefreshToken`/`OAuthAccount`/`PasswordResetToken` + migration; JWT access/refresh; RBAC guard; băm mật khẩu; rule cấp quyền Giáo viên `ASM-BACKLOG-06`.
    - [x] **Frontend:** Trang Register/Login/Forgot/Reset + OAuth callback + Profile; route guard theo vai trò; form shadcn/ui + zod; Zustand auth store; xử lý refresh token.
  - **Trạng thái 2026-11-25:** 5/6 AC verified (132 unit tests, 8 E2E pass). Chỉ còn AC OAuth: chạy lệnh opt-in `corepack pnpm --filter web test:e2e:google` với tài khoản Google test (`E2E_GOOGLE_EMAIL`, `E2E_GOOGLE_PASSWORD`) và client Google đã đăng ký redirect URI. **KHÔNG implement lại story này** khi `/continue` — chỉ chạy bước verify còn lại, sau đó chuyển `[x]`. Chi tiết: `.specify/features/auth-role-foundation/decisions.md`, `docs/features/auth-role-foundation/README.md`.
  - **Waiver 2026-11-26:** Người dùng chọn tạm thời bỏ qua bước verify Google E2E để triển khai story tiếp theo. Story này GIỮ NGUYÊN `[/]` — AC OAuth vẫn chưa verified; downstream được phép chạy theo quyết định người dùng. Cần chạy `test:e2e:google` và chuyển `[x]` trước Go-Live.
  - **Deliverables khi [x]:**
    - `.specify/features/auth-role-foundation/baseline.md` (SIGNED-OFF)
    - `docs/features/auth-role-foundation/README.md`
    - `docs/user-guides/auth-role-foundation.md` (ảnh Playwright thật)

- [x] **US-CLS-001**: Tạo lớp học, mã lớp & học sinh tham gia
  - **Slug:** `classroom-join-code`
  - **Effort:** M
  - **Context-budget:** single-session
  - **Priority:** Must-Have (P0)
  - **Depends-on:** `US-AUTH-001` _(waived 2026-11-26 cho Google E2E; code/auth đã sẵn sàng)_
  - **Blocks:** `US-EXAM-001`
  - **Mô tả:** Giáo viên tạo lớp và chia mã lớp; học sinh nhập mã để tham gia; giáo viên kiểm soát danh sách học sinh trong lớp của mình.
  - **Acceptance Criteria (AC):**
    - [x] Giáo viên tạo lớp và nhận một mã lớp duy nhất.
    - [x] Học sinh nhập mã lớp hợp lệ thì gửi yêu cầu tham gia và xuất hiện trong danh sách chờ duyệt.
    - [x] Giáo viên duyệt hoặc xóa học sinh khỏi lớp do mình tạo.
    - [x] Giáo viên chỉ thấy lớp mình tạo; học sinh chỉ thấy lớp mình đã tham gia.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [x] **Backend:** `POST/GET /classrooms`, `DELETE /classrooms/:id`, `POST /classrooms/:code/join`, `PATCH /classrooms/:id/enrollments/:userId/approve`, `DELETE .../enrollments/:userId`; Prisma `Classroom`/`Enrollment`/`ClassCode` + migration; generator mã unique; ownership guard; scope query theo `userId`.
    - [x] **Frontend:** `ClassroomList`, `CreateClassroomDialog`, trang `JoinByCode` với form validate, `StudentRoster` với nút duyệt/xóa, trạng thái chờ duyệt.
  - **Trạng thái 2026-11-26:** Hoàn thành. 165 unit tests (108 API + 57 web), build/lint/typecheck xanh, migration `20261126093000_add_classrooms` applied, Playwright `e2e/classrooms.spec.ts` pass (tạo lớp → join → duyệt → học sinh thấy lớp). Code review + UI review: zero Critical, mọi finding đã xử lý.
  - **Deliverables khi [x]:**
    - `.specify/features/classroom-join-code/contract.md` + `decisions.md` + `test-plan.md` _(Tier 2 lean bypass — không dùng baseline.md SIGNED-OFF)_
    - `docs/features/classroom-join-code/README.md`
    - `docs/user-guides/classroom-join-code.md` (ảnh Playwright thật)

- [ ] **US-QB-001**: Ngân hàng câu hỏi — 5 dạng, phân loại & lời giải
  - **Slug:** `question-bank-core`
  - **Effort:** L
  - **Context-budget:** multi-session
  - **Priority:** Must-Have (P0)
  - **Depends-on:** `US-AUTH-001` _(waived 2026-11-26 cho Google E2E; code/auth đã sẵn sàng)_
  - **Blocks:** `US-EXAM-001`, `US-QB-002`, `US-EXAM-002`, `US-PRA-001`
  - **Mô tả:** Giáo viên xây dựng và tái sử dụng kho câu hỏi được phân loại rõ ràng, đủ 5 dạng và có lời giải chi tiết.
  - **Acceptance Criteria (AC):**
    - [ ] Giáo viên thêm, sửa, xóa câu hỏi.
    - [ ] Hỗ trợ 5 dạng: một đáp án đúng, nhiều đáp án đúng, đúng/sai, điền từ vào chỗ trống, ghép cặp `ASM-BACKLOG-01`.
    - [ ] Câu hỏi được gắn môn học, chương và độ khó (dễ / trung bình / khó).
    - [ ] Giáo viên chèn được hình ảnh, công thức toán `ASM-BACKLOG-02` và đoạn code vào nội dung câu hỏi.
    - [ ] Mỗi câu có lời giải chi tiết và hiển thị đúng khi được phép.
    - [ ] Giáo viên lọc danh sách câu hỏi theo môn, chương, độ khó; học sinh không truy cập được ngân hàng câu hỏi.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `POST/GET/PATCH/DELETE /questions`; DTO discriminated union theo `questionType` + schema zod cho từng dạng; Prisma `Question`/`Option`/`MatchingPair`/`Subject`/`Chapter` + migration; RBAC teacher-only; endpoint upload asset; validate lời giải.
    - [ ] **Frontend:** `QuestionBankTable` với bộ lọc; `QuestionEditor` với 5 form riêng theo dạng; rich-text/MathJax/code block; dialog xóa có xác nhận; phân trang.
  - **Deliverables khi [x]:**
    - `.specify/features/question-bank-core/baseline.md` (SIGNED-OFF)
    - `docs/features/question-bank-core/README.md`

- [ ] **US-EXAM-001**: Tạo đề thủ công, cấu hình & giao cho lớp
  - **Slug:** `exam-authoring-assignment`
  - **Effort:** L
  - **Context-budget:** multi-session
  - **Priority:** Must-Have (P0)
  - **Depends-on:** `US-CLS-001`, `US-QB-001`
  - **Blocks:** `US-ATT-001`, `US-EXAM-002`
  - **Mô tả:** Giáo viên chọn câu từ ngân hàng để lập đề, thiết lập điều kiện làm bài và phát cho đúng lớp, với trạng thái đề rõ ràng.
  - **Acceptance Criteria (AC):**
    - [ ] Giáo viên tạo đề thủ công bằng cách chọn câu hỏi từ ngân hàng.
    - [ ] Giáo viên cài đặt thời gian làm bài, thời gian mở/đóng đề, số lần làm tối đa, mật khẩu vào đề, và cho phép/không cho phép xem đáp án sau khi nộp `ASM-BACKLOG-08`.
    - [ ] Giáo viên giao đề cho một hoặc nhiều lớp do mình quản lý.
    - [ ] Đề có 3 trạng thái: nháp / đang mở / đã đóng, và trạng thái điều khiển được việc học sinh thấy đề.
    - [ ] Học sinh chỉ thấy đề được giao cho lớp mình tham gia.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `POST/GET/PATCH/DELETE /exams`, `POST /exams/:id/assign`; DTO cấu hình + validate cửa sổ thời gian; Prisma `Exam`/`ExamQuestion`/`ExamAssignment`/`ExamStatus` + migration; state machine nháp→mở→đóng; băm mật khẩu đề; ownership guard; lọc đề theo lớp của học sinh.
    - [ ] **Frontend:** `ExamList`, `ExamBuilder` (question picker từ `US-QB-001`), `ExamSettings` form, `AssignToClassesDialog`, badge + hành động theo trạng thái, `StudentExamList` (sắp mở / đang mở / đã làm).
  - **Deliverables khi [x]:**
    - `.specify/features/exam-authoring-assignment/baseline.md` (SIGNED-OFF)
    - `docs/features/exam-authoring-assignment/README.md`

- [ ] **US-ATT-001**: Làm bài có giờ máy chủ, chống gian lận, tự lưu & chấm điểm
  - **Slug:** `timed-attempt-grading`
  - **Effort:** XL
  - **Context-budget:** multi-session
  - **Priority:** Must-Have (P0 — Core USP)
  - **Depends-on:** `US-EXAM-001`
  - **Blocks:** `US-ANA-001`, `US-ANA-002`
  - **Mô tả:** Học sinh làm bài trong một phiên được bảo vệ, nộp bài đúng hạn và nhận điểm chấm tự động kèm lời giải theo cấu hình của giáo viên.
  - **Acceptance Criteria (AC):**
    - [ ] Học sinh chỉ bắt đầu được đề trong cửa sổ mở, nhập đúng mật khẩu nếu có, và còn lượt làm.
    - [ ] Đồng hồ đếm ngược tính theo giờ máy chủ; hết giờ hệ thống tự nộp bài.
    - [ ] Bảng điều hướng cho thấy câu đã làm / chưa làm; học sinh đánh dấu câu để xem lại được.
    - [ ] Bài làm được tự lưu trong lúc làm và khôi phục khi mất mạng hoặc tắt tab.
    - [ ] Thứ tự câu hỏi và đáp án được xáo trộn khác nhau giữa các học sinh.
    - [ ] Trong lúc thi: chặn copy/paste và chuột phải; phát hiện chuyển tab / thoát toàn màn hình và ghi log số lần vi phạm; vượt ngưỡng thì cảnh báo hoặc tự nộp `ASM-BACKLOG-05`; một tài khoản chỉ dùng được trên một thiết bị.
    - [ ] Khi nộp bài, hệ thống chấm tự động, tính điểm từng phần cho câu nhiều đáp án và áp điểm trừ nếu giáo viên cấu hình.
    - [ ] Học sinh xem kết quả, đáp án đúng và lời giải nếu giáo viên cho phép; xem được lịch sử các bài đã làm.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `POST /attempts/start`, `PATCH /attempts/:id/answers`, `POST /attempts/:id/submit`, `GET /attempts/:id`, `GET /me/attempts`; deadline lấy từ cấu hình đề ở server (không tin client clock); autosave idempotent theo key; Prisma `Attempt`/`Answer`/`Violation`/`ActiveSession` + migration; shuffle với seed lưu theo attempt; grading service theo từng `questionType` (partial score + negative marking); kiểm soát 1 active device; rule ngưỡng vi phạm.
    - [ ] **Frontend:** `ExamTakingPage` với countdown sync giờ server; `QuestionNavigator`; nút đánh dấu; indicator/autosave + banner khôi phục; handler `contextmenu`/`copy`/`paste`/`visibilitychange`/`fullscreenchange`; `ResultPage` hiển thị lời giải có điều kiện; `AttemptHistoryPage`.
  - **Deliverables khi [x]:**
    - `.specify/features/timed-attempt-grading/baseline.md` (SIGNED-OFF)
    - `docs/features/timed-attempt-grading/README.md`
    - `docs/user-guides/timed-attempt-grading.md` (ảnh Playwright thật)

---

## 🚀 Sprint 2: Feature Expansion

> **Mục tiêu Sprint:** Bổ sung import, sinh đề tự động, phân tích và luyện tập — sau khi vòng thi MVP chạy ổn định.

- [ ] **US-QB-002**: Import câu hỏi hàng loạt từ Excel/Word & nội dung phong phú
  - **Slug:** `question-import-rich-content`
  - **Effort:** M
  - **Context-budget:** single-session
  - **Priority:** Should-Have (P1)
  - **Depends-on:** `US-QB-001`
  - **Blocks:** _(none)_
  - **Mô tả:** Giáo viên nhanh chóng đưa đề có sẵn vào hệ thống mà không phải nhập từng câu.
  - **Acceptance Criteria (AC):**
    - [ ] Giáo viên tải file Excel/Word theo template và import hàng loạt câu hỏi `ASM-BACKLOG-03`.
    - [ ] Hệ thống báo từng dòng lỗi và bỏ qua dòng đó, các dòng hợp lệ vẫn được import.
    - [ ] Giáo viên thấy số câu import thành công và kiểm tra lại được danh sách vừa import.
    - [ ] Hình ảnh, công thức và đoạn code hiển thị đúng ở câu đã import.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `POST /questions/import` (multipart); parser xlsx/docx; DTO validation + báo lỗi theo dòng; batch insert trong transaction; endpoint upload asset; giới hạn kích thước file.
    - [ ] **Frontend:** `ImportDialog` với tải template, drag-drop, bảng preview lỗi, progress và liên kết tới danh sách câu vừa tạo.
  - **Deliverables khi [x]:**
    - `.specify/features/question-import-rich-content/baseline.md` (SIGNED-OFF)
    - `docs/features/question-import-rich-content/README.md`

- [ ] **US-EXAM-002**: Sinh đề tự động theo ma trận
  - **Slug:** `exam-auto-generation-matrix`
  - **Effort:** M
  - **Context-budget:** single-session
  - **Priority:** Should-Have (P1)
  - **Depends-on:** `US-QB-001`, `US-EXAM-001`
  - **Blocks:** _(none)_
  - **Mô tả:** Giáo viên khai báo cơ cấu đề và hệ thống chọn câu ngẫu nhiên phù hợp, giảm công sức lập đề.
  - **Acceptance Criteria (AC):**
    - [ ] Giáo viên khai báo ma trận: số câu theo chương và độ khó (ví dụ 10 câu dễ, 5 câu khó, chương 1–3).
    - [ ] Hệ thống chọn ngẫu nhiên câu thỏa ma trận từ ngân hàng câu hỏi.
    - [ ] Giáo viên xem lại và chỉnh sửa đề sinh tự động trước khi lưu.
    - [ ] Hệ thống báo rõ nếu ngân hàng không đủ câu để đáp ứng ma trận.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `POST /exams/generate`; DTO ma trận + validate; thuật toán chọn ngẫu nhiên có seed; lỗi `INSUFFICIENT_QUESTION_POOL`; tái dùng trạng thái nháp của `Exam`.
    - [ ] **Frontend:** `MatrixBuilder` dạng lưới chương × độ khó; `GeneratePreview`; luồng chỉnh sửa câu sau khi sinh.
  - **Deliverables khi [x]:**
    - `.specify/features/exam-auto-generation-matrix/baseline.md` (SIGNED-OFF)
    - `docs/features/exam-auto-generation-matrix/README.md`

- [ ] **US-ANA-001**: Thống kê & phân tích đề cho giáo viên
  - **Slug:** `teacher-analytics`
  - **Effort:** L
  - **Context-budget:** multi-session
  - **Priority:** Should-Have (P1)
  - **Depends-on:** `US-ATT-001`
  - **Blocks:** _(none)_
  - **Mô tả:** Giáo viên nhìn được đề đang dễ hay khó, câu nào có vấn đề, để điều chỉnh cách ra đề.
  - **Acceptance Criteria (AC):**
    - [ ] Giáo viên xem phổ điểm của lớp theo từng đề.
    - [ ] Giáo viên xem tỉ lệ trả lời đúng của từng câu.
    - [ ] Hệ thống đánh dấu câu quá dễ, quá khó hoặc nghi sai đáp án.
    - [ ] Giáo viên xem đáp án nhiễu được chọn nhiều nhất cho mỗi câu.
    - [ ] Giáo viên chỉ thấy dữ liệu của lớp do mình quản lý.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `GET /analytics/exams/:id`, `GET /analytics/questions/:id`; aggregation query có index; groupBy theo chương/độ khó; scope RBAC theo lớp; response DTO.
    - [ ] **Frontend:** `AnalyticsDashboard`; biểu đồ phổ điểm; bảng tỉ lệ đúng theo câu; highlight đáp án nhiễu; bộ lọc lớp/đề.
  - **Deliverables khi [x]:**
    - `.specify/features/teacher-analytics/baseline.md` (SIGNED-OFF)
    - `docs/features/teacher-analytics/README.md`

- [ ] **US-PRA-001**: Chế độ luyện tập với feedback ngay
  - **Slug:** `practice-mode`
  - **Effort:** M
  - **Context-budget:** single-session
  - **Priority:** Could-Have (P2)
  - **Depends-on:** `US-QB-001`
  - **Blocks:** _(none)_
  - **Mô tả:** Học sinh ôn luyện không giới hạn lượt và biết đúng sai ngay để tự sửa.
  - **Acceptance Criteria (AC):**
    - [ ] Học sinh làm bài luyện tập không giới hạn số lần.
    - [ ] Học sinh biết đúng/sai ngay sau mỗi câu và xem được lời giải.
    - [ ] Kết quả luyện tập không tính vào điểm của các bài thi chính thức.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `POST /practice/sessions`, `POST /practice/sessions/:id/answers`; trả feedback ngay; tách biệt `PracticeSession` khỏi `Attempt`; tái dùng question DTO của `US-QB-001`.
    - [ ] **Frontend:** `PracticePage`; thẻ feedback ngay sau mỗi câu; panel lời giải; danh sách lịch sử luyện tập riêng.
  - **Deliverables khi [x]:**
    - `.specify/features/practice-mode/baseline.md` (SIGNED-OFF)
    - `docs/features/practice-mode/README.md`

- [ ] **US-ANA-002**: Biểu đồ tiến bộ & chủ đề yếu cho học sinh
  - **Slug:** `student-progress-analytics`
  - **Effort:** M
  - **Context-budget:** single-session
  - **Priority:** Could-Have (P2)
  - **Depends-on:** `US-ATT-001`
  - **Blocks:** _(none)_
  - **Mô tả:** Học sinh thấy mình tiến bộ thế nào và biết chủ đề nào cần ôn thêm.
  - **Acceptance Criteria (AC):**
    - [ ] Học sinh xem biểu đồ tiến bộ qua các bài đã làm.
    - [ ] Hệ thống chỉ ra chương/chủ đề còn yếu dựa trên kết quả các bài của chính học sinh đó.
    - [ ] Học sinh chỉ thấy dữ liệu của chính mình; bài luyện tập không làm nhiễu biểu đồ.
  - **Tasks (Phân rã kỹ thuật cho Subagents):**
    - [ ] **Backend:** `GET /me/progress`; aggregation theo chương với ngưỡng đúng thấp; loại trừ `PracticeSession`; DTO response theo khoảng thời gian.
    - [ ] **Frontend:** `ProgressChart`; danh sách `WeakTopicList`; bộ lọc môn học/khoảng thời gian.
  - **Deliverables khi [x]:**
    - `.specify/features/student-progress-analytics/baseline.md` (SIGNED-OFF)
    - `docs/features/student-progress-analytics/README.md`

---

## 🔮 Backlog Dự Kiến — Future Horizons (V2.0+)

> Các ý tưởng chưa được ưu tiên. Không có Slug, không có AC — chỉ là placeholder.

- [~] **US-FUTURE-001**: Vai trò Quản trị viên — quản lý user, danh mục môn học, thống kê toàn hệ thống (brief §1.2, dời từ MVP).
- [~] **US-FUTURE-002**: Thi trực tiếp kiểu Kahoot + bảng xếp hạng realtime (brief §3.1).
- [~] **US-FUTURE-003**: AI sinh câu hỏi từ PDF + giải thích lời giải (brief §3.4).
- [~] **US-FUTURE-004**: Chụp ảnh webcam ngẫu nhiên trong lúc thi (brief §2).
- [~] **US-FUTURE-005**: Xuất bảng điểm Excel & xuất đề thi PDF (brief §3.2).
- [~] **US-FUTURE-006**: Thông báo đề mới / nhắc nhở sắp hết hạn (brief §3.5).
- [~] **US-FUTURE-007**: Gamification — huy hiệu, chuỗi ngày luyện tập, bảng xếp hạng (brief §3.6).
- [~] **US-FUTURE-008**: Billing / Stripe (Q5 — billing sau).
- [~] **US-FUTURE-009**: PWA / chế độ offline (Q1 — web-only ở MVP).

---

## 🏁 Quy Chuẩn Định Nghĩa Hoàn Thành (Definition of Done - DoD)

Một User Story / Task chỉ được chuyển từ `[/]` sang `[x]` khi:

1. **Nghiệp vụ:** Đạt 100% Acceptance Criteria.
2. **Kiểm thử tự động:** Backend có unit/integration test; frontend render đúng, interaction mượt, không console error.
3. **Chất lượng mã:** File < 800 dòng, function < 50 dòng, nesting < 3, immutable data; đã quan sát các stack skills phù hợp.
4. **Bug gate:** Zero Critical / Blocker.
5. **Tài liệu hóa:** `docs/features/<slug>/README.md` + user guide có ảnh Playwright thật.

---

## 🚀 Kế Hoạch Phát Hành Production (Go-Live Plan)

### 1. Pre-Deploy Checklist

#### 🔴 Critical — Blockers tuyệt đối

- [ ] **SEC-01**: Không có credential hardcoded; mọi secret nằm trong biến môi trường.
- [ ] **SEC-02**: JWT / refresh secret sinh bằng `openssl rand -hex 64`, không dùng default.
- [ ] **SEC-03**: CORS whitelist đúng domain frontend production, không dùng `*`.

#### 🟡 Important

- [ ] **DB-01**: Provision PostgreSQL production và chạy `prisma migrate deploy`.
- [ ] **API-01**: Deploy NestJS; health check trả HTTP 200.
- [ ] **WEB-01**: Deploy React SPA; cấu hình fallback routing (refresh trang con không 404).
- [ ] **TEST-01**: Playwright smoke toàn bộ happy path trên production URL: đăng nhập → tạo lớp → tạo đề → học sinh làm bài → có điểm.
- [ ] **SEC-04**: Kiểm tra giờ máy chủ và hàng đợi nộp bài khi hết thời gian dưới tải thật.

#### 🟢 Nice-to-have

- [ ] **OBS-01**: Error monitoring (Sentry / log drain).
- [ ] **OBS-02**: Uptime monitoring.

### 2. Biến Môi Trường Production Mẫu

```bash
# ── Backend (NestJS) ─────────────────────────────────────────
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
JWT_SECRET="<openssl rand -hex 64>"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="<openssl rand -hex 64>"
JWT_REFRESH_EXPIRES_IN="7d"
OAUTH_GOOGLE_CLIENT_ID="<client-id>"
OAUTH_GOOGLE_CLIENT_SECRET="<client-secret>"
CORS_ORIGINS="https://<frontend-domain>"
UPLOAD_DIR="/var/app/uploads"

# ── Frontend (React/Vite) ────────────────────────────────────
VITE_API_URL="https://<backend-domain>"
```

### 3. Sprint Go-Live Tracking

- [ ] **US-DEPLOY-01**: Security Hardening & Secret Audit (SEC-01 → SEC-04).
- [ ] **US-DEPLOY-02**: Cloud Database Provisioning & Safe Migration.
- [ ] **US-DEPLOY-03**: Backend API Deploy & Health Check Verification.
- [ ] **US-DEPLOY-04**: Frontend Deploy & SPA Routing Fallback Verification.
- [ ] **US-DEPLOY-05**: Production End-to-End Smoke Test.

---

## 📝 Ghi Chú Quan Trọng Cho AI

> AI đọc phần này để hiểu ngữ cảnh và quy tắc của file. Không xóa.

### Quy tắc quét của `/command-continue-project`:

1. **Step 1**: Đọc `tech-stack` từ YAML frontmatter → paste vào system prompt của mọi subagent.
2. **Step 2**: Tìm story `[/]` trước (ưu tiên tuyệt đối), sau đó `[ ]` đầu tiên từ trên xuống.
3. **Step 3 (Blocked Gate)**: Nếu story mang `[!]` → DỪNG LẠI, báo user, đề xuất phiên grilling. Bỏ qua `[~]`.
4. **Step 4 (Dependency Gate)**: Nếu `Depends-on` chưa `[x]` → từ chối story đó, báo blocked, đề xuất làm dependency trước.
   - Chain MVP: `US-AUTH-001 → US-CLS-001 + US-QB-001 → US-EXAM-001 → US-ATT-001`.
5. **Step 5 (Effort & Budget Routing)**:
   - `S` + `single-session` → Fast-Track BA (2–3 câu).
   - `M` + `single-session` → Bounded Task BA.
   - `L|XL` + `multi-session` → Full Feature BA + `wayfinder` trước.
6. **Step 6 (Task Allocation)**: Lấy trực tiếp mục `Tasks: Backend / Frontend` giao cho backend/frontend subagent.
7. **Step 7 (Go-Live)**: Story `US-DEPLOY-###` đi theo Pre-Deploy Verification, không đi BA pipeline thường.
8. **Step 8**: Chỉ đánh `[x]` sau khi e2e pass, tech-doc xong, user-guide có ảnh Playwright thật.

### Đồng bộ artifact khác

- `CONTEXT.md` — ubiquitous language + trạng thái `ASM-01..11`.
- `adr/` — `0001` meta, `0002` + `ADR-001` framework; product ADR bắt đầu `0003`.
- Khi resolve `ASM-BACKLOG-NN`, ghi chú vào `CHANGELOG.md` và cập nhật comment đầu file này (không xóa dòng cũ).
