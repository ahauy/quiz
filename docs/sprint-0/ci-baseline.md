# CI Baseline (S0-11)

## Jobs

| Job | Depends on | Steps | Blocking |
| :--- | :--- | :--- | :--- |
| `install` | — | checkout → pnpm 9.15.9 → Node 22 → `pnpm install --frozen-lockfile` | yes |
| `quality` | install | `lint` → `typecheck` → `prisma validate` → `test` → `build` | yes |
| `e2e` | quality | Postgres 16 service (health check) → prisma generate/migrate → Playwright chromium → `test:e2e` | yes |

## Triggers

- `pull_request` (all branches)
- `push` to `main`
- Concurrency group cancels superseded runs on the same ref.

## Secrets & environment

- No real secrets in YAML. CI-only placeholder values are 32+ chars to pass `envSchema` and are **not** production credentials.
- Production secrets (`JWT_SECRET`, `OAUTH_GOOGLE_*`, `DATABASE_URL`) come from GitHub Secrets at Go-Live — not configured in Sprint 0.

## Deliberate omissions

- **No deploy job** — `ASM-BACKLOG-07` deferred to Go-Live sprint.
- No Docker image build — not needed until a deploy target exists.
- `pnpm/action-setup` pinned to 9.15.9 to match root `packageManager`; global pnpm 11 on the dev machine is bypassed via corepack.

## Local equivalence for verification

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm --filter api prisma validate
corepack pnpm test
corepack pnpm build
docker compose up -d db
corepack pnpm test:e2e
```
