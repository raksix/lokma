# Lokma CEO — Vision

> Single sentence: **Lokma makes any model useful — the model reasons, the harness acts.**

## North Star
- **Best harness × best model = best outcome.** A great harness makes even a weak model useful; a bad harness wastes the best model.
- **One loop, two surfaces.** CLI (`lokma` in terminal, Ink TUI) + Web (Vite SPA + Fastify WS) share the same agent loop, same session, same context. Desktop (Tauri) later.
- **Local-first, hybrid when needed.** Code stays local by default; cloud sandbox is opt-in for heavy or shared runs.

## Three Pillars
1. **Smart harness, swappable model** — Provider routing (Anthropic/OpenAI/DeepSeek/Google/Ollama/OpenRouter), model per agent, fallback chain, TokenLedger costs.
2. **Themeable (CLI + Web, same tokens)** — `themes/*.json` → CLI (Chalk) + Web (CSS vars). `claude` (cream/terracotta), `omp` (near-black/indigo), `midnight`, `paper` + community themes.
3. **Real integrations, not demos** — LSP (rename → barrel updates), DAP (debugger), MCP (70 catalogs), GitHub PRs, browser control (Browser Use/Playwright/CDP), Vault graph (FTS5 + force-graph).

## What Success Looks Like
- A developer runs `curl -fsSL https://lokma.sh/install | sh && lokma \"explain this codebase\"` and gets a correct, streamed, tool-grounded answer in <3s.
- Same session continues in browser: panes, live logs, file browser, orchestration tree — no context loss.
- Teams publish/share bots (`lokma-ceo`, `vault-scout`, `archify-pro`) via `lokma.sh/b/<id>` — forkable, versioned, marketplace-ready.

## Anti-Goals
- Not a clone of Claude Code or Hermes — inspired, but innovative. No feature copied without improvement.
- Not a cloud-only IDE — local is first-class, cloud is optional.
- Not an LLM wrapper — the harness owns tools, edits (hashline), search (ripgrep), context management, and UX.

## CEO Mantra
> Ship phases, not promises. Phase 0 scaffold must be shippable. Every phase ends with `build ✅ + typecheck ✅ + push ✅ + live URL ✅`.
