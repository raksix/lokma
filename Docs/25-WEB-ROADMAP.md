# Web Harness — Roadmap (Ultra-Detailed)

> **Docs are done, code is next. Stack decision first: `21-WEB-STACK-alternatives.md` §9 — pick A/B/C/D (recommendation A: Next 15 + Fastify 5 + flexlayout-react + Zustand + WS/SSE). Everything below assumes A. Companion: `03-YOL-HARITASI.md` (phased master).**

## Phase 0 — Scaffolding (1–2 days)

Goal: monorepo builds, two surfaces import the same schemas, empty panes render.

- [ ] **Monorepo:** `bun` workspaces (`pnpm` alt), `packages/lokma-core` + `lokma-ai` + `lokma-shared` (Zod) + `lokma-web` (`web/` Next.js 15 + `server/` Fastify 5) + `themes/` + `.lokma/worktrees/` + `.agentlocks/`, root `tsconfig`/`eslint`/`prettier`, `/.gitignore` entries for `worktrees` + `.agentlocks`.
- [ ] **lokma-core:** `Context` kernel (~300 lines), `ToolRegistry`, `SessionStore` (JSONL `~/.lokma/projects/<hash>/sessions/*.jsonl`), `Provider` types Zod in `lokma-shared`, agent loop stub `query()` → mock `text_delta` stream.
- [ ] **lokma-ai:** Anthropic + OpenAI adapters, `stream()` abstraction, mock `models` catalog + cache.
- [ ] **lokma-shared:** `AgentSchema` + `LockSchema` + `MemorySchema` + `SkillSchema` + `VaultGraphSchema`, WS protocol (`text_delta`/`tool_start`/`tool_result`/`permission_request`/`ask_user_question`/`done`+`cost`+`agent.*`).
- [ ] **lokma-web/server:** Fastify 5 + `@fastify/websocket` + `@fastify/cors`, routes `GET /health`, `GET /api/config` (masked `keySet`), `GET /api/providers`, `GET /api/models`, `GET /api/sessions`, `GET /api/skills`, `GET /api/agents`, `GET /api/vault/graph`, `WS /ws/:sessionId` echo mock.
- [ ] **lokma-web/web:** Next.js 15 App Router + Tailwind v4 + shadcn/ui, App Shell header + left/right borders (static before flexlayout), Chat stub (input + mock messages), `bun dev` runs `server` + `web` concurrently.
- [ ] **Config & credentials:** `~/.lokma/config.json | .lokma/settings.json | env LOKMA_* | CLI flags` hierarchy, `credentials.json` AES-GCM 0600, `lokma config/auth/doctor` + watcher `config/changed` — `26-*`.
- [ ] **Skills/memory/vault scaffolds:** `skills/` + `~/.lokma/skills/`, `registry.scan()` + `build_skills_system_prompt()` trie, `~/.lokma/memories/MEMORY.md+USER.md` + `state.db` FTS5 stub, `VaultPort` interface (`POST /api/vault/ingest` → lokma-vault / memory.fermag.com.tr/lokma) — `27-*` `28-*` `29-*`.
- [ ] **Agent scaffolds:** `~/.lokma/agents/<id>/SOUL.md+IDENTITY.json+MEMORY.md+config.json+sessions/` layout, `registry.ts`+`orchestrator.ts` stubs, `.agentlocks/locks/<sha1>.json` + `worktree` helpers, 6 persona templates `skills/lokma-personas/*` (`reviewer/planner/tester/researcher/builder/custodian`), feature flag `agents` off by default — `30-*` §2,5,6,10,12.
- [ ] **PM2 + nginx:** `lokma-web :3456` (local) or `lokma.fermag.com.tr` (cloud), SQLite→Postgres switch, same pattern as `notes.fermag :3008`/`sunumly :3021`.
- [ ] **Docs:** `02-TEKNIK-KARARLAR.md` with chosen stack.

**Exit:** `lokma web --port 3456` → browser shows App Shell + mock chat streams over WS, CLI and Web read the same `SessionStore` JSONL, `lokma-shared` schemas import in both surfaces.

---

## Phase 1 — Core Loop in the Browser (1–2 weeks)

Goal: real agent turns in web, same loop as CLI — plus agents MVP.

