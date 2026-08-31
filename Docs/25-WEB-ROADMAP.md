# Web Harness — Roadmap

> **Docs are done, code is next.** This roadmap sequences the build so you can say "start Phase 1" and the harness gets scaffolded in the chosen stack.
> **Stack decision first:** Read `21-WEB-STACK-alternatives.md` and pick **A / B / C / D** (or a mix) before scaffolding. Everything below assumes **Stack A** (Next.js + Fastify + flexlayout + Zustand + WS/SSE).

## Phase 0 — Scaffolding (1–2 days)

Goal: monorepo builds, two surfaces talk to the same loop, empty panes render.

- [ ] **Monorepo:** `pnpm workspaces` or `bun workspaces`, `packages/lokma-core`, `lokma-ai`, `lokma-shared`, `lokma-web` (with `web/` + `server/`), `themes/`, root `tsconfig`, `eslint`, `prettier`.
- [ ] **lokma-core:** Extract/share: `Context` kernel (~300 lines), `ToolRegistry`, `SessionStore` (JSONL), `Provider` types (Zod in `lokma-shared`), agent loop stub (`query()` generator returning mock stream).
- [ ] **lokma-ai:** Provider adapters (Anthropic + OpenAI first), `stream()` abstraction, mock `models` catalog.
- [ ] **lokma-web/server:** Fastify 5 + `@fastify/websocket` + `@fastify/cors`, routes: `GET /health`, `GET /api/providers`, `GET /api/models`, `GET /api/sessions`, `WS /ws/:sessionId` (echo mock).
- [ ] **lokma-web/web:** Next.js 15 (App Router) + Tailwind v4 + shadcn/ui, App Shell: header + left/right borders (static, no flexlayout yet), Chat stub (input + mock messages), `pnpm dev` runs both server + web concurrently.
- [ ] **PM2 + nginx:** `lokma-web :3456` (local) or `lokma.fermag.com.tr` (cloud), same pattern as `notes.fermag :3008`, `sunumly :3021`.
- [ ] **Docs update:** `02-TEKNIK-KARARLAR.md` with chosen stack, `03-YOL-HARITASI.md` with this roadmap.

**Exit criteria:** `lokma web --port 3456` → browser shows shell + mock chat streams over WS, two surfaces import the same `lokma-shared` schemas.

---

## Phase 1 — Core Loop in the Browser (1–2 weeks)

Goal: Real agent turns in the web, same loop as CLI.

- [ ] **Wire lokma-core loop to WS:** `/ws/:sessionId` handler calls `query()` generator, forwards `text_delta` / `tool_start` / `tool_result` / `permission_request` / `ask_user_question` / `done` + `cost` events to client. Client renders them.
- [ ] **Chat:** Full streaming chat — `text_delta` append, tool renderers (Read/Edit/Bash/Grep), permission card (`Allow/Deny/Always`), `AskUserQuestion` choices, `/` slash palette (from `commands` plugin), `@` file mention (from file tree), `Ctrl+M` model switcher (enabled models only).
- [ ] **Providers & Models (UI + API):** `Settings → Providers` (add/edit/test/delete, key encrypted) + `Settings → Models` (enable per provider, checkbox table, search, `GET /api/models` merge + cache) — spec in `22-*` §1–2.
- [ ] **Sessions (UI + API):** `SessionsPane` (list, search, `+ New`, click → load), `POST /api/sessions`, `PATCH /rename`, `POST /fork`, `DELETE`, resume via WS replay. JSONL same files as CLI — `lokma` CLI and web read the same `~/.lokma/projects/`.
- [ ] **Usage:** `Usage` pane/page (KPI cards + `recharts` AreaChart by model + session table + CSV export), `GET /api/usage/*` — spec in `22-*` §3.
- [ ] **Pane system v1:** `flexlayout-react` integrated, model persisted to `localStorage`, layout: Left `Sessions` / Center `Chat` / Right `Files` — drag/resize/collapse working, config via `lokma.patch.yml`.
- [ ] **File browser v1:** `react-arborist` tree, `GET /api/files`, click → preview in Code pane (Monaco read-only), drag → `@file` in chat.
- [ ] **Auth:** `lokma auth` token → httpOnly cookie + `Bearer` fallback, `POST /api/auth/login` → sets cookie, all `/api/*` gated.

