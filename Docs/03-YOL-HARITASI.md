# 03 — Roadmap (Ultra-Detailed)

> **Status 2026-09-01 UTC:** Docs set 01–36 complete · **Stack A — Vite 6 + React 19 + Tailwind v4 + shadcn/ui + Fastify 5 + flexlayout-react** (Next.js 15 → Vite 6 on 2026-09-01 per your request) + domain lokma.fermag.com.tr + Tauri + dual license + shadcn — Phase 0 scaffold Vite
> **English from 2026-08-31 01:45 (chat Turkish) · Single source: `00-LOKMA-KONTEKST.md`**
> **Detail docs:** `20-overview` · `21-stack` · `22-features` · `23-plugins` · `24-panes` · `25-roadmap` · `26-config` · `27-skills` · `28-memory` · `29-obsidian` · `30-agent-system` · `31-archify` · `32-setup` · `33-testing` · `34-design` · `35-bots`

---

## Phase 0 — Setup ✅ + Scaffolding (Next, 1–2 days)

> **Stack picked A — Vite 6 + React 19** (was Next 15 → Vite 2026-09-01) + Tailwind v4 + shadcn/ui + Fastify 5 + flexlayout-react — 2026-09-01 switched per your request. See `02-TEKNIK-KARARLAR.md`.

### Already done (✅)

- [x] `Docs/` system (`00-LOKMA-KONTEKST.md` as single source, English Rule 7) — 2026-08-31
- [x] Research: Claude Code (10), OMP themes (11), harness arch (12), synthesis (13) — 2070 lines ham, 5fe6bf1+d17cc5a
- [x] Public repo `raksix/lokma` + README (harness, not clone) + 77-line `.gitignore` + `.env.example` — 96ac29c → af2217a → 8bc7696 → 07054cd
- [x] Reposition innovative harness (README 8bc7696 + GitHub description 07054cd)
- [x] Web harness docs 20–25 (62KB synthesized + 195KB ham, 6 docs, 3 subagents) — 6c4f776
- [x] Config & credentials refactor — `~/.lokma/config.json` + `~/.lokma/credentials.json` (AES-GCM, 0600) + `.lokma/settings.json` per project + env — `26-*` + 0d889aa
- [x] Auto-skill discovery (Hermes-inspired) — `27-*` (1044 lines ham) — `<available_skills>` index, `skill_view` progressive disclosure, curator patch
- [x] Infinite memory + vault + graph — `28-*` (1390 lines) + `29-*` (879 lines, 2112 Obsidian MCPs scanned) — FTS5 `session_search` + `VaultPort` + `react-force-graph-2d`
- [x] **Agent system — ultra-detailed** — `30-*` (40KB synthesized + 2699 lines ham, 4 subagents): per-agent `SOUL`/`MEMORY`/`model`/`budgets`, `maxAgents=20`/`maxConcurrent=5` + queue + priority + aging, self-spawn via `create_agent` (skill-gated), bus + coordinator + heartbeat/lease, 3-layer collision-free (advisory `.agentlocks` + `git worktree` + `expectedSha` hashline + `diff3`), 23 extras — see `30-*` §2–14

### Scaffold next — UNBLOCKED (Stack A picked 2026-08-31)

