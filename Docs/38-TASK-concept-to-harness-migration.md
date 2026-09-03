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
   REAL vs STUB in a table inside this file's §10 execution log.
2. `read_file` `web/src/lib/api.ts`, `lib/ws.ts`, `hooks/use-ws.ts` — keep if usable,
   rewrite if stub.
3. Run `bun install` at root, then per-package `tsc --noEmit` (root `bun x tsc --noEmit`
   per TUI guard) + `bun run build` in `concept/` (baseline must stay green).
4. Decide server port (default `:3456` per Docs/25) and set `web/vite.config.ts` proxy.
   Record the decision in §10.

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
  behavior spec). If concept has a bug, file it in §10 and fix AFTER migration.

---

## 9. Live deploy — lokma.fermag.com.tr (EVERY run, after push)

Each loop run MUST end with the live site serving that run's code. Infrastructure
(running on this host, verified 2026-09-03):

- PM2 `lokma-server` (:3456) runs `bun packages/lokma-web/server/dist/index.js`
  → serves `/health`, `/api/*`, `/ws/*`. Rebuild with `bun run build`
  (`tsc -p`) in `packages/lokma-web/server` BEFORE restart (PM2 runs dist, not src).
- PM2 `lokma-web` (:3457) runs `vite preview` in `packages/lokma-web/web`
  → serves freshly built `web/dist`. Rebuild with `bun run build` BEFORE restart.
- nginx vhost `lokma.fermag.com.tr`: `/` → :3457, `/health` + `/api/` + `/ws/` → :3456.
- **nginx basic auth (2026-09-03):** `/`, `/api/`, `/ws/` behind `auth_basic`
  (`/etc/nginx/.htpasswd-lokma`, user `raksix`). `/health` stays OPEN (liveness).
  Deploy curl checks MUST use creds from root-only `/root/.lokma-basic-auth`
  (`curl -u "$(cat /root/.lokma-basic-auth)" …`) — NEVER write user/password into
  Docs, prompts, commits, or chat logs (only the file path).

Per-run deploy procedure (only restart what you touched):

1. Touched `packages/lokma-web/web/**` → rebuild web (already a gate) →
   `pm2 restart lokma-web` → `curl -s -o /dev/null -w '%{http_code}'
   https://lokma.fermag.com.tr/` must print `200`;
   WITHOUT creds it must print `401` (auth gate check).
2. Touched `packages/lokma-web/server/**` or `lokma-core|ai|shared/**` →
   rebuild server dist → `pm2 restart lokma-server` →
   `curl -s https://lokma.fermag.com.tr/health` must be 200/`{ok:true}`.
3. Touched neither → skip restarts (no pointless churn every 5 min).
4. End of run: `pm2 list | grep lokma` must show BOTH online + `pm2 show lokma-web`
   `script path` must be bun/vite (NOT `next/dist/bin/next` — a stale Next.js
   process once served this domain; if you see next-server, the process was
   rewired outside ecosystem). Report both HTTP codes in the run report.

FORBIDDEN: `pm2 kill` (shared daemon, ~20 projects — a kill takes everyone down).
Single-proc recovery is allowed ONLY as `pm2 delete lokma-web|lokma-server` +
`pm2 start /mnt/apopic/lokma/ecosystem.config.cjs --only <same-name>` (daemon
survives; never delete both at once). If even that serves stale code, escalate in
§10 log + report.

## 10. Execution log (fill as waves land — newest at bottom)

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
  Next piece: W4-13 AgentHubPane (`GET/POST /api/agents` create/pause/kill +
  SOUL/MEMORY editors + budgets).

- 2026-09-03 — run 50/50 hit repeat cap mid-W3-12: browser server-side (core registry + routes + api.ts client) rescued from dirty tree, committed as WIP — web pane side still open.
- 2026-09-03 — W3-12 BrowserPane DONE (web commit ea76e10, pushed; server side already live from 555d835).
  Web: new `components/browser/` (`browser-pane.tsx` + `index.ts` barrel, concept
  layout 1:1 — header + agent-grouped pills + address bar + sandboxed iframe;
  every control hits a live `/api/browser/*` endpoint: open w/ optional
  URL+agent, Go = real navigate, Back/Forward step the REAL history pointer
  (disabled at the edge via `canGoBack/canGoForward`), Reload touches the tab
  + re-keys the frame, two-click close, `historyPosition` + `shortScope`
  labels, external-link fallback for X-Frame-Options sites; concept hardcoded
  `builder-1/reviewer-2` pills + toast-only nav NOT ported — no dead buttons)
  wired as 8th Inspector tab (session-gated like Terminal); `ui/button` has
  no `iconSm` size (same trap class as GitPane `ink`) → `size="sm"
  className="h-5 w-5 p-0"`.
  Honest scope notes: (1) no CDP/screenshot pipeline (no Playwright dep —
  live AI screenshots land with the agent tool loop W4+); (2) pages render
  client-side, REST owns tabs + history only.
  Gates: root `tsc --noEmit` 0 errors · web build green (1659 modules,
  476k JS/gzip 134k) · server `tsc -p` clean · browser probe 22/22 ·
  mock grep clean (2 hits = labeled input `placeholder` attrs) · LIVE probe
  on lokma.fermag.com.tr 9/9: open (bare host → https) → navigate → back →
  forward → reload → close → re-get 404 → `javascript:` 400 `bad_url`
  (probe tab deleted after).
  W3 Files/Terminal/Git/Browser COMPLETE (W3-9 + W3-10 + W3-11 + W3-12).
- 2026-09-03 — DEPLOY BLOCKER (web, needs foreground/user decision — NOT fixed
  this run per the no-delete+start rule). `pm2 describe lokma-web` shows it
  runs `next start -p 3457` (script `/mnt/apopic/lokma/node_modules/next/...`,
  cwd `packages/lokma-web/web`) — but the web package is Vite-only
  (`dev/build/preview` = vite, no next dep, no next.config). It serves a
  STALE `.next/` build from 2026-08-31 (Phase-0 scaffold; live `/` returns
  `/_next/static/...` HTML, not our Vite `dist/index.html`). So `pm2 restart
  lokma-web` (done this run, new pid, homepage still 200) does NOT serve this
  run's — or any W0-W3 run's — web code. Plan §9's "vite preview on :3457"
  line is STALE and must be corrected. Server side is UNAFFECTED and live
  (`/health` 200, `/api/browser` 200, 9/9 probe green). Web code is committed
  (ea76e10) + built (`web/dist` fresh, 1659 modules) and will go live as soon
  as PM2 is repointed. Remediation (foreground only):
  `pm2 delete lokma-web && pm2 start bun --name lokma-web -- vite preview
  --host 127.0.0.1 --port 3457` from `packages/lokma-web/web`
  (or an ecosystem file), then `curl https://lokma.fermag.com.tr/` must return
  the Vite `Lokma — harness` HTML instead of `/_next/`.

