# REQ-133 — Thinking budget from the composer

**Status:** done · 2026-09-11
**Reported (verbatim):** "abi bu inputtan bi şekilde thinking ayarı yapabilmeliyiz"
**Screenshot:** `upload_20260911_224653_7.png` — the composer had no reasoning control at all.

## Problem

The composer could pick a **model** (`Ctrl+M`) but nothing about *how hard* the
model should think. Reasoning levels existed nowhere in the stack: `grep` for
`reasoning_effort` / `thinking` across `lokma-ai`, `lokma-core` and the web app
returned zero hits, so every turn went upstream with the provider's own
default — neither "answer fast" nor "think deeper" was reachable from the UI.

## What was built

One control, wired end to end, with no per-provider UI branching:

```
composer picker (Off | Low | Medium | High)
  → ws prompt frame  { reasoningEffort }
  → QueuedPrompt → runAgentLoop → aiStream
  → adapter translation:
      OpenAI-compatible  reasoning_effort: 'low' | 'medium' | 'high'
      Responses API      reasoning: { effort }
      Anthropic          thinking: { type: 'enabled', budget_tokens }
```

- **`Off` (default) sends no reasoning field at all** — the pre-REQ-133 request
  shape is byte-identical, so nothing regresses for users who never touch it.
- Anthropic budgets: `low 1024`, `medium 4096`, `high 6144` (all below the
  adapter's `max_tokens: 8192`; 1024 is Anthropic's documented floor).
- The pick is **persisted** (`localStorage: lokma-composer-thinking`) and starter
  cards honour the same stored preference.
- The picker sits with the input tools (attach / dictate) and turns terracotta
  when a level is active, so an "on" state is visible without opening the menu.

## Capability probe (why a level can never break a turn)

Gateways that do not know the field answer `400`. Both adapters therefore run
the same probe the tool path already uses (`REQ-128`):

1. send the turn with the reasoning field;
2. if the upstream rejects it with capability wording, **retry once without it**
   and remember the `base|model` pair for the process lifetime;
3. later turns skip the field immediately — one 400 per pair, not one per turn.

Wording is matched narrowly (`reason`/`thinking`/`effort` **and** a capability
phrase) so a genuine bad request is never swallowed as a probe.

## Evidence

| Check | Result |
|---|---|
| `bun src/provider/adapters.test.ts` (lokma-ai) | **138/138 PASS** — includes body shape on both adapters, the `off` no-op, and both retry probes |
| `bun src/lib/ws.test.ts` (web) | PASS — the level rides the wire; `off`/unset stays off; an unknown level fails the schema |
| `bun src/components/chat/composer.test.ts` | PASS — stored level honoured, stale value and blocked storage both degrade to `off` |
| `bun x tsc --noEmit` (web) + `build:shared/ai/core/server` | clean |
| `scripts/probe-live-thinking.cjs` (live server, real WS) | **8/8 PASS** — `high` turn answers, `off` turn still answers, a thinking turn still calls tools |
| UI probe (Playwright, live app) | **8/8 PASS** — control present, menu lists Off/Low/Medium/High, pick persists, survives reload |

Screenshots: `/tmp/lokma-think-menu.png`, `/tmp/lokma-think-picked.png`
(vision-confirmed: "Off, Low, Medium, High" menu; chip reads "Thinking High").

### Which models actually respond

Direct upstream measurement (`reasoning_effort` on vs off, `reasoning_content`
characters, same prompt):

| Model | off | high | note |
|---|---|---|---|
| `google/gemini-3.8-flash` | 0 | **546** | the field switches reasoning ON (2.4s → 3.8s) |
| `meta/muse-spark-1.3` | 0 | **71** | the field switches reasoning ON (4.4s → 9.7s) |
| `xiaomi/mimo-v2.5` | 693 | 49 | reasons anyway; high **lowers** it |
| `MiniMaxAI/MiniMax-M2.5` | 741 | 244 | reasons anyway; high lowers it |
| `moonshotai/Kimi-K2.6` | 189 | 115 | reasons anyway; high lowers it |
| `Qwen/Qwen3.8-Max` | 114 | 78 | reasons anyway; high lowers it |
| `zai-org/GLM-5.3` | 60 | 9 | reasons anyway; high lowers it |
| `deepseek-v4-pro` | 67 | 60 | field ignored |
| `deepseek-v4.1-flash` | 54 | 59 | field ignored |
| `xai/grok-4.6` | 54 | 50 | field ignored |

Read this carefully before calling a model broken: only the first group reacts
in the expected direction. The middle group reasons on every turn regardless,
so a level there trims rather than adds. Every tested model **accepted** the
field (no 400s), so the probe stays a safety net rather than the normal path.

## Known limits (not bugs in this change)

- `deepseek-v4.1-flash` (the live default) returns `reasoning_content` on a
  non-streamed call but streamed **no** `thinking_delta` frames during the live
  probe. Whether reasoning is streamed is upstream behaviour; if we want the
  live thinking block to fill on that model we would need to inspect how the
  adapter reads streamed reasoning for that vendor — separate task.
- The picker is per-user (localStorage), not per-session or per-bot, so every
  prompt in every session carries the same level until it is changed.

## Files

- `packages/lokma-shared/src/protocol/ws.ts` — `REASONING_EFFORTS`, `ReasoningEffort`, prompt field
- `packages/lokma-ai/src/provider/reasoning.ts` — level map, rejection memory, probe wording
- `packages/lokma-ai/src/provider/openai.ts` · `anthropic.ts` — body translation + probe
- `packages/lokma-ai/src/stream.ts` · `provider/types.ts` — `reasoningEffort` passthrough
- `packages/lokma-web/server/src/session-runs.ts` · `routes/ws.ts` · `agent-loop.ts` — queue → loop → adapter
- `packages/lokma-web/web/src/components/chat/composer.tsx` — the picker (`readThinking` is exported for starters)
- `packages/lokma-web/web/src/lib/ws.ts` · `hooks/use-ws.ts` · `components/chat/index.tsx` — wire plumbing
- `scripts/probe-live-thinking.cjs` — live end-to-end probe
