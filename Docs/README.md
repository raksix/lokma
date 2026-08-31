# Docs — Lokma Documentation

> **Single source of truth.** Hermes reads here before every task. English from 2026-08-31 01:45 (chat stays Turkish).

## File Index

| File | What | Status |
|------|------|--------|
| `00-LOKMA-KONTEKST.md` | **MAIN FILE** — read & update every prompt | ✅ |
| `01-PROJE-TANIMI.md` | What Lokma is (innovative harness) | ✅ |
| `02-TEKNIK-KARARLAR.md` | Stack **A picked** + arch (shadcn/domain/Tauri/dual) | ✅ Decided 2026-08-31 |
| `03-YOL-HARITASI.md` | Roadmap — ultra-detailed Phases 0–3 (agents + testing + design + bots + setup) | ✅ EN (03-25 synced, 30-35) |
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | Claude Code full inventory (18KB) | ✅ |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | OMP themes & design language (7.6KB) | ✅ |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | CLI+Web harness architecture (17KB) | ✅ |
| `13-ARASTIRMA-ozet-ve-sonraki-adimlar.md` | Synthesis + Phase 0 plan (3.3KB) | ✅ |
| `20-WEB-HARNESS-overview.md` | **Web harness overview** — why/principles/parity/arch | ✅ EN 6.4KB |
| `21-WEB-STACK-alternatives.md` | **Stack decision matrix** — frontend/backend/pane/state/realtime | ✅ EN 9.8KB — **PICK A/B/C/D** |
| `22-WEB-FEATURES-provider-model-session.md` | **Provider/model/session/usage** + parity checklist | ✅ EN 13KB |
| `23-PLUGIN-SYSTEM-deepseek-cordis.md` | **Plugin system** — DeepSeek Cordis + Lokma kernel | ✅ EN 9.4KB |
| `24-WEB-PANE-SYSTEM-and-orchestration.md` | **Pane system** — sidebars, browser, live logs, orchestration | ✅ EN 12KB |
| `25-WEB-ROADMAP.md` | **Web roadmap — ultra-detailed** — Phases 0→3 (agents + setup + testing + design + bots) | ✅ EN 18KB (30-35) |
| `26-CONFIG-and-CREDENTIALS.md` | **Config & credentials** — layered config + encrypted credentials.json | ✅ EN 8KB |
| `27-SKILLS-auto-discovery-hermes-inspired.md` | **Auto skill discovery** — Hermes <available_skills> + skill_view + curator | ✅ EN 11KB (raw 1044 lines) |
| `28-MEMORY-infinite-vault-graph.md` | **Infinite memory + vault + graph** — FTS5 + VaultPort + react-force-graph-2d | ✅ EN 12KB (raw 1390 lines) |
| `29-OBSIDIAN-MCP-vault-and-graph.md` | **Obsidian MCP vs file vault** — 2112 MCPs scanned, VaultPort wins | ✅ EN 7.5KB (raw 879 lines) |
| `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` | **Agent system — ULTRA-DETAILED** — personality, per-agent memory, per-agent model, caps+queue, self-spawn, orchestration, bus+coordinator+heartbeat, 3-layer collision-free, 23 extras | ✅ EN 40KB (raw 2699 lines) |
| `31-ARCHIFY-diagrams-and-viewer.md` | **Archify — diagrams & viewer** — typed JSON IR → HTML/SVG, 5 types, 4 presets, viewer contract | ✅ EN 10KB (raw 970 lines) |
| `32-SETUP-optional-stack-and-connections.md` | **Setup — optional stack & connections** — `lokma init/setup` TUI: browser + web search + gateway + MCP + vault | ✅ EN 12KB (raw 1,190+1,349+964) |
| `33-TESTING-autonomous-harness-testsprite-inspired.md` | **Testing — autonomous harness** — TestSprite-inspired self-hosted: video+trace, expect/actual, API, Shannon/security | ✅ EN 13KB (raw 655+1,136) |
| `34-DESIGN-open-design-inspired.md` | **Design — Open Design-inspired canvas** — 6 artifacts, DESIGN.md, design-systems, Design Studio, export | ✅ EN 13KB (raw 1,325+831) |
| `35-BOTS-lokma-bots.md` | **Lokma Bots — Grok-bots-inspired** — bot.json, persona→bot→agent, Gallery, lifecycle, sharing | ✅ EN 12KB (raw 1,121) |
| `36-AUTH-and-PERMISSIONS.md` | **Auth & permissions — RBAC + project-scoped** — admin/member/viewer, project visibility/creation policy, session inheritance, JWT, `can()` | ✅ EN 19KB |
| `raw/10-claude-code-ham-arastirma.md` | Raw: Claude Code 957 lines, 53KB | ✅ |
| `raw/11-omp-ham-arastirma.md` | Raw: OMP 360 lines, 30KB | ✅ |
| `raw/12-harness-ham-arastirma.md` | Raw: Harness 753 lines, 41KB | ✅ |
| `raw/21-web-stack-ham-arastirma.md` | Raw: Web stack 712 lines, 60KB | ✅ |
| `raw/22-web-features-ham-arastirma.md` | Raw: Web features 1068 lines, 61KB | ✅ |
| `raw/23-dsh-plugin-ham-arastirma.md` | Raw: DSH Cordis plugin 1146 lines, 74KB | ✅ |
| `raw/27-hermes-skills-ham-arastirma.md` | Raw: Hermes skills 1044 lines, 64KB | ✅ |
| `raw/28-hermes-memory-ham-arastirma.md` | Raw: Hermes memory 1390 lines, 59KB | ✅ |
| `raw/29-obsidian-mcp-ham-arastirma.md` | Raw: Obsidian MCP 879 lines, 50KB | ✅ |
| `raw/30-agent-orchestration-ham-arastirma.md` | Raw: Agent orchestration 603 lines, 68KB | ✅ |
| `raw/31-agent-personality-ham-arastirma.md` | Raw: Agent personality & memory 826 lines, 59KB | ✅ |
| `raw/32-agent-conflict-ham-arastirma.md` | Raw: Agent conflict-free editing 857 lines, 64KB | ✅ |
| `raw/33-agent-extras-ham-arastirma.md` | Raw: Agent extras 20+ ideas 413 lines, 50KB | ✅ |
| `raw/34-hermes-setup-ham-arastirma.md` | Raw: Hermes setup 1,190 lines, 78KB | ✅ |
| `raw/35-hermes-browser-search-ham-arastirma.md` | Raw: Hermes browser+search 1,349 lines, 104KB | ✅ |
| `raw/36-hermes-connections-ham-arastirma.md` | Raw: Hermes gateway/MCP 964 lines, 74KB | ✅ |
| `raw/37-archify-ham-arastirma.md` | Raw: Archify 970 lines, 108KB | ✅ |
| `raw/38-opendesign-ham-arastirma.md` | Raw: Open Design 1,325 lines, 111KB | ✅ |
| `raw/39-opendesign-designsystem-ham-arastirma.md` | Raw: Open Design design systems 831 lines, 106KB | ✅ |
| `raw/40-testsprite-ham-arastirma.md` | Raw: TestSprite 655 lines, 96KB | ✅ |
| `raw/41-lokma-test-ui-security-ham-arastirma.md` | Raw: Test UI+security 1,136 lines, 76KB | ✅ |
| `raw/42-grok-bots-ham-arastirma.md` | Raw: Grok Bots 1,121 lines, 114KB | ✅ |
| `99-NOTLAR.md` | Scratch notes | ✅ |

**Total:** 26 synthesized docs (~210KB) + 22 raw (~1.5 MB / 12,240 lines) + 3 system docs = **~51 files**

## Workflow

1. Furkan says something → Hermes reads `00-LOKMA-KONTEKST.md` first
2. Hermes does work → writes/updates the relevant `Docs/` file(s) (English)
3. Updates `00-LOKMA-KONTEKST.md` (chronology + last status)
4. Commit + push (English message) — auto
5. Sync to memory.fermag.com.tr

## Status

- **Created:** 2026-08-31
- **Research:** ✅ Complete (Claude Code + OMP + harness + web harness + Hermes skills/memory/Obsidian MCPs + agent system + Archify + Open Design + TestSprite + Grok Bots)
- **Web harness docs:** ✅ Complete (20-26, English) + auto-skills (27) + infinite memory+vault+graph (28-29) + agent system (30, ultra-detailed) + Archify (31) + setup optional stack (32) + testing harness (33) + design canvas (34) + Lokma Bots (35)
- **Next:** Pick stack (21-*) → Scaffold Phase 0 monorepo (packages/lokma-core+ai+shared+web + themes + agents/archify/design/testing/bots scaffolds)
