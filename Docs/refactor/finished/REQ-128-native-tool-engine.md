# REQ-128 — Tool calling engine: make it behave like Claude Code

**Status:** done (2026-09-11)
**Asked:** "abi harness tool calling, zart calling. zurt calling düzgün olsun.
git claude code, opencode, hermes agent bak onlar nasıl yapmış tool calling
engine harness engine falan hele claude code nasıl yapmış aynısı olsun"

## What was wrong

1. **The Chat-Completions path was tool-blind.** Only the Responses path
   (Muse Spark) received `tools[]`; every OpenAI-compatible upstream —
   opencode-go, omniroute, deepseek, ollama — ran the model with no schemas
   at all, so the loop depended on the model *guessing* a text protocol out
   of the system prompt.
2. **Results were fed back as text.** Even when a call arrived as a real
   function call, the answer went back as one user message full of
   `<tool_result>` markup, and the assistant turn lost its `tool_calls`.
   History rebuilt from the transcript degraded the same way.
3. **No read-only concurrency.** Independent `glob`+`grep`+`read_file` calls
   queued one after another.
4. **No result budget.** A 300KB grep went into the conversation verbatim
   (`JSON.stringify`), evicting everything else.
5. **Three file tools, no content tools.** No `edit_file` (every change was
   a whole-file rewrite), no `grep`, no `glob`.
6. **The prompt taught markup**, so models that could call functions
   imitated markup instead.

## What shipped

- `packages/lokma-ai` — native tools on `/chat/completions` (tools[],
  `tool_choice:auto`, streamed `delta.tool_calls[]` accumulation, assistant
  `tool_calls` + `role:tool` rows, raw argument string preserved); the same
  for the Anthropic Messages path (`tool_use` replay, merged `tool_result`
  blocks, `input_json_delta` accumulation); capability probes that retry a
  turn without `tools`, or with flattened history, when the upstream refuses
  the shape; 116 adapter checks.
- `packages/lokma-core` — `glob`, `grep`, `edit_file` over the workspace
  jail; `readOnly` + `maxResultSizeChars` on tool definitions with the gate
  and the batcher reading the same markers; `result-budget.ts` (per-tool
  budgets, newline-aligned preview, spill envelope, empty-result
  placeholder); `tool-results.ts` (one shared tool→model shape for both
  loops); 78 tool checks.
- `packages/lokma-web/server` — parallel read-only batches (limit 10,
  model order), spill-on-overflow, native history re-pairing from the
  transcript with dangling-id guards; 26 loop checks.
- `packages/lokma-core/src/cli` — the TUI sends the same schemas and uses
  the same feed-back path, so the CLI gets function calling too.
- `scripts/probe-live-tools.ts` — a live probe that fails loudly if the
  engine regresses.
- `Docs/40-TOOL-ENGINE.md` — the design + the Claude Code comparison.

## Evidence

- Probes: 116 + 78 + 26 checks pass.
- Live (real upstream, real model): `omniroute/auto/best-free` and
  `omniroute/auto/best-coding` both → 12/12 checks, turn 1 native call,
  turn 2 answer from the real file.
- Live CLI: one-shot `read hello.txt` → native `read_file`, answer
  `BANANA-42` from the file.
- Commits: 5832d85, d60ce5d, 325f85f, eeb0540, 596cb74, 99f62bf, b11c11f,
  09bb854, 6a8baa1.

## Left over (see Docs/40 §5)

Sub-agents, hooks, live partial tool-input rendering, `strict` schema mode,
and the remaining workhorse tools (web fetch/search, notebooks).
