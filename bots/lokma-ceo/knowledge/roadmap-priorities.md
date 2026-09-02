# Lokma CEO — Roadmap Priorities

Source of truth: `Docs/03-YOL-HARITASI.md` (32KB) + `Docs/25-WEB-ROADMAP.md` (14KB). This is the CEO's distilled priority stack.

## Phase 0 — Scaffold (Current, Sep 2026)
**Goal:** Shippable foundation that proves the loop.
- [x] Docs 00-36 ultra-detailed (30-35 + agents/skills/memory/vault/archify/setup/testing/design/bots/auth)
- [x] Stack locked: **Vite 6 + React 19 + Tailwind v4 + shadcn/ui + Fastify 5 + flexlayout-react** — concept proves 24 panes, build 1860 modules, 441k JS
- [ ] `packages/*` monorepo scaffold: `lokma-shared` (Zod schemas) → `lokma-core` (loop) → `lokma-ai` (provider routing) → `lokma-server` (Fastify + WS) → `lokma-web` (Vite SPA)
- [ ] `lokma` CLI thin wrapper (`bin/lokma` → core/dist) + `lokma doctor` + `lokma theme set <name>`
- [x] Domain `lokma.fermag.com.tr` (67, nginx) — `lokma.sh` reserved
- Done criteria: `bun run build:all ✅`, `lokma --help` streams, concept deploy live, `Docs/00-*` updated.

## Phase 1 — Core Loop + Chat (Next)
- Provider/model/session/usage (Docs 22) — `GET /api/models`, `POST /api/chat` streaming, TokenLedger, Usage pane stacked AreaChart
- Skills auto-discovery (Docs 27) — `<available_skills>` + `skill_view` + curator
- Memory vault (Docs 28) — FTS5 `session_search` + `vault/lokma/**` + graph
- Agents MVP + self-spawn 1.5 + archify/design/testing/bots stubs (Docs 30-35)

## Phase 1.5 — Agents Self-Spawn
- `create_agent` tool gated by `agent-spawner` skill, caps `maxAgents 20 / maxConcurrent 5`, queue + priority, audit `createdBy: ai:<parent>`
- Web Agent Hub: caps HUD + SOUL/MEMORY + queue + DnD session→agent

## Phase 2 — Parallel + Safe + Deep
- MCP + hooks + plugins (Cordis kernel, Docs 23) + git worktrees + terminal + browser per agent
- Memory deep + vault graph 2D/3D + agents parallel+safe+communication+orchestration (lease→sha→worktree) + Bus + Coordinator + heartbeat 30s
- Archify deep (typed JSON IR → HTML/SVG, 5 types) + Design deep (DESIGN.md + 6 artifacts) + Testing deep (TestSprite 6-stage + video/trace/Shannon) + Bots deep (Gallery + playground + publish/fork)

## Phase 3 — Polish + Extras
- Themes + sharing + cloud + 23 extras ranked: marketplace, cron per agent, approvals, observability, handoff, browser per agent, adversarial review, eval harness, time-travel, voice, etc.
- Desktop Tauri, mobile, perf, a11y

## CEO Rules for Sequencing
1. **No Phase 2 before Phase 1 streams correctly.** Streaming is the demo — everything else is leverage.
2. **One shippable per turn.** Each commit must be verifiable (`build ✅ + curl live 200`).
3. **Docs first, code second.** If it's not in Docs/, it didn't happen. `00-KONTEKST.md` grows every prompt.
4. **Caps are product.** Never silently raise `maxAgents`/`maxConcurrent` — propose with cost impact.
5. **Theme parity is non-negotiable.** Every UI change ships CLI + Web tokens together (`themes/*.json`).
