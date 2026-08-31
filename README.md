# Lokma

> **Innovative agentic coding harness — in your terminal, in your browser, everywhere.**

**Lokma** is an **open-source agentic coding harness** that turns any LLM into a capable coding agent. Multi-provider, themeable, and built for real workflows — from a single `lokma` command in the terminal to a full browser IDE.

The core idea is simple: **the model reasons, the harness acts.** Lokma handles the loop, the tools, the context, and the UX — so every model you connect (Claude, GPT, DeepSeek, Gemini, or your own local LLM) delivers its best.

## ✨ Why Lokma?

- **🧠 Smart harness, swappable model** — The harness stays the same, the model changes. Tool formats, edit strategies, and context management are optimized independently of any single provider.
- **🎨 Themeable (CLI + Web, same tokens)** — `lokma theme set omp` for near-black/ indigo, `lokma theme set claude` for cream/terracotta, `midnight`, `paper` — and community themes. One `themes/*.json`, two surfaces.
- **🌐 CLI + Web, one harness** — Start in the terminal with `lokma`, continue in the browser. Same session, same loop, same context. Code stays local or runs in a cloud sandbox — you choose.
- **🔌 Real integrations** — LSP (knows what your IDE knows, e.g. rename → barrel updates), DAP (debugger), MCP (Notion/Jira/Postgres), GitHub PRs, browser control.
- **⚡ Fast & efficient** — Hashline edits (−61% tokens on edits), ripgrep instant search, in-process tooling, benchmaxxed on every tool.
- **🔓 Open & extensible** — MIT, plugin marketplace, custom slash commands, hooks, skills. Package your workflow, share it.

## Surfaces

| Surface | Status | What |
|---------|--------|------|
| **CLI** | 🔨 In progress | Terminal harness — the heart of the agent loop, Ink TUI |
| **Web** | 🔨 In progress | Browser harness — hybrid (local + cloud), real-time streaming, IDE-grade panes |
| **Desktop** | 📋 Later | Native app (visual diff, multi-session, drag-drop) |

## Documentation

All research and architecture lives in [`Docs/`](Docs/):

- [`Docs/20-WEB-HARNESS-overview.md`](Docs/20-WEB-HARNESS-overview.md) — Web harness overview (why, principles, parity, architecture)
- [`Docs/21-WEB-STACK-alternatives.md`](Docs/21-WEB-STACK-alternatives.md) — Stack decision matrix (pick A/B/C/D)
- [`Docs/22-WEB-FEATURES-provider-model-session.md`](Docs/22-WEB-FEATURES-provider-model-session.md) — Providers, models, sessions, token usage (API + UI + schema)
- [`Docs/23-PLUGIN-SYSTEM-deepseek-cordis.md`](Docs/23-PLUGIN-SYSTEM-deepseek-cordis.md) — Plugin system (everything-is-a-plugin, Cordis-inspired)
- [`Docs/24-WEB-PANE-SYSTEM-and-orchestration.md`](Docs/24-WEB-PANE-SYSTEM-and-orchestration.md) — Pane system (draggable sidebars, file browser, live terminal, browser preview, orchestration)
- [`Docs/25-WEB-ROADMAP.md`](Docs/25-WEB-ROADMAP.md) — Roadmap: Phases 0 → 3

Earlier research (context):

- [`Docs/10-ARASTIRMA-claude-code-birebir-analiz.md`](Docs/10-ARASTIRMA-claude-code-birebir-analiz.md) — Claude Code feature inventory (used as reference during research)
- [`Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md`](Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md) — OMP theme & design language (reference)
- [`Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md`](Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md) — Harness architecture (CLI + Web)
- [`Docs/raw/`](Docs/raw/) — Raw research data

## Quick Start (soon)

```bash
curl -fsSL https://lokma.sh/install | sh
lokma "explain this codebase"
lokma theme set omp
```

## Philosophy

> *The model reasons, the harness acts. A great harness makes even a weak model useful — a bad harness wastes the best model.*

Lokma is built around this idea: **best harness × best model = best outcome.**

## License

MIT — open-source, community-driven.
