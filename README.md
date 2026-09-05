# Lokma

> **Innovative agentic coding harness — in your terminal, in your browser, everywhere.**

**Lokma** is an **open-source agentic coding harness** that turns any LLM into a capable coding agent. Multi-provider, themeable, and built for real workflows — from a single `lokma` command in the terminal to a full browser IDE.

The core idea is simple: **the model reasons, the harness acts.** Lokma handles the loop, the tools, the context, and the UX — so every model you connect (Claude, GPT, DeepSeek, Gemini, or your own local LLM) delivers its best.

**Status: LIVE in production** at [https://lokma.fermag.com.tr](https://lokma.fermag.com.tr) — Fastify server + Vite SPA, real provider streaming, 23 Inspector panes, agent loop with tool/permission/question frames.

## Why Lokma?

- **Smart harness, swappable model** — The harness stays the same, the model changes. Tool formats, edit strategies, and context management are optimized independently of any single provider.
- **Themeable (CLI + Web, same tokens)** — `lokma config set theme omp` for near-black/indigo, `claude` for cream/terracotta, `midnight`, `paper` — one config value, two surfaces.
- **CLI + Web, one harness** — Start in the terminal with `lokma`, continue in the browser. Same session, same loop, same context (`~/.lokma/`).
- **Real integrations** — Git (status/commit/push + agent locks + worktrees), live shell terminals, browser tabs, MCP servers, remote plugin marketplace, cloud export/import.
- **Fast & efficient** — Token/cost ledger per run, 2-tier transcript compaction, session FTS search, code-split web bundle (22 on-demand pane chunks).
- **Open & extensible** — Open core, plugin marketplace, custom slash commands, skills with curator patches, bots with fork/publish/run lifecycle.

## Live deployment

| Piece | Value |
|-------|-------|
| Production URL | `https://lokma.fermag.com.tr` |
| Server | Fastify 5 + WebSocket, PM2 `lokma-server`, port `:3456` |
| Web | Vite 6 + React 19 SPA (preview), PM2 `lokma-web`, port `:3457` |
| Auth | nginx HTTP basic auth on `/`, `/api/`, `/ws/`; `/health` open (no auth) |
| Health | `GET /health` → `200` |

## Quick start

Prerequisites: **Bun ≥ 1.2**, **Node ≥ 22**.

```bash
git clone https://github.com/raksix/lokma && cd lokma
bun install
bun run build:all        # shared → core → ai → server → web
pm2 start ecosystem.config.cjs   # lokma-server :3456 + lokma-web :3457
```

Development (proxied `/api` + `/ws` → `:3456`):

```bash
bun run dev:server   # Fastify with live reload
bun run dev:web      # Vite dev server
```

CLI (after build):

```bash
./bin/lokma --help
./bin/lokma config get | ./bin/lokma config set theme omp
./bin/lokma config set permissions.defaultMode plan
./bin/lokma doctor
./bin/lokma agent list
./bin/lokma web --port 3456
```

## What works (all live, all real — no mocks)

**Agent loop** — streaming chat with thought trace, `<tool>` execution with pending-gate resume, permission cards (Allow/Deny/Always persisted), `AskUserQuestion` cards, per-run token/cost ledger, interrupt/stop, session fork/rewind/merge/rename, 2-tier transcript compaction, FTS search across transcripts.

**23 Inspector panes** — Info, Providers (CRUD + live connection test), Models (enable/disable), Usage (KPIs + stacked chart + CSV/JSONL export), Settings (config/appearance/permissions/MCP), Agents (registry + SOUL/MEMORY editors + budgets + fork/clone), Orchestration (live tree + fan-out + WS `agent_state` fan-out), Vault (graph + FTS5 BM25 search + wikilinks + ingest), Skills (registry + `skill_view` + curator patch + usage telemetry), Archify (typed-IR diagrams + viewer + Before/Delta/After + SVG/HTML/JSON/card/PNG/WebM export), Design Studio (6 artifact types + `DESIGN.md` guard + heuristic critique + HTML/ZIP/JSON/PNG/WebM export), Testing Lab (plan→run→classify→report + Shannon secret scan + junit.xml), Bots (gallery + create/fork/publish + playground run — incl. featured **Lokma CEO** bot), Auth (RBAC admin/member/viewer + projects + invites), Setup (optional-stack flags + init scaffold + 8-check doctor), Plugins (6 bundled + hot enable/disable without restart + URL install + remote GitHub marketplace), Observability (per-agent trace timeline + replay + share links), Cron & Approvals (per-agent schedules + 30s firing daemon + run-now + run history + approval decisions), Memory (CRUD + usage meter + compaction controls), Extras (roadmap tracker), Terminal (live shells, session-scoped), Git (branch/ahead-behind/staged-unstaged + commit/push/GC + lock owner badges), Browser (per-agent tabs + history).

**Plus** — 4 theme palettes with live apply + boot restore, public share links (`/share/:token`, auth-free), cloud export/import (manifest + sha256), responsive mobile shell (exclusive drawers under 768px), keyboard shortcuts + skip link + focus traps + reduced-motion support.

## Surfaces

| Surface | Status | What |
|---------|--------|------|
| **CLI** | Live | `./bin/lokma` — config get/set, doctor, agent list, web launcher |
| **Web** | Live | Browser harness — chat + 23 Inspector panes, real-time WS streaming |
| **Desktop** | Later | Native app (Tauri, Phase 3) — not built yet |

## Repository layout

```
packages/lokma-shared/       Zod schemas + WS protocol (single source of truth)
packages/lokma-core/         Agent loop, sessions, providers, tools, vault, bots, cron, …
packages/lokma-ai/           Multi-provider abstraction + streaming adapters
packages/lokma-web/server/   Fastify API (28 route files) + WS multiplex
packages/lokma-web/web/      Vite 6 + React 19 + Tailwind v4 + shadcn/ui SPA
bin/lokma                    CLI entry (wraps lokma-core dist)
themes/                      Shared theme palettes (CLI + Web tokens)
Docs/                        Architecture + research (single source of truth)
concept/                     FROZEN design reference (mock, do not edit)
```

## Documentation

All research and architecture lives in [`Docs/`](Docs/):

- [`Docs/20-WEB-HARNESS-overview.md`](Docs/20-WEB-HARNESS-overview.md) — Web harness overview (why, principles, parity, architecture)
- [`Docs/21-WEB-STACK-alternatives.md`](Docs/21-WEB-STACK-alternatives.md) — Stack decision matrix (Vite 6 picked)
- [`Docs/22-WEB-FEATURES-provider-model-session.md`](Docs/22-WEB-FEATURES-provider-model-session.md) — Providers, models, sessions, token usage (API + UI + schema)
- [`Docs/23-PLUGIN-SYSTEM-deepseek-cordis.md`](Docs/23-PLUGIN-SYSTEM-deepseek-cordis.md) — Plugin system (everything-is-a-plugin, Cordis-inspired)
- [`Docs/24-WEB-PANE-SYSTEM-and-orchestration.md`](Docs/24-WEB-PANE-SYSTEM-and-orchestration.md) — Pane system (Inspector tabs, tiling, orchestration)
- [`Docs/25-WEB-ROADMAP.md`](Docs/25-WEB-ROADMAP.md) — Roadmap: Phases 0 → 3 (all complete)
- [`Docs/26-CONFIG-and-CREDENTIALS.md`](Docs/26-CONFIG-and-CREDENTIALS.md) — Layered config + encrypted credentials
- [`Docs/27-SKILLS-auto-discovery-hermes-inspired.md`](Docs/27-SKILLS-auto-discovery-hermes-inspired.md) — Auto skill discovery + curator
- [`Docs/28-MEMORY-infinite-vault-graph.md`](Docs/28-MEMORY-infinite-vault-graph.md) — Infinite memory + vault + graph
- [`Docs/29-OBSIDIAN-MCP-vault-and-graph.md`](Docs/29-OBSIDIAN-MCP-vault-and-graph.md) — File vault decision (VaultPort wins)
- [`Docs/30-AGENT-SYSTEM-personality-memory-orchestration-collision.md`](Docs/30-AGENT-SYSTEM-personality-memory-orchestration-collision.md) — Agent system (personality, memory, caps, collision-free editing)
- [`Docs/31-ARCHIFY-diagrams-and-viewer.md`](Docs/31-ARCHIFY-diagrams-and-viewer.md) — Archify diagrams & viewer
- [`Docs/32-SETUP-optional-stack-and-connections.md`](Docs/32-SETUP-optional-stack-and-connections.md) — Optional setup stack & connections
- [`Docs/33-TESTING-autonomous-harness-testsprite-inspired.md`](Docs/33-TESTING-autonomous-harness-testsprite-inspired.md) — Autonomous testing harness
- [`Docs/34-DESIGN-open-design-inspired.md`](Docs/34-DESIGN-open-design-inspired.md) — Design canvas & brand contract
- [`Docs/35-BOTS-lokma-bots.md`](Docs/35-BOTS-lokma-bots.md) — Lokma Bots (lifecycle, gallery, marketplace)
- [`Docs/36-AUTH-and-PERMISSIONS.md`](Docs/36-AUTH-and-PERMISSIONS.md) — Auth & permissions (RBAC, project-scoped)
- [`Docs/37-BOT-lokma-ceo.md`](Docs/37-BOT-lokma-ceo.md) — Bot: Lokma CEO (strategic CEO persona)
- [`Docs/38-TASK-concept-to-harness-migration.md`](Docs/38-TASK-concept-to-harness-migration.md) — Concept → harness migration plan + execution log (all waves done)
- [`Docs/39-TEST-LOOP-log.md`](Docs/39-TEST-LOOP-log.md) — Continuous test-loop run log

Earlier research (context):

- [`Docs/10-ARASTIRMA-claude-code-birebir-analiz.md`](Docs/10-ARASTIRMA-claude-code-birebir-analiz.md) — Claude Code feature inventory
- [`Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md`](Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md) — OMP theme & design language
- [`Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md`](Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md) — Harness architecture (CLI + Web)
- [`Docs/raw/`](Docs/raw/) — Raw research data

## Known follow-ups (need a human/box decision, not code)

- Cloud sandbox / Postgres / S3 backing for cloud transfer (infra choice)
- Real-device / assistive-technology testing (hardware + manual pass)
- Share-token rotation / expiry policy (product decision)

## Philosophy

> *The model reasons, the harness acts. A great harness makes even a weak model useful — a bad harness wastes the best model.*

Lokma is built around this idea: **best harness × best model = best outcome.**

## License

Dual-licensed — open core + private cloud (see [`LICENSE`](LICENSE)): `core` (harness, packages, CLI) is MIT; the hosted cloud service, its infra, and private deployment configs are proprietary.
