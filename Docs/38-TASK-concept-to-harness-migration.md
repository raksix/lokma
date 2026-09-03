# TASK-38 — Migrate Concept Design into the Real Web Harness (and Make It Work)

> Status: OPEN · Created: 2026-09-03 · Owner: Furkan + Hermes
> Goal: move every pixel and interaction from `concept/` (mock design) into
> `packages/lokma-web/web/` (real harness frontend) wired to
> `packages/lokma-web/server/` (real Fastify backend) — no mocks left on the happy path.
> Docs 20-37 are the spec. This file is the execution plan.

---

## 0. Definitions (read first, prevents confusion)

| Term | Path | What it is |
|---|---|---|
| Concept design | `concept/` (Vite 6 + React 19, standalone) | Clickable mock. All data hardcoded. `concept/src/App.tsx` (465 lines) + 21 `*Pane.tsx` + `panes/` (TilingBar/SplitTree/WindowedCanvas) + `chat/` (5 files). Build: `bun run build` → 1863 modules, 497k JS, green. |
| Real harness web | `packages/lokma-web/web/` (Vite SPA) | Thin stub today: `App.tsx`, `main.tsx`, `index.css`, `hooks/use-ws.ts`, `lib/api.ts`, `lib/ws.ts`, `components/` (app-shell/header/sidebar only). This is the migration TARGET. |
| Real harness server | `packages/lokma-web/server/src/` (Fastify 5) | Routes exist as files: `health, config, providers, models, sessions, skills, agents, vault, ws` (+ `plugins/cors, websocket`, `utils/masked`). Each route must be audited — some are stubs. |
| Shared kernel | `packages/lokma-core`, `packages/lokma-ai`, `packages/lokma-shared` | Already scaffolded (session store, providers, WS protocol types, Zod schemas). Frontend must consume these via the server, never re-implement them. |

**Non-goals (explicitly OUT of this task):** CLI/TUI changes, Tauri/Electron packaging,
cloud deploy (PM2/nginx), new Docs research, theme redesign, mobile app. Those are separate tasks.

**Golden rule:** no pane ships with mock data on its primary view. If the backend
endpoint does not exist yet, implement the endpoint in the SAME wave (server + web
in one atomic commit set), never "UI now, API later".

---

## 1. Current-state inventory (verified 2026-09-03, do not assume — re-check before coding)

### 1.1 Concept source files (COPY FROM here, never edit concept/ during migration)

`concept/src/` layout (all paths relative to repo root):

- `concept/src/App.tsx` — shell: left/right collapse + widths (268/300, localStorage
  `lokma-pane-left`), `tiling`, `windowed`, `LayoutNode` row/col split tree (persist
  `lokma:layout:v1`), `handleOpenTab/handleOpenFile/handleForkFrom/splitPane/closePane`,
  `Ctrl/Cmd+K` search, `[`/`]` sidebars, `Escape` close, `lokma-toast` event bus.
- `concept/src/components/layout/` (21 files): `Pane.tsx` (tab bar, drag-to-split with
  5 drop zones, resize e/s/se handles, per-pane Composer), `SidebarLeft.tsx`
  (Sessions/Projects tabs, worktree pill, checkpoints), `FileBrowser.tsx`
  (files/terminal/browser tabs), `Composer.tsx` (steer/queue modes, model dropdown,
  file attach, mic), `TerminalPane.tsx`, `BrowserPane.tsx` (per-agent tabs),
  `OrchestrationPane.tsx`, `GitPane.tsx` (3-layer safe banner), `VaultPane.tsx`
  (FTS5 + SVG graph 2D/3D + depth slider + wikilink), `UsagePane.tsx` (SVG AreaChart),
  `SettingsPane.tsx` (6 tabs: Providers/Models/Config/Appearance/Permissions/MCP),
  `SkillsPane.tsx`, `TestingPane.tsx` (6-stage), `BotsPane.tsx` (Gallery, lokma-ceo featured),
  `AgentHubPane.tsx` (caps 20/5/20, SOUL/MEMORY), `ArchifyPane.tsx` (5 types, viewer
  contract), `DesignStudioPane.tsx` (6 artifacts), `AuthPane.tsx` (RBAC/can matrix),
  `SetupWizardPane.tsx` (init + doctor 8 checks), `PluginMarketplacePane.tsx` (Cordis),
  `ObservabilityPane.tsx` (trace timeline), `CronApprovalsPane.tsx`, `ExtrasPane.tsx` (23 ranked),
  `Header.tsx`, `SearchModal.tsx` (docs RAG mock), `MobilePane.tsx`, `ShellParts.tsx`.
- `concept/src/components/panes/`: `TilingBar.tsx` (18 `onOpen*` props),
  `SplitTree.tsx`, `WindowedCanvas.tsx`.
- `concept/src/components/chat/`: `SingleChatView.tsx`, `LokmaMessage.tsx` (permission
  card + AskUserQuestion), `UserMessage.tsx`, `ChatNav.tsx`, `HeroSection.tsx`.
- Style tokens (must be preserved 1:1): cream `#FAF9F5`, terracotta `#C96442`
  (hover `#B85736`), ink `#262624`, line `#E8E4DE`, muted `#F2F0EB`; fonts Inter /
  Instrument Serif / JetBrains Mono; `h-7` pane headers `bg-[#FDFCFB]` /
  dark `bg-[#1E1E21]`; lucide-react icons only (no emoji).

### 1.2 Harness target files (MIGRATE INTO here)

- `packages/lokma-web/web/src/App.tsx`, `main.tsx`, `index.css`, `vite.config.ts`
  (must proxy `/api` + `/ws` → server port, see Docs/25 Phase 0 exit).
- `packages/lokma-web/web/src/lib/api.ts`, `lib/ws.ts`, `lib/utils.ts`,
  `hooks/use-ws.ts`, `components/app-shell.tsx`, `header.tsx`, `sidebar.tsx`.
- `packages/lokma-web/server/src/routes/*.ts` — audit each before its wave.
- Contracts: `packages/lokma-shared/src/protocol/ws.ts`, `protocol/types.ts`,
  `schemas/*.ts` — frontend types must import from here (or be code-generated from
  Zod), never hand-duplicated.

### 1.3 Pre-flight checklist (do this FIRST, one commit max, no UI yet)

1. `read_file` every `server/src/routes/*.ts` + `plugins/*.ts` and mark each endpoint
   REAL vs STUB in a table inside this file's §9 execution log.
2. `read_file` `web/src/lib/api.ts`, `lib/ws.ts`, `hooks/use-ws.ts` — keep if usable,
   rewrite if stub.
3. Run `bun install` at root, then per-package `tsc --noEmit` (root `bun x tsc --noEmit`
   per TUI guard) + `bun run build` in `concept/` (baseline must stay green).
4. Decide server port (default `:3456` per Docs/25) and set `web/vite.config.ts` proxy.
   Record the decision in §9.

---

## 2. Target architecture (how the real thing fits together)

```
browser ──HTTPS──> packages/lokma-web/web (Vite SPA, this migration)
   │  REST /api/* ──> packages/lokma-web/server (Fastify 5)
   │  WS   /ws/:sessionId ──> server/plugins/websocket.ts
   │                                │ calls
   │                                v
   │                    packages/lokma-core (Context kernel, SessionStore JSONL,
   │                      ToolRegistry, agents/orchestrator/locks/worktree,
   │                      memory/manager, skills/registry, config/loader)
   │                    packages/lokma-ai (provider adapters, stream(), catalog)
   │                    packages/lokma-shared (Zod schemas + WS protocol types)
```

- Streaming: server `query()` generator → WS frames `text_delta / tool_start /
  tool_result / permission_request / ask_user_question / terminal/data /
  terminal/exit / agent/start / agent/delta / agent/end / done+cost`
  (exact frame names from `lokma-shared/src/protocol/ws.ts` — read it, do not invent).
- State: URL holds `sessionId` + active pane; Zustand (or React context if already
  chosen) holds pane model; `localStorage: lokma:layout:v1` keeps layout (same shape
  as concept — port the type, do not redesign).