- [ ] Monorepo: `bun workspaces` (`pnpm` alt), `packages/lokma-core` + `lokma-ai` + `lokma-shared` (Zod schemas) + `lokma-web` (`web/` Vite 6 SPA + `server/` Fastify 5) + `themes/` + `.lokma/worktrees/` + `.agentlocks/`
- [ ] `lokma-core`: `Context` kernel (~300 lines), `ToolRegistry`, `SessionStore` (JSONL `~/.lokma/projects/<hash>/sessions/*.jsonl`), `Provider` types Zod in `lokma-shared`
- [ ] `lokma-ai`: Anthropic + OpenAI adapters, `stream()` abstraction, mock `models` catalog
- [ ] `lokma-shared`: `AgentSchema` + `LockSchema` + `MemorySchema` + `SkillSchema` + WS protocol (text_delta/tool_*/permission/cost)
- [ ] `lokma-web/server`: Fastify 5 + `@fastify/websocket` + `@fastify/cors`, routes `GET /health`, `GET /api/config` (masked), `GET /api/providers`, `GET /api/models`, `GET /api/sessions`, `GET /api/agents`, `GET /api/vault/graph`, `WS /ws/:sessionId`
- [ ] `lokma-web/web`: Vite 6 + React 19 + Tailwind v4 + shadcn/ui — App Shell header + left/right borders (static before flexlayout), Chat stub + mock WS, `vite.config.ts` proxy `/api`+`/ws` → `:3456`, proves two surfaces import same `lokma-shared`
- [ ] `Config & credentials` — layered `~/.lokma/config.json | .lokma/settings.json | env LOKMA_* | CLI flags`, `credentials.json` AES-GCM 0600, `lokma config/auth/doctor` — see `26-*` §5–7
- [ ] `Auto-skills scaffold` — `skills/` (repo) + `~/.lokma/skills/` (user+hub), `registry.scan()` + `build_skills_system_prompt()` + `skill_view` trie, stub `curator.ts` — see `27-*` §7
- [ ] `Memory scaffold` — `~/.lokma/memories/MEMORY.md+USER.md` (§-delimited), `state.db` FTS5, `session_search` stub, `VaultPort` interface (`vault/memory.fermag.com.tr/lokma` prefix), `memory` tool — see `28-*` §5
- [ ] `Agent scaffold` — `~/.lokma/agents/<id>/SOUL.md+MEMORY.md+IDENTITY.json+config.json+sessions/` layout, `AgentSchema`/`LockSchema` Zod, `registry.ts` + `orchestrator.ts` stubs, `.agentlocks/` + `worktree` helpers, `.gitignore` entries, 6 persona templates in `skills/lokma-personas/*/SOUL.md` (`reviewer/planner/tester/researcher/builder/custodian`), feature flag `agents` off by default — see `30-*` §2, §5, §6, §12
- [ ] `Setup — optional stack` — `lokma init/setup` Ink TUI (browser + web search + gateway + MCP + vault checkboxes), `lokma doctor` probes, layered config — see `32-*`
- [ ] `Archify scaffold` — `~/.lokma/archify/<id>/` (ir.json + html + share.png + receipt.json), `archify` tool stub (generate/validate/delta/export), `GET /api/archify/*` — see `31-*`
- [ ] `Design canvas scaffold` — `~/.lokma/design/` (systems/templates/artifacts) + `.lokma/DESIGN.md` guard (7+ H2), `design_canvas` tool stub, `GET /api/design/*` — see `34-*`
- [ ] `Testing scaffold` — `~/.lokma/test-runs/<id>/` (plan.json + tests/*.spec.cjs + videos/*.webm + report.json), `test_app` skill stub, `lokma test` CLI — see `33-*`
- [ ] `Bots scaffold` — `~/.lokma/bots/<id>/bot.json` (Zod BotSchema), `GET /api/bots`, Bot Gallery stub — see `35-*`
- [ ] PM2 + nginx (67) — `lokma-web :3456` (local) or `lokma.fermag.com.tr` (cloud), SQLite local / Postgres cloud per `02-*`

**Exit:** `lokma web --port 3456` → browser shows shell + mock chat streams over WS, two surfaces import same `lokma-shared`, two surfaces read same `SessionStore` JSONL.

---

## Phase 1 — Core Loop in Browser (1–2 weeks)

Goal: real agent turns in the web, same loop as CLI — plus agents MVP.

- [ ] **Wire lokma-core loop to WS:** `/ws/:sessionId` calls `query()` generator, forwards `text_delta`/`tool_start`/`tool_result`/`permission_request`/`ask_user_question`/`done + cost`
- [ ] **Chat:** streaming `text_delta` append, tool renderers (Read/Edit/Bash/Grep), `permission card` (Allow/Deny/Always), `AskUserQuestion` choices, `/` slash palette (from `commands` plugin), `@` file mention (file tree), `Ctrl+M` model switcher (only enabled models)
- [ ] **Providers & Models (UI+API):** `Settings → Providers` (add/edit/test/delete, key encrypted→masked `keySet`, `POST /api/providers/:id/test`) + `Settings → Models` (per-provider enable checkbox table + search + `GET /api/models` merged+cache), fallback chain — `22-*` §1–2
- [ ] **Sessions (UI+API):** `SessionsPane` (list/search/`+ New`/click→load), `POST /api/sessions`, `PATCH /rename`, `POST /fork`, `DELETE`, resume via WS replay; JSONL same files as CLI (`lokma --resume <id>` cross-surface)
- [ ] **Usage:** header cost badge + `/usage` dashboard (`recharts` AreaChart by model) + session table + CSV/JSONL export — `22-*` §3
- [ ] **Pane system v1:** `flexlayout-react` integrated, persisted `localStorage: lokma:layout:v1`, Left `Sessions` / Center `Chat` / Right `Files`
- [ ] **File browser v1:** `react-arborist` tree, `GET /api/files`, preview in `Monaco` read-only, drag → `@file`
- [ ] **Auth:** `lokma auth <token>` → httpOnly cookie + `Bearer` fallback, all `/api/*` gated
- [ ] **Auto-skills wiring (Phase 1):** `<available_skills>` injected every turn, `skill_view` trie + `linked_files`, `/skills` palette + autocomplete, `GET /api/skills` — see `27-*` §7.3
- [ ] **Memory wiring (Phase 1):** `MEMORY.md/USER.md` frozen snapshot per session, `memory` tool (add/replace/remove), `POST /api/memory` (masked), `session_search` over FTS5, `POST /api/vault/ingest` + `GET /api/vault/note` — see `28-*` §5.2–5.3
- [ ] **Agents — MVP (Phase 1 CRUD):** `lokma agent create <name> [--persona reviewer] [--model anthropic/...] [--cwd ./proj]` + `config/run/pause/resume/kill/fork/clone/delete`, REST `GET/POST /api/agents`, `caps` enforcement (`maxAgents` existence + `maxConcurrent` concurrency → priority queue normal/aging), `SOUL.md` editor, per-agent `model` + `MEMORY.md` + `budgets` + `TokenLedger agentId`, agent-scoped `session_search`, read-only `Agent Hub` pane — see `30-*` §5–6, §11
- [ ] **Agents — Self-spawning stub (Phase 1.5):** `create_agent` tool gated by `agent-spawner` skill, `createdBy: ai:<parentId>` + `AUDIT.md`, `maxSpawnDepth: 3` — see `30-*` §7

**Exit:** create session → pick enabled model → prompt → stream with tools → switch model mid-session → cost badge + Usage → resume same session from CLI and see same transcript → `lokma agent create reviewer` → that agent streams in Web with its own SOUL/memory → `lokma init` checkboxes for browser/search/gateway → Archify diagram via `archify` tool → design artifact via `design_canvas` → `lokma test --plan-only` shows element inventory.

---

## Phase 2 — Full Parity + Orchestration (2–3 weeks)

Goal: every Claude Code feature reachable in web; orchestration & pane system complete; collision-free parallel agents.

- [ ] **MCP:** `Settings → MCP` — 4 transports (stdio/http/sse/ws), test, enable, same `.mcp.json` as CLI, dynamic tools
- [ ] **Permissions / Hooks / Skills / Plugins:** settings panels for each, slash commands from skills, `hooks` table (`PostToolUse` etc.), plugin manager (`23-*` UI: installed list, marketplace `agentskills.io`/`dsh-market`, add from URL, enable/disable without restart, lightweight kernel)
- [ ] **Memory deep (Phase 2):** 2-tier compression (gateway 85% + agent 50% lean/default, `in_place: true` soft-archive), 4-phase compaction with anchor index, Honcho pluggable provider, `Vault` file tree + `Graph` pane (`react-force-graph-2d` 2D default + `react-force-graph-3d` star-map toggle), `[[wikilink]]` click → pane, `depth` slider, `folder=lokma` default — see `28-*` §4–5
- [ ] **Obsidian / vault deep:** `lokma-vault` (or `memory.fermag.com.tr/lokma` prefix) as default, `VaultPort` interface, `<!-- lokma-sync -->` merge, `lokma mcp serve --vault` (vault **as** MCP), optional `vault.backend: "obsidian-rest"` (`27124/mcp`) — see `29-*`
- [ ] **Git:** `GitPane` (branch, `git status` diff, commit log, `gh` PR flow), diff viewer in Code pane (`hashline` style)
- [ ] **Live terminal logs:** `xterm.js` in right pane, `terminal/data` WS events from PTY, multiple `bash:*` tabs
- [ ] **Browser preview:** `BrowserPane` (iframe/proxied), `browser_*` tools, harness can `navigate`/`click`/`screenshot` live per agent — see `30-*` §11.3
- [ ] **Agents — Parallel & safe (Phase 2):** `.agentlocks/` advisory locks + `heartbeat`/`lease` (30s/60s, steal on 2 missed beats) + `git worktree` isolation per concurrent agent + `expectedSha` snapshot guard + `diff3` merge — see `30-*` §10
- [ ] **Agents — Communication (Phase 2.5):** typed `Bus` (SQLite WAL + WS push, `mailbox` + `broadcast`), `Coordinator` (file-ownership graph, `task.assign`, `merge.request` mediation), `send_to_agent`, Web `Live logs` per agent + lock HUD — see `30-*` §9 + `30-*` §11
- [ ] **Orchestration patterns (from `30-*` §8):** `parallel()` (fan-out 3–20), `pipeline()` (`phase`), map-over-commits, `Team` (long-lived peers), `Workflow` script (hundreds via Cordis `jobs`), adversarial verifier vote
- [ ] **Pane system v2:** all tabs from `24-*` §1.1 (Code, Git, Orchestration/OrchestrationPane, Usage, Browser), drag `session → session` (split/fork/merge), drag `session → agent card` = handoff (#20), reorder left TabSets, `Agent Hub` full CRUD — see `30-*` §11.1
- [ ] **Projects:** `ProjectsPane` (cwd list, `+ Add project`, switch), `Group by project` toggle, checkpoints (`Rewind` per edit, `⎇` worktree pill), worktree GC (`ttl_days: 7`)
- [ ] **Archify deep (Phase 2):** `compare` delta Before/Delta/After pane + share cards 1200×630 + `archify guide` from codebase — see `31-*` §6
- [ ] **Design deep (Phase 2):** `design system add/use` + `template add` + 5D critique pass + export pipeline HTML/PDF/PPTX/MP4 — see `34-*` §8–11
- [ ] **Testing deep (Phase 2):** full Test Lab (Plan→Run→Report→Security), per-test video+trace, Shannon suite, `junit.xml` CI — see `33-*` §7–9
- [ ] **Bots deep (Phase 2):** Bot Gallery (Featured/Mine/Shared) + playground + `fork`/`publish` + hub/marketplace + `POST /api/bots/:id/run` → agent — see `35-*` §5–9
- [ ] **Skills self-improvement (Phase 2):** `skill_manage(patch)` in-loop + Web `PATCH /api/skills/:id`, `.usage.json` telemetry → curator ranking

**Exit:** web can do everything CLI does (MCP, hooks, skills auto-routed, git PR, agents orchestrated with zero silent overwrites, checkpoint rewound) — all from the browser, N agents in parallel, file locks HUD green.

---

## Phase 3 — Themes, Polish, Cloud & Extras (2–4 weeks)

Goal: beautiful, shippable, shareable — the "ballandır" that makes Lokma innovative.

- [ ] **Themes:** `themes/*.json` → CSS vars + Chalk tokens, `lokma theme set <name>`, 4 MVP (`claude`/`omp`/`midnight`/`paper`, OMP benchmarked), `Settings → Appearance` live switch — `11-*`
- [ ] **Sharing:** `Share session` → public link (read-only transcript), `Export` JSONL/Markdown, per-agent trace share (`/share/agent/<id>`) — see `30-*` #23
- [ ] **Cloud mode:** Docker/Firecracker per-session sandbox, `lokma.fermag.com.tr` (PM2+nginx, SQLite→Postgres, S3 JSONL, `.lokma/worktrees` on volume), `lokma doctor` (`--agents` checks SOUL/MEMORY/worktree/model/credential/locks) — see `30-*` #21, `23-*`
- [ ] **Desktop (TAURI/Electron, later):** same `lokma-web` bundle behind Tauri, native file picker, system tray
- [ ] **Extras (stretch, pick from `30-*` §13 — 23 ranked):** per-agent `cron` (#5), human-in-the-loop approvals per agent (#6), `Observability` trace timeline (#7), `handoff` protocol (#8), auto-scaling `maxConcurrent` (#9), `sandbox: docker|host` per agent (#10), `browser per agent` (#11), skill sharing across agents (#12), voice per agent (#13), `agent-vs-agent` adversarial review (#14), token-tiered `delegationModel` (#15), `Replay` deterministic re-run (#17), MCP `agentTemplate` import (#18), affinity + work-stealing (#19), vault graph `provenance: agentId` (#22) — all have why/how in `30-*` §13
- [ ] **Perf & a11y:** virtualized chat (`react-virtuoso`), keyboard nav (every action has a shortcut), `prefers-reduced-motion`, Lighthouse 90+
- [ ] **Mobile:** responsive App Shell (left drawer, right sheet on `<768px>`)
- [ ] **Polish:** `lokma init` onboarding, empty states, error boundaries, offline banner, `--version`

---

## Dependencies & Sequencing

```
21 (decision) → 0 (scaffold: core+ai+shared+web + themes + agents/archify/design/testing/bots/setup) → 1 (loop+chat+providers/models/sessions/usage+panes v1 + skills+memory stub + agents MVP+self-spawn + archify/design/testing/bots stubs)
                                    ↓
                           2 (MCP+perms+hooks+skills|plugins+git+terminal+browser + memory deep+vault deep + agents parallel+safe + communication + orchestration + panes v2)
                                    ↓
                           3 (themes+sharing+cloud + extras 1-23 stretch + mobile+perf+a11y+polish)
```

- **Phase 1 is the MVP milestone** — demoable, dog-foodable, single+humble multi-agent.
- **Phase 2 is parity** — the "everything CLI does, web does too — with N agents, safely" promise (file-collision-free).
- **Phase 3 is polish** — the "innovative, not cloned" ballandır (themes, cloud, graph, voice, adversarial review).

---

## What I Need From You Now

~~1. **Stack decision:** reply `A` / `B` / `C` / `D`~~ — **DONE 2026-08-31:** A picked (Next+Fastify+shadcn), domain lokma.fermag.com.tr, Tauri, dual license, shadcn design system.
2. **"Scaffold Phase 0"** — monorepo builds in stack A, `git push`, and `lokma web` runs locally on :3456 (PM2+nginx on 67).

Docs are the contract — code follows the contract. Phase 0 ready to start.

---

*Detail: `25-WEB-ROADMAP.md` (web-specific) · `30-AGENT-SYSTEM` (agents) · `31-ARCHIFY` · `32-SETUP` · `33-TESTING` · `34-DESIGN` · `35-BOTS` · `27-29` (skills/memory/vault)*
