# Lokma Web Harness — Overview

> **Status:** Design & Documentation Phase · 2026-08-31
> **Language:** English (project docs & code are now English-first)
> **Related:** `10-ARASTIRMA-claude-code-birebir-analiz.md` · `11-ARASTIRMA-omp-temalar-ve-tasarim.md` · `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md`

## 1. What Is the Web Harness?

The **Lokma Web Harness** is the browser surface of the same agentic loop that powers the CLI. One harness, two surfaces — same `query()` generator, same tools, same sessions.

```
CLI (Ink TUI) ─┐
               ├─► lokma-core (agent loop, tools, permissions, sessions)
Web (React) ───┘         ▲
                         │ provider layer (lokma-ai)
                    Anthropic / OpenAI / DeepSeek / Gemini / Ollama / OpenRouter
```

- **CLI-first, Web-native.** Start in the terminal, continue in the browser, or vice versa. Sessions are portable.
- **Not a thin wrapper.** The web has full parity with Claude Code: every tool, every slash command, every permission mode, every hook — rendered for the browser.
- **Hybrid execution.** Local (your machine, your files) or Cloud (isolated sandbox) — user chooses per session.

## 2. Design Principles

| Principle | Meaning |
|-----------|---------|
| **Single loop** | CLI and Web share `packages/lokma-core`. No duplicate logic. |
| **Everything is a Plugin** | Inspired by DeepSeek Harness / Cordis. Tools, providers, panes, themes — all plugins. See `23-PLUGIN-SYSTEM-deepseek-cordis.md`. |
| **Theme-aware** | OMP-style themes (`themes/*.json`) → same tokens in Ink (Chalk) and Web (CSS vars). `lokma theme set omp` works everywhere. |
| **Pane-first UX** | Advanced, draggable, resizable pane system — not a single chat column. See `24-WEB-PANE-SYSTEM-and-orchestration.md`. |
| **Real-time by default** | Token streaming (SSE/WS), tool streaming (partial JSON), live terminal logs — no polling. |
| **Local-first, cloud-optional** | No vendor lock-in. Self-hostable. Files stay local unless you opt into cloud. |

## 3. Feature Parity with Claude Code (Web Must Have)

Every capability in `10-*` must be reachable from the web:

| Claude Code feature | Web equivalent |
|---------------------|---------------|
| `claude` / `claude -p` / `/clear` / `/model` | Chat input, slash command palette (`/`), model switcher |
| 40+ tools (Read, Edit, Bash, Grep, LSP…) | Tool renderers (diff viewer, terminal, file preview) — `22-*` |
| Permission modes (auto/manual/plan/bypass) | Permission banner + `Shift+Tab` equivalent in web |
| CLAUDE.md + auto memory | Project settings panel + memory viewer |
| Hooks / Skills / Plugins | Plugin manager UI — `23-*` |
| MCP (4 transports) | MCP manager (add/test/enable) — `22-*` |
| Git (`@lokma`, PR, commit) | Git panel + diff review — `24-*` |
| Sessions (resume/fork/worktree) | Session sidebar + command palette — `22-*` |
| Agent teams / subagents | Orchestration view, Agent Hub — `24-*` |
| Token usage & cost | Usage dashboard (per session/model/day) — `22-*` |
| Provider & model catalog | Provider & model settings — `22-*` |

No web-only shortcuts, no "lite" mode. Full harness or nothing.

## 4. High-Level Architecture

```
Browser (Vite 6 + React 19)
  ├─ App Shell (pane layout, sidebars, command palette)
  ├─ Chat (streaming messages, tool renderers, slash menu)
  ├─ File Browser (project tree, open/preview, drag-drop)
  ├─ Terminal (xterm.js, live PTY from harness)
  ├─ Browser Preview (embedded browser, harness can drive it)
  └─ Panels (sessions, projects, git, logs, usage)
        ↕ WebSocket + SSE (see 12-* §3.3)
Fastify API + WS Server (packages/lokma-web/server)
  ├─ /api/sessions  /api/providers  /api/models  /api/usage
  ├─ /ws/:sessionId  (agent events ↔ client)
  └─ /api/files  /api/terminal  /api/browser  /api/mcp
        ↕
lokma-core (same as CLI)
  ├─ Agent loop (async generator, compaction, permission)
  ├─ Tool registry (40+ tools + MCP dynamic)
  ├─ Session store (JSONL + checkpoints)
  └─ Hook / skill / plugin runners
```

Execution modes:

- **Local mode (Phase 1):** `lokma web --port 3456` on your machine, browser connects to `localhost`. Files are local, no sandbox.
- **Cloud mode (Phase 2):** `lokma-web` on `lokma.fermag.com.tr`, each session in a Docker/Firecracker microVM. Files are in the sandbox, synced via volume or git.

## 5. Repo Structure (Web-Relevant)

```
lokma/
├── packages/
│   ├── lokma-core      # shared: loop, tools, sessions, plugins
│   ├── lokma-ai        # shared: providers, streaming, catalog
│   ├── lokma-shared    # shared: zod schemas, types, WS protocol
│   ├── lokma-cli       # CLI surface (Ink)
│   └── lokma-web/      # ← web surface
│       ├── server/     # Fastify + WS
│       │   ├── routes/ (sessions, providers, models, usage, files, mcp)
│       │   └── ws.ts
│       └── web/        # Vite 6 SPA (React 19 + Tailwind + shadcn)
│           ├── app/    # (chat) / sessions / settings / plugins
│           └── components/ (Chat, FileTree, Terminal, PaneLayout, ...)
├── themes/             # claude.json, omp.json, midnight.json, paper.json
└── Docs/               # this folder
```

## 6. How This Doc Set Fits Together

| Doc | What it answers |
|-----|-----------------|
| **20 — Overview** (this) | What is the web harness and why |
| **21 — Stack Alternatives** | Which frontend/backend/pane/state/realtime stack to pick — **you decide** |
| **22 — Provider / Model / Session / Usage** | Detailed spec for the four core web features |
| **23 — Plugin System** | DeepSeek Cordis-style everything-is-a-plugin design |
| **24 — Pane System & Orchestration** | Draggable panes, sidebars, live logs, browser, orchestration |
| **25 — Roadmap** | Phased plan from doc → scaffold → MVP → cloud |

Start with **21** if you want to make a decision. Start with **22** if you want to see the feature specs.

## 7. Open Questions (Resolved in 21)

- Frontend: Vite vs Next.js vs SvelteKit vs Remix? (picked Vite 6 — was Next.js 15, switched 2026-09-01)
- Backend: Fastify vs Hono vs NestJS?
- Pane: mosaic vs dock vs flexlayout vs custom?
- Realtime: WebSocket vs SSE vs tRPC?
- State: Zustand vs Jotai vs Redux?

All answered with a decision matrix in `21-WEB-STACK-alternatives.md` — read it and pick.

---

*Next: `21-WEB-STACK-alternatives.md` — stack decision matrix.*