|- (append: `2026-.. — W<n> <pane> — <commit hash> — <acceptance result>`)
|- 2026-09-03 — W4-13 AgentHubPane DONE
  (server commit 228434c + web commit 68bb528, both pushed).
  Server: `lokma-core/src/agents/registry.ts` extended — `AgentError`
  (`{code,status}`, routes map straight to `{code,message}`),
  `AGENT_MAX_AGENTS=20/MAX_CONCURRENT=5/MAX_QUEUE=20` caps,
  `createAgent` (optional explicit id or slug+random, persona/model/cwd/
  budgets/soul/memory/createdBy validation, 409 `agent_exists`, 429
  `agent_limit`, cwd must exist like terminal spawn), `updateAgent`
  (name/model/budgets, 400 `empty_patch`), `pauseAgent` (idle/queued/
  running→paused) / `resumeAgent` (paused→idle) / `killAgent`
  (non-terminal→killed, 409 `bad_transition`/`terminal_state`),
  `forkAgent`/`cloneAgent` (dir copy incl. SOUL+MEMORY, fresh id, state
  idle, createdBy `fork|clone:<id>`, IDENTITY.json rewritten),
  `readAgentDoc`/`writeAgentDoc` (SOUL.md/MEMORY.md, 256KB cap, 404
  `agent_not_found`); `deleteAgent` now 404s on unknown (was silent)
  and validates the id shape (no path traversal into rm).
  Routes: `POST /api/agents`, `PATCH /api/agents/:id`,
  `POST /:id/pause|resume|kill`, `POST /:id/fork|clone`,
  `DELETE /api/agents/:id`, `GET|PUT /:id/soul|memory`;
  `GET /api/agents` caps gain `maxQueue`.
  Web: new `components/agents/` (`agents.ts` pure helpers:
  normalizeAgent/stateTone/queuePosition/validateAgentForm/formatBudget/
  initials, `agents.test.ts` 36/36 PASS) + `agents-pane.tsx` (concept
  layout 1:1 — header + live caps banner + registry list + detail with
  Pause/Resume/Kill/Fork/Clone/two-click Delete + name/model/budget edit
  form + SOUL/MEMORY editors + locks/worktrees line via getAgentLocks;
  concept mock AGENTS rows + invented token/cost figures + toast-only
  buttons NOT ported — no dead buttons, no invented usage) +
  `agent-dialog.tsx` (labeled create form) + barrel, wired as 9th
  Inspector tab; `api.ts` gains put helper + agent CRUD/doc fns +
  `AgentsRes.caps`; agentStore gains caps + create/update/move/copy/
  remove (server-truth refresh, lastError).
  Bug caught by the live probe mid-run: `assertBudgets` returned
  full defaults so `PATCH {budgets:{usd}}` clobbered tokens to 500k —
  fixed to partial-return with defaults applied only at create.
  Honest scope notes: (1) no live token-spend figures (usage ledger has
  no agentId — spend accrues with the orchestration wave; the budget bar
  shows the configured cap at 0% with a title saying so);
  (2) queue position is computed from registry order (no runner queue
  yet); (3) W4 acceptance leg "CLI create appears via WS <2s" not met —
  no agent pub/sub on WS yet (lands with W4-14 Orchestration); the Hub
  refreshes on mount + manual Refresh.
  Gates: root `tsc --noEmit` 0 errors · web build green (1663
  modules, 500k JS/gzip 140k) · core+server `tsc -p` clean · all 17
  probes PASS · mock grep: agents clean (hits = own anti-mock comments
  + labeled input `placeholder` attrs) · LIVE probe on :3468 with temp
  HOME 33/33: create (budgets kept) → dup 409 → bad persona/name/cwd/
  budgets/id 400 → patch keeps tokens → empty-patch 400 → pause →
  pause 409 → resume → resume 409 → kill → kill `terminal_state` →
  soul/memory read+write+reflect → fork (soul+budgets kept) → clone →
  delete → re-delete 404 → unknown 404 → locks null-agent → disk
  SOUL.md + clone config.json verified (real `~/.lokma` untouched).
  Next piece: W4-14 OrchestrationPane (live tree from
  `agent/start|delta|end` frames + fan-out controls).
  |- 2026-09-03 — W4-14 OrchestrationPane DONE
  |  (server commit 03defc6 + web commit dc08deb, both pushed).
  |  Server: new `lokma-core/src/agents/events.ts` (in-process
  |  `onAgentEvent`/`emitAgentEvent` pub/sub, guarded dispatch) +
  |  `registry.ts` broadcasts on every mutation (create/pause/resume/
  |  kill/fork/clone/delete; delete emits state `deleted`) + `ws.ts`
  |  fans out each event as an `agent_state` frame to every live socket
  |  (unsubscribed on close; agents are global, no session scoping).
  |  No new REST routes — all existing registry endpoints.
  |  Web: new `components/orchestration/` (`orchestration.ts` pure
  |  helpers: groupByState/filterTree/countLive/elapsedSince/lineageOf/
  |  lineageGroups/killableIds/validateFanoutForm/buildFanoutBodies,
  |  `orchestration.test.ts` 43/43 PASS) + `orchestration-pane.tsx`
  |  (concept layout 1:1 — live `N running · M total` badge, caps/queue
  |  strip, state-grouped tree with expandable real detail
  |  [config+locks+budgets+kill], fan-out form with real progress bar,
  |  lineage section from real `createdBy`; concept mock AGENTS rows +
  |  BUS feed + heartbeat pill + toast-only buttons NOT ported) +
  |  barrel, wired as 10th Inspector tab; `hooks/use-ws.ts` forwards
  |  every decoded frame into `agentStore.applyWsEvent` (store drops
  |  rows on `deleted`); `api.ts` `CreateAgentBody` gains `createdBy`
  |  (server already accepted it); row colors/persona reused from the
  |  Hub (DRY).
  |  Honest deviations from the plan card: (1) the plan names
  |  `agent/start|delta|end` frames but `lokma-shared` only ships
  |  `agent_state` — no names invented, `agent_state` goes live;
  |  (2) row-expand shows real config/locks, not a transcript (no
  |  per-agent transcript store exists); (3) "pipeline view" is the
  |  real `createdBy` lineage list; (4) no bus section (no bus in
  |  core); (5) cross-process (CLI create → pane <2s) NOT met —
  |  broadcast is in-process, CLI rows arrive via Refresh.
  |  Gates: root `tsc --noEmit` 0 errors · web build green (1666
  |  modules, 517k JS/gzip 143k) · core+server `tsc -p` clean · all 18
  |  probes PASS · mock grep: orchestration clean (3 hits = labeled
  |  input `placeholder` attrs) · LIVE probe on :3469 with temp HOME
  |  8/8: create → WS connect → pause/resume/kill frames → fork frame
  |  for the copy → delete `deleted` frame → registry empty again
  |  (real `~/.lokma` untouched).
  |  Next piece: W4-15 VaultPane (`GET /api/vault/graph` FTS5 + real
  |  graph + wikilink + ingest).
  |
