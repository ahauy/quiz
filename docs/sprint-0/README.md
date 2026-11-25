# Sprint 0 — Handoff

> Plan: [`SPRINT_0_PLAN.md`](./SPRINT_0_PLAN.md) · Decisions: §8 (8/8 locked) · Requirements survey: [`requirements-survey.md`](./requirements-survey.md) · CI: [`ci-baseline.md`](./ci-baseline.md)

## Quick start

```bash
# Node 22 + corepack (global pnpm is 11 — always use corepack pnpm)
corepack enable
corepack pnpm -v                 # -> 9.15.9
corepack pnpm install --frozen-lockfile
corepack pnpm --filter api prisma generate
corepack pnpm db:up              # docker compose up -d db
cp .env.example .env             # then fill real secrets for local run
corepack pnpm dev                # api :3000 + web :5173
```

Health check: `curl http://localhost:3000/health` → `{"status":"ok","database":"connected",...}`.

## Commands

| Command | Meaning |
| :--- | :--- |
| `corepack pnpm lint` | ESLint across workspaces |
| `corepack pnpm typecheck` | tsc --noEmit across workspaces |
| `corepack pnpm --filter api prisma validate` | Validate Prisma schema |
| `corepack pnpm test` | Vitest unit tests (api + web + shared) |
| `corepack pnpm build` | Build all workspaces |
| `corepack pnpm test:e2e` | Playwright smoke (needs api + web + db running) |

## Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| `ERR_PNPM_EIO` on install | Global pnpm 11 or store path permission | Use `corepack pnpm` (9.15.9); if needed add `--store-dir ./.pnpm-store` |
| `/health` returns `degraded` | Postgres not healthy | `docker compose up -d db`, wait for `pg_isready`, run `pnpm --filter api prisma migrate deploy` |
| `Invalid environment configuration: ...` | Missing/invalid `.env` | Copy `.env.example`; JWT secrets need ≥ 32 chars |
| `Playwright: browser not found` | Chromium not installed | `corepack pnpm --filter web exec playwright install --with-deps chromium` |
| Page renders blank, console `504 (Outdated Optimize Dep)` | Vite dep cache stale after reinstall | Restart `pnpm --filter web dev`; `rm -rf apps/web/node_modules/.vite` if needed |
| `ERR_PNPM_EIO` on incremental install | Partially written `node_modules` from an interrupted run | `rm -rf node_modules apps/*/node_modules packages/*/node_modules` then `corepack pnpm install --ignore-scripts` |
| Docker daemon unavailable | Docker Desktop not running | `open -a Docker`, wait for `docker info` to succeed |
| `RoleGuard` renders nothing | No session in Zustand store | Expected in Sprint 0 — real auth lands in `US-AUTH-001` |
| CI `TS2307: Cannot find module 'express'` | `@types/express` was only in a global type folder on dev machine, not declared in the workspace | Declared `@types/express` in `apps/api/devDependencies`; keep types local to the package |
| CI `PrismaClient has no exported member` / `$queryRaw does not exist` | `quality` job restored pnpm cache and skipped `@prisma/client` postinstall, which cannot locate `apps/api/prisma/schema.prisma` from repo root | `prisma generate` runs explicitly before `typecheck` (see `.github/workflows/ci.yml`) |
| CI `prisma validate` fails on missing `DATABASE_URL` | `quality` job has no `.env` | CI-only `DATABASE_URL` is set at job level; no real DB needed |
| CI `e2e`: `ECONNREFUSED ::1:3000` / `127.0.0.1:3000` | `webServer` only started Vite; no process served the API, so `/health` had no listener | `playwright.config.ts` now starts both `apps/api` (`:3000/health`) and `apps/web` (`:5173`) via Playwright `webServer[]` |
| Playwright webServer exits with pnpm version error | `command: "pnpm dev"` resolved global pnpm 11 instead of pinned 9 | Use `corepack pnpm ...` in every `webServer` command |

## What is intentionally empty

- Domain Prisma models (only `HealthProbe` exists) — each story adds its own in baseline.
- Feature route tables — `RoleGuard` is a skeleton, no real pages yet.
- `.specify/features/` — `/continue` creates folders per story.
- Deploy workflow — deferred (`ASM-BACKLOG-07`).

## Next

`/continue` picks `US-AUTH-001` (Effort M, Tier 2 Lean: roadmap AC → `test-plan.md` → TDD).
