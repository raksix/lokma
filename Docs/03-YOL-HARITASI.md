# 03 — Roadmap

## Phase 0 — Setup ✅
- [x] Docs/ system created (`00-LOKMA-KONTEKST.md` as single source)
- [x] Research: Claude Code (10), OMP themes (11), harness arch (12), synthesis (13) — 5fe6bf1 + d17cc5a
- [x] Public repo `raksix/lokma` + README + .gitignore — 96ac29c → af2217a
- [x] Reposition: innovative harness (not clone) — 8bc7696
- [x] **Web harness docs set (English, 2026-08-31 01:45):**
  - [x] `20-overview` — why/principles/parity/arch
  - [x] `21-stack-alternatives` — decision matrix (A/B/C/D) — **awaiting your pick**
  - [x] `22-features` — provider/model/session/usage + Claude Code parity checklist
  - [x] `23-plugin-system` — DeepSeek Cordis-inspired everything-is-a-plugin
  - [x] `24-pane-system` — draggablesidebars, file browser, live logs, browser, orchestration
  - [x] `25-roadmap` — Phases 0→3 (this file's source)
  - [x] Raw: `raw/21` (60KB/712 lines), `raw/22` (61KB/1068), `raw/23` (74KB/1146)

## Phase 0 — Scaffolding (Next, after your stack pick)
> **Blocked on:** your stack decision (A/B/C/D from `21-*` §9)

- [ ] Monorepo: `packages/lokma-core` + `lokma-ai` + `lokma-shared` + `lokma-web` (`web/` + `server/`) + `themes/`
- [ ] lokma-core: Context kernel, ToolRegistry, SessionStore (JSONL), Provider types
- [ ] lokma-ai: Anthropic + OpenAI adapters, stream() abstraction
- [ ] **Config & credentials refactor** — `~/.lokma/config.json` + `~/.lokma/credentials.json` (AES-GCM, 0600) + `.lokma/settings.json` per project + env override, watcher + `config/changed` event, masked `GET /api/config`, `lokma config`/`auth`/`doctor` — see `26-CONFIG-and-CREDENTIALS.md`
- [ ] lokma-web/server: Fastify + WS, routes `/api/config` `/api/providers` `/api/models` `/api/sessions` `WS /ws/:sessionId`
- [ ] lokma-web/web: Next.js App Shell (header + left/right borders, Chat stub, mock WS)
- [ ] PM2 + nginx (67) — same pattern as notes.fermag/sunumly
- [ ] Auto-skills + memory + vault graph (see below — Phase 1/2 items, scaffold hooks in Phase 0)

## Phase 1 — Core Loop in Browser (1–2 weeks)
- [ ] Wire `lokma-core` loop to WS (real `text_delta`/`tool_*`/`permission` events)
- [ ] Chat (streaming, tool renderers, slash palette, @file mention, model switcher)
- [ ] Providers & Models UI + API (encrypted keys, `/v1/models` merge, per-provider enable)
- [ ] Sessions UI + API (list/search/new/fork/rename/delete/resume, JSONL shared with CLI)
- [ ] Usage (header badge + `/usage` dashboard + CSV export)
- [ ] Pane system v1 (flexlayout, Sessions/Chat/Files, persisted layout)
- [ ] File browser v1 (react-arborist, preview in Monaco, drag → @file)
- [ ] Auth (token → httpOnly cookie + Bearer)

## Phase 2 — Full Parity + Orchestration (2–3 weeks)
- [ ] MCP (4 transports, dynamic tools)
- [ ] Permissions / Hooks / Skills / Plugins (settings panels, plugin manager UI)
- [ ] Git panel (branch/diff/commit/PR)
- [ ] Live terminal logs (xterm.js, `terminal/data` WS)
- [ ] Browser preview (iframe/proxied, `browser_*` tools)
- [ ] Orchestration (Agent Hub, subagent tree, task fan-out)
- [ ] Pane system v2 (all tabs, drag session into session = split/fork/merge, reorder left)
- [ ] Projects pane, checkpoints, worktrees

## Phase 3 — Themes, Polish, Cloud (2–4 weeks)
- [ ] Themes (`claude`/`omp`/`midnight`/`paper`, live switch, CSS vars + Chalk)
- [ ] Desktop app (Tauri/Electron, later)
- [ ] Cloud mode (Docker/Firecracker per-session sandbox, `lokma.fermag.com.tr`)
- [ ] Sharing (public read-only link, JSONL/Markdown export), mobile, perf/a11y, `lokma doctor`

---

*Detail: `25-WEB-ROADMAP.md`. Your next move: pick stack (A/B/C/D) → `Scaffold Phase 0`.*
