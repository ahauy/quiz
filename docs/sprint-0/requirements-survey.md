# Sprint 0 — Requirements Survey (S0-01)

> Generated 2026-11-25. Sources: `chuc-nang-web-thi-trac-nghiem.md` §1–§3, grilling 2026-11-25, `PRODUCT_BACKLOG_ROADMAP.md`.

## 1. AC trace — Sprint 1 stories

| Story | AC nguồn | Tracing |
| :--- | :--- | :--- |
| US-AUTH-001 | 6 AC | Brief §1.1 (đăng ký/đăng nhập/quên mk/3 role) + grilling Q2 (Email+Password + OAuth) + ASM-07 (bỏ Admin) + ASM-BACKLOG-04/06 |
| US-CLS-001 | 4 AC | Brief §1.3 "Quản lý lớp học" + grilling Q4 (shared theo lớp) + ASM-08 |
| US-QB-001 | 6 AC | Brief §1.3 "Ngân hàng câu hỏi" 5 dạng + ASM-BACKLOG-01/02 |
| US-EXAM-001 | 5 AC | Brief §1.3 "Tạo & quản lý đề thi" + ASM-BACKLOG-08 |
| US-ATT-001 | 8 AC | Brief §1.4 + §1.5 + §2 + grilling ASM-10 (full anti-cheat) + ASM-BACKLOG-05 |

**Kết luận:** 29/29 AC có nguồn, 0 AC treo.

## 2. ASM triage

| ID | Trạng thái | Lý do |
| :--- | :--- | :--- |
| ASM-BACKLOG-01 | `resolve-in-S0` ✅ | Chốt normalize + per-pair scoring |
| ASM-BACKLOG-02 | `resolve-in-S0` ✅ | Chốt KaTeX |
| ASM-BACKLOG-03 | `defer-to-story` | Template import chỉ cần ở US-QB-002 (Sprint 2) |
| ASM-BACKLOG-04 | `resolve-in-S0` ✅ | Chốt Google only |
| ASM-BACKLOG-05 | `resolve-in-S0` ✅ | Chốt 2/3 |
| ASM-BACKLOG-06 | `resolve-in-S0` ✅ | Chốt mã GV pre-seed |
| ASM-BACKLOG-07 | `defer-to-story` | Deploy target ở Go-Live |
| ASM-BACKLOG-08 | `already-covered` | Roadmap đã ghi "GV tự cấu hình, không default cố định" |

## 3. Business rules mới phát sinh trong S0

Không có. Mọi rule đều trace về nguồn ở §1–§2. Các quyết định kỹ thuật (pnpm, monorepo, CI) không phải business rule.

## 4. Ranh giới phân quyền (xác nhận lại từ ASM-07/08)

- Teacher: thấy/quản lý lớp do mình tạo; thấy đề mình tạo; thấyattempt của lớp mình.
- Student: thấy lớp mình tham gia; thấy đề giao cho lớp mình; thấyattempt của chính mình.
- Admin: **không tồn tại ở MVP** — mọi truy cập "toàn hệ thống" bị từ chối ở guard.

## 5. Invariants cần đưa vào ADR

1. `ServerClock` — deadline chỉ tính ở server (ADR-0004).
2. `Violation` — ngưỡng 2 cảnh báo / 3 tự nộp, config được (ADR-0004).
3. `TeacherCode` — pre-seed, optional field lúc register (ADR-0005).
