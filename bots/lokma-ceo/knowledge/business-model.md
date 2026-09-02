# Lokma CEO — Business Model

## Positioning
**Innovative agentic coding harness — in your terminal, in your browser, everywhere.**

Not a model, not a wrapper — the harness that makes any model useful. Audience: solo devs → teams → enterprises that want provider choice + local control.

## Packaging
| Tier | What's Included | Price Signal | Where |
|------|-----------------|--------------|-------|
| **Open Core (MIT)** | `lokma-core` (loop) + `lokma-ai` (routing) + `lokma-tui` (Ink) + themes + skills + docs + `lokma bot/agent` local | Free, GitHub `raksix/lokma` | `lokma.sh/install` |
| **Cloud Private** | Hosted Web harness (lokma.fermag.com.tr) — hybrid sandbox, real-time streaming, shared vault, team bots, usage billing | Metered (TokenLedger → USD), plan-gated 50-bot cap like Grok | 67 infra, `lokma web` |
| **Enterprise** | SSO (RBAC admin/member/viewer, Docs 36), private marketplace, on-prem vault, audit logs, `coordinator` pinned | Custom | Later |

## Revenue Levers
1. **Compute margin** — Cloud sandbox runs (Web harness) + provider passthrough (OmniRoute-style smart routing keeps costs low).
2. **Bot marketplace** — `lokma.sh/b/<id>` + future `agentskills.io`-style hub: featured bots, one-click fork — take rate on premium bots/skills.
3. **Team seats** — Per-seat for Webb harness + vault + graph + Archify/Design/Testing panes (collaboration value).
4. **Support** — Enterprise on-prem + custom harness integrations (LSP/DAP/MCP deep).

## Cost Discipline (CEO-Owned)
- **TokenLedger per agent per session** — input/output/cached/costUsd, stacked AreaChart in Usage pane, CSV/JSONL export.
- **Budgets:** global `budgets.usd/tokens` + per-agent `budgets.maxUsd/maxTokens/maxTurns` — hard stop `error_max_budget`, soft alert at 80%.
- **Model routing:** `model` pinned per agent, `fallback[]` on 429/5xx, `delegationModel` (haiku) for spawn decisions — saves opus tokens on fan-out.
- **Example:** Lokma CEO itself: `maxTokens 120k, maxUsd $5, maxTurns 50` — enough for a roadmap slice, not enough to bankrupt a runaway loop.

## Moat (Why Lokma Wins)
- **Harness quality > model quality** — Hashline edits (−61% tokens), ripgrep instant search, in-process tooling, benchmaxxed per tool — wins even on weak models.
- **Themeable + portable** — One `themes/*.json`, two surfaces; `SOUL.md` + `bot.json` exportable — user owns their harness.
- **Collision-free parallelism** — The only harness with 3-layer safety (lease→sha→worktree) + Bus + Coordinator + heartbeat — teams can actually run 5 agents on one repo without merge hell.
- **Vault as memory** — FTS5 + graph is not a feature, it's the product: every session becomes searchable, linkable, reusable knowledge.

## What CEO Says No To (This Quarter)
- No mobile app before Web streams flawlessly.
- No CRDT/OT realtime file co-editing before worktree isolation ships (defer to pane-collaboration later).
- No new provider before Anthropic + OpenAI + DeepSeek + Ollama are green.
- No marketplace monetization before `bot.json` sharing is frictionless (export zip → import → fork).

## Metric That Matters (Phase 1)
**Time-to-first-streaming-tool-call** — from `lokma \"explain this codebase\"` to first `read_file` streamed token. Target <3s local, <5s cloud. Everything else is secondary until this is green.
