# TEST LOOP LOG — Lokma full-system test (1000 iterations)

> Job: `lokma-test-loop` · every 5m · Workdir: `/mnt/apopic/lokma`
> Goal: a WORKING system on REAL data — backend endpoints green, browser flows green,
> screenshots reviewed, design fixed, README fresh, harness proven with a demo project,
> Docs compliance verified. Each run owns ONE area (rotate A→F), fixes what it finds,
> commits + pushes instantly, deploys live, logs here.

## Rotation areas (one per run, in order)

- **A. Backend sweep** — hit EVERY endpoint in `packages/lokma-web/server/src/routes/*.ts`
  (27 files: agents, archify, auth, bots, browser, cloud, commands, config, cron, design,
  files, git, health, memory, models, observability, plugins, providers, sessions, setup,
  skills, terminal, tests, themes, usage, vault, ws). Live probes against PM2
  `lokma-server` :3456 (temp HOME isolation where FS state matters). Read server logs
  (`pm2 logs lokma-server --lines 100 --nostream`) for errors. Fix failures server-side,
  same run. Creds for authed paths: `/root/.lokma-basic-auth` (path only, never values).
- **B. Browser flows** — headless Chromium (repo recipe: `NODE_PATH=/root/test-hermes/node_modules`
  playwright-core + `/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` under
  xvfb; record the WORKING recipe here on first green run, reuse after). Login via nginx
  basic auth (creds file), click through panes/flows, assert live data (no mocks), fix
  client bugs same run.
- **C. Screenshots + design** — full-page screenshots of EVERY pane/view, review each
  image with vision, fix design flaws (spacing, overflow, dark mode, labels, dead controls).
  Store shots under `/tmp/lokma-shots/<date>/` (NOT in git).
- **D. README + Docs compliance** — README.md must describe the REAL system (features,
  ports, auth, screenshots optional); verify every Docs/20-37 feature claim exists in the
  running app; mark gaps as new work items in Docs/00 Sıradaki adım.
- **E. Harness demo project** — build a SMALL demo project WITH lokma itself
  (via CLI `lokma` / harness chat), proving the agent loop works end-to-end on real tasks.
  Keep it under `/tmp/lokma-demo/` (NOT in git unless it becomes a fixture).
- **F. Regression + live** — root tsc + web/server builds + full test suites + live deploy
  verify (`/` 200 with creds / 401 without, `/health` 200, bundle hash == disk dist).

## Rules

- One area per run, next area = (last area + 1). Never leave tree dirty; atomic English
  commits + `git push origin main` instantly; docs (this log + Docs/00) committed + pushed.
- `concept/` frozen. `pm2 kill` forbidden; single-proc recovery only via ecosystem file.
- Secrets (basic-auth user/password) NEVER in Docs/prompts/commits/logs — only paths.

## Run log (newest at bottom)

- 2026-09-05 — log created. Next area: A.