**Exit criteria:** Create session → pick model (only enabled) → prompt → stream response with tools → switch model mid-session → see token cost in header + Usage page → resume same session from CLI (`lokma --resume <id>`) and see the same transcript.

---

## Phase 2 — Full Parity + Orchestration (2–3 weeks)

Goal: Every Claude Code feature from `10-*` reachable in web; orchestration and pane system complete.

- [ ] **MCP:** `Settings → MCP` (add 4 transports: stdio/http/sse/ws, test, enable, same `.mcp.json` as CLI), dynamic tools in registry.
- [ ] **Permissions / Hooks / Skills / Plugins:** Settings panels for each, slash commands from skills, hooks table (`PostToolUse` etc.), plugin manager (`23-*` UI: installed list, marketplace, add from URL, enable/disable without restart).
- [ ] **Git:** `GitPane` (branch, `git status` diff, commit log, `gh` PR flow, `@lokma` config), diff viewer in Code pane (`hashline` style).
- [ ] **Live terminal logs:** `xterm.js` in right pane, `terminal/data` WS events from harness PTY, multiple `bash:*` tabs.
- [ ] **Browser preview:** `BrowserPane` (iframe/proxied), `browser_*` tools, harness can `navigate`/`click`/`screenshot` and user watches live.
- [ ] **Orchestration:** `OrchestrationPane` + `Alt+A` Agent Hub — running agent tree, subagent transcripts, task fan-out, `Cancel` per agent.
- [ ] **Pane system v2:** All tabs from `24-*` §1.1 (Code, Git, Orchestration, Usage, Browser), drag session into session (drop = split/fork/merge), reorder left sidebar tabs, `localStorage: lokma:layout:v1` + `lokma --dump-layout`.
- [ ] **Project picker:** `ProjectsPane` (cwd list, `+ Add project`, switch), `Group by project` toggle in Sessions.
- [ ] **Checkpoints / worktrees:** `Rewind` button per edit, `⎇` worktree pill in header, `New Session → Worktree` toggle.

**Exit criteria:** Web can do everything Claude Code does: MCP tools appear, hooks fire, skills run, git PR created, agents orchestrated, checkpoint rewound — all from the browser, no terminal needed.

---

## Phase 3 — Themes, Polish, Cloud (2–4 weeks)

Goal: Beautiful, shippable, shareable.

- [ ] **Themes:** `themes/*.json` → CSS vars + Chalk tokens, `lokma theme set <name>`, four MVP themes (`claude`/`omp`/`midnight`/`paper`), `Settings → Appearance` dropdown, live switch.
- [ ] **Desktop app (optional):** Tauri or Electron shell wrapping the same `lokma-web` bundle, native file picker, system tray.
- [ ] **Cloud mode:** Docker/Firecracker per-session sandbox, `lokma.fermag.com.tr` deployment (PM2 + nginx + SQLite→Postgres + S3 for JSONL), `/api/files` proxied to sandbox volume.
- [ ] **Sharing:** `Share session` → public link (read-only transcript), `Export` (JSONL / Markdown).
- [ ] **Mobile:** Responsive App Shell (left drawer, right sheet on `<768px`).
- [ ] **Perf & a11y:** Virtualized chat (`react-virtuoso`), keyboard nav (every action has a shortcut), `prefers-reduced-motion`, Lighthouse 90+.
- [ ] **Polish:** Onboarding (`lokma init`), empty states, error boundaries, offline banner, `lokma doctor`.

---

## Dependencies & Sequencing

```
21 (decision) → 0 (scaffold) → 1 (loop+chat+providers/models/sessions/usage+panes v1)
                                    ↓
                           2 (MCP+perms+hooks+skills+plugins+git+terminal+browser+orchestration+panes v2)
                                    ↓
                           3 (themes+cloud+sharing+polish)
```

- Phase 1 is the MVP milestone — demoable, dog-foodable.
- Phase 2 is parity — the "everything Claude Code does, web does too" promise.
- Phase 3 is polish — the "ballandır" that makes Lokma feel innovative, not cloned.

## What I Need From You Now

1. **Stack decision:** Reply `A` / `B` / `C` / `D` or a mix (see `21-*` §9).
2. Then: **"Scaffold Phase 0"** — I build the monorepo in the chosen stack, `git push`, and you can `lokma web` locally.

No code until you decide. Docs are the contract — code follows the contract.

---

*Related: `20-overview` · `21-stack` · `22-features` · `23-plugins` · `24-panes`*