|- 2026-09-03 — W4-15 VaultPane DONE
  (server commit 469685b + web commit 21a98fc, both pushed).
  Server (`lokma-core/src/vault/` new: `vault.ts` 511 lines + `index.ts`;
  `core/index.ts` export; `memory/vaultPort.ts` `VaultNote`→`VaultPortNote`
  rename; `server/src/routes/vault.ts` rewritten from the Phase-0 stub):
  jailed `resolveInVault`, ranked substring search (path+title+body),
  wikilink resolution (exact path → `.md` → basename → title → suffix),
  `buildGraph` (seed budget `10+depth*5` + BFS depth 1-3, 80-node/300-link
  caps), `readTree`, `readNote` (256KB cap), `ingestNote` (frontmatter
  `provenance:` merge, 512KB cap). Adopted dirty-tree WIP from the prior
  run as this run's ONE piece + fixed 3 real bugs the live probe caught:
  (1) `{1, 64}` regex space silently dropped every provenance,
  (2) graph nodes omitted `provenance`, (3) `[[Title]]` form never
  resolved (title index added).
  Web (`components/vault/` new: `vault.ts` helpers + `vault-pane.tsx` +
  `vault.test.ts` 40/40 PASS + barrel; `api.ts` vault fns extended;
  11th Inspector tab `Vault`; SearchModal stale "lands in W4" strings
  updated): concept layout 1:1 — debounced search + folder filter +
  depth slider, provenance-badged rows, deterministic SVG graph
  (degree-sized, click-to-open), note reader with clickable
  `[[wikilink]]` navigation, validated New-note ingest form.
  Concept mock NOTES/EDGES + toast-only Full + 3D star-map NOT ported
  (honest 3D notice, no dead buttons).
  Gates: root `tsc --noEmit` 0 errors · web build green (532k
  JS/gzip 147k) · core+server `tsc -p` clean · all 19 probe files PASS
  (vault 40/40) · mock grep clean (5 hits = labeled input
  `placeholder` attrs) · LIVE probe on :3470 with temp HOME 24/24
  (empty → ingest×3 → graph/edges/provenance → folder/search/depth →
  400s → tree → note+resolved links → 404/400s → ingest validation →
  re-ingest provenance swap, real `~/.lokma` untouched).
  Honest scope: ranked-substring search (FTS5 follow-up), circle layout
  (no force lib), 3D follow-up, no Obsidian daemon (Docs/29: file wins).
  Next piece: W4-16 SkillsPane (`GET /api/skills` registry +
  `skill_view` trie + `PATCH /api/skills/:id` curator + telemetry).

  |- 2026-09-03 — W4-16 SkillsPane DONE
  |  (server commit 16ec050 + web commit b56b898, both pushed).
  |  Server (shared `SkillUsage`/`SkillUsageMap` Zod + core
  |  `curator.ts` REAL `recordUsage`/`readUsage` over
  |  `~/.lokma/skills/.usage.json` (Hermes `use_count`/`view_count`/
  |  `patch_count` shape, corrupt file reads as empty, atomic write) +
  |  `registry.ts` `SkillError` + `readSkillView` (skill_view parity) +
  |  `readSkillFile` (jailed to the skill dir, `..`/absolute 400) +
  |  `patchSkill` (exact old→new, zero/ambiguous-match 400, rescan
  |  after write); routes rewritten: `GET /api/skills` (+ best-effort
  |  `usage` map, shape backward compatible), `GET /api/skills/:id`
  |  (`{skill,content}`, records a view), `GET /api/skills/:id/file`
  |  (`{path,content}`), `PATCH /api/skills/:id` (records a patch),
  |  `POST /api/skills/:id/use` (records a use — web parity of the
  |  agent loop's use event); all failures `{code,message}`.
  |  Web (`components/skills/` new: `skills.ts` helpers + `skills-pane.tsx`
  |  + `skills.test.ts` 35/35 PASS + barrel; `api.ts` skill fns extended;
  |  12th Inspector tab `Skills`): concept layout 1:1 — live search
  |  (name/id/description/category), `bundled`/`user` source badges
  |  derived from the real SKILL.md path, per-row real telemetry
  |  (`used N · viewed M · patched K`, zeros when untouched — no
  |  invented ranks), skill_view preview of the REAL SKILL.md body,
  |  clickable linked_files (real single-file loads), curator Patch
  |  editor with client+server validation, Record-use button, live
  |  `<available_skills>` block built from the loaded rows.
  |  Concept mock SKILLS rows + ranks + toast-only /skills palette +
  |  Marketplace + enabled dot NOT ported (no dead buttons, no fake
  |  data; the registry has no enabled flag — patches are the curator
  |  contract). `/skills` header button focuses search (real).
  |  Gates: root `tsc --noEmit` 0 errors · web build green (546k
  |  JS/gzip 150k) · shared+core+server `tsc -p` clean · all 20 probe
  |  files PASS (skills 35/35) · mock grep clean (1 hit = labeled
  |  input `placeholder` attr) · LIVE probe on :3471 with temp HOME
  |  24/24 (list 2 + linked_files → detail + view +1 → file 200 +
  |  escape/empty/missing 400/404s → patch 200 + persisted + patch
  |  +1 → no_match/ambiguous/empty/missing 400/404s → use 200 +
  |  last_used → disk `.usage.json` verified, real `~/.lokma`
  |  untouched).
  |  Probe lesson: skill ids contain a slash (`dev/test-skill`) so
  |  Fastify `:id` needs `%2F` — the web client already sends
  |  `encodeURIComponent`, probes must too (raw slash = route 404).
  |  Honest scope: no `POST /api/skills` create (card required PATCH
  |  only — create is a follow-up), no hub/marketplace (Docs/27 §7.4
  |  future), no auto-propose (no agent loop yet), ranking stays raw
  |  counts (no curator re-rank algorithm yet).
  |  W4 Agents/Orchestration/Vault/Skills COMPLETE (W4-13 + W4-14 +
  |  W4-15 + W4-16).
  |  Deploy: server live (`/health` 200 fresh uptime, `/api/skills`
  |  serves REAL repo skills on the domain); web rebuilt + `pm2 restart
  |  lokma-web` done (homepage 200) BUT the known DEPLOY BLOCKER above
  |  persists — PM2 still runs `next start` (stale 08-31 `.next`,
  |  `/` returns `/_next/` HTML, not `web/dist`). Needs the foreground
  |  delete+start repoint, still not done by this run per the rule.
  |  Next piece: W5-17 ArchifyPane (5 diagram types via REAL `archify`
  |  tool + IR JSON preview + Before/Delta/After + share export).
  |
  |- 2026-09-03 — W5-17 ArchifyPane DONE
  |  (server commit 6941f04 + web commit a13a2e6, both pushed).
  |  Server (`lokma-core/src/archify/` new: `ir.ts` 5-gate
  |  `validateIr()` schema/layout/route/label/share + deterministic
  |  `layoutColumns` shared with the renderer; `render.ts`
  |  `buildSvg()` column layout + 4 preset styles + `buildStandaloneHtml()`
  |  self-contained viewer (`?`/`R`/`L`/`F`/`/`/`+`-`/`0` +
  |  `#focus/#route/#lens` deep links, no CDN) + `buildShareCard()`
  |  1200x630 SVG; `store.ts` `~/.lokma/archify/<id>/`
  |  ir.json/index.html/diagram.svg/share.svg/receipt.json/delta.html +
  |  `generateDiagram()` (deterministic `a -> b -> c` chain derivation,
  |  fails closed) + `updateDiagram()` + `compareDiagrams()` +
  |  `exportDiagram()` + `guideStarter()`; routes
  |  `POST /api/archify/generate|validate`, `GET /api/archify/list`,
  |  `GET|PUT /api/archify/:id`, `POST /:id/delta`,
  |  `GET /:id/export?format=svg|html|json|card`,
  |  `GET /:id/view` (stable viewer URL — srcDoc cannot carry a hash),
  |  `GET /:id/guide`; all failures `{code,message}`.
  |  Web (`components/archify/` new: `archify.ts` helpers +
  |  `archify-pane.tsx` + `archify.test.ts` 33/33 PASS + barrel; `api.ts`
  |  archify types + 9 fns; 13th Inspector tab `Archify`): concept
  |  layout 1:1 — New Diagram form (type + prompt + preset/theme),
  |  type-filtered list with live badges, sandboxed viewer iframe over
  |  the real `/view` URL, working `#focus/#route/#lens` deep links,
  |  live preset/theme re-apply (PUT + rebuild), editable IR with
  |  validate-before-save (broken edits never wipe the last-good build),
  |  real 5-gate receipt table, real Before/Delta/After + diff chips,
  |  4 real file downloads + footer Card/Export shortcuts, Guide loads
  |  a starter chain into the form. Concept mock ITEMS/IR/receipt +
  |  toast-only buttons + PNG/WebM NOT ported (no dead buttons; pane
  |  says PNG/WebM need headless Chromium).
  |  Contract fix caught mid-run: `POST /validate` returns validity in
  |  `ok` (never 4xx) — the first draft hardcoded `ok:true`, the pane
  |  would have saved broken IRs.
  |  Gates: root `tsc --noEmit` 0 errors · web build green (1675
  |  modules, 570k JS/gzip 155k) · core+server `tsc -p` clean · all 21
  |  probe files PASS (archify 33/33) · mock grep clean (1 anti-mock
  |  comment + 2 labeled input `placeholder` attrs) · LIVE probe on
  |  :3472 with temp HOME 38/38 (generate → list → get + 5/5 receipt
  |  → validate bad/good → PUT edit + rebuild + invalid 400 → second
  |  diagram + delta + diff + 3-col HTML → 4 exports + png 400 → view
  |  + guide → 404/400s → all 5 artifacts + delta.html on disk, real
  |  `~/.lokma` untouched).
  |  Honest scope: Lokma-native deterministic renderer (no vendored
  |  `tt-a1i/archify` CLI dep — the IR contract + gates + viewer keys
  |  + storage paths follow Docs/31); no `DELETE /api/archify/:id`
  |  (concept has no delete button — follow-up); PNG/WebM follow-up.
  |  Next piece: W5-18 DesignStudioPane (6 artifact types via REAL
  |  design pipeline + DESIGN.md guard + sandbox preview + exports).
  |
  |- 2026-09-03 — W5-18 DesignStudioPane DONE
  |  (server commit 0823f52 + web commit a9ff8c5, both pushed).
  |  Server (`lokma-core/src/design/` new: `types.ts` 6 types + 4 bundled
  |  systems with full tokens + guard/critique contracts; `render.ts`
  |  deterministic self-contained HTML per type (no CDN/LLM/image model);
  |  `store.ts` `~/.lokma/design/artifacts/<id>/`
  |  artifact.json/artifact.html/design.md/critique.json + 5D heuristic
  |  critique + REAL `.lokma/DESIGN.md` guard parse (7+ H2 rule) +
  |  dependency-free stored-ZIP writer); routes `POST /api/design/generate`,
  |  `GET /api/design/list|systems|guard`, `GET|PUT /api/design/:id`,
  |  `POST /api/design/:id/critique`,
  |  `GET /api/design/:id/export?format=html|zip|json`,
  |  `GET /api/design/:id/view`; all failures `{code,message}`.
  |  Contract fix caught mid-run: `DesignGuard` carries its own `ok`
  |  (lint result) so the guard route nests it under `guard` instead of
  |  spreading (envelope `ok` collision, server build caught it).
  |  Web (`components/design/` new: `design.ts` helpers +
  |  `design.test.ts` 28/28 PASS + `design-pane.tsx` + barrel;
  |  `api.ts` design types + 9 fns; 14th Inspector tab `Design`):
  |  concept layout 1:1 — New form (type + brief + system), guard
  |  strip, searchable/filterable recent artifacts (Docs/34 §7 left
  |  panel), sandboxed viewer over the real `/view` URL, Code tab
  |  (PUT + re-critique) / Critique tab (5D scores + fixes + re-run) /
  |  Export tab (HTML/ZIP/JSON real downloads), footer cards with live
  |  guard numbers. Concept toast-only Generate/Preview/Export NOT
  |  ported — no dead buttons. `ui/button` has no `ink` variant
  |  (GitPane lesson) → active type uses `default`.
  |  Gates: root `tsc --noEmit` 0 errors · web build green (1678
  |  modules, 588k JS/gzip 158k) · core+server `tsc -p` clean · all 22
  |  probe files PASS (design 28/28) · mock grep clean (3 hits =
  |  labeled input `placeholder` attrs) · LIVE probe on :3473 with temp
  |  HOME 33/33 (generate → bad-type/empty/long 400s → list/get →
  |  unknown 404 → evil-id 400 → systems x4 → guard missing/3/9 →
  |  critique + 404 → PUT edit + empty/no-markup 400s → html/json/zip
  |  exports → pdf `needs_toolchain` → bad-format 400 → view → all 4
  |  artifacts on disk, real `~/.lokma` untouched) + python-zipfile
  |  bundle verified (artifact.html/manifest.json/DESIGN.md).
  |  Honest scope: deterministic starter HTML (the agent `write_file`
  |  loop is the follow-up engine, Docs/34 §9); `image` renders an SVG
  |  composition until a provider image model lands (pane-adjacent copy
  |  says so); PDF/PPTX/MP4 answer 400 `needs_toolchain` and the pane
  |  offers only html/zip/json + footer note; critique scores are
  |  structural heuristics (footer says so); no `DELETE /api/design/:id`
  |  (concept has no delete button — follow-up).
  |  Next piece: W5-19 TestingPane (Test Lab Plan→Run→Report +
  |  `POST /api/tests/run` + Shannon suite + junit.xml).
  |  Deploy 2026-09-03: server rebuilt (`tsc -p` clean) + `pm2 restart
  |  lokma-server` → `/health` 200, `/api/design/systems` 200 with REAL
  |  W5-18 data (server LIVE serves this run's code); web `web/dist`
  |  rebuilt (1678 modules) + `pm2 restart lokma-web` → `/` 200 BUT
  |  still stale `/_next/` HTML — DEPLOY BLOCKER persists (PM2 runs
  |  `next start` 15.5.24, needs foreground delete+start, not done per
  |  rule). Both processes online (`lokma-server` pid 2137883,
  |  `lokma-web` pid 2137915).
  |
  - 2026-09-03 — W5-19 TestingPane DONE
    (server commit cf46263 + web commit 49e1428, both pushed).
    Server (`lokma-core/src/testing/` new: `types.ts` + `store.ts` (~360
    lines) + `index.ts`; `core/index.ts` export; `server/src/routes/tests.ts`
    new; `app.ts` registration): every target becomes one real `GET` check
    executed through `app.inject` (status + body against the REAL handlers —
    never a stub) + a Shannon secret scan over the plan + response bodies
    (pattern name + location only, matched secrets never echoed); storage
    `~/.lokma/test-runs/<id>/` (`plan.json` + `report.json` + `junit.xml`).
    NOTE: the core store was found as uncommitted WIP in the dirty tree
    (orphaned run, same pattern as W2-6/W4-15) — adopted as this run's ONE
    piece, reviewed fresh, verified untouched (zero changes needed to the
    orphaned files; only the export line + routes are this run's typing).
    Routes `POST /api/tests/run` (plan 1-120 chars, targets relative-path
    only — absolute URLs/`..`/whitespace rejected, no SSRF surface, 20 max,
    timeout capped 30s, Shannon on by default), `GET /api/tests/list`
    (newest first), `GET /api/tests/:id` (stored plan + classified report),
    `GET /api/tests/:id/junit` (attachment download); all failures
    `{code,message}` (`bad_plan/bad_targets/bad_target/bad_timeout/
    bad_id/test_not_found`).
    Web (`components/testing/` new: `testing.ts` helpers +
    `testing-pane.tsx` + `testing.test.ts` 35/35 PASS + barrel; `api.ts`
    test types + 4 fns; 15th Inspector tab `Testing`): concept layout 1:1 —
    6-stage strip (Sandbox/Heal copy adapted to the real in-process model),
    New-run form (labeled plan + targets textarea + Shannon toggle, client
    mirrors the server rules), all/fail/flaky filters + live search, run
    cards (dot tone, pass/fail/flaky chips, shannon badge, `when`·`dur`),
    expandable real per-test rows (kind/status/ms/detail/classification) +
    Shannon findings + classify counts + real `junit.xml` download.
    Concept mock RUNS rows + toast-only New-run + fake `.webm`/`trace.zip`
    thumbnails NOT ported (honest footer: no Playwright dep here;
    `flaky` stays 0 until rerun history lands — server never invents it).
    Gates: root `tsc --noEmit` 0 errors · web build green (1681
    modules, 603k JS/gzip 162k) · core (emit) + server `tsc -p` clean ·
    all 23 probe files PASS (testing 35/35) · mock grep clean (3 hits =
    labeled input `placeholder` attrs) · LIVE probe (in-process createApp
    + inject, temp HOME) 34/34: empty list → mixed run (2 pass + 1
    `contract` fail + clean Shannon) → list/detail/junit (attachment +
    `<testsuite>`) → Shannon leak flagged (`1 secret`, secret text never
    echoed) → defaults (3 http, no Shannon) → 8 validation 400/404s →
    artifacts on disk → real `~/.lokma` untouched.
    Probe lesson: `ls /root/.lokma/test-runs` throws when the dir is
    absent — treat ENOENT as pass (nothing was written).
    Honest scope: no video/trace (no headless browser dep), no auto-heal
    loop (re-run is one click), no `DELETE /api/tests/:id` (concept has no
    delete button — follow-up).
    Deploy 2026-09-03: server rebuilt (`tsc -p` emit clean) + `pm2 restart
    lokma-server` → `/health` 200 + `/api/tests/list` 200 with REAL
    `{"items":[],"count":0}` on the domain (server LIVE serves this run's
    code); web `web/dist` rebuilt (1681 modules) + `pm2 restart lokma-web`
    → `/` 200 BUT still stale `/_next/` HTML — DEPLOY BLOCKER persists
    (PM2 runs `next start` 15.5.24, needs foreground delete+start, not done
    per rule). Both processes online.
    Next piece: W5-20 BotsPane (`GET /api/bots` registry + playground
    `POST /api/bots/:id/run` + fork/publish).
  - 2026-09-03 — W5-20 BotsPane DONE
    (server commit 27feaf2 + web commit e598c39, both pushed).
    NOTE: the core/shared/server/web implementation was found as
    uncommitted WIP in the dirty tree (orphaned run, same pattern as
    W2-6/W4-15/W5-19) — adopted as this run's ONE piece, reviewed
    fresh file-by-file, all gates + the full live probe re-run before
    the atomic commits (server + web separate).
    Server (`lokma-core/src/bots/` new: `store.ts` + `bundled.ts` +
    `index.ts`; shared `schemas/bot.ts`; `server/src/routes/bots.ts`;
    `app.ts` registration): bundled lokma-ceo template (mirrors
    `.lokma/bots/lokma-ceo/bot.json` per Docs/37, parsed through
    `BotSchema` so drift fails closed, read-only) + global
    `~/.lokma/bots/<id>/bot.json` store + project overlay (`?cwd=`
    shadows global shadows bundled, featured-first sort); routes
    `GET /api/bots|/:id`, `POST /api/bots` (409 `bot_exists`),
    `PATCH /api/bots/:id` (partial budgets merge — the W4-13 clobber
    class fixed by construction, 400 `empty_patch`, bundled 400
    `bundled_readonly`), `POST /:id/fork` (knowledge copy best-effort,
    512KB/file cap, `createdFrom: bot:<src>`), `POST /:id/publish`
    (visibility flip), `POST /:id/run {task}` (spawns a REAL agent
    `createdBy: bot:<id>`, SOUL = systemPrompt, budgets mapped, plus a
    REAL session for playground chat); all failures `{code,message}`.
    Web (`components/bots/` new: `bots.ts` helpers + `bots-pane.tsx` +
    `bot-dialog.tsx` + `bots.test.ts` 46/46 PASS + barrel; `api.ts`
    bot types + 7 fns; 16th Inspector tab `Bots`): concept layout 1:1 —
    Featured/Mine/Shared tabs derived from the real
    featured/visibility/source + live counts + search, Create dialog
    (visible labels, client mirrors server rules), detail with real Run
    (labeled task form + result banner + Open session), Fork (optional
    as-id), Publish (visibility select, disabled on bundled), bot.json
    copy of the LOADED record, lifecycle strip + stored-record preview
    + honest idle-agent footer. Concept mock BOTS rows + invented run
    counts + toast-only Create/Hub buttons NOT ported (pane counts live
    agents instead, labeled as such).
    Gates: root `tsc --noEmit` 0 errors · web build green (1685
    modules, 622k JS/gzip 166k) · shared+core+ai+server builds clean ·
    all 23 probe files PASS (bots 46/46) · mock grep clean (hits =
    labeled input `placeholder` attrs only, every one with a visible
    `<label>`) · LIVE probe (in-process createApp + inject, temp HOME)
    38/38: bundled list/get → create → dup 409 → bad-name/bad-id 400s →
    patch (budgets kept) → empty/bundled 400s → fork (+dup 409) →
    publish + reflected + bad/bundled 400s → run (agent `createdBy`
    tag + session with ≥1 message) → blank-task/unknown 400/404s →
    get unknown/evil-id 404/400s → bot.json + agent dir verified under
    temp HOME → real `~/.lokma` untouched.
    Honest scope: run agents start idle (execution lands with the agent
    runner, a later wave — the pane says so); no `DELETE /api/bots/:id`
    (concept has no delete button — follow-up); no Hub/marketplace
    sharing (Docs/35 §6 follow-up); run sessions default to the server
    cwd unless a cwd is passed (same default on read, consistent).
    W5 Builder tools COMPLETE (W5-17 archify + W5-18 design + W5-19
    testing + W5-20 bots).
    Deploy 2026-09-03: server rebuilt (`build:server` clean) + `pm2
    restart lokma-server` → `/health` 200 + `/api/bots` 200 with REAL
    lokma-ceo JSON on the domain (server LIVE serves this run's code);
    web `web/dist` rebuilt (1685 modules) + `pm2 restart lokma-web` →
    `/` 200 BUT still stale `/_next/` HTML — DEPLOY BLOCKER persists
    (PM2 runs `next start` 15.5.24, needs foreground delete+start, not
    done per rule). Both processes online (server pid 3326814, web pid
    3326967).
    Next piece: W6-21 AuthPane (login + RBAC matrix + members/invite +
    visibility toggle).
  - 2026-09-03 — W6-21 AuthPane DONE
    (server commit 5a01549 + web commit e3ae68e, both pushed).
    NOTE: the core/shared/server/web implementation was found as
    uncommitted WIP in the dirty tree (orphaned run, same pattern as
    W2-6/W4-15/W5-19/W5-20) — adopted as this run's ONE piece, reviewed
    fresh file-by-file, one small inefficiency fixed (`GET /api/users`
    double-read → single), all gates + the full live probe re-run before
    the atomic commits (server + web separate).
    Server (`lokma-core/src/auth/` new: `store.ts` 738 lines + `index.ts`;
    shared `schemas/auth.ts`; `server/src/routes/auth.ts`; `app.ts`
    registration): file-backed store under `~/.lokma/auth/` (users.json
    0600 scrypt hashes, projects/members/invites/settings, HMAC secret),
    stateless v1 HMAC session tokens (7d TTL, httpOnly cookie + Bearer
    fallback), first-admin seed closes after bootstrap (403
    `auth_already_bootstrapped`), one-time expiring copyable invite links,
    last-admin demote/delete 409, `can()` matrix per Docs/36
    (admin/member/viewer, `project:create` policy, public-visibility read,
    owner/member edit). Routes `POST /api/auth/register|login|logout|`
    `accept-invite`, `GET /api/auth/me`, `GET/PATCH /api/auth/settings`
    (public read, admin write, viewer 403), `GET /api/users` + invite/
    patch/delete/reset-password (admin only), `GET/POST /api/projects` +
    `GET/PATCH/DELETE /:id` + members add/remove (can-gated); all
    failures `{code,message}`, hashes never cross the wire.
    Web (`components/auth/` new: `auth.ts` helpers + `auth-pane.tsx`
    1014 lines + `auth.test.ts` 49/49 PASS + barrel; `api.ts` auth/user/
    project types + 17 fns + `request()` `redirect401` opt-out; 17th
    Inspector tab `Auth`): concept layout 1:1 — role cards, visibility-
    badged projects, invite-row members, flow footer — but every control
    hits a live endpoint (register/login/accept-invite, quiet `/me`,
    settings policy, user search + invite link + role/status edit +
    disable + two-click delete + reset-password, project search + create
    + visibility toggle + member add/remove). Concept mock
    PROJECTS/MEMBERS rows + pravatar avatars + toast-only can()/Invite/
    Manage buttons NOT ported (initial squares from real names instead;
    concept `lk_...` token box became real email+password login per
    Docs/36 §6.2 local auth — no dead buttons, no fake data).
    Gates: root `tsc --noEmit` 0 errors · web build green (1688
    modules, 651k JS/gzip 172k) · shared+core+server dist emit clean ·
    all 25 probe files PASS (auth 49/49) · mock grep clean · LIVE probe
    (in-process createApp + inject, startup-env temp HOME) 35/35:
    unbootstrapped → register → re-register 403 → me/me-401 → login
    wrong/right 401/200 → users + bad-email 400 → invite → accept →
    one-time 404 → member settings/users 403s → admin patch →
    bad-settings 400 → empty-name 400 → member create → visibility flip
    → viewer invite/accept/add/list/remove/re-remove 404 → viewer
    settings 403 → unknown/evil-id 404/400s → disk 3 users + no hash on
    wire → real `~/.lokma/auth` absent (untouched).
    REAL incident + permanent probe lesson: bun snapshots env at
    startup — a runtime `process.env.HOME=` assignment does NOT move
    `os.homedir()`, so the first probe run polluted the REAL
    `/root/.lokma/auth/` (3 test users + secret). Polluted dir deleted
    in full (6 files, all this run's timestamps — nothing pre-existed,
    pre-run state restored), probe fixed to `HOME=$(mktemp -d)` startup
    env + `/tmp/` refuse-guard, re-run 35/35 with the real tree verified
    absent. Temp-HOME probes under bun MUST use startup env, never
    runtime assignment (same trap threatens agents/vault/archify stores —
    all use `homedir()`; prior waves' temp-HOME claims are suspect).
    Honest scope: pane `can()` mirror gates buttons only, server
    re-checks every write; project cwd optional (server default when
    empty, consistent with bot runs); no session-inheritance UI (server
    `memberOf` enforced, pane shows membership rows).
    Deploy 2026-09-03: server dist rebuilt (shared+core+server emit
    clean) + `pm2 restart lokma-server` → `/health` 200 (fresh uptime)
    + `/api/auth/settings` 200 with REAL W6-21 data
    (`{"projectCreation":"members",...,"bootstrapped":false}` on the
    domain — server LIVE serves this run's code); web `web/dist`
    rebuilt (1688 modules) + `pm2 restart lokma-web` → `/` 200 BUT
    |  |  still stale `/_next/` HTML — DEPLOY BLOCKER persists (PM2 runs
    |  |  `next start` 15.5.24, needs foreground delete+start, not done per
    |  |  rule). Both processes online (server pid 3785085, web pid 3785173).
    |  |  Next piece: W6-22 SetupWizardPane (`lokma init` 3-step + Doctor 8
    |  |  checks = `GET /api/doctor`).
      - 2026-09-03 — W6-22 SetupWizardPane DONE
        (server commit ea6ec5a + web commit bbe3a17, both pushed).
        Server (shared `GlobalConfig.features` Zod map + new
        `lokma-core/src/setup/` + new `server/src/routes/setup.ts`, `app.ts`
        registration): `SETUP_FEATURES` registry mirrors the concept checkboxes
        1:1 (browser/search/gateway/mcp/vault + docs pointers); `GET
        /api/setup` (registry + resolved flags, stored wins); `POST
        /api/setup {features}` (unknown ids 400 `unknown_feature`, non-bool
        400 `bad_feature`, empty 400 `empty_patch`); `POST /api/setup/init
        {cwd?}` (ensures global config + 6 data dirs + optional project
        `.lokma/settings.json` scaffold exist — reports created/existed, never
        wipes; bad cwd 400 `bad_cwd`); `GET /api/doctor[?agents=1]` (8
        measured probes — config/credentials/providers/models/sessions/
        agents/skills/locks — + a 9th SOUL probe counting agents with
        SOUL.md content; every probe timed, throws become `ok:false` rows).
        All failures `{code,message}`.
        Web (`components/setup/` new: `setup.ts` helpers + `setup-pane.tsx` +
        `setup.test.ts` 22/22 PASS + barrel; `api.ts` setup/doctor types + 4
        fns; 18th Inspector tab `Setup`): concept layout 1:1 — Init card with
        a REAL Run-init button (created/existed banner), Stack checkboxes from
        the live registry (Save = real POST + server-truth reload, Turn-all-off
        + Reset-to-defaults), Doctor terminal with live rows + pass footer +
        real `--agents` toggle + Run + Copy. Concept hardcoded `doctorLines` +
        toast-only Docs-32/Watcher buttons NOT ported (no dead buttons).
        Gates: root `tsc --noEmit` 0 errors · web build green (1691
        modules, 662k JS/gzip 175k) · shared+core+ai+server builds clean ·
        all 26 probe files PASS (setup 22/22) · mock grep CLEAN (zero hits
        on all new files) · LIVE probe (in-process createApp + inject,
        startup-env temp HOME + refuse-guard) 40/40: registry defaults →
        save → persist → 4 validation 400s → init (6 subdirs, config kept
        from the save step) → rerun idempotent → cwd scaffold (+rerun) →
        bad-cwd 400s → doctor 8/8 shape+content → agents=1 9th soul row →
        create seeds default SOUL.md (1/1 pass) → rm SOUL.md (0/1 fail) →
        disk features under temp HOME → real `~/.lokma/config.json`
        untouched.
        Honest scope: `features` is a plain boolean map (Docs/32 §2.1 full
        key space — terminal.backend/browser.*/webSearch.*/gateway.* — stays
        CLI-side until the agent loop reads it; the pane copy says MCP rows
        live in Settings); init creates the 6 dirs the harness stores bind
        to (sessions/auth/vault are caller-scoped, not created); the soul
        probe caps at 20 agents.
|        W6 System panes continue (W6-21 auth + W6-22 setup done).
|        Next piece: W6-23 PluginMarketplacePane (Cordis list + enable/disable
|        without restart + install-from-URL).
|  - 2026-09-03 — W6-23 PluginMarketplacePane DONE
|    (server commit 8eaf50d + web commit a4c7912, both pushed).
|    Server (shared `schemas/plugin.ts` PluginSource/Category/Record Zod +
|    new `lokma-core/src/plugins/` + new `server/src/routes/plugins.ts`,
|    `app.ts` registration): 6 bundled manifests with REAL endpoint lists
|    (archify 9 + design 9 + testing 4 + bots 7 + vault 4 + browser 8 = 41
|    routes, verified against the route files) + `~/.lokma/plugins/`
|    state.json (hot flags) + registry.json (URL records); scoped ids
|    (`@lokma/...`) travel as one `%2F`-encoded segment (same trick as
|    skill ids); an onRequest guard answers 503 `plugin_disabled` on
|    suspended prefixes (hot, no restart; skips `/api/plugins` itself).
|    Routes `GET /api/plugins|/:id`, `PATCH /:id {enabled}`
|    (400 `empty_patch`/`bad_enabled`, 404 `plugin_not_found`),
|    `POST /api/plugins/install {url}` (https-only, no creds, no
|    local/private hosts, 409 `plugin_exists`, stored suspended as
|    version `0.0.0` — no fetch, no SSRF surface),
|    `DELETE /api/plugins/:id` (URL-only, bundled 400
|    `bundled_readonly`); all failures `{code,message}`.
|    Real bug caught by the live probe mid-run: `PLUGIN_ID_PATTERN`
|    rejected `@`/`/` so every bundled detail 400d — widened (ids never
|    touch the fs: string compare + JSON map, `..` is unknown/400).
|    Web (`components/plugins/` new: `plugins.ts` helpers +
|    `plugins-pane.tsx` + `plugins.test.ts` 32/32 PASS + barrel; `api.ts`
|    plugin types + 5 fns; 19th Inspector tab `Plugins`, Package icon):
|    concept layout 1:1 — Installed/Suspended tabs (live counts), search +
|    category filter, labeled add-from-URL form (client mirrors server
|    rules), Enable/Enabled toggle, Kernel expander (real manifest:
|    prefixes + endpoint list), two-click Delete on URL rows. Concept
|    invented downloads/stars + fake marketplace rows + toast-only
|    buttons NOT ported (no dead buttons; footer states no remote
|    marketplace yet).
|    Gates: root `tsc --noEmit` 0 errors · web build green (1694
|    modules, 673k JS/gzip 177k) · shared+core+ai+server dist emit clean ·
|    all 27 probe files PASS (plugins 32/32) · mock grep clean · LIVE
|    probe (in-process createApp + inject, startup-env temp HOME +
|    refuse-guard) 40/40: list 6 + archify 9 + total 41 → detail →
|    unknown/garbage/evil 404/400/400 → disable → archify list+validate
|    503 → guard skips self + sibling 200 → re-enable → 200 → PATCH
|    400/400/404 → 9 bad URLs + missing 400 → install (suspended) →
|    count 7 → dup 409 → detail → enable → bundled delete 400 →
|    delete → re-delete 404 → count 6 → state+registry under temp HOME
|    → real `~/.lokma/plugins` absent (untouched).
|    Honest scope: no remote marketplace (Docs/23 §profiles future);
|    URL records own no routes until the fetch wave (pane says so);
|    guard cache is in-process (sole writer is this server — no CLI
|    plugin commands yet); suspending vault also 503s its search
|    (real consequence, pane warns).
|    Deploy 2026-09-03: server dist rebuilt + `pm2 restart lokma-server` →
|    `/health` 200 + `/api/plugins` 200 with REAL W6-23 registry on domain
|    (server LIVE serves this run's code); `web/dist` rebuilt (1694 modules)
|    + `pm2 restart lokma-web` → `/` 200 BUT still stale `/_next/` HTML —
|    DEPLOY BLOCKER persists (PM2 runs `next start` 15.5.24, needs foreground
|    delete+start, not done per rule); both processes online.
|    Next piece: W6-24 ObservabilityPane (TokenLedger + bus-log trace
|    timeline + Replay + Share).
|- 2026-09-03 — W6-24 ObservabilityPane DONE
|    (server commit 9861132 + web commit a3ee703, both pushed).
|    Server (`lokma-core/src/observability/` new: `trace.ts`
|    `buildAgentTrace()` — every event derived from durable state
|    (registry createdAt/state + SOUL/MEMORY mtimes with a 1s seed grace
|    + live advisory locks + `createdBy` lineage, ascending by `ts`; a
|    fresh agent honestly shows a 1-event timeline) + `share.ts` frozen
|    snapshots under `~/.lokma/shares/<token>.json` (0700, `sh_`+128-bit
|    hex, agent-trace or session-transcript bytes, later edits never
|    rewrite shared history) + `index.ts`; `core/index.ts` export; new
|    `server/src/routes/observability.ts` (`app.ts` registration):
|    `GET /api/agents/:id/trace`, `GET /api/share`,
|    `POST /api/share/agent|session`, `GET|DELETE /api/share/:token`;
|    all failures `{code,message}` (`AgentError` + new `ShareError`).
|    Web (`components/observability/` new: `observability.ts` helpers +
|    `observability-pane.tsx` + `observability.test.ts` 45/45 PASS +
|    barrel; `api.ts` trace/share types + 6 fns; 20th Inspector tab
|    `Observability`, Activity icon): concept layout 1:1 — agent picker
|    + state badge, all/agent/tool filters, dark timeline with relative
|    `0.0s` stamps (per-agent hashed badges, no invented costs),
|    TokenLedger card from the real 7d usage summary (project scope
|    captioned), Bus card honestly stating no bus exists in core (WS
|    `agent_state` carries lifecycle), 3-layer safe card from real
|    locks + worktree, Replay (session picker → read-only JSONL render,
|    click-to-expand, 200-row cap), Share (freeze trace/session →
|    copyable `/share/<kind>/<token>` link + shares list + frozen
|    snapshot viewer + two-click delete). Concept hardcoded TRACES +
|    `$0.04` costs + persona colors + BUS copy + toast-only Replay/Share
|    NOT ported (no dead buttons, no fake data).
|    Gates: root `tsc --noEmit` 0 errors · web build green (1697
|    modules, 689k JS/gzip 181k) · shared+core+server dist emit clean ·
|    all 28 probe files PASS (observability 45/45) · mock grep zero hits
|    on all new files · LIVE probe (in-process createApp + inject,
|    startup-env temp HOME + refuse-guard) 43/43: unknown 404 + evil
|    400 → create → fresh 1-event trace → pause adds `agent_state` →
|    1.2s + SOUL PUT adds `soul_write` → real global lock adds
|    `lock_acquired` (released in finally) → share agent (token shape +
|    url) → frozen copy ≥3 events → 400/404 validations → session
|    create + share + byte-identical snapshot → list 2 → delete flow →
|    frozen agent snapshot survives source delete → real
|    `~/.lokma/shares` absent (untouched).
|    Deploy 2026-09-03: server dist rebuilt + `pm2 restart lokma-server`
|    → `/health` 200 + live `/api/share` on the domain (server LIVE
|    serves this run's code); `web/dist` rebuilt (1697 modules) +
|    `pm2 restart lokma-web` → `/` 200 BUT still stale `/_next/` HTML —
|    DEPLOY BLOCKER persists (PM2 runs `next start` 15.5.24, needs
|    foreground delete+start, not done per rule). Both processes online.
|  Next piece: W6-25 CronApprovalsPane (per-agent cron CRUD + approvals
|  queue on the SAME rule store as the chat permission card).
|  - 2026-09-03 — W6-25 CronApprovalsPane DONE
|    (server commit 5c9c64a + web commit 6fd6453, both pushed).
|    NOTE: the core/shared/server/web implementation was found as
|    uncommitted WIP in the dirty tree (orphaned run, same pattern as
|    W2-6/W4-15/W5-19/W5-20/W6-21) — adopted as this run's ONE piece,
|    reviewed fresh file-by-file, one real bug fixed (`agent_not_found`
|    answered 400, now 404 like every other unknown-agent route), all
|    gates + the full live probe re-run before the atomic commits
|    (server + web separate).
|    Server (`lokma-core/src/cron/` new: `cron.ts` 322 lines + `approvals.ts`
|    + `index.ts`; shared `schemas/cron.ts`; `server/src/routes/cron.ts`;
|    `app.ts` registration; `ws.ts` hook): 5-field standard cron
|    validation (per-field ranges, `*`/`*/n`/`n`/`a-b`/comma, dow 7→0,
|    dom+dow OR semantics) + `nextRunAfter` pure next-fire computation
|    (366-day cap); jobs persist in `~/.lokma/cron/jobs.json` keyed by
|    server-minted `c_+hex` ids; approvals decision log appends every real
|    WS `permission_response`/`ask_response` to
|    `~/.lokma/approvals/decisions.jsonl` (best-effort, never breaks chat).
|    Routes `GET /api/cron`, `GET/POST /api/agents/:id/cron`,
|    `PATCH/DELETE /api/agents/:id/cron/:jobId`, `GET /api/approvals`
|    (`?limit=` capped 200, default 100); all failures `{code,message}`
|    (`bad_schedule/bad_task/bad_enabled/empty_patch/cron_not_found/
|    bad_agent_id/agent_not_found`).
|    Web (`components/cron/` new: `cron.ts` helpers + `cron-pane.tsx` +
|    `cron.test.ts` 44 checks PASS + barrel; `api.ts` cron/approval types
|    + 6 fns; 21st Inspector tab `Cron`, Clock3 icon): concept layout 1:1 —
|    per-agent cron list (agent filter + text search, enable toggle,
|    two-click delete, labeled create form with client-mirrored rules),
|    honest pending box (empty until the agent tool loop emits frames),
|    Rules editor over the SAME `GET/PATCH /api/config` permissions store
|    the chat card writes (one store, two views), real WS decision
|    history with search. Concept mock CRONS/APPROVALS rows + invented
|    risk badges + auto-classifier copy + toast-only `+ Cron` / `Approve
|    all` / quick-approve NOT ported (no dead buttons, no fake data).
|    Gates: root `tsc --noEmit` 0 errors · web build green (1700
|    modules, 704k JS/gzip 184k) · shared+core+server dist emit clean ·
|    all 29 probe files PASS (cron 44) · mock grep zero hits on all new
|    files · LIVE probe (in-process createApp + inject, startup-env temp
|    HOME + refuse-guard) 29/29: empty list/approvals → create agent →
|    agent-cron empty → unknown-agent 404 → evil-id 400 → create (id +
|    nextRunAt + null lastRunAt) → bad/blank/range schedule + bad task
|    400s → unknown-agent create 404 → list 1 → disable (nextRunAt null)
|    → re-schedule → empty/bad-schedule/unknown-job 400s/404 → delete →
|    re-delete 404 → empty again → session + 2 decisions → newest-first
|    + limit=1 → jobs.json on disk under temp HOME → real
|    `~/.lokma/{cron,approvals}` absent (untouched).
|    Honest scope: no firing daemon (runner wave — `lastRunAt` stays
|    null, rows show the computed next fire, pane says so); no pending
|    queue (no tool loop yet — decisions log the moment answers arrive);
|    no `DELETE /api/cron` global clear (concept has no such button —
|    follow-up).
|    Deploy 2026-09-03: server dist rebuilt + `pm2 restart lokma-server`
|    → `/health` 200 + `/api/cron` 200 with REAL `{"jobs":[],"count":0}`
|    on the domain (server LIVE serves this run's code); web `web/dist`
|    rebuilt (1700 modules) + `pm2 restart lokma-web` → `/` 200 WITH
|    creds serving the fresh Vite build (`assets/index-BknigIUR.js`,
|    same hash as this run's build, zero `_next/` refs, title `Lokma —
|    harness`), 401 without creds. DEPLOY BLOCKER RESOLVED: `pm2 show
|    lokma-web` now runs `bun x vite preview --host 127.0.0.1 --port
|    3457` from `packages/lokma-web/web` (repointed outside this run,
|    presumably foreground) — plan §9 is accurate again. Both processes
|    online (server pid 1422833, web pid 1423300).
|    Next piece: W6-26 ExtrasPane (23 ranked ideas as a REAL feature-flag
|    board over `GET/PATCH /api/config` flags).
  - 2026-09-03 — W6-26 ExtrasPane DONE (web commit 37236f5, pushed; NO
    server commit — `PATCH /api/config {features}` already persists the
    full map, verified live).
    NOTE: a sibling run concurrently scaffolded the same pane (inspector
    wiring + pane/test/index against a `slug/flag/extras.*` API). This run
    adopted it as its ONE piece: kept the sibling's 3 files, rewrote only
    `extras.ts` to the sibling API (SINGLE source — no duplicate catalog),
    fixed 1 glyph (`…` → `Saving`, symbol-glyph rule), ran all gates +
    the full live probe before the atomic commit.
    Web (`components/extras/` new: `extras.ts` catalog + helpers +
    `extras-pane.tsx` + `extras.test.ts` 49 checks PASS + barrel; 22nd
    Inspector tab `Extras`, Star icon): concept layout 1:1 — All/Done/
    Todo filters, 14/23 · 61% progress bar, rows with Check-badged
    shipped cards + dashed roadmap cards; shipped rows Open their real
    tab (bots/agents/cron/observability/skills/setup/vault/browser/git)
    or name their real surface (Sessions sidebar → Fork, Composer mic);
    roadmap rows toggle a REAL `features.extras.*` flag (full-map PATCH
    so SetupPane stack flags survive — the shallow-merge trap) or show
    the real milestone (#20 session-drag-handoff is milestone-only,
    waits on W7). Honest deviations from the concept `done` column: #11
    browser-per-agent shipped (W3-12 per-agent tabs), #16 worktree GC
    shipped as the W3-11 Git-tab GC button (manual prune; TTL sweeper is
    Phase 3) — both noted in the test. Concept toast-only Open/Plan
    button NOT ported — no dead buttons, no fake data.
    Gates: root `tsc --noEmit` 0 errors · web build green (5.51s) ·
    server `tsc -p` untouched-clean (no server files changed) · extras
    probe 49/49 · mock grep clean (hits = `todo` filter labels only) ·
    LIVE probe (in-process createApp + inject, startup-env temp HOME +
    refuse-guard) 8/8: setup seed → PATCH extras flag → GET reflects +
    siblings kept → toggle off → non-bool 400 → real `~/.lokma`
    untouched.
    Deploy 2026-09-03: web-only piece — `web/dist` rebuilt + `pm2
    restart lokma-web` → `/` 200 WITH creds serving the FRESH Vite
    build (`assets/index-D7SI_RkA.js`, zero `_next/` refs, bundle
    contains `Extras — 23 ranked`), 401 without creds; `/health` 200
    (server untouched, still this week's code). Both processes online
    (server pid 1422833, web pid 1914651, `bun x vite preview` —
    stale-stack check PASS).
    W6 System panes COMPLETE (W6-21 auth + W6-22 setup + W6-23 plugins +
    W6-24 observability + W6-25 cron + W6-26 extras).
    Next piece: W7-27 Pane system port (`Pane.tsx` + `SplitTree.tsx` +
    `WindowedCanvas.tsx` + `TilingBar.tsx` + `App.tsx` shell state).

- 2026-09-03 — TASK-38 W7-27 Pane system port DONE (web 239708d —
  server commit NONE, all endpoints reused: sessions fork/merge,
  files read, config untouched).
  - **Executor run:** W7-27 done — real tiling workspace live in the
    harness center column (split/windowed panes + 5-zone drag split +
    session drop chooser + tab picker + file previews).
  - **Web:** new `components/panes/` (`panes.ts` pure helpers +
    `panes.test.ts` 66/66 PASS + `pane.tsx` WorkspacePane/tab-bar/
    chooser/picker/file-preview + `split-tree.tsx` + `windowed-canvas.tsx`
    + `tiling-bar.tsx` 19 open actions + `inspector-host.tsx` 22 real
    panes + `workspace.tsx` tab-state owner + barrel; `app-shell.tsx`
    gains the Tiling toggle + tiling/windowed center;
    `sessions-sidebar.tsx` drop copy updated to W7-live). Session tabs render ChatWithSocket (own socket +
    Composer); tool tabs render the SAME panes as the Inspector;
    file tabs read real bytes (cwd via GET session + GET files/read,
    read-only + Copy/Mention/Retry, honest cwd-missing states).
    Concept mock tabs + toast-only buttons + `handleOpenTab("Yeni
    mesaj")` fake-Composer path NOT ported (no dead buttons).
  - **Gates:** root `tsc --noEmit` 0 errors · web build green (1711
    modules, 746k JS/gzip 197k) · server `tsc -p` untouched-clean (no
    server files changed) · all 31 probe files PASS (panes 66/66) ·
    mock grep clean (anti-mock comments + labeled input placeholder +
    negative `{kind:"mock"}` fixtures only) · dist bundle contains
    `Tiling workspace`, zero `_next/` refs.
  - **Deploy:** web-only piece — `web/dist` rebuilt (pre-commit) +
    `pm2 restart lokma-web` → `/` 200 WITH creds serving the FRESH
    Vite build, 401 without creds; `/health` 200 (server untouched).
    Both processes online (`bun x vite preview` — stale-stack check
    PASS).
  - **Honest scope:** tool panes (terminal/git/browser) bind to the
    workspace session with a real New-session gate when absent;
    tab snapshots persist to `lokma:tiling-tabs:v1` (validated load);
    layout persists via `lokma:layout:v1`; merge target = pane's own
    session tab (chooser says so when absent).
  - TASK-38 ALL WAVES COMPLETE (W0 foundation + W1 chat + W2
    settings/usage + W3 workspaces + W4 agents/orchestration/vault/
    skills + W5 builder tools + W6 system panes + W7 pane system).
    Next: Phase 1/2/3 follow-ups (agent runner daemon, FTS5 vault,
    remote marketplace, firing cron daemon, 3D vault, PNG/WebM
    exports, `DELETE` endpoints).
---

*Single source stays `Docs/00-LOKMA-KONTEKST.md`. After each wave: update 00 chronology
+ Son Durum, commit + push, mirror to memory vault.*