- Auth: `lokma auth <token>` (CLI) → httpOnly cookie + `Authorization: Bearer`;
  every `/api/*` (except `/health`) goes through `preHandler` JWT verify; RBAC
  `can()` matrix from Docs/36 enforced server-side (pane only mirrors it).

---

## 3. Foundation wave (W0 — nothing visual ships without this)

**F1. API client** (`web/src/lib/api.ts`): typed `GET/POST/PATCH/DELETE` wrapper,
cookie+Bearer attach, 401 → redirect login, error shape `{ code, message }`
matching server `errors.ts`-style responses. One function per endpoint group
(`listSessions`, `forkSession`, `testProvider`, …). Unit-test the 401 path.

**F2. WS client** (`web/src/lib/ws.ts` + `hooks/use-ws.ts`): connect
`/ws/:sessionId`, auto-reconnect with backoff, typed frame dispatch, per-frame
React state reducers (append-only transcript log, tool-call map, cost accumulator).
Expose `sendText`, `answerPermission`, `answerQuestion`, `interrupt`.

**F3. Stores**: `sessionStore` (sessions list, active session, transcript),
`paneStore` (layout tree + open tabs + `activeSessionId`, persisted to
`lokma:layout:v1` with version guard), `providerStore` (providers/models cache 5m),
`agentStore` (agents, locks HUD, bus mailbox). Server is source of truth; stores
are caches with explicit invalidation on WS events.

**F4. Shell chrome**: port `Header` (model switcher `Ctrl+M`, cost badge
`12.3k · $0.04`, theme toggle `localStorage lokma-theme`, search `Ctrl+K`),
`Toast` (`lokma-toast` bus), `SearchModal` (REAL: `GET /api/vault/graph?q=` +
sessions search — delete the mock DOCS array), `FooterBar`, error boundary per
pane (a crashing pane must never blank the app), offline banner (WS disconnected).

**F5. Theme**: copy `concept/src/index.css` tokens 1:1 into `web/src/index.css`
(Tailwind v4 `@theme`). Verify 4 themes (claude/omp/midnight/paper) toggle live.

**W0 acceptance:** `lokma web --port 3456` → shell renders, login works, WS connects,
`GET /health` green, no mock imports remain in shell files.

---

## 4. Migration waves (strict order — each wave is shippable, commit per pane)

### W1 — Chat core (the product lives or dies here)

1. **SingleChatView + Composer** ← `concept/.../chat/SingleChatView.tsx`,
   `layout/Composer.tsx`. Real send → WS `text_delta` streaming; Enter send /
   Shift+Enter newline; `@file` mention inserts real path (from FileBrowser) and
   server includes file in context; `/` slash palette (real command list from server);
   `Ctrl+M` model switch mid-session (server `PATCH /api/sessions/:id`); stop button
   → WS interrupt; fork → `POST /api/sessions/:id/fork` + new tab; edit/rewind/copy
   per message (rewind = server checkpoint restore, not just UI scroll).
2. **LokmaMessage** ← `chat/LokmaMessage.tsx`: Thought collapsible (real tool-call
   trace from `tool_start/tool_result`), code blocks with Copy + Open-in-pane
   (real file open), **permission card** (Allow/Deny/Always → WS answer +
   persist rule via `PATCH /api/config` permissions), **AskUserQuestion** (options
   → WS answer; blocks stream until answered), cost footer from `done.cost` frame.
3. **Sessions (SidebarLeft)** ← `layout/SidebarLeft.tsx`: `GET /api/sessions`
   (virtualized, Today/Yesterday/Earlier or By-project), `POST /api/sessions`,
   rename/fork/delete/resume, search, `+ New Session`. Drag session → pane =
   side-by-side / merge / fork dialog (real `POST /fork`, `POST /merge`).
4. **HeroSection/empty states** ← `chat/HeroSection.tsx`: keep starter cards, each
   card creates a REAL session with the prompt prefilled.

W1 acceptance: create session → stream tokens with 1+ tool call → approve a
permission → switch model mid-chat → fork → resume same transcript from CLI
(`lokma --resume <id>` shows the web transcript). No mock strings in chat files
(`grep -rn "Mock yanıt\|Alındı — pane" web/src` must be empty).

### W2 — Providers / Models / Usage / Config (SettingsPane slices)

5. **Providers tab** ← `SettingsPane` Providers section → `GET/POST/PATCH/DELETE
   /api/providers`, `POST /api/providers/:id/test` (live `/v1/models` check),
   priority order persisted, `keySet` boolean only (NEVER key values to client;
   server masks, see `server/src/utils/masked.ts`). Add-provider dialog validates
   ID/Name/BaseURL/Key.