- [ ] **Wire lokma-core loop to WS:** `/ws/:sessionId` → `query()` generator → forward `text_delta`/`tool_start`/`tool_result`/`permission_request`/`ask_user_question`/`done + cost` to `xterm.js`-safe stream.
- [ ] **Chat:** streaming `text_delta` append, tool renderers (Read/Edit/Bash/Grep), permission card (Allow/Deny/Always), `AskUserQuestion` choices, `/` slash palette (from `commands` plugin), `@` file mention (file tree), `Ctrl+M` model switcher (only enabled models).
- [ ] **Providers & Models (UI+API):** `Settings → Providers` (add/edit/test/delete, encrypted→masked) + `Settings → Models` (per-provider enable table + search + `GET /api/models` merge+cache, fallback chain) — `22-*` §1–2.
- [ ] **Sessions (UI+API):** `SessionsPane` (list/search/`+ New`/click→load), `POST /api/sessions`, `PATCH /rename`, `POST /fork`, `DELETE`, resume via WS replay; JSONL same files as CLI — `lokma --resume <id>` cross-surface.
- [ ] **Usage:** `Usage` pane/page (KPI cards + `recharts` AreaChart by model + session table + CSV/JSONL, `agentId` column) + header badge — `22-*` §3.
- [ ] **Pane system v1:** `flexlayout-react`, persisted `localStorage: lokma:layout:v1`, Left `Sessions` / Center `Chat` / Right `Files` — drag/resize/collapse, config via `lokma.patch.yml`.
- [ ] **File browser v1:** `react-arborist` tree, `GET /api/files`, click → `Monaco` read-only preview, drag → `@file` in chat.
- [ ] **Auth:** `lokma auth <token>` → httpOnly cookie + `Bearer`, all `/api/*` gated.
- [ ] **Auto-skills (Phase 1):** `<available_skills>` injected every turn (see `27-*` §7.2), `skill_view` progressive disclosure (`GET /api/skills/:id` + `GET /api/skills/:id/file`), `/skills` palette + autocomplete — Hermes `Use when` first-57-chars routing, no embeddings in hot path.
- [ ] **Memory (Phase 1):** `MEMORY.md/USER.md` frozen snapshot, `memory` tool (add/replace/remove, overflow echo), `POST /api/memory` (masked), `session_search` over FTS5 (agent-scoped `agentId`), `VaultPort.ingest()` + `POST /api/vault/ingest` + `GET /api/vault/note` — see `28-*` §5.
- [ ] **Agents — MVP (Phase 1):**
  - CRUD: `lokma agent create <name> [--persona reviewer] [--model anthropic/...] [--cwd ./proj]` + `config/run/pause/resume/kill/fork/clone/delete/import/export`, REST `GET/POST/PATCH/DELETE /api/agents`, read-only `Agent Hub` pane (card: avatar, model pill, state dot, tokens/USD).
  - Caps: `maxAgents=20` (exist) + `maxConcurrent=5` (running) + `maxQueue=20`, priority queue (`interactive>high>normal>low`, aging), `maxSpawnDepth:3`, `budgets` hard stops (`error_max_budget`) — `30-*` §6.
  - Per-agent `SOUL.md` editor + `MEMORY.md` view + `USER.md` + `Promote to global`, per-agent `model/fallback/credentialRef/temperature` + `TokenLedger agentId` + cost pane filter — `30-*` §2–4.
  - Agent-scoped `session_search` + Web pane — `30-*` §3.3.

- [ ] **Self-spawning stub (1.5):** `create_agent` tool gated by `agent-spawner` skill (`Use when the task needs multiple specialists`), `createdBy: ai:<parent>` + `AUDIT.md`, MCP `agents` tools — user-toggleable — `30-*` §7.

**Exit:** create session → pick enabled model → prompt → stream with tools → cost badge + Usage → `lokma --resume <id>` from CLI shows same transcript → `lokma agent create reviewer --model anthropic/claude-4-sonnet` → that agent streams in Web with its own SOUL/memory/model in `Agent Hub`.

---

## Phase 2 — Full Parity + Orchestration (2–3 weeks)

Goal: every Claude Code feature reachable in web; orchestration and pane system complete; collision-free parallel agents.

