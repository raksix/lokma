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
- 2026-09-05 — area A (backend sweep, run 1): probed ~70 live endpoints on PM2 lokma-server :3456 (45 collection GETs, 22 :id GETs, invalid-id + auth-negative + terminal/vault write round-trips, zero residue). Server error log EMPTY. Found + fixed 2 real bugs server-side, both verified live after restart: (1) `GET /api/agents/:id` on missing id returned HTTP 200 `{ok:false,error:'Not found'}` — now 404 `{code:agent_not_found,message}` matching PATCH/DELETE convention (registry.ts:231); (2) `GET /api/sessions/:id` on well-formed-but-unknown id returned HTTP 200 with a fabricated empty session — now 404 `{code:session_not_found}` matching fork/DELETE convention (real sessions still 200). By-design confirms (no fix): `/api/auth/me`+`/api/users` 401 unauthenticated, `/api/usage/export` 400 without `?format=` (200 csv/jsonl with real ledger rows), `/api/vault/note` 400 non-.md / 404 unknown. Typecheck 0 + dist rebuilt + lokma-server restarted via ecosystem file only; live `/` 401 anon/200 authed, `/health` 200. Commit 29a0e3c pushed. Next area: B.
- 2026-09-05 — area B (browser flows, run 1): headless Chromium click-through of the RUNNING app — 23/23 Inspector tabs ok, 20/20 tiling-bar buttons ok (pane counter 4→23, Reset restores), 5/5 real sidebar sessions load transcripts, sessions list + server-up badge live, 0 mock hits, 0 pageerrors, 0 failed requests after fix (was 7x `GET /api/sessions/:fresh-id` 404s per fresh boot — Chat fired 2 + every mounted Terminal/Git/Browser/Files/FilePreview pane fired 1 each for cwd). Found + fixed 1 real client bug class same run: session cwd/meta now resolves from the cached server list via new `useKnownSession(id)` hook (stores/session.ts, `'loading'|null|summary` states; cwd is create-time immutable so the cache is authoritative) wired into chat/index.tsx (waits for list, skips doomed GETs, `force` post-stream reload bypasses the guard since the WS loop creates the session server-side) + terminal/git/browser/file-browser/pane.tsx file preview (drop-resolve GET fallback kept: user-initiated, intentional). Plus inline SVG favicon in index.html (kills /favicon.ico 404). Proof: stores probe ALL PASS incl. 5 new asserts (unknown-id skip, force refetch, session_not_found→empty/no-error), web `tsc --noEmit` 0, dist rebuilt + lokma-web single-proc restarted via ecosystem file, live `/` 401 anon / `/health` 200. Commit 52a77a8 pushed. WORKING RECIPE (first green, reuse after): `NODE_PATH=/root/test-hermes/node_modules` playwright-core + executablePath `/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` + `--no-sandbox --disable-dev-shm-usage`, httpCredentials read at runtime from the creds file, fresh context per run, `domcontentloaded` + 6s settle. Next area: C.
