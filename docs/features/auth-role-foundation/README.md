# US-AUTH-001 — auth-role-foundation

> Tech handoff for **Auth & Role Foundation** (EPIC-01, Sprint 1, Effort M, Must-Have P0).
> Delivered 2026-11-25. This README is the contract-level view of the feature; field-level detail lives in `apps/api/prisma/schema.prisma`, the migration `20261125082639_add_auth_foundation`, and the sources listed under [References](#references).
>
> Sources: `.specify/features/auth-role-foundation/` (`context-pack.md`, `decisions.md`, `test-plan.md`, `00-tech-context.md`), `adr/0005-auth-rbac-boundary.md`, `docs/conventions.md`, `docs/PRODUCT_BACKLOG_ROADMAP.md`.

---

## 1. Scope

### In scope

- Register / login with email + password.
- Real Google OAuth authorization-code exchange (`GET /auth/oauth/google/url` → `POST /auth/oauth/google/callback`).
- Forgot / reset password (15-minute TTL, single use, local reset URL).
- Exactly two roles (`TEACHER`, `STUDENT`) with the `teacherCode` rule; no `ADMIN`.
- Profile update + password change (`GET`/`PATCH /auth/me`).
- Logout with immediate invalidation of existing access tokens.
- Route guards on both the API and the web router.
- Tests and documentation.

### Out of scope

- `ADMIN` role / admin panel / user management (Phase 2).
- Email or SMTP provider (see D-AUTH-01 and [follow-up ASMs](#6-follow-up-asms)).
- OAuth providers other than Google (`ASM-BACKLOG-04`).
- Classroom / exam UI (later Sprint 1 stories).
- Password strength meter beyond the DTO minimum of 8 characters.
- Production deploy / Go-Live.

The six roadmap Acceptance Criteria are covered by the endpoint set in §2 and verified in §5 (AC → TC map in `test-plan.md`).

---

## 2. API contract

Both slices match this contract exactly. Paths are unprefixed and mounted under `/auth` by `AuthController` (`@Controller("auth")`).

- **Success envelope:** `{ data: T }`.
- **Error envelope:** `{ code, message, details? }` via the global `AllExceptionsFilter`. The filter adds `path`/`timestamp`; the web zod schema strips them (review L8).
- **Validation:** global `ValidationPipe` (`whitelist`, `transform`, `forbidNonWhitelisted`); every inbound body is a class-validator DTO. The web side parses envelopes with zod.

| Method | Path | Auth | Body / input | Response `data` | Status |
| :-- | :-- | :-- | :-- | :-- | :-- |
| POST | `/auth/register` | public | `{ email, password, displayName, requestedRole?: TEACHER\|STUDENT, teacherCode?: string }` | `UserDto` | 201 |
| POST | `/auth/login` | public | `{ email, password }` | `AuthResultDto` + `Set-Cookie refreshToken` | 200 |
| POST | `/auth/refresh` | refresh cookie | none | `AuthResultDto` + rotated cookie | 200 |
| POST | `/auth/logout` | access + refresh cookie | none | `OkDto` + cleared cookie | 200 |
| GET | `/auth/oauth/google/url` | public | none | `AuthUrlDto` + `oauth_state` cookie | 200 |
| POST | `/auth/oauth/google/callback` | `oauth_state` cookie | `{ code, state, teacherCode?: string }` | `AuthResultDto` + refresh cookie | 200 |
| POST | `/auth/forgot-password` | public | `{ email }` | `ForgotPasswordResultDto` | 202 |
| POST | `/auth/reset-password` | public | `{ token, newPassword }` | `OkDto` | 200 |
| GET | `/auth/me` | access | none | `UserDto` | 200 |
| PATCH | `/auth/me` | access | `{ displayName?, newPassword?, currentPassword? }` | `UserDto` | 200 |

Shared DTO types live in `packages/shared/src/dto/index.ts` — `RegisterDto`, `UserDto`, `AuthResultDto`, `AuthUrlDto`, `ForgotPasswordResultDto`, `OkDto`. They are the fixed cross-slice contract authored before dispatch; **do not remove or rename them**.

### Error codes

| Code | HTTP | Meaning |
| :-- | :-- | :-- |
| `EMAIL_IN_USE` | 409 | Duplicate email on register (Prisma `P2002` race mapped here, review M1) |
| `INVALID_CREDENTIALS` | 401 | Wrong email / password |
| `INVALID_TEACHER_CODE` | 400 | Missing/wrong code for a teacher claim (ADR-0005 follow-up, resolved here) |
| `INVALID_RESET_TOKEN` | 400 | Unknown or already-used reset token |
| `EXPIRED_RESET_TOKEN` | 400 | Reset token past its 15m TTL |
| `INVALID_STATE` | 400 | OAuth `state` mismatch |
| `OAUTH_FAILED` | 401 | Google code exchange / `id_token` verification failed |
| `UNAUTHORIZED` | 401 | Missing / invalid access token |
| `FORBIDDEN` | 403 | Wrong role or out-of-scope resource (ADR-0005 §3) |
| `VALIDATION_ERROR` | 400 | DTO validation failure |

### Cookie behaviour

- `refreshToken` — httpOnly, `Path=/auth`, `SameSite=Lax`, `secure` only in production, 7d max age. Set on login / refresh / OAuth callback; rotated on every `/auth/refresh`; cleared on logout and on password change.
- `oauth_state` — short TTL, set by `/auth/oauth/google/url`, validated with constant-time equality and cleared on callback.

---

## 3. Data model

Prisma (`apps/api/prisma/schema.prisma`), generated from the real DB as migration `20261125082639_add_auth_foundation`. Never edit an accepted migration.

`enum Role { TEACHER, STUDENT }` — the single source is `packages/shared/src/enums/index.ts` (`Role.TEACHER`, `Role.STUDENT`), read by both the API guards and the web router. **`ADMIN` does not exist**, not even hidden (ADR-0005 §1).

| Model | Key fields | Notes |
| :-- | :-- | :-- |
| `User` | `id` (uuid PK), `email` (unique), `displayName`, `passwordHash?`, `role` (default `STUDENT`), `tokenVersion` (int, default `0`), `createdAt`, `updatedAt` | `passwordHash` is nullable for OAuth-only accounts. Relations: `refreshTokens[]`, `oauthAccounts[]`, `passwordResetTokens[]` (all `onDelete: Cascade`). |
| `RefreshToken` | `id`, `userId` (FK), `tokenHash` (unique), `expiresAt`, `createdAt`, `revokedAt?` | Only the hash is stored; the raw 32-byte token is never persisted. Index on `userId`. |
| `OAuthAccount` | `id`, `userId` (FK), `provider`, `providerAccountId`, `createdAt` | Unique `(provider, providerAccountId)`; index on `userId`. Google accounts identified by the `sub` claim. |
| `PasswordResetToken` | `id`, `userId` (FK), `tokenHash` (unique), `expiresAt`, `usedAt?`, `createdAt` | Hash in DB; raw token appears only in the reset URL / server log. 15m expiry; `usedAt` enforces single use. Index on `userId`. |
| `HealthProbe` | `id`, `createdAt` | Sprint-0 skeleton retained for the accepted baseline migration. |

`tokenVersion` is bumped on logout, password reset, and password change, which invalidates all previously issued access tokens immediately (ASM-AUTH-002, ASM-AUTH-003).

---

## 4. Security decisions

- **Password storage** — Node `crypto.scrypt` + per-user random salt, verified with `timingSafeEqual` (no new dependency). Plaintext is never stored or logged; two hashes of the same password differ (TC-008). DTO minimum is 8 characters; no strength meter (out of scope).
- **Access tokens** — JWT HS256 via Node `crypto` HMAC (no new dependency); claims `sub`, `role`, `tokenVersion`, `exp`; TTL 15m (`JWT_EXPIRES_IN`). Held in memory by the Zustand auth store and hydrated on mount via `POST /auth/refresh`; never written to `localStorage` (ASM-AUTH-002).
- **Refresh tokens** — random 32 bytes; only the hash is in the DB; delivered as an httpOnly cookie scoped to `/auth`, `SameSite=Lax`, `secure` only in production, 7d max age; rotated on every refresh and revoked on logout/reset/password change.
- **Immediate invalidation** — `tokenVersion` bumps on logout, reset, and password change, so existing access tokens fail `JwtAuthGuard` even before `exp` (ASM-AUTH-002, ASM-AUTH-003). A missing refresh cookie fails loudly (review M2/M3, L9).
- **Google OAuth** — `state` cookie (CSRF) set by `/auth/oauth/google/url`, validated and cleared on callback; the code is exchanged at `https://oauth2.googleapis.com/token`; the `id_token` is verified via `oauth2.googleapis.com/tokeninfo` and requires `email_verified` **and** `aud == client_id` (review M4: missing `aud` is rejected). The HTTP caller is injected (`ports.ts`) so unit tests never touch the network. `teacherCode` and `state` comparisons use constant-time equality (review L5).
- **RBAC boundary (ADR-0005)** — exactly two roles; `ADMIN` absent. The API guards (`JwtAuthGuard`, `RolesGuard`, `@Public`, `@Roles`) and the web `RoleGuard` read the same `Role` enum from `packages/shared`. Global guards leave public endpoints and `/health` reachable. Teacher role is granted only when `teacherCode` matches the pre-seeded `TEACHER_CODE` env value (`ASM-BACKLOG-06`); OAuth uses the same path and cannot bypass it. Out-of-scope resources return `403`, not `404` (ADR-0005 §3).
- **Reset tokens** — raw token only in the reset URL (`${VITE_API_URL or http://localhost:5173}/reset-password?token=<token>`) and server-side log; hash in DB; 15m TTL; single use. Reuse/expiry → `INVALID_RESET_TOKEN` / `EXPIRED_RESET_TOKEN` (D-AUTH-02).
- **Forgot-password delivery** — no email/SMTP provider is in the agreed stack, so `POST /auth/forgot-password` returns the one-time reset URL in the 202 response and logs it server-side (D-AUTH-01). Production delivery is an explicit follow-up ASM, not silently invented.
- **No silent failures / no leakage** — error envelope only, no stack traces in production responses (TC-010), no secrets logged. Unique-email race maps Prisma `P2002` → `EMAIL_IN_USE` 409 (review M1). OAuth linking to an existing email never upgrades that user's role (ASM-AUTH-001) — no privilege escalation via a callback-supplied code.

Resolved user decisions this session: **D-AUTH-01** (URL-in-response delivery), **D-AUTH-02** (15m single-use reset), **D-AUTH-03** (real-Google E2E is opt-in).

---

## 5. Test evidence

| Layer | Result | Where |
| :-- | :-- | :-- |
| Unit (Vitest) | **132 passing** | `apps/api/src/**/*.spec.ts`, `apps/web/**/*.spec.ts`, `packages/shared` |
| E2E default (Playwright) | **8 passing** | `apps/web/e2e/auth.spec.ts` (7) + `apps/web/e2e/smoke.spec.ts` (1) |
| E2E real Google (opt-in) | **1 skipped** (explicit reason) | `apps/web/e2e/oauth-google.spec.ts` (TC-002) |

- **Unit tests** are pure/injected with a NODE env and no live DB — the CI `quality` job has no DB service (`00-tech-context.md`, `test-plan.md`). 20 spec files cover TC-001/003/004/005/006, TC-007 (guards), TC-008 (hashing), plus service, DTO, cookie, token, reset, and OAuth units. No placeholder assertions.
- **Default E2E** runs against the real API + Docker Postgres (Playwright `webServer[]` starts both `:3000` and `:5173`) and covers TC-001, TC-003, TC-004, TC-005, TC-006, TC-009, TC-010. Google is never faked in E2E.
- **Opt-in real Google (TC-002)** — skipped unless `E2E_GOOGLE_REAL=1`; requires `E2E_GOOGLE_EMAIL` / `E2E_GOOGLE_PASSWORD`. Exact command:
  ```bash
  E2E_GOOGLE_REAL=1 corepack pnpm --filter web test:e2e:google
  ```
  (runs `playwright test e2e/oauth-google.spec.ts --headed`). Interactive consent cannot run headless/unattended, so the spec is **reported as unverified in CI** (D-AUTH-03).
- **Green gates** (`test-plan.md`): `lint`, `typecheck`, `test`, `build`, `prisma migrate deploy` + `prisma validate` (DB healthy), `test:e2e`, code review + UI review with zero Critical.
- **Review disposition** (`decisions.md`, 2026-11-25): both mandatory passes returned **zero Critical**; findings resolved before delivery — `P2002` → `EMAIL_IN_USE` with a unit test; exact error-code assertions for reset-token reuse and wrong `currentPassword`; missing refresh cookie fails loudly; `tokeninfo` `aud` check; constant-time `teacherCode`/`state` comparisons; focus-visible rings, `aria-busy`, invalid-field border, missing-reset-token message and authenticated header links; the single Sprint-0 shadcn-style `components/ui/button.tsx` primitive retained (no Radix/cva install); shared DTO contract authored by the orchestrator; `AllExceptionsFilter` superset retained to avoid breaking Sprint 0.

Remaining DoD documentation deliverable: `docs/user-guides/auth-role-foundation.md` with real Playwright screenshots (`test-plan.md` gate 9 / roadmap deliverables). This README covers the technical-documentation half only.

---

## 6. Follow-up ASMs

### Open / deferred

| ASM | What remains | Gate / owner |
| :-- | :-- | :-- |
| **ASM-AUTH-004** | Production email delivery for reset links and a real Google OAuth client registered for the production domain. Until then, forgot-password returns the reset URL in the API response + server log (D-AUTH-01). | Go-Live sprint; blocked by `ASM-BACKLOG-07` |
| **ASM-BACKLOG-07** | Production environment (hosting, domain, CI) undecided; deferred to Go-Live. Also drives `SEC-01`–`SEC-04` (no hardcoded credentials, strong JWT secrets, CORS whitelist, server-clock check). | Go-Live sprint |
| **ADR-0005 follow-up (Phase 2 Admin)** | Adding an `ADMIN` role must **supersede ADR-0005 with a new ADR** — do not edit it in place. Admin UI / user management / system-wide statistics stay out of MVP (`US-FUTURE-001`). | Phase 2 |

### Revisit only if product objects (conservative choices reported in `decisions.md`)

- **ASM-AUTH-001** — OAuth linking to an existing email never upgrades that user's role. An invite-code upgrade path needs a separate decision.
- **ASM-AUTH-005** — a `teacherCode` supplied while `requestedRole=STUDENT` is rejected with `INVALID_TEACHER_CODE` (code presence counts as a teacher claim, ADR-0005 §4). Revisit only if product wants the field ignored for students.

### Closed in this feature

- ADR-0005 follow-up "specify the `teacherCode` validation error code" → resolved as `INVALID_TEACHER_CODE` (HTTP 400) in `decisions.md`.
- `ASM-BACKLOG-04` (Google OAuth only for MVP) and `ASM-BACKLOG-06` (teacher role by `teacherCode` vs pre-seeded `TEACHER_CODE`) — agreed in prior artifacts and implemented here.

### Out-of-scope items that become future work

Email provider, other OAuth providers, admin role, a password strength meter beyond the 8-char DTO minimum, classroom/exam UI, and production deploy.

---

## References

- `.specify/features/auth-role-foundation/context-pack.md` · `decisions.md` · `test-plan.md` · `00-tech-context.md`
- `adr/0005-auth-rbac-boundary.md` · `docs/conventions.md` · `docs/PRODUCT_BACKLOG_ROADMAP.md` (US-AUTH-001 AC + ASMs)
- `docs/sprint-0/README.md` (commands, gates, troubleshooting)
- Code: `apps/api/src/auth/**`, `apps/api/prisma/schema.prisma`, `apps/web/src/app/router.tsx`, `apps/web/e2e/**`, `packages/shared/src/{dto,enums}/**`
