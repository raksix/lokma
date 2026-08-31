# 02 — Technical Decisions

> Stack and architecture decisions accumulate here. Each decision is dated and reasoned.

## Stack (Pending Decision)

User must pick web stack from `21-WEB-STACK-alternatives.md` §9 before Phase 0 scaffold. Options:

| ID | Frontend | Backend | Pane | Realtime | Status |
|----|----------|---------|------|----------|--------|
| **A (Recommended)** | Next.js 15 + Tailwind + shadcn/ui + React 19 | Fastify 5 | flexlayout-react | WS + SSE | ⏳ Awaiting pick |
| **B** | SvelteKit 2 | Hono (Bun) | flexlayout-react | WS | ⏳ |
| **C** | Next.js 15 | Fastify 5 | dnd-kit + Resizable (custom) | WS + SSE | ⏳ |
| **D** | Next.js 15 | NestJS 11 | flexlayout-react | WS | ⏳ |

**Recommendation:** **A** — proven on your infra (67: Randevona, notes.fermag, Sunumly all Next.js+Fastify+PM2+nginx+shadcn), least risk, fastest to MVP, hiring pool, IDE-grade panes out of the box.

Other fixed choices (stack-independent):

| Area | Choice | Why |
|------|--------|-----|
| Monorepo | `bun` workspaces (`pnpm` alt) | You use `bun` on DSH, `pnpm` on others — either works |
| State | Zustand 5 | Minimal, per-domain stores, persist to localStorage |
| Validation | Zod in `lokma-shared` | Single source of truth for API ↔ client |
| Terminal | xterm.js + fit + web-links | Proven, same as VS Code |
| Editor | Monaco (file preview/diff) | VS Code parity; Codemirror 6 alt |
| Tree | react-arborist (virtualized, drag-drop) | Or custom ul + dnd-kit |
| Charts | recharts | You already use it |
| Config & secrets | Layered `~/.lokma/config.json` + provider `credentials.json` (encrypted, 0600) + `.lokma/settings.json` per project + env override — see `26-CONFIG-and-CREDENTIALS.md` | Mirrors Claude Code `~/.claude.json`/`settings.json` — keys in one encrypted file, masked over API, `lokma doctor` checks perms |
| DB | drizzle-orm + SQLite (local) / Postgres (cloud) | Light, typed, migrations |
| Plugin kernel | Lightweight Cordis-inspired (~300 lines) — no vendored Cordis fork | Same semantics, smaller surface — see `23-*` |
| Themes | `themes/*.json` → CSS vars + Chalk tokens (4 MVP: claude/omp/midnight/paper) | Single token source for CLI+Web |
| Language | **Docs & code English from 2026-08-31 01:45** (Rule 7), chat stays Turkish | Your request |
| Auto-skills | Hermes-inspired `<available_skills>` index + `skill_view` progressive disclosure + curator self-patching — see `27-SKILLS-auto-discovery-hermes-inspired.md` | LLM matches `Use when <trigger>.` (first 57 chars) — no embeddings in hot path |
| Memory | Infinite via `MEMORY.md/USER.md` (§-delimited) + FTS5 `session_search` + compaction + vault sync (`lokma-vault` / `memory.fermag.com.tr`) — see `28-MEMORY-infinite-vault-graph.md` | Hermes frozen prompt + 2-tier compression + vault graph (react-force-graph-2d) |
| Obsidian / vault | File-based vault + `VaultPort` + `GET /api/vault/graph` — no Obsidian desktop required; optional `obsidian-rest` backend — see `29-OBSIDIAN-MCP-vault-and-graph.md` | VPS-friendly, no `27124` daemon |
| Agents | Per-agent `SOUL.md` + `MEMORY.md` + `model` + `budgets` + SCOPED FTS5; `maxAgents=20` + `maxConcurrent=5` + queue + priority; `.agentlocks/` advisory + `git worktree` + `expectedSha` hashline + bus + coordinator — see `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` | Multi-provider, themeable, collision-free paralellism |
| Setup | `lokma init/setup` Ink TUI checkboxes: browser (Browser Use/Playwright/CDP) + web search (SearXNG/Exa/Brave) + gateway (Telegram/Discord/Slack/WA/Signal) + MCP + memory/vault — see `32-SETUP-optional-stack-and-connections.md` | Optional stack — mirrors `hermes setup` wizard |
| Locks | `.agentlocks/locks/<sha1(path)>.json` + 30s heartbeat + 60s lease + `edit_file` snapshot guard | Cheapest reliable layer before worktree |
| Worktrees | `git worktree add .lokma/worktrees/<agentId>` per concurrent agent, merge via coordinator `diff3` | Strongest isolation — no runtime file collision |
| Orchestration | `parallel()` / `pipeline()` / Team / workflow-script (Cordis jobs) — see `30-*` §8 | Fan-out 3–20, then coalesce |
| Diagrams | Archify typed JSON IR → HTML/SVG, 5 types, 4 presets, viewer contract — see `31-ARCHIFY-diagrams-and-viewer.md` | Agent produces IR, Lokma renders |
| Design canvas | Open Design-inspired 6 artifacts + `DESIGN.md` brand contract + `design-systems/` + Design Studio pane — see `34-DESIGN-open-design-inspired.md` | Agent-native design engine |
| Testing | TestSprite-inspired self-hosted harness: plan→inventory→codegen→sandbox(video+trace)→classify→heal + Shannon/security — see `33-TESTING-autonomous-harness-testsprite-inspired.md` | `test_app` skill + Test Lab pane |
| Bots | Grok-bots-inspired `bot.json` spec, Bot Gallery, persona→bot→agent, fork/share/marketplace — see `35-BOTS-lokma-bots.md` | Lightweight shareable specialists |