6. **Models tab** ← SettingsPane Models: `GET /api/models` (merged
   `provider::id`, 5m cache), enable/disable per model, bulk update. Composer
   dropdown reads THIS store (single source, delete concept's hardcoded MODELS).
7. **Usage** ← `UsagePane.tsx`: `GET /api/usage/summary?range=7d|30d|90d`,
   `GET /api/usage/sessions`, `GET /api/usage/export?format=csv|jsonl` (real
   download). Keep the SVG AreaChart component, feed real series. Header cost
   badge polls summary (60s) or updates on `done.cost` frames.
8. **Config + Appearance + Permissions + MCP tabs**: `GET/PATCH /api/config`
   (layered `~/.lokma/config.json` → `.lokma/settings.json` → env — server owns
   merge, UI only edits), theme live toggle (persist server + localStorage),
   permission rules list = same data as chat permission card, MCP servers
   (4 transports stdio/http/sse/ws, enable/disable, same `.mcp.json` as CLI).

W2 acceptance: add provider → test connection green → its models appear in Models
tab AND Composer dropdown → chat with one → Usage chart + CSV export include it.

### W3 — Files / Terminal / Git / Browser (right-side power tools)

9. **FileBrowser** ← `layout/FileBrowser.tsx`: `GET /api/files?cwd=&path=`
   (virtualized tree, git status overlay M/A/D/?), `GET /api/files/read`
   (Monaco read-only preview → writable editor with save = real file write +
   `expectedSha` guard), drag file → chat = `@path`, right-click copy path/relative,
   `Ctrl+P` quick-open (fuzzy over real tree).
10. **TerminalPane** ← `layout/TerminalPane.tsx`: xterm attach to harness PTY via
    `terminal/data` + `terminal/exit` WS frames; per-tool-call tabs (`bash:1`…);
    Clear/Copy/Follow; kill button ends the real PTY. Multi-agent tabs from agentStore.
11. **GitPane** ← `layout/GitPane.tsx`: `git status` (real), branch, commit+push
    buttons (server runs git, streams output to terminal pane), 3-layer safe banner
    driven by REAL lock/worktree state (`GET /api/agents/:id/locks`), owner pills.
12. **BrowserPane** ← `layout/BrowserPane.tsx`: per-agent tabs via
    `POST /api/browser/open` → `{ tabId }`, address bar = `browser_navigate`,
    screenshot frames rendered live, Back/Forward/Reload call real tools. Worktree
    scope label per tab.

W3 acceptance: open repo file → edit → save → GitPane shows M → commit from pane →
file used as `@mention` in chat and cited by the model.

### W4 — Agents / Orchestration / Vault / Skills (multi-agent + memory)

13. **AgentHubPane** ← `layout/AgentHubPane.tsx`: `GET/POST /api/agents`
    (create with persona/model/cwd/budgets), pause/resume/kill/fork/clone/delete,
    capsHonor (`maxAgents=20/maxConcurrent=5/maxQueue=20` — server 429s when full,
    UI shows queue position), SOUL.md + MEMORY.md editors (`PATCH /api/agents/:id`
    writes real files under `~/.lokma/agents/<id>/`), per-agent model + budgets +
    TokenLedger.
14. **OrchestrationPane** ← `layout/OrchestrationPane.tsx`: live tree from
    `agent/start|delta|end` frames (root session → children with task/status/elapsed),
    transcript expand per agent, Cancel per agent + Cancel-all, fan-out controls
    (`parallel()` 3–20 with progress bar), pipeline view. This pane is LIVE state;
    AgentHub is REGISTRY — keep the split.
15. **VaultPane** ← `layout/VaultPane.tsx`: `GET /api/vault/graph?folder=&depth=&q=`
    (FTS5 search + real graph, 2D default / 3D toggle, depth slider 1–3),
    `[[wikilink]]` click opens note pane (`GET /api/vault/note`), ingest
    (`POST /api/vault/ingest` with `provenance: agentId`), Obsidian backend badge.
16. **SkillsPane** ← `layout/SkillsPane.tsx`: `GET /api/skills` (real registry scan
    `skills/` + `~/.lokma/skills/`), `skill_view` trie preview, `PATCH
    /api/skills/:id` (curator patch), usage telemetry in rows.

W4 acceptance: `lokma agent create reviewer` (CLI) appears in Hub <2s via WS;
spawn 3 agents → Orchestration tree live → kill one → locks HUD clears; vault
search returns a real note; skill patch persists and re-renders prompt.

### W5 — Builder tools (Archify / Design / Testing / Bots)

17. **ArchifyPane** ← `layout/ArchifyPane.tsx`: 5 diagram types via REAL `archify`
    tool (server runs it, streams progress), IR JSON preview, Before/Delta/After,
    share card export, receipt gates. Storage `~/.lokma/archify/<id>/`.
18. **DesignStudioPane** ← `layout/DesignStudioPane.tsx`: 6 artifact types via REAL
    design pipeline, DESIGN.md guard picker (real `.lokma/DESIGN.md` parsed
    server-side), sandbox iframe preview of REAL output, exports
    HTML/PDF/PPTX/ZIP/MP4.
19. **TestingPane** ← `layout/TestingPane.tsx`: Test Lab Plan→Run→Report →
    `POST /api/tests/run` (server executes, streams per-test video/trace paths),
    Shannon suite, `junit.xml` download, run history `~/.lokma/test-runs/<id>/`.
20. **BotsPane** ← `layout/BotsPane.tsx`: `GET /api/bots` (real `bot.json`
    registry incl. lokma-ceo featured), playground `POST /api/bots/:id/run`
    (streams into a session), fork/publish (writes `~/.lokma/bots/<id>/bot.json`).

W5 acceptance: generate one archify diagram + one design artifact + one test run +
one bot run, all from panes, all artifacts on disk where Docs say they live.

### W6 — System panes (Auth / Setup / Marketplace / Observability / Cron / Extras)

21. **AuthPane** ← `layout/AuthPane.tsx`: login (`lokma auth` code → cookie),
    RBAC matrix (read from server `GET /api/auth/settings`, edits via PATCH —
    server enforces), project members + invite (`POST /api/projects/:id/invite`),
    visibility toggle (server-side scoping, verify by logging in as viewer).
22. **SetupWizardPane** ← `layout/SetupWizardPane.tsx`: 3-step `lokma init`
    (writes REAL `~/.lokma/config.json` via server), stack checkboxes, Doctor
    8 checks = REAL `lokma doctor --agents` output streamed (`GET /api/doctor`).
23. **PluginMarketplacePane** ← `layout/PluginMarketplacePane.tsx`: Cordis plugin
    list from server (`ctx.tools/llm/sessions` manifest), enable/disable WITHOUT
    restart (server hot-reload), install-from-URL (server validates + sandboxes).
24. **ObservabilityPane** ← `layout/ObservabilityPane.tsx`: REAL trace timeline
    from `TokenLedger` + bus log (`GET /api/agents/:id/trace`), Replay (re-renders
    transcript from JSONL), Share (`POST /share/agent` → public link).
25. **CronApprovalsPane** ← `layout/CronApprovalsPane.tsx`: per-agent cron CRUD
    (`GET/POST/DELETE /api/agents/:id/cron`), approvals queue (Allow/Deny/Always
    writes the SAME rule store as chat permission card — one store, two views).
26. **ExtrasPane** ← `layout/ExtrasPane.tsx`: 23 ranked ideas become a REAL
    feature-flag board (`GET/PATCH /api/config` flags) — toggling actually enables
    the capability (or shows its real milestone, never a dead switch).

W6 acceptance: fresh `~/.lokma` → SetupWizard completes init → doctor 8/8 →
login as viewer gets 403 on admin writes → cron created in pane fires on server.

### W7 — Pane system itself (port, do not rebuild)

27. Port `Pane.tsx` (tabs, 5-zone drag split, resize handles, per-pane Composer
    host), `SplitTree.tsx`, `WindowedCanvas.tsx`, `TilingBar.tsx` (keep all 18
    `onOpen*` actions, now opening REAL panes), `App.tsx` shell state + layout
    persist (same `lokma:layout:v1` key so concept-saved layouts keep working).
    Delete the mock `handleOpenTab("Yeni mesaj", …)` Composer path — Composer sends
    to the session, not to a fake tab.

W7 acceptance: drag session→pane (split/fork/merge), drag file→chat, windowed
drag, tiling toggle, save/reset layout — all against live data, zero mock content.

---

## 5. Per-pane migration card template (copy for every pane, fill during work)

```md
### <PaneName> — <Docs §>
- Source: `concept/src/components/layout/<File>.tsx` (<N> lines)
- Target: `packages/lokma-web/web/src/...` (mirror path `components/layout/<File>.tsx`)
- Mock → real map:
  | Mock (concept) | Real (harness) | Endpoint / WS frame |
  |---|---|---|
  | ... | ... | ... |
- Server work needed: <route file + handler, or NONE>
- Shared-schema touch: <Zod schema in lokma-shared, or NONE>
- Acceptance: <3-6 checkable bullets, each observable in browser or on disk>
- Commit: `feat(web): migrate <PaneName> pane to harness (<what is real now>)`
```

---

## 6. Verification gates (every wave, no exceptions)

1. `bun x tsc --noEmit` at root — 0 errors (TUI guard: never `./node_modules/.bin/tsc`).
2. `bun run build` in `packages/lokma-web/web` — 0 errors.
3. Server `bun run build` (or `tsc -p`) in `packages/lokma-web/server` — 0 errors.
4. `grep -rn "Mock\|mock yanıt\|TODO\|FIXME\|placeholder" packages/lokma-web/web/src`
   — primary views must be clean (loading/empty states are fine, fake data is not).
5. Manual E2E per wave acceptance (record exact clicks + expected server log lines).
6. `lokma web --port 3456` smoke: login → chat streams → cost badge moves → reload
   keeps layout + transcript.
7. Atomic English commits + `git push origin main` after EACH pane (user rule:
   commit immediately, never batch a wave into one commit).

---

## 7. Commit plan (order = wave order; one pane = one commit minimum)

- `chore(web): scaffold foundation — api/ws clients, stores, shell chrome, theme port`
- `feat(web): migrate <Pane> pane to harness (...)` × 26
- `feat(server): <endpoint> for <pane>` interleaved where server work was needed
- `docs: update 00-KONTEKST + TASK-38 execution log (wave N)`
- Never touch `concept/` in these commits (concept stays frozen as the visual reference).

---

## 8. Risks & known traps

- **PM2 env contamination** (`NODE_ENV`/`NODE_CHANNEL_FD` break builds; stale
  `WEB_ORIGIN` needs delete+start, not restart) — use sterile env for builds.
- **ESM import drift**: frontend types must follow `lokma-shared` Zod schemas;
  hand-duplicated types WILL rot — import, don't copy.
- **Secret leakage**: `keySet` booleans only; never render keys/tokens (server masks).
- **Scope creep**: a pane is DONE when its card acceptance passes — polish goes to
  a follow-up task, not this migration.
- **concept/ edits**: FORBIDDEN during migration (it is the reference screenshots +
  behavior spec). If concept has a bug, file it in §9 and fix AFTER migration.

---

## 9. Execution log (fill as waves land — newest at bottom)

- 2026-09-03 — TASK-38 created (this file). Pre-flight (§1.3) not yet run.
- 2026-09-03 — W0 pre-flight DONE (audit + baseline only, zero code changes).
  Server route REAL-vs-STUB audit (read fresh 2026-09-03, `packages/lokma-web/server/src/routes/`):
  | Endpoint | File | Verdict |
  |---|---|---|
  | `GET /health`, `GET /api/health` | `health.ts` | REAL — liveness probe, no auth |
  | `GET /api/config`, `GET /api/config/effective` | `config.ts` | REAL — `loadConfig(cwd)` + masked creds |
  | `PATCH /api/config` | `config.ts` | STUB — echoes `patched` keys, "Phase 0 stub — save lands in Phase 1" |
  | `GET /api/providers` | `providers.ts` | REAL — registry list + `keySet`/`last4` only (never raw keys) |
  | `POST /api/providers/:id/test` | `providers.ts` | STUB — returns "Phase 0 mock", no live `/v1/models` check |
  | `GET /api/models` | `models.ts` | REAL — merged `getCatalog()` (5m cache per header comment) |
  | `GET /api/sessions`, `GET /api/sessions/:id` | `sessions.ts` | REAL — `SessionStore` JSONL read, same files as CLI |
  | `POST /api/sessions` | `sessions.ts` | REAL (thin) — creates session via marker append; no fork/merge/rename/delete yet |
  | `GET /api/agents`, `GET /api/agents/:id` | `agents.ts` | REAL (read-only) — `listAgents`/`getAgent`, caps 20/5; no create/pause/kill yet |
  | `GET /api/skills`, `GET /api/skills/:id` | `skills.ts` | REAL (read-only) — `scan()` registry; no PATCH curator yet |
  | `GET /api/vault/graph`, `GET /api/vault/tree` | `vault.ts` | STUB — empty nodes/links, "Phase 0 stub — graph in Phase 2" |
  | `GET /ws/:sessionId` | `ws.ts` | PARTIAL — real SessionStore persist + real `lokma-ai stream()`, BUT: model hardcoded `anthropic/claude-sonnet-4-5`, cost hardcoded `$0.002`, replay prefixed `[replay]`, no `tool_start/tool_result/permission_request/ask_user_question` frames, no Zod `decodeClientMessage` (raw JSON parse) |
  | Missing entirely (later waves) | — | usage/files/terminal/browser/git/auth/bots/tests/archify/design/cron/observability routes; session fork/merge/rename/delete/resume; agent create/pause/kill; provider CRUD |
  Web client audit (`packages/lokma-web/web/src/`):
  | File | Verdict |
  |---|---|
  | `lib/api.ts` | KEEP + extend in F1 — thin `fetchJson` + typed fetchers (health/config/providers/models/sessions) work; missing `{code,message}` error shape, 401→login redirect, per-group fns (`forkSession`, `testProvider`, …) |
  | `lib/ws.ts` (`wsUrl`) | KEEP + fix in F2 — works in dev but hardcodes direct `:3456` (bypasses vite `/ws` proxy); F2 must prefer relative-URL proxy path with direct fallback |
  | `hooks/use-ws.ts` | KEEP + extend in F2 — connect/`text_delta`/`done`/error + `sendPrompt` work; missing auto-reconnect backoff, typed frame reducers, `answerPermission`/`answerQuestion`/`interrupt` |
  Vite proxy decision: KEEP as-is, no change. Server default `:3456` (`server/src/index.ts`), web dev `:3457` with `/api` + `/ws` → `127.0.0.1:3456` already wired in `web/vite.config.ts`.
  Baseline verification (2026-09-03, sterile env): root `bun x tsc --noEmit` 0 errors; `concept/` build 1863 modules 497.03k JS green; `packages/lokma-web/web` build 46 modules green; `packages/lokma-web/server` build (`tsc -p`) clean; `git status` clean.
  Next piece: W0-F1 api client (`web/src/lib/api.ts`).
- 2026-09-03 — W0-F1 api client DONE (`web/src/lib/api.ts` + `web/src/lib/api.test.ts`, commit 23dcca4).
  Typed `request<T>` wrapper (GET/POST/PATCH/DELETE, cookie `include` + Bearer from
  `localStorage["lokma-token"]`), `ApiError { code, message, status }` normalizing both
  the future `{ code, message }` shape and the legacy Phase 0 `{ ok: false, error }`
  shape, 401 → redirect `/login` (no loop on `/login` itself). Per-group fns:
  health/getConfig/patchConfig, listProviders/testProvider, listModels,
  listSessions/getSession/createSession/forkSession (fork URL real, server lands W1),
  listAgents/getAgent, listSkills/getSkill, getVaultGraph. Back-compat: `fetchJson` +
  `api.health/config/providers/models/sessions` kept (HealthBadge untouched).
  401-path probe `api.test.ts` (`bun src/lib/api.test.ts`): 10/10 PASS.
  Gates: root `tsc --noEmit` 0 errors · web build 46 modules green ·
  server `tsc -p` clean · mock grep: 1 pre-existing hit left for F2/W1
  (`components/chat/input.tsx` placeholder text mentions "mock WS" — chat scope, not F1).
  Next piece: W0-F2 ws client (`web/src/lib/ws.ts` + `hooks/use-ws.ts`).
- 2026-09-03 — W0-F2 ws client DONE (`web/src/lib/ws.ts` + `hooks/use-ws.ts` +
  `web/src/lib/ws.test.ts` + 1-line `chat/input.tsx` placeholder cleanup,
  commits 8dc7554 + 915b42d).
  `wsUrl()` now rides the serving origin (`ws(s)://<host>/ws/:id` → vite `/ws`
  proxy in dev, nginx in prod; the `:3456` hardcode is demoted to an explicit
  `directWsUrl()` fallback used on later reconnect retries). Token attach via
  `withAuthToken()` (`?token=` from `localStorage["lokma-token"]`, forward-compat —
  server ignores it today). All frame shapes come from `lokma-shared` Zod
  (`ServerMessageSchema` decode, `ClientMessageSchema`-checked builders:
  prompt/abort/permission_response/ask_response) — zero hand-duplicated names.
  Pure `applyServerFrame()` reducer (stream append, tool-call map, cost
  accumulator, permission/question queues, done/error) drives the hook; hook adds
  auto-reconnect (capped backoff 500ms→10s, max 10 attempts) and exposes
  `sendText` (=`sendPrompt`, back-compat with Chat), `answerPermission`,
  `answerQuestion`, `interrupt` (abort, keeps partial stream).
  Shared fix required for the web build: root `lokma-shared` import pulls
  `utils/index.js` → `node:crypto` (browser-externalized, vite build FAILED);
  `packages/lokma-shared/package.json` now exposes `./protocol/*` subpath so the
  browser imports only the zod-only `dist/protocol/ws.js` (commit 8dc7554).
  28/28 probe PASS (`bun src/lib/ws.test.ts`).
  Gates: root `tsc --noEmit` 0 errors · web build 57 modules green ·
  server `tsc -p` clean · mock grep: 2 hits, both the legit word "placeholder"
  (React prop + tailwind class) — no mock data.
  Next piece: W0-F3 stores (`sessionStore`, `paneStore`, `providerStore`, `agentStore`).
- 2026-09-03 — W0-F3 stores DONE (`web/src/stores/` 8 files: `layout.ts` +
  `storage.ts` + `session.ts` + `pane.ts` + `provider.ts` + `agent.ts` +
  `index.ts` + `stores.test.ts`, commit 5fe3941).
  Zustand v5 (already a dependency, no new packages). Server stays source of
  truth; stores are caches with explicit WS invalidation:
  `sessionStore` (list/active/transcript cache, `done` frame → stale+refetch,
  dead-selection prune on refresh), `paneStore` (LayoutNode ported 1:1 from
  concept `App.tsx`, same `lokma:layout:v1` key, schema `version: 1` +
  `migrate` shape guard, chrome-only partialize), `providerStore`
  (providers/models shared cache, 5m TTL mirroring the server catalog),
  `agentStore` (registry + `agent_state` live merge, per-agent locks map).
  `safeStorage` (localStorage with memory fallback) keeps bun probes green.
  44/44 probe PASS (`bun src/stores/stores.test.ts`).
  Gates: root `tsc --noEmit` 0 errors · web build 57 modules green ·
  server `tsc -p` clean · mock grep in `stores/`: 0 hits.
  Next piece: W0-F4 shell chrome (Header/Toast/SearchModal/Footer/error boundary).
- 2026-09-03 — W0-F4 shell chrome DONE (`components/shell/` 8 files: `theme.ts` +
  `toast.tsx` + `search-modal.tsx` + `footer-bar.tsx` + `pane-error-boundary.tsx` +
  `offline-banner.tsx` + `index.ts` + `shell.test.ts`; rewrote `header.tsx`,
  `app-shell.tsx`; `chat/index.tsx` split `Chat({ws})` + `ChatWithSocket`;
  `sidebar.tsx` `SessionsPanel onSelect`; commit 484f113).
  Header ported from concept (cream/terracotta, serif wordmark, lucide only):
  model dropdown reads providerStore `GET /api/models` (persists
  `lokma-model`; server PATCH lands W1), live cost badge from WS `cost`
  frames, `lokma-theme` toggle, Ctrl+K search button, `[`/`]` toggles.
  SearchModal is REAL (sessionStore + `GET /api/vault/graph?q=`, debounced,
  no DOCS array). AppShell owns the single WS socket (Chat takes it as a
  prop — no duplicate sockets), adds session switching (remount per id),
  30s `/api/health` poll, global shortcuts (Ctrl+K/Ctrl+M/`[`/`]`/Esc).
  Gates: root `tsc --noEmit` 0 errors · web build green (311k JS, gzip 93k) ·
  server `tsc -p` clean · shell.test.ts 10/10 + api/ws/stores probes PASS ·
  mock grep clean (1 hit = "never mock data" comment in api.ts).
  Next piece: W0-F5 theme port (`concept/src/index.css` → `web/src/index.css`).
- 2026-09-03 — W0-F5 theme port DONE (`web/src/index.css` replaced byte-identical
  with `concept/src/index.css` (diff clean, 189 lines) + `web/index.html` (dropped
  hardcoded `class="dark"`, added Inter/Instrument Serif/JetBrains Mono font links
  + pre-paint `lokma-theme` guard script) + `shell/theme.ts` contract comment fix +
  `shell/theme.test.ts` 11/11 PASS, commit 24a845e).
  Web now renders on the real concept tokens: cream `#FAF9F5` light default,
  terracotta `#C96442`, ink `#262624`, `@theme` cream/paper/ink/terracotta/line +
  font stacks (fixes `font-serif`/`font-mono` fallbacks), `@custom-variant dark`,
  shadcn vars intact (`bg-card/bg-background/bg-muted/bg-primary` keep working —
  same var names in both files), pane/scrollbar/hover utilities, `.dark` hex
  overrides (previously the header toggle added a class no CSS answered).
  Scope note: plan §F5 said "4 themes (claude/omp/midnight/paper)" — the concept
  reference only ships light/dark (`themes/*.json` are CLI-side palettes, no web
  picker exists in concept), so F5 ports light/dark 1:1 and leaves the JSON
  palettes CLI-side; a 4-theme web picker is a follow-up wave, not this piece.
  Gates: root `tsc --noEmit` 0 errors · web build green (1625 modules,
  CSS 28.77kB/gzip 6.78kB, JS 311k/gzip 93k) · server `tsc -p` clean ·
  all probes PASS (theme 11/11 + shell 10/10 + api + ws 28/28 + stores 44/44) ·
  mock grep clean (1 hit = "never mock data" comment in api.ts).
  W0 foundation COMPLETE (pre-flight + F1 api + F2 ws + F3 stores + F4 shell + F5 theme).
  Next piece: W1-1 SingleChatView + Composer (first chat-core pane).
- 2026-09-03 — W1-1 SingleChatView + Composer DONE
    (server commit 6a169bd + web commit 8bdca5c, both pushed).
    Server: SessionStore meta sidecar (`<id>.meta.json`) + `fork()` (on-disk copy)
    + `rewind()` (truncate); new `POST /api/sessions/:id/fork`,
    `PATCH /api/sessions/:id {model}`, `POST /api/sessions/:id/rewind
    {keepMessages}`, `GET /api/commands` (5 slash commands, server-owned
    registry); WS prompt gains optional `model` + `contextPaths` (shared Zod,
    backward compatible), resolves model message > meta > default, reads `@file`
    mentions into context (cwd-scoped, 20KB/file, max 5), replay-as-`text_delta`
    REMOVED (client loads transcript via REST — no stream pollution).
    Web: `chat/composer.tsx` (real model picker from `GET /api/models` +
    PATCH persist, `@path` chips, `/` palette executing the server registry,
    steer/queue with client-side queue drain, text-file attach inlined, stop =
    WS interrupt, mic progressive enhancement) + `chat/single-chat-view.tsx`
    (REST transcript + live stream, edit = save-and-rewind via server, copy,
    rewind, fork, hero cards create real sessions) + `chat/index.tsx` rewrite
    (optimistic pending, done → refetch, slash exec, per-session model,
    initial-prompt handoff via sessionStorage); header model select persists
    server-side; AppShell passes session switching; dead `input.tsx`/`message.tsx`
    deleted. Honest cost: `cost` frame now sends real char counts + costUsd 0
    (no price table yet — real pricing lands with W2 Usage).
    Gates: root `tsc --noEmit` 0 errors · web build green (1625 modules,
    JS 338k/gzip 101k) · server `tsc -p` clean (after rebuilding lokma-core +
    lokma-ai dist — server resolves workspace deps via dist) · probes PASS
    (chat 18/18 + ws + api) · mock grep clean (1 hit = legit "never mock data"
    comment) · LIVE probe on :3459: create → patch model → get (meta) → fork
    (copied:1) → rewind (kept:0) → 400/404 validation + WS invalid-shape error
    frame, all green.
    Next piece: W1-2 LokmaMessage (thought trace, permission card, AskUserQuestion, cost footer).
|- 2026-09-03 — W1-2 LokmaMessage DONE
|    (server commit c343949 + web commit c74ec7e, both pushed).
|    Server: `PATCH /api/config` is REAL now (was echo stub) — validates the
|    patch against `GlobalConfigSchema.partial()` (400 + `{code,message}` on
|    invalid), persists via existing `saveGlobal()` to `~/.lokma/config.json`
|    (same file the CLI reads). Unblocks the chat "Always allow" rule persist.
|    Web: new `chat/lokma-message.tsx` (ThoughtTrace + AssistantBody/CodeBlock +
|    PermissionCard + QuestionCard, concept tokens 1:1, lucide only) +
|    `lokma-message.test.ts` 19/19 PASS. `single-chat-view.tsx`: assistant rows
|    render real code fences with copy; live run shows the real tool-call trace
|    (`tool_start/tool_result` frames, hidden when the run has none — never
|    faked), pending permission/question cards, and the real cost footer.
|    `chat/index.tsx`: Allow/Deny/Always answers travel over WS (`always`
|    reads GET /api/config, appends the exact tool name to `permissions.allow`,
|    PATCHes back — full allow array sent so the shallow merge never wipes
|    deny/mode; answer is always sent, persist failure only toasts).
|    `hooks/use-ws.ts` 1-liner: `sendText` clears `toolCalls` so each run owns
|    its trace. Honest scope notes: (1) server emits no tool/permission/ask
|    frames yet (no tool loop — lands with agent work) so cards appear only
|    when frames arrive; the answer path is real end-to-end. (2) Code-block
|    "Open in pane" omitted — no pane system until W7, no dead buttons.
|    (3) Stream-blocking on unanswered questions is server-side behavior for
|    the future tool loop. (4) Historical transcript rows show no thought/cost
|    (session JSONL stores role/content only — trace persistence is a later wave).
|    Gates: root `tsc --noEmit` 0 errors · web build green (348k JS/gzip 103k) ·
|    server `tsc -p` clean · all probes PASS (lokma-message 19/19 + ws + api +
|    stores + shell + theme + chat) · mock grep: chat clean, remaining hits are
|    later-wave stubs (providers test W2, vault W4) · LIVE probe on :3459 with
|    temp HOME: PATCH permissions → `{ok:true}` → GET shows `allow:["bash"]`
|    → invalid theme → 400 → file on disk, all green (real `~/.lokma` untouched).
|    Next piece: W1-3 Sessions SidebarLeft (list/virtualized/CRUD/search/fork/merge).
|- 2026-09-03 — W1-3 Sessions SidebarLeft DONE
|    (server commit 879094c + web commit d2a91b9, both pushed).
|    Server: `SessionStore` gains `rename()` (title sidecar) + `remove()`
|    (unlinks JSONL + meta) + `merge()` (appends source transcript into the
|    target, 400 on self-merge, 404 on missing) + `summary()`/`listSummaries()`
|    (title/model/messageCount/createdAt/updatedAt, newest first);
|    `SessionMeta` gains optional `title` (shared type, backward compatible).
|    Routes: `GET /api/sessions` returns enriched `SessionSummary[]` (same
|    response shape, more fields — old `id`-only clients keep working);
|    `PATCH /api/sessions/:id` accepts `{model}` and/or `{title}` (1-120 chars,
|    400 `bad_title`/`bad_patch` on invalid); new `DELETE /api/sessions/:id`
|    (404 when nothing on disk) + `POST /api/sessions/:id/merge {from}`
|    (400/404 mapped from store errors). Fork copies the title too.
|    Web: new `components/sessions/` (`grouping.ts` pure helpers +
|    `sessions-sidebar.tsx` + `sessions.test.ts` 21/21 PASS + barrel) —
|    Today/Yesterday/Earlier or by-project groups, live search over
|    title/id/model, New Session (real POST), click-to-resume, inline rename,
|    two-click delete, fork-open-session footer (real POST /fork), merge-into
|    dialog (real POST /merge, source kept, target selected after); rows are
|    draggable with the real session id (`application/x-lokma-session`, drop
|    side lands with W7 — no fake tabs). `api.ts` gains
|    rename/delete/merge fns + enriched `SessionSummary` (new fields optional
|    so old fixtures typecheck); `sessionStore` gains
|    create/fork/rename/delete/merge actions (server source of truth, caches
|    pruned); `SearchModal` matches title/model too; dead `SessionsPanel`
|    deleted; `AppShell` left pane renders the real sidebar.
|    `.gitignore` fix: bare `sessions/` runtime rule swallowed the new source
|    dir → added `!packages/lokma-web/web/src/components/sessions/` exception.
|    Honest scope notes: (1) no status dots from the server (no presence feed
|    yet) — the only live dot marks the open session; (2) no virtualized
|    windowing lib — incremental render caps at 120 rows + Show-all (session
|    lists are dozens of rows; full windowing deferred until needed);
|    (3) merge keeps the source (explicit delete is one click away);
|    (4) drag-to-pane split/fork/merge dialog is W7 pane-system work.
|    Gates: root `tsc --noEmit` 0 errors · web build green (1630 modules,
|    361k JS/gzip 107k) · server `tsc -p` clean · all probes PASS (sessions
|    21/21 + shell 10/10 + api + ws + stores + theme 11/11 + lokma-message +
|    chat) · mock grep: sessions clean (1 hit = input `placeholder` attr) ·
|    LIVE probe on :3459 with temp HOME: create×2 → enriched list →
|    rename → empty-title 400 → merge (appended:1) → self-merge 400 →
|    delete → re-delete 404 → list shows renamed target (kept:2), all green
|    (real `~/.lokma` untouched).
|    Next piece: W1-4 HeroSection/empty states (starter cards create real sessions).
|- 2026-09-03 — W1-4 HeroSection/empty states DONE (web commit ef172c7, pushed).
|    Web-only piece (no server work — `POST /api/sessions` + initial-prompt
|    handoff already real from W1-1/W1-3): new `chat/hero-section.tsx`
|    (ported from concept `HeroSection.tsx`, same cream/terracotta tokens +
|    serif headline + 3 starter cards; `onStart(prompt)` creates a REAL
|    session, never a fake `onOpenTab` tab; time-based greeting — the
|    concept hardcodes a persona name we must not invent) +
|    `single-chat-view.tsx` slimmed to `<HeroSection onStart={onStart}/>`
|    (dead `Card` import dropped) + `chat.test.ts` §6 hero acceptance
|    (4 greeting boundaries, unique titles, title+desc present, no
|    hardcoded persona name).
|    Gates: root `tsc --noEmit` 0 errors · web build green (1631 modules,
|    361k JS/gzip 107k) · server `tsc -p` clean · chat probe all PASS
|    (incl. 7 new hero checks) · mock grep: chat+sessions clean (1 hit =
|    own anti-mock comment in hero-section.tsx).
|    W1 chat core COMPLETE (W1-1 chat+composer + W1-2 message +
|    W1-3 sessions + W1-4 hero).
|    Next piece: W2-5 Providers tab (`GET/POST/PATCH/DELETE /api/providers` +
|    live `POST /:id/test`).
|- 2026-09-03 — W2-5 Providers tab DONE
  (server commit 9b40be5 + web commit 099e9d1, both pushed).
  Server: `GET /api/providers` now returns merged built-ins + custom
  entries (`{id,name,baseUrl,enabled,keySet,last4,priority,custom}`,
  priority-sorted); new `POST /api/providers` (slug/url validation,
  409 on duplicates incl. built-in ids, key stored AES-GCM 0600),
  `PATCH /api/providers/:id` (name/baseUrl/enabled/priority/key;
  built-ins gain a config override entry), `DELETE /api/providers/:id`
  (custom only — built-ins 400, unknown 404, credentials removed),
  `POST /api/providers/reorder` (exact-set order → priorities
  persisted to `~/.lokma/config.json`), `POST /api/providers/:id/test`
  is LIVE (Anthropic x-api-key / Google v1beta / OpenAI-compatible
  Bearer, 10s timeout, `{ok,modelCount,models[0..20],latencyMs}`,
  keys never echoed). Shared `ProviderConfig` gains optional
  `name`/`baseUrl`; core gains `removeCredentials()`.
  Web: new `components/providers/` (`providers-pane.tsx` real list +
  keySet badges + live Test + enable toggle + up/down reorder +
  two-click custom delete, `provider-dialog.tsx` add/edit with visible
  labels + write-only key, `validation.ts` mirroring server rules,
  `inspector-panel.tsx` Info/Providers tabs in the right sidebar,
  `providers.test.ts` 25/25 PASS); providerStore gains
  test/create/patch/delete/reorder actions; concept mock key preview
  (`sk-ant-***-visible-mock`) and toast-only buttons NOT ported.
  Gates: root `tsc --noEmit` 0 errors · web build green (376k
  JS/gzip 110k) · server `tsc -p` clean · all probes PASS (providers
  25/25 + api + ws + stores + shell + theme + chat + lokma-message +
  sessions) · mock grep: providers clean (1 hit = comment documenting
  the excluded mock) · LIVE probe on :3461 with temp HOME: create →
  dup 409 → bad id/url 400 → patch disable → reorder → no-key test
  `ok:false` → live example.com probe `HTTP 404` 116ms → delete →
  re-delete 404 → builtin delete 400 → config + creds verified on
  disk, all green (real `~/.lokma` untouched).
  Next piece: W2-6 Models tab (`GET /api/models` enable/disable +
  Composer single-source store).
|- 2026-09-03 — W2-6 Models tab DONE
  (server commit 6d8e0d9 + web commit a4f4ca2, both pushed).
  NOTE: the implementation was found as uncommitted work in the tree
  (written ~04:00-04:31 UTC, idle 14 min — orphaned run, never verified
  or committed). This run adopted it as its ONE piece: reviewed every
  diff fresh, ran all gates, ran the live probe, then committed
  atomically (server + web separate) per the task rules.
  Server (`lokma-ai` + `modelRoutes`): pure `applyModelFlags()` overlay
  (`GlobalConfig.models[id] = { enabled }`, unknown ids ignored,
  unmapped default enabled) + `invalidateCatalog()`; `GET /api/models`
  now overlays persisted flags (adds `enabledCount`); new
  `PATCH /api/models` single `{id,enabled}` or bulk
  `{models:{id:bool}}` (500-key cap, 400 `bad_models`/`too_many_models`/
  `bad_id`/`bad_enabled`/`empty_patch`/`unknown_model`), persists via
  `saveGlobal()` to `~/.lokma/config.json` (schema field already
  existed), invalidates the 5m catalog cache, returns the full catalog.
  Web: new `components/providers/` helpers (`models.ts`: `filterModels`,
  `countEnabled`, `buildBulkMap`, `enabledModels` single-source picker,
  `models.test.ts` 13 checks PASS) + `ModelsPane` (live search, row
  checkbox toggles with optimistic rollback, Allow All / Disable All =
  one PATCH, Refresh, `enabled/total` counter, provider badges, lucide
  only; concept mock columns Ctx/badge + toast-only Fallback button NOT
  ported — fake data forbidden, no dead buttons) wired as a third
  Inspector tab; providerStore gains optimistic `setModelEnabled` /
  `setModelsBulk` (rollback + `lastError` on failure); `api.ts` gains
  `setModelEnabled`/`setModelsBulk` + `ModelInfo.enabled` /
  `enabledCount`; Composer dropdown + header Ctrl+M select read ONLY
  enabled models (header keeps the persisted choice visible even if
  disabled after the fact, so the select never blanks).
  Gates: root `tsc --noEmit` 0 errors · web build green (382k
  JS/gzip 112k) · server `tsc -p` clean · all probes PASS (models 13 +
  stores + api 401-path + ws) · mock grep: providers clean (2 hits =
  comments documenting the excluded mocks) · LIVE probe on :3462 with
  temp HOME: GET 7/7 → disable one (updated:1, 6 left) → GET reflects
  → bulk re-enable (updated:1) → unknown 400 → bad-shape 400 →
  `models` flags verified on disk, all green (real `~/.lokma` untouched).
  Next piece: W2-7 Usage (`GET /api/usage/summary|sessions|export` +
  AreaChart + CSV/JSONL download).
|- 2026-09-03 — W2-7 Usage DONE
  (server commit c51f8e6 + web commit f637bfc, both pushed).
  Server: new `lokma-core/src/usage/` (`pricing.ts` public list-price
  table $/1M with family fallback for dated variants + ollama-local at
  zero; unknown models `priced:false`/cost 0, never guessed;
  `ledger.ts` UsageLedger per-project `usage.jsonl` beside sessions —
  record/read/summarize with zero-filled day series, per-model split,
  unpriced-token flag) + new `GET /api/usage/summary?range=`
  (KPIs + stacked series + byModel) + `GET /api/usage/sessions`
  (per-session rows joined with session titles) +
  `GET /api/usage/export?format=csv|jsonl` (real attachment
  downloads, 400 `bad_range`/`bad_format`); WS handler records one
  ledger line per completed run (best-effort, never breaks chat) and
  the `cost` frame now carries real estimated tokens + priced costUsd
  (replaces the W1-1 `costUsd: 0` stub — header badge + message cost
  footer go live with real numbers).
  Web: new `components/usage/` (`usage.ts` pure helpers: formatTokens/
  formatUsd/shortModel/chartKeys/collapseSeries/buildStackedPaths/
  axisLabels/formatLastActive/downloadBlob, `usage.test.ts` 26/26 PASS)
  + `usage-pane.tsx` (concept layout 1:1 — range toggle, 4 KPI cards,
  stacked SVG chart from the live series, sessions table click →
  session, CSV/JSONL real blob downloads, honest empty/error states;
  concept mock KPI/CHART/SESSIONS arrays + toast-only exports NOT
  ported) wired as 4th Inspector tab; `api.ts` gains usage types +
  getUsageSummary/getUsageSessions/downloadUsageExport + `authedFetch`
  (auth stays DRY for blob downloads); AppShell passes
  `onOpenSession={switchSession}` into the Inspector.
  Honest scope notes: (1) tokens are `ceil(chars/4)` estimates
  (adapters report no counts in Phase 0) — pane footer says so;
  (2) header badge acceptance met via live `cost` frames (no 60s
  poll added — the "or" leg of the plan); (3) session rows show no
  live presence dot (no presence feed yet) — emerald dot marks
  today's sessions only.
  Gates: root `tsc --noEmit` 0 errors · web build green (1640
  modules, 394k JS/gzip 115k) · server `tsc -p` clean (after core
  dist rebuild) · all probes PASS (usage 26/26 + api + ws + stores
  + shell 10/10 + theme 11/11 + sessions 21/21 + providers 25/25 +
  chat + lokma-message + models 13) · mock grep: usage clean (1 hit
  = own anti-mock comment) · LIVE probe on :3463 with temp HOME
  22/22: create → empty summary (0 runs, x7 zero series) → WS run →
  cost frame (in/out > 0, costUsd > 0, default sonnet) → summary
  (1 run, tokens == frame sum, cost matches, topModel, byModel x1,
  unpriced 0) → sessions row (joined title/model/cost) → CSV
  (header + 1 priced row) → JSONL (parses, priced:true) → bad
  range/format 400 → `usage.jsonl` verified on disk under temp
  HOME (real `~/.lokma` untouched).
  W2 Settings/usage COMPLETE (W2-5 providers + W2-6 models + W2-7 usage).
  Next piece: W2-8 Config + Appearance + Permissions + MCP tabs
  (`GET/PATCH /api/config` layered merge UI + theme persist + MCP servers).
|- 2026-09-03 — W2-8 Config + Appearance + Permissions + MCP DONE
  (server commit b1f9622 + web commit e6369d1, both pushed).
  Server: NO new routes (GET/PATCH /api/config already real) — shared
  touch only: new `McpServerSchema` (transport enum stdio|http|sse|ws,
  command/url, enabled default true, `.passthrough()` so old configs
  with extra keys still parse) now validates `mcp.servers` in
  GlobalConfig + ProjectSettings (was `record(unknown)`); bad
  transports 400 instead of silently persisting garbage.
  Web: new `components/settings/` (`settings.ts` pure helpers:
  THEME_CARDS, serverThemeToMode, normalizeConfig/McpEntry/Hooks,
  validateMcpForm, full-object PATCH builders; `settings.test.ts`
  50/50 PASS) + 4 panes wired as a 5th Inspector tab `Settings`
  (single GET load, remount-on-reload, lucide only, concept tokens
  1:1): Config (effective merged values + editable defaultModel +
  masked credentials status), Appearance (4 theme cards → instant
  light/dark + PATCH persist, same value the CLI reads), Permissions
  (allow/deny add/remove + defaultMode select + hooks add/remove —
  SAME rule store the chat card writes), MCP (add/edit dialog with
  visible labels, transport select, enable toggle, two-click delete).
  Concept mock rows + toast-only buttons (Test, Add Provider dialog,
  key preview, tool counts) NOT ported — no dead buttons.
  Gates: root `tsc --noEmit` 0 errors · web build green (1647
  modules, 421k JS/gzip 121k) · server `tsc -p` clean · all probes
  PASS (settings 50/50 + api + ws + stores + shell 10/10 + theme
  11/11 + sessions 21/21 + providers 25/25 + models 13 + usage 26/26
  + chat + lokma-message) · mock grep: settings clean (2 hits =
  own anti-mock comments) · LIVE probe on :3464 with temp HOME:
  GET defaults → PATCH theme/hooks/permissions/MCP → GET reflects
  → bad theme/transport 400 → disk `config.json` verified (real
  `~/.lokma` untouched). Honest note: PATCH writes global, but the
  repo's own `.lokma/settings.json` project layer wins for
  defaultModel in the merge (Docs/26 design) — Config tab shows the
  effective value, verified via `?cwd=/tmp`.
  W2 FULLY COMPLETE (W2-5 providers + W2-6 models + W2-7 usage +
  W2-8 config/appearance/permissions/MCP).
  Next piece: W3-9 FileBrowser (`GET /api/files` tree + read/save +
  `@mention`).
|- 2026-09-03 — W3-9 FileBrowser DONE
  (server commit caa66d3 + web commit 93862eb, both pushed).
  Server: new `lokma-core/src/files/` (`WorkspaceFiles`: jailed
  `resolveInRoot` guard, `list` one-level dirs-first + git overlay
  M/A/D/R/? per file with dirty-descendant aggregation for dirs,
  `read` 256KB cap + binary sniff + full-file sha, `write` atomic via
  `writeAtomic` with `expectedSha` 409 guard + create-if-missing,
  `search` server-ranked fuzzy capped 20k visits; skips
  node_modules/.git/dist/.next/build/target) + new
  `GET /api/files|/read|/search` + `POST /api/files/write`
  (`{code,message}` errors: bad_path/outside_root/not_a_*/binary_file/
  too_large/stale_file/file_not_found/bad_query).
  `ws.ts` `@file` reader now reuses the shared `resolveInRoot` (DRY,
  same jail behavior).
  Web: new `components/files/` (`files.ts` pure helpers: basename/
  parentDir/joinRel/formatSize/gitLabel/filterLoaded/appendMention +
  `files.test.ts` 28/28 PASS) + `file-browser.tsx` (session-scoped cwd
  via `GET /api/sessions/:id`, lazy tree, labeled search + debounced
  server quick-open, preview → edit → save with 409 conflict UI
  [Use server version / Overwrite with mine], right-click menu Copy
  path/filename + Insert @mention + Open, drag rows with
  `application/x-lokma-file` + `@path` fallback) wired under
  SessionsSidebar in the left Explorer; `api.ts` gains
  list/read/search/write fns + types; Chat Card accepts drops +
  `lokma-insert-mention` events → Composer `dropSignal` splices
  `@path` (existing parser → `contextPaths`, server reads bytes into
  model context); AppShell Ctrl+P reveals the left pane + focuses
  search. Concept toast-only buttons (New file/Reveal/Terminal-here)
  NOT ported — no dead buttons. No Monaco dep (plain textarea,
  honest scope note).
  Gates: root `tsc --noEmit` 0 errors · web build green (1650
  modules, 437k JS/gzip 125k) · server `tsc -p` clean · all 13
  probes PASS (files 28/28 + chat + api + ws + stores + shell +
  theme + sessions + providers + models + usage + settings) ·
  mock grep: files clean (1 hit = Input `placeholder` attr, visible
  `<label>` present) · LIVE probe on :3465 with temp HOME: list
  (M/? + dir aggregation) → read+sha → write → stale 409 →
  create → escape 400 → missing 404 → search → bad-query 400 →
  real-null binary 400, all green (real `~/.lokma` untouched).
  Next piece: W3-10 TerminalPane (xterm + `terminal/data|exit` WS
  frames + per-tool-call tabs + kill).
|- 2026-09-03 — W3-10 TerminalPane DONE
  (server commit 79a2e48 + web commit 3b10494, both pushed).
  Server: new `lokma-core/src/terminal/` (`TerminalManager`: live `$SHELL`
  children with piped stdio, `spawn` in an existing-dir `cwd` else 400
  `bad_cwd`, `write` 64KB cap, `resize` stored, `kill` SIGTERM→SIGKILL
  grace, 10-live cap 429 `terminal_limit`, 64KB scrollback tail per
  terminal, records kept after exit until DELETE) + new
  `POST /api/terminal` (optional `sessionId` tag for WS scoping) +
  `GET /api/terminal` + `GET /api/terminal/:id` (record + `tail` for
  late-joining panes) + `POST /api/terminal/:id/input` +
  `DELETE /api/terminal/:id` (`{code,message}` errors: bad_cwd/
  terminal_not_found/terminal_exited/bad_data/too_large/bad_terminal_id).
  Shared protocol gains `terminal/input|resize|kill` (client) +
  `terminal/data|exit` (server, plan §2 slash names, session-scoped).
  `ws.ts` multiplexes terminals over the existing `/ws/:sessionId`
  socket (per-connection fan-out filtered by the spawn tag, unsubscribed
  on close; kill confirms via `terminal/exit`, errors as `error` frames).
  Web: new `components/terminal/` (`terminal.ts` pure helpers: label/
  status/exit/appendCapped/stripAnsi/filterLines/copyText +
  `terminal.test.ts` 24/24 PASS) + `terminal-pane.tsx` (concept dark
  styling 1:1, lucide only, visible labels on every field; live tabs,
  search filter, Follow toggle, stdin line with `$`-echo, two-click Kill,
  Forget for exited, Copy/Clear/Refresh, New-shell form with session cwd
  + agent attach from agentStore, exit banner, honest pipes footer) as
  6th Inspector tab; `lib/ws.ts` gains terminal builders + chat-ignores
  reducer cases; `useWs` gains sendTerminal/resizeTerminal/killTerminal
  (WS-down kill falls back to REST DELETE); `api.ts` gains terminal
  types + 5 fns; AppShell threads `sessionId` + `ws` into the Inspector.
  Concept toast-only buttons (Run/Maximize) NOT ported — no dead
  buttons. No xterm.js dep (plain scrollback + stdin, honest scope note
  in pane + footer; full-screen TUIs do not work on pipes — pty is the
  follow-up, same precedent as the W3-9 Monaco skip).
  Gates: root `tsc --noEmit` 0 errors · shared+core+ai+server builds
  clean · web build green (1653 modules, 451k JS/gzip 129k) ·
  all probes PASS (terminal 24/24 + ws + api + stores + shell 10/10) ·
  mock grep: terminal clean (1 hit = own anti-mock comment) · LIVE
  probe on :3466 with temp HOME 18/18: spawn → list → bad-cwd 400 →
  missing 404 → REST echo → tail catch-up → empty-data 400 → WS
  echo via `terminal/data` → WS kill → `terminal/exit` (SIGTERM) →
  write-after-exit 409 → delete → re-delete 404 → evil-id 400, all
  green (real `~/.lokma` untouched). Probe-script lesson: Fastify
  rejects bodyless requests carrying `Content-Type: application/json`
  with 400 — the probe now omits the header when there is no body.
  Next piece: W3-11 GitPane (real `git status` + commit/push +
  3-layer safe banner from locks/worktree state).

- 2026-09-03 — W3-11 GitPane DONE
  (server commit 4350ff9 + web commit 71cace5, both pushed).
  Server: new `lokma-core/src/git/` (`RepoGit`: branch + upstream +
  ahead/behind + staged-vs-unstaged files, `\x1f`/`\x1e`-parsed `log`,
  `add -A` + `commit` with 400 `bad_message`/`nothing_to_commit`
  (stdout AND stderr checked — clean-tree output lands on stdout on some
  git versions), `push` with output tail, `worktree prune` gc;
  non-repos answer `{ repo: false }` on status, 400 `not_a_repo`
  elsewhere) + new `GET /api/git/status|/log|/locks` +
  `POST /api/git/commit|/push|/gc` (`{code,message}` errors) + core
  `listLocks()` + plan-literal `GET /api/agents/:id/locks`
  (owner locks + worktrees, `agent:null` + empty on unknown — W4-ready).
  Status also carries `worktrees` (banner + filter).
  Web: new `components/git/` (`git.ts` pure helpers + `git-pane.tsx`
  concept layout 1:1 + `git.test.ts` 25/25 PASS) as 7th Inspector tab;
  per-file live owner pills over `GET /api/git/locks`, 3-layer banner
  from REAL lock/worktree counts, labeled commit input + real
  Commit/Push/GC (concept mock `FILES`/`COMMITS` + toast-only buttons
  NOT ported — no dead buttons). Web `ui/button` has no `ink`
  variant → active filter uses `default`. `api.ts` gains git + locks
  types/fns.
  Gates: root `tsc --noEmit` 0 errors · web build green (1656
  modules, 464k JS/gzip 132k) · server `tsc -p` clean · all 14
  probes PASS · mock grep: git clean (2 hits = input `placeholder`
  attr + tailwind class, visible `<label>` present) · LIVE probe on
  :3467 with temp HOME 16/16: status → log → bad-max 400 →
  non-repo `repo:false` → real lock acquire → locks + agent-locks →
  commit (hash) → clean tree → empty-message 400 →
  `nothing_to_commit` → gc → push-no-remote 500, all green.
  Probe lessons: (1) locks live GLOBAL in `~/.agentlocks`
  (`expandHome` ignores `$HOME`) → assertions use `.some()`, probe
  cleans its own /tmp locks; (2) Fastify bodyless+JSON-catch lesson
  from W3-10 still applies.
  Next piece: W3-12 BrowserPane (per-agent tabs +
  `POST /api/browser/open` + live screenshots).

- 2026-09-03 — run 50/50 hit repeat cap mid-W3-12: browser server-side (core registry + routes + api.ts client) rescued from dirty tree, committed as WIP — web pane side still open.

- (append: `2026-.. — W<n> <pane> — <commit hash> — <acceptance result>`)

---

*Single source stays `Docs/00-LOKMA-KONTEKST.md`. After each wave: update 00 chronology
+ Son Durum, commit + push, mirror to memory vault.*
