# 40 — The Tool Engine (REQ-128)

> How Lokma calls tools, why it looks the way it does, and where it now
> stands against Claude Code, opencode and Hermes Agent.
> Reference teardowns: `Docs/research/01-claude-code-tool-engine.md`,
> `02-opencode-tool-engine.md`, `03-hermes-tool-engine.md`.

## 1. The one-line rule

**The model calls functions; the loop answers with pairs.** Anything that
does not fit that sentence is a fallback, and it exists only for upstreams
that cannot take `tools` at all.

## 2. What we found in the references

Claude Code's engine (`cli.js` 2.1.89, minified, 16.8k lines) reduced to the
rules that actually matter:

| Rule | Claude Code | Why it matters |
|---|---|---|
| Wire protocol | Anthropic `tool_use` blocks; assistant turn replayed with its calls, results as `tool_result` blocks in the NEXT user message | A re-serialized call confuses upstreams; the pair must round-trip exactly |
| Result size | per-tool `maxResultSizeChars` (Bash 30k, Grep 20k, default 50k ceiling) | One big read must never evict the conversation |
| Over budget | **spill to disk** + `<persisted-output>` envelope with size, path and a 2000-char newline-aligned preview | Truncation destroys the answer; the model can read the rest itself |
| Empty result | `(X completed with no output)` | "did it run?" must never be ambiguous |
| Errors | in-band `is_error: true` with `Error: <msg>`; unknown tool names are results too | The model self-corrects instead of the turn dying |
| Concurrency | read-only tools batched and run in parallel (limit 10, `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`), results yielded in input order | Independent reads must not queue |
| Tool count | 38 built-ins, one factory, lazy `inputSchema`/`prompt()` getters | The workhorses (Read/Edit/Write/Grep/Glob/Bash) are what makes it usable |
| Extensibility | 27 hook events, `PreToolUse` can return allow/deny/ask before the user is prompted | The single highest-leverage extension point |

opencode and Hermes reach the same place from different angles (per-tool
schemas, streaming partial arguments, denied calls answered as results),
so the design below is not an Anthropic quirk — it is the shape every
serious agent harness converges on.

One deliberate divergence: opencode does NOT fan parallel calls out itself —
it hands execution to the bundled AI SDK `streamText` runtime and only
*asks* the model to emit several calls in one turn (plus a `batch` tool).
Claude Code does fan read-only calls out, and Lokma follows Claude Code
here. Do not "align" the batcher toward opencode; it would serialize
independent reads for no gain.

## 3. What Lokma does now

### 3.1 Protocol — native first, text as fallback

| Layer | File | Behaviour |
|---|---|---|
| OpenAI-compatible (`/chat/completions`) | `packages/lokma-ai/src/provider/openai.ts` | sends `tools[]` + `tool_choice:auto`, accumulates streamed `delta.tool_calls[]` fragments per index, flushes one `native_tool_call` per call |
| OpenAI Responses (spark) | same | already native; unchanged, now also carries the raw argument string |
| Anthropic Messages | `packages/lokma-ai/src/provider/anthropic.ts` | `tools[]` (`input_schema`), assistant `tool_use` replay, `tool_result` blocks merged into ONE user message, `input_json_delta` accumulation |
| Message shape | `packages/lokma-ai/src/provider/types.ts` | `ProviderMessage.toolCalls` (assistant) and `toolCallId`/`name` (tool rows) — the raw argument STRING is preserved for byte-identical replay |
| Capability probes | `openai.ts` | an upstream that rejects `tools` is retried without it and remembered; one that rejects the *pairing* gets the flattened text history — the turn always runs |
| Text fallback | `packages/lokma-core/src/tools/parse.ts` | `<tool name="…">{json}</tool>` blocks still parse (`createBlockFilter` streams them out of the visible text), so a model without function calling still works |

### 3.2 Loop

Both loops share one implementation of the tool→model shape
(`packages/lokma-core/src/tools/tool-results.ts`):