## Architecture

- **Shared core:** `packages/lokma-core` (agent loop, tool registry, sessions, plugin kernel) + `lokma-ai` (provider abstraction, streaming) + `lokma-shared` (Zod schemas, WS protocol) — shared by CLI (Ink TUI) and Web (Fastify WS + Next.js).
- **Plugin system:** Everything is a plugin (DeepSeek Harness Cordis-inspired) — see `23-PLUGIN-SYSTEM-deepseek-cordis.md` for 5 Cordis ideas, service keys, events, `inject`, `waterfall` etc. No vendored Cordis.
- **Pane system:** IDE-grade draggable panes (flexlayout-react) — see `24-WEB-PANE-SYSTEM-and-orchestration.md` for left/right sidebars, file browser, live logs, browser preview, drag session into session, orchestration.

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-08-31 | Docs/ system created | Your request — single source docs |
| 2026-08-31 | Reposition to innovative harness (not clone) | Your correction — "ballandır orda" |
| 2026-08-31 | Multi-provider (6: Anthropic/OpenAI/DeepSeek/Google/Ollama/OpenRouter) | Web harness requirement |
| 2026-08-31 | Plugin system: Cordis-inspired lightweight kernel | DeepSeek Harness research (74KB/1146 lines) — everything-is-a-plugin |
| 2026-08-31 | Pane system: flexlayout-react (provisional) | Pending your pick from 21-* |
| 2026-08-31 | Docs & code → English (chat Turkish) | Your request 2026-08-31 01:45 |
| 2026-08-31 | Config hierarchy: `~/.lokma/config.json` + provider `credentials.json` (encrypted 0600) + `.lokma/settings.json` per project + env override — see `26-CONFIG-and-CREDENTIALS.md` | Your request: keys in config like `~/.claude/config.json`/`settings.json`, refactor spec'd |
| 2026-08-31 | Web harness docs set (20-25) completed — 62KB synthesized + 195KB raw | 3 research subagents + DSH scrape |
| 2026-08-31 | Auto-skill discovery (Hermes-inspired) — `<available_skills>` + `skill_view` + curator patch — see `27-*` | Your request: "hermes agent kendi kendine skill araştırıp onu kullanabiliyor" — 1044 lines raw |
| 2026-08-31 | Infinite memory + vault + graph — `MEMORY.md/USER.md` + FTS5 `session_search` + compaction + vault sync + graph view — see `28-*` + `29-*` | Your request: "kendi sonsuz memorysi. obsidian mcpler ... vault memory sistemi ve graph görüntüleyicisi" — 1390+879 lines raw |
| 2026-08-31 | Agent system — per-agent `SOUL`/`MEMORY`/`model` + `maxAgents`/`maxConcurrent` + queue + self-spawn + bus + locks/worktree/hashline collision-free — see `30-*` | Your request: web roadmap genişlet + ultra-detailed agent system — 2699 lines raw (4 subagents) |
| 2026-08-31 | Archify diagrams — typed JSON IR → HTML/SVG, 5 types, 4 presets, viewer contract, `~/.lokma/archify/` + Design Studio pane + `/api/archify/*` — see `31-ARCHIFY-diagrams-and-viewer.md` | `tt-a1i/archify` 34.9k★ research (970 lines) — integration via skill + pane |
| 2026-08-31 | Setup optional stack — `lokma init/setup` Ink TUI checkboxes: browser (Browser Use/Playwright/CDP) + web search (SearXNG/Exa/Brave fallback) + gateway (Telegram/Discord/Slack/WA/Signal) + MCP + memory/vault — see `32-SETUP-optional-stack-and-connections.md` | Your request: *"hermesi kurarken browser/web search/bağlantı kurulumda isteğe bağlı seçilebilsin"* — hermes setup/browse/gateway trio (1,190+1,349+964 lines) |
| 2026-08-31 | Testing autonomous harness — TestSprite-inspired but self-hosted: plan→inventory(codegen)→sandbox(video+trace)→classify→heal, element `expect` guarantee, API + Shannon/security suite, Test Lab pane — see `33-TESTING-autonomous-harness-testsprite-inspired.md` | Your request: *"testsprite bağımsız ama daha iyi — video/rapor/plan/buton coverage/API/Shannon"* — 655+1,136 lines |
| 2026-08-31 | Design canvas — Open Design-inspired: 6 artifact types (Prototype/Deck/Mobile/Image/Document/HyperFrame), `DESIGN.md` brand contract (7+ H2), `design-systems/` + `templates/`, Design Studio pane + `/api/design/*` + export HTML/PDF/PPTX/MP4 — see `34-DESIGN-open-design-inspired.md` | Your request: *"lokmanın kendi içinde tasarım da yapılabilsin, claude design gibi"* — open-design 92.9k★ (1,325+831 lines) |
| 2026-08-31 | Lokma Bots — Grok-bots-inspired: `bot.json` spec, persona→bot→agent mapping, Bot Gallery pane, lifecycle create→playground→publish→fork→run as agent, sharing/marketplace — see `35-BOTS-lokma-bots.md` | Your request: *"hermese bots geldi grok bots gibi lokma bots planı çıkar"* — grok-bots 1,121 lines |

---

*Pending: your stack pick (A/B/C/D) → Phase 0 scaffold.*