- [ ] **MCP:** `Settings → MCP` — 4 transports (stdio/http/sse/ws), test, enable, same `.mcp.json` as CLI, dynamic tools via `ToolRegistry`.
- [ ] **Permissions / Hooks / Skills / Plugins:** settings panels, slash commands from skills, `hooks` table (`PostToolUse` etc.), plugin manager UI (`23-*`: installed/marketplace `agentskills.io`+`dsh-market`, add from URL, enable/disable without restart, lightweight Cordis kernel `ctx.tools/llm/sessions`, `emit/waterfall/bail`).
- [ ] **Memory deep:** 2-tier compression (gateway 85% + agent 50% lean/default, `in_place: true`), 4-phase compaction + anchor index, Honcho pluggable provider, `Vault` file tree + `Graph` pane (`react-force-graph-2d` 2D canvas default + `react-force-graph-3d` star-map toggle as in Hermes `/journey`), `[[wikilink]]` click→pane, `depth` slider 1–3, `folder=lokma` default — `28-*` §4.
- [ ] **Vault deep:** `lokma-vault` (or `memory.fermag.com.tr/lokma` prefix) default, `VaultPort` interface + `<!-- lokma-sync -->` merge, `GET /api/vault/graph` (`?folder=lokma&depth=2`), `lokma mcp serve --vault` (vault **as** MCP), optional `vault.backend: "obsidian-rest"` — `29-*`.
- [ ] **Git:** `GitPane` (branch, `git status` diff, commit log, `gh` PR flow), diff `Monaco` + `hashline` style rewind.
- [ ] **Live terminal logs:** `xterm.js` in right pane, `terminal/data` WS from harness PTY, multiple `bash:*` tabs multiplexed `WS /ws/:sessionId`.
- [ ] **Browser preview:** `BrowserPane` (iframe/proxied), `browser_*` tools, per-agent browser tabs `GET /api/agents/:id/browser/open` → worktree-scoped — `30-*` §11.3.
- [ ] **Agents — Parallel & safe (Phase 2):**
  - `.agentlocks/locks/<sha1(path)>.json` advisory locks + `heartbeat` (30s) + `lease` (60s, steal on 2 missed beats) + dashboard HUD (who holds what) — `30-*` §10.1.
  - `git worktree add .lokma/worktrees/<agentId> -b worktree/<agentId>` per concurrent agent, merge `diff3`/AST driver via coordinator — `30-*` §10.2–10.4.
  - `expectedSha` snapshot guard on every `edit_file`/`write_file`/`apply_patch`, on mismatch → `currentSha + hunks` + `merge.request` — `30-*` §10.3.
  - Combined: lease → sha guard → worktree (see `30-*` §10.4 diagram).
- [ ] **Agents — Communication (Phase 2.5):**
  - Typed `Bus` over SQLite WAL + WS push (`mailbox` + `broadcast`), messages `file.intent/claim/release/edited`, `task.assign`, `merge.request/done`, `agent.spawned/done` — `30-*` §9.1.
  - `Coordinator` (file-ownership graph, `task.assign`, `merge.request` mediation, takeover on 60s heartbeat miss) — `30-*` §9.2–9.3.
  - `send_to_agent` messaging + Web `Live logs` per agent — `30-*` §9.
