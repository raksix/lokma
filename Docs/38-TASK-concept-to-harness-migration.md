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
- (append: `2026-.. — W<n> <pane> — <commit hash> — <acceptance result>`)

---

*Single source stays `Docs/00-LOKMA-KONTEKST.md`. After each wave: update 00 chronology
+ Son Durum, commit + push, mirror to memory vault.*