- `toolResultCarrier()` — one result, with the text blob AND the native pair
- `feedBackResults()` — native turn → `assistant.tool_calls[]` + one `tool`
  row per result (synthetic ids for text-parsed calls in the same turn, so
  no call id is ever left unanswered); text turn → the single
  `<tool_result>` user blob
- `formatToolResult()` — the payload, or a spill envelope when over budget

`packages/lokma-web/server/src/agent-loop.ts` additionally:

- runs **consecutive read-only calls as one parallel batch** (limit 10,
  results recorded in model order); mutating calls and anything the gate
  wants to ask about stay strictly serial
- re-pairs native history from the transcript (`buildLoopHistory`), so a
  second conversation in the same session still sees the tool protocol
  instead of a wall of markup; unpaired rows degrade to text so a
  `tool_call_id` is never dangling

`packages/lokma-core/src/cli/tui.ts` sends the same schemas and uses the
same feed-back path — CLI and Web stay twins.

### 3.3 Tools

| Tool | Kind | Budget | Notes |
|---|---|---|---|
| `read_file` | read-only | 50k | returns the sha for guarded writes |
| `list_files` | read-only | default | one level, dirs-first, git states |
| `search_files` | read-only | 20k | fuzzy FILE NAME search |
| `glob` | read-only | 20k | `**` crosses dirs, `*` does not, `?` is one char |
| `grep` | read-only | 20k | regex or literal, grouped per file with line numbers |
| `edit_file` | mutating | 10k | exact-string replace; refuses a missing or ambiguous match; writes with the sha it just read |
| `write_file` | mutating | 10k | create/overwrite, `expectedSha` guard |
| `run_command` | mutating | 30k | one binary, no shell, jailed; non-zero exit is a RESULT |

Tool definitions declare `readOnly` and `maxResultSizeChars`; the registry
is authoritative — the gate treats a declared read-only tool as allowed in
`auto` mode without a second edit in `gate.ts`, and the loop's parallel
batcher reads the same marker.

### 3.4 System prompt

`buildToolSystemPrompt()` leads with *"Call the tools you were given
(function calling)"* and phrases the `<tool>` markup as the explicit
fallback. Before this, the prompt only taught markup, so models that could
call functions imitated markup instead.

## 4. Proof

| Layer | Command | Result |
|---|---|---|
| Adapter (116 checks) | `bun src/provider/adapters.test.ts` (packages/lokma-ai) | chat-completions tools, fragmented `tool_calls`, capability probes, Anthropic blocks |
| Tools + budget (78 checks) | `bun src/tools/tools.test.ts` (packages/lokma-core) | glob/grep/edit on a real temp workspace, budgets, markers |
| Loop history (26 checks) | `bun src/agent-loop.test.ts` (packages/lokma-web/server) | caps, native re-pairing, dangling-id guards |
| **Live, real model** | `bun scripts/probe-live-tools.ts omniroute/auto/best-free` | model emits a NATIVE call, 2 turns, answer contains the real file contents |
| **Live, CLI** | `lokma tui -p "read hello.txt"` | `read_file` called natively, answer from the real file |

## 5. Known gaps (deliberately not in this pass)

1. **Tool count.** 8 tools vs Claude Code's 38. Missing workhorses: a
   `todo_write`-style checklist (Lokma has claim/complete todo tools
   instead), web fetch/search, notebook edit, task/sub-agent delegation.
2. **Hooks.** `PreToolUse`/`PostToolUse` style extension points do not
   exist; the permission gate is the only pre-execution seam.
3. **Partial tool-input streaming to the UI.** The adapter emits
   `tool_input_delta` for Anthropic and carries the raw string everywhere,
   but no WS frame renders a call's arguments as they stream.
4. **`strict: true` schema mode** and per-tool prompt-cache breakpoints.
5. **Sub-agents** (`Agent` tool) — the biggest single capability gap.