- [ ] **Orchestration patterns:** `parallel()` (fan-out 3–20 as in `30-*` §8), `pipeline()` (`phase`-ed Cordis-style), `map` over commits/files as workflow-script (hundreds via Cordis `jobs`), `Team` (long-lived peers), adversarial verifier vote — see `30-*` §8.
- [ ] **Pane system v2:** all tabs from `24-*` §1.1 (Code, Git, Orchestration, Usage, Browser), drag `session → session` (split/fork/merge), drag `session → agent card` = handoff (#20), drag `agent card → agent card` = merge request, reorder left TabSets (`Sessions ↔ Projects ↔ Agent Hub`), `Agent Hub` full CRUD + `⏸ ■` — `30-*` §11.
- [ ] **Projects + checkpoints + worktrees:** `ProjectsPane` (cwd list, `+ Add project`, switch), `Group by project` toggle, `Rewind` per edit, `⎇` worktree pill in header, `New Session → Worktree` toggle, worktree GC `worktrees.ttl_days: 7` — `30-*` #16.
- [ ] **Skills self-patching:** `skill_manage(patch)` in-loop + Web `PATCH /api/skills/:id`, `.usage.json` telemetry → curator ranking — `27-*`.

**Exit:** web can do everything CLI does (MCP, hooks, skills auto-routed, git PR, agents orchestrated with zero silent overwrites — lock HUD green, merge queue drains), N agents in parallel, file locks HUD, checkpoint rewound, session handed from one agent to another via drag — all from the browser.

---

## Phase 3 — Themes, Polish, Cloud & Extras (2–4 weeks)

Goal: beautiful, shippable, shareable — the "ballandır" that makes Lokma innovative, not cloned.

- [ ] **Themes:** `themes/*.json` → CSS vars + Chalk tokens, `lokma theme set <name>`, 4 MVP (`claude`/`omp`/`midnight`/`paper`, OMP benchmarked), `Settings → Appearance` live switch — `11-*`.
- [ ] **Sharing:** `Share session` → public link (read-only transcript), `Export` JSONL/Markdown, per-agent trace share (`/share/agent/<id>` as in `30-*` #23), same tier as `26-*`.
- [ ] **Cloud mode:** Docker/Firecracker per-session sandbox, `lokma.fermag.com.tr` (PM2+nginx, SQLite→Postgres, S3 JSONL, `.lokma/worktrees` on volume), `lokma doctor --agents` (SOUL parseable, MEMORY under cap, worktree exists, model reachable, credential valid, locks not stale — `30-*` #21).
- [ ] **Desktop (optional):** Tauri or Electron shell wrapping same `lokma-web` bundle, native file picker, system tray.
- [ ] **Extras (stretch, pick from `30-*` §13 — 23 ideas, ranked by value for a *coding* harness, each with why/how):**
  - **For v1 stretch (highest value):** agent templates marketplace (#1), eval harness (#3), time-travel fork (#4), per-agent `cron` (#5), human-in-the-loop approvals per agent (#6), `Observability` trace pane (#7), `handoff` protocol (#8), `browser per agent` (#11), `session → agent` drag handoff (#20).
  - **Next:** `Vault graph provenance(agentId)` (#22), auto-scaling `maxConcurrent` (#9), `sandbox: docker|host` per agent (#10), `skill sharing` (#12), `voice` per agent (#13), `agent-vs-agent` adversarial review (#14), token-tiered `delegationModel` (#15), `Replay` deterministic re-run (#17), MCP `agentTemplate` import (#18), affinity + work-stealing (#19), `Worktree GC` (#16), per-agent budgets hard 80% alert (#2).
- [ ] **Perf & a11y:** virtualized chat (`react-virtuoso`), keyboard nav (every action shortcut), `prefers-reduced-motion`, Lighthouse 90+.
- [ ] **Mobile:** responsive App Shell (left drawer, right sheet on `<768px>`).
- [ ] **Polish:** `lokma init` onboarding, empty states, error boundaries, offline banner, `--version`.

---

## Dependencies & Sequencing

```
21 (decision) → 0 (scaffold: lokma-core+ai+shared+web + config+skills+memory+vault+agents scaffolds + locks+worktree+personas)
                                    ↓
                           1 (loop+chat+providers/models/sessions/usage + panes v1 + file tree + skills routing + memory wiring + agents MVP 1.5 self-spawn)
                                    ↓
                           2 (MCP+perms+hooks+skills+plugins+git+terminal+browser + memory deep+vault deep+graph + agents parallel+safe+communication + orchestration patterns + panes v2)
                                    ↓
                           3 (themes+sharing+cloud + extras 1-23 stretch + mobile+perf+a11y+polish)
```

- **Phase 1 is the MVP** — demoable, dog-foodable, single and *humble* multi-agent.
- **Phase 2 is parity** — "everything CLI does, web does too — with N agents, safely" (collision-free).
- **Phase 3 is polish** — the "innovative, not cloned" ballandır (themes, cloud, graph, voice, adversarial review).

---

## What I Need From You Now

1. **Stack decision:** `A` / `B` / `C` / `D` or a mix — `21-WEB-STACK-alternatives.md` §9 (recommendation **A**).
2. Then: **"Scaffold Phase 0"** — monorepo builds in the chosen stack, `git push`, and `lokma web` runs locally.

No code until you decide. Docs are the contract — code follows the contract.

---

*Master: `03-YOL-HARITASI.md` · Agents deep: `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` · Skills/memory/vault: `27-*`/`28-*`/`29-*`*
