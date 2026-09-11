# Claude Code CLI — Tool-Calling Engine Teardown

> Reverse-engineered from the installed package on this machine.
> Package: `/usr/lib/node_modules/@anthropic-ai/claude-code` — version **2.1.89**, bin `/usr/bin/claude`.
> Main bundle: `cli.js` — **13,081,065 bytes, 16,824 lines** (minified). Minified identifiers are quoted verbatim so claims are re-checkable.
>
> **Citation convention.** Because `cli.js` is a single minified bundle, citations are `cli.js:<line>` (source line number) with the byte offset appended where the line is very long, e.g. `cli.js:1695@6524632`. Everything below was extracted by reading the installed file; nothing is taken from public docs. Where a thing could not be located, it is marked **not found**.
>
> Type definitions companion file: `sdk-tools.d.ts` (102,269 chars, `json-schema-to-typescript` output, header says "JSON Schema definitions for Claude CLI tool inputs", `cli.js` sibling).

---

## 0. Inventory

| Path | What it is |
|---|---|
| `/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js` | the whole runtime — minified bundle, 16,824 lines |
| `/usr/lib/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts` | generated TS types for tool inputs/outputs |
| `/usr/lib/node_modules/@anthropic-ai/claude-code/package.json` | manifest, `"version": "2.1.89"` |
| `/usr/bin/claude` | bin shim (prints `2.1.89 (Claude Code)`) |
| `/root/.claude/settings.local.json` | live config — contains only a `permissions` key |
| `/root/.claude/settings.json`, `/root/.claude/history.jsonl` | settings + prompt history |
| `/root/.claude/projects/<slugified-cwd>/*.jsonl` | per-project session transcripts |
| `/root/.claude/skills/`, `/root/.claude/plans/`, `/root/.claude/plugins/marketplaces/`, `/root/.claude/session-env/<uuid>/` | empty in this install (skills dir exists but holds no user skills here) |

Observed live settings shape (values are allow-rules, no credentials):

```jsonc
// /root/.claude/settings.local.json
{ "permissions": { "allow": ["Bash(openclaw config:*)", "Bash(openclaw tui:*)", ...] } }
```

---

## 1. The Agent Loop

### 1.1 Shape

Claude Code's tool loop is a **generator-driven ReAct loop**: the model emits `tool_use` blocks, the runtime executes them, appends a single `user` message whose `content` is an array of `tool_result` blocks, and re-queries. The canonical "one assistant turn → all its tool results" helper is this (recovered at `cli.js:37@90125`):

```js
async function RY5(q, K = q.messages.at(-1)) {
  if (!K || K.role !== "assistant" || !K.content || typeof K.content === "string") return null;
  let _ = K.content.filter((Y) => Y.type === "tool_use");
  if (_.length === 0) return null;
  return {
    role: "user",
    content: await Promise.all(_.map(async (Y) => {
      let $ = q.tools.find((O) => ("name" in O ? O.name : O.mcp_server_name) === Y.name);
      if (!$ || !("run" in $))
        return { type: "tool_result", tool_use_id: Y.id, content: `Error: Tool '${Y.name}' not found`, is_error: true };
      try {
        let O = Y.input;
        if ("parse" in $ && $.parse) O = $.parse(O);          // zod validation
        let A = await $.run(O);
        return { type: "tool_result", tool_use_id: Y.id, content: A };
      } catch (O) {
        return {
          type: "tool_result", tool_use_id: Y.id,
          content: O instanceof oX6 ? O.content : `Error: ${O instanceof Error ? O.message : String(O)}`,
          is_error: true,
        };
      }
    })),
  };
}
```

Three things this pins down:

1. **Iteration is not bounded here** — the "how many iterations" answer lives in the caller. The turn budget is expressed as a sentinel `error_max_turns` result (`cli.js:4194@9439702`), i.e. the loop keeps going while the model returns `tool_use` and stops on a max-turn guard with an explicit synthetic error, not by falling out of a `for` loop.
2. **Tool lookup is by name against the live tool array**, and unknown tools become `is_error: true` results rather than exceptions — the model sees the failure and can recover.
3. **`parse` hook on tool definitions** is where zod validation happens before `run`.

### 1.2 The inner tool-exec pipeline

Each individual tool invocation goes through `io6` (`cli.js:4117@9358668`), which is the wrapper that owns the cross-cutting concerns (validation, permission check, hooks, telemetry, result mapping) and calls the tool's own `call()`. The public entry is:

```js
async function hN6(q, K, _) {                       // cli.js:1816@6747049
  let z = q.mapToolResultToToolResultBlockParam(K, _);
  return ZS4(z, q.name, DS4(q.name, q.maxResultSizeChars));
}
async function fS4(q, K, _) {                       // cli.js:1816@6747196
  return ZS4(q, K, DS4(K, _));
}
```

So: **tool returns anything → `mapToolResultToToolResultBlockParam()` normalises it into a `tool_result` block → `ZS4()` truncates/persists it.** Empty results are special-cased to `"(<toolName> completed with no output)"`.

The sub-agent loop is a separate generator (`Dy`), used by the Agent tool; it runs the same body with `isNonInteractiveSession: true` and its own `abortController` and `setAppStateForTasks`.

**Main-loop generator:** the outer generator that yields assistant/user turns to the UI and re-queries the API was located only by its side-effects (the `error_max_turns` guard at `cli.js:4194` and the query payload builder at `cli.js:7926`). Its exact declaration is **not found** as a clean symbol in the bundle.

---

## 2. Tool Definition / Registration

### 2.1 The factory

Every built-in is produced by one factory, `tq({...})` (`cli.js:511@3720976`), which stores the definition and merges defaults from `mM_` (`cli.js:511@3721237`). The functional shape of a definition (reconstructed from every `tq({...})` call site):

```js
tq({
  name,                       // string | getter
  searchHint,                 // one-line string used by ToolSearch
  aliases: [ ... ],           // optional extra names
  maxResultSizeChars,         // per-tool output budget, e.g. Bash 30000, Grep 20000
  strict,                     // → sent as `strict: true` to the API
  async prompt({agents, tools, getToolPermissionContext, allowedAgentTypes}) { ... },  // dynamic description
  get inputSchema()  { ... }, // zod schema (lazy)
  get outputSchema() { ... }, // zod schema (lazy)
  isReadOnly()               { return true },   // concurrency-safe marker
  async description() { return "Launch a new agent" },
  async call(input, ctx, canUseTool, ...) { ... },  // the implementation
  mapToolResultToToolResultBlockParam(result, toolUseId) { ... },
})
```

Concrete instance (Agent, `cli.js:3954@9233759`):

```js
bp8 = tq({
  async prompt({ agents, tools, getToolPermissionContext, allowedAgentTypes }) { ... },
  name: w4,                       // w4 === "Agent"
  searchHint: "delegate work to a subagent",
  aliases: [eB],
  maxResultSizeChars: 1e5,
  async description() { return "Launch a new agent" },
  get inputSchema()  { return Ao1() },
  get outputSchema() { return RKY() },
  async call({ prompt, subagent_type, description, model, run_in_background, name, team_name, mode, isolation, cwd }, H, J, M, X) { ... },
})
```

### 2.2 Full built-in tool census

**38 tools** are constructed via `tq({...})` in this build. One line each:

| # | Tool | cli.js | What it does |
|---|---|---|---|
| 1 | `ToolSearch` | 1506 | search the deferred tool catalog by keyword and load matches |
| 2 | `StructuredOutput` | 1698 | return the final response as a structured JSON object |
| 3 | `ListMcpResourcesTool` | 1798 | list resources from connected MCP servers |
| 4 | `TodoWrite` | 2436 | manage the session task checklist |
| 5 | `Skill` | 2506 | invoke a slash-command skill |
| 6 | `PowerShell` | 2978 | execute Windows PowerShell commands |
| 7 | `Edit` | 3042 | modify file contents in place (string replacement) |
| 8 | `Write` | 3051 | create or overwrite files |
| 9 | `Grep` | 3052 | search file contents with regex |
| 10 | `Glob` | 3061 | find files by name pattern / wildcard |
| 11 | `NotebookEdit` | 3067 | edit Jupyter notebook cells (`.ipynb`) |
| 12 | `WebFetch` | 3137 | fetch and extract content from a URL |
| 13 | `TaskStop` | 3150 | kill a running background task |
| 14 | `SendUserMessage` | 3156 | send a message to the user without ending the turn |
| 15 | `TaskOutput` | 3161 | read output/logs from a background task |
| 16 | `WebSearch` | 3173 | search the web for current information |
| 17 | `ExitPlanMode` | 3205 | present a plan for approval and start executing |
| 18 | `TestingPermission` | 3225 | prompt the user with a multi-choice question (internal/testing variant) |
| 19 | `AskUserQuestion` | 3225 | prompt the user with a multiple-choice question |
| 20 | `LSP` | 3263 | code intelligence (definitions, references, diagnostics) |
| 21 | `EnterPlanMode` | 3348 | switch to plan mode to design an approach |
| 22 | `EnterWorktree` | 3387 | create an isolated git worktree and switch into it |
| 23 | `ExitWorktree` | 3417 | exit a worktree session and return/cleanup |
| 24 | `Config` | 3456 | get or set Claude Code settings (theme, model, …) |
| 25 | `TaskCreate` | 3495 | create a task in the task list |
| 26 | `TaskGet` | 3517 | retrieve a task by ID |
| 27 | `TaskUpdate` | 3592 | update a task (status, owner, …) |
| 28 | `TaskList` | 3627 | list all tasks |
| 29 | `CronCreate` | 3628 | schedule a recurring or one-shot prompt |
| 30 | `CronDelete` | 3628 | cancel a scheduled cron job |
| 31 | `CronList` | 3628 | list active cron jobs |
| 32 | `RemoteTrigger` | 3639 | manage scheduled remote agent triggers |
| 33 | `TeamCreate` | 3750 | create a multi-agent swarm team |
| 34 | `TeamDelete` | 3763 | disband a swarm team and clean up |
| 35 | `SendMessage` | 3820 | send messages to agent teammates |
| 36 | `Agent` | 3954 | delegate work to a subagent (the "Task" tool) |
| 37 | `Bash` | 4105 | execute shell commands |
| 38 | `Read` | 4567 | read files, images, PDFs, notebooks |

Beyond these, MCP servers contribute tools named `mcp__<server>__<tool>` (`cli.js:2022`, `"name" in O ? O.name : O.mcp_server_name`), and `ReadMcpResource`/`McpInput` appear in `sdk-tools.d.ts` (lines 22–25) as an MCP-resource family.

### 2.3 Tool visibility filtering

Not all 38 reach the API. A filter `rF1({tools, isBuiltIn, isAsync, permissionMode})` (`cli.js:2022@6953560`) prunes:

```js
function rF1({ tools: q, isBuiltIn: K, isAsync: _ = !1, permissionMode: z }) {
  return q.filter((Y) => {
    if (Y.name.startsWith("mcp__")) return !0;          // MCP always allowed through
    if (l_(Y, hX) && z === "plan") return !0;            // plan-mode-only tools
    if (nV6.has(Y.name)) return !1;                      // hard-blocked set
    if (!K && GB1.has(Y.name)) return !1;                // non-builtin session blocks some
    if (_ && !sy8.has(Y.name)) return !1;                // async (background) allow-list
    ...
  });
}
```

---

## 3. Tool Result Format

### 3.1 Wire shape

A tool result is an Anthropic `tool_result` block:

```ts
{ type: "tool_result", tool_use_id: string, content: string | Array<TextBlock|ImageBlock>, is_error?: true }
```

- **Rich content is supported**: `content` may be an array containing `{type:"text"}` and `{type:"image"}` blocks. `TS4()` (`cli.js:1816@6747191`) short-circuits truncation for any array containing an image — images are never persisted to disk.
- **Errors** are represented in-band with **`is_error: true`** plus a string content. Two sources:
  - unknown tool → `Error: Tool '<name>' not found` (`cli.js:37@90125`)
  - thrown exception → `Error: <message>` (or the structured `oX6.content` when the error is that class)
- **Empty results** are rewritten to `"(<toolName> completed with no output)"` rather than sent as empty content (`cli.js:1816@6747260`).

### 3.2 Truncation

Budget resolution (`cli.js:1809@6745771`):

```js
function DS4(q, K) {                       // q = tool name, K = tool.maxResultSizeChars
  if (!Number.isFinite(K)) return K;
  let z = u8(rjz, {})?.[q];                // settings key "tengu_satin_quoll"
  if (typeof z === "number" && Number.isFinite(z) && z > 0) return z;
  return Math.min(K, JE4);                 // JE4 === 50000
}
```

Constants (`cli.js:1662@6462880`):

| Const | Value | Meaning |
|---|---|---|
| `JE4` | `50000` | hard ceiling on `maxResultSizeChars` |
| `ME4` | `400000` | default when a tool declares no limit |
| `XE4` | `200000` | "hawthorn window" default (`tengu_hawthorn_window` override) |
| `EN6` | `2000` | preview size persisted into the transcript (`cli.js:1817@6752874`) |

Per-tool limits (literal source values):

| Tool | `maxResultSizeChars` | Effective budget (via `DS4`) |
|---|---|---|
| `Bash` | `30000` (`cli.js:4105@9318731`) | 30000 |
| `PowerShell` | `30000` (`cli.js:2978@8656599`) | 30000 |
| `Grep` | `20000` (`cli.js:3052@8742083`) | 20000 |
| `Read` | `1/0` → **Infinity** (`cli.js:4567@9538992`) | unbounded — `DS4` returns `K` unchanged when `!Number.isFinite(K)` |
| everything else | `1e5` (100,000) | `min(1e5, 50000)` = **50000** |

`Read` is deliberately unbounded at the tool layer (`1/0` evaluates to `Infinity`) — output control for reads happens inside the tool (line offsets/limits), not in the result pipeline. `Bash`/`PowerShell`/`Grep`/`Read` also set `strict: !0` (strict tool-call schema mode).

Truncation driver (`cli.js:1816@6747260`):

```js
async function ZS4(q, K, _) {
  let z = q.content;
  if (ajz(z)) return d("tengu_tool_empty_result", { toolName: wK(K) }),
              { ...q, content: `(${K} completed with no output)` };
  if (!z) return q;
  if (TS4(z)) return q;                       // image-bearing → never truncate
  let Y = kS4(z), $ = _ ?? ME4;
  if (Y <= $) return q;                       // under budget → pass through
  let O = await LN6(z, q.tool_use_id);        // persist full output to a file
  if (RN6(O)) return q;                       // persistence errored → keep original
  let A = q46(O);
  return d("tengu_tool_result_persisted", { toolName: wK(K), originalSizeBytes: O.originalSize, ... }),
         { ...q, content: A };
}
```

**Large outputs are not truncated away — they are spilled to disk and replaced with a preview envelope.** Persistence path: `<projectTmpDir>/tool-results/<file>.json|txt`, written with `flag: "wx"` (fail-if-exists → idempotent) (`LN6`, `cli.js:1816`).

The exact notice the model sees (`q46`, `cli.js:1816@6746924`; literals `WS4`/`ijz` at `cli.js:1817@6752848`):

```js
const WS4 = "<persisted-output>";
const ijz = "</persisted-output>";
function q46(q) {
  let K = `${WS4}\n`;
  K += `Output too large (${B4(q.originalSize)}). Full output saved to: ${q.filepath}\n\n`;
  K += `Preview (first ${B4(EN6)}):\n`;
  K += q.preview;
  K += q.hasMore ? `\n...\n` : `\n`;
  K += ijz;
  return K;
}
```

Preview cut (`da6`, `cli.js:1816`): takes the first `EN6` (2000) chars, then **backs up to the last newline**, but only if that newline is past `K*0.5`; otherwise it hard-cuts at `K`. Result is `{preview, hasMore}`.

```js
function da6(q, K) {
  if (q.length <= K) return { preview: q, hasMore: !1 };
  let z = q.slice(0, K).lastIndexOf("\n"), Y = z > K * 0.5 ? z : K;
  return { preview: q.slice(0, Y), hasMore: !0 };
}
```

Size accounting: `kS4` counts string length, or for block arrays sums only `type:"text"` block lengths.

---

## 4. Parallel Tool Calls

**Yes — multiple `tool_use` blocks in one assistant turn run concurrently**, bounded and ordered by an explicit three-stage pipeline at `cli.js:1695`.

```js
// 1) bounded concurrent generator map
function my8(q, K) { ... }                 // cli.js:1695@6522098  (limit = K)

// 2) the limit
function Q$z() {                           // cli.js:1695@6522652
  return Number(process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY) || 10;
}

// 3) batch splitter: consecutive tools are grouped only while they are concurrency-safe
function d$z(q) { ... }                    // cli.js:1695@6523213

// 4) the runner
async function* l$z(q, K, _, z) {          // cli.js:1695@6524632
  yield* my8(q.map(async function* (Y) { ... }), Q$z());
}
```

Mechanics:

- **Default concurrency = 10**, overridable with `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` (`Q$z`).
- **Batching rule**: `d$z` splits the assistant turn's tool list into consecutive runs of "concurrency-safe" tools (the `isReadOnly() → true` marker on definitions, e.g. `Read`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `ToolSearch`, `TaskList`, `TaskGet`, `LSP`, `AskUserQuestion`, `ListMcpResourcesTool`). Non-safe tools (Bash, Edit, Write, Agent, …) are not run concurrently with each other; they form their own serial batches.
- **Ordering**: `my8` is a *generator* map — results are yielded in input order regardless of completion order, and `l$z` is called from the parent loop with `yield*`, so the eventual `tool_result` array is positionally aligned with the `tool_use` order the model emitted. That alignment matters: Anthropic requires every `tool_use` id to get exactly one `tool_result`, in any order but all present.
- Because each branch is itself an `async function*`, partial progress streams out as tools finish rather than blocking on `Promise.all` of the whole batch.

---

## 5. Permission / Approval Gating

### 5.1 Modes

The mode set (schema enum, `cli.js:2176@8057740`):

```js
L.enum(["default","acceptEdits","bypassPermissions","plan","dontAsk"])
```

with this description embedded in the SDK types:

> `'default'` — Standard behavior, prompts for dangerous operations.
> `'acceptEdits'` — Auto-accept file edit operations.
> `'bypassPermissions'` — Bypass all permission checks (requires `allowDangerouslySkipPermissions`).
> `'plan'` — Planning mode, no actual tool execution.
> `'dontAsk'` — Don't prompt for permissions, deny if not pre-approved.

UI presentation table (`cli.js:168@998324`) — note the extra internal `auto` mode:

```js
{
  default:           { title: "Default",            symbol: "",     external: "default" },
  plan:              { title: "Plan Mode",          symbol: K51,    external: "plan" },
  acceptEdits:       { title: "Accept edits",       symbol: "⏵⏵",   external: "acceptEdits" },
  bypassPermissions: { title: "Bypass Permissions", symbol: "⏵⏵",   external: "bypassPermissions" },
  dontAsk:           { title: "Don't Ask",          symbol: "⏵⏵",   external: "dontAsk" },
  auto:              { title: "Auto mode",          symbol: "⏵⏵",   external: "default" },
}
```

### 5.2 Decision result shape

The permission callback is `canUseTool` and it returns a discriminated union (`cli.js:2176@8057740`):

```js
L.union([
  L.object({ behavior: L.literal("allow"), updatedInput: L.unknown().optional(),
             updatedPermissions: ..., decisionClassification: B7K().optional() }),
  L.object({ behavior: L.literal("deny"), message: L.string(),
             interrupt: L.boolean().optional(), toolUseID: L.string().optional(),
             decisionClassification: B7K().optional() }),
])
```

So a decision is `allow` (optionally rewriting the input and/or persisting new rules) or `deny` (with a message shown to the model, plus an optional `interrupt` that aborts the whole turn).

### 5.3 Rules and config

Permission config is a `permissions` object with `allow` / `deny` / `ask` / `defaultMode` / `disableBypassPermissionsMode` / `disableAutoMode` / `additionalDirectories` (`cli.js:168@1074436`, the settings-key validator `uC7`). Rule syntax is observed live:

```
Bash(openclaw config:*)
Bash(grep -oP '--token \K[^ ]+')
```

i.e. `ToolName(specifier[:wildcard])`. The engine merges allow-rules from several sources (`FC5(q, K)`, `g_6`) and applies them via the matcher at `cli.js:1662@6458176`.

### 5.4 The UI prompt

The interactive prompt is driven by the tool's `canUseTool`/permission-request path, surfaced to the user as a **PermissionRequest** event, and to hooks as `PermissionRequest` / `PermissionDenied` hook events (§8). Hook-driven override of the prompt is expressed as:

```js
L.object({ hookEventName: L.literal("PreToolUse"), permissionDecision: RBz().optional(), ... })
```

where the hook can return `allow` / `deny` / `ask` and be consulted *before* the user is prompted — the standard pattern for "auto-approve these Bash commands from a hook".

**Not located:** the exact function that computes the final allow/deny/ask from (mode × rule-set × hook result) — only its inputs, outputs and constants were recovered.

---

## 6. Streaming

- **Tool input arrives as accumulated partial JSON.** The bundle contains the SSE-delta handling for `input_json_delta` (`cli.js:16@86428`), i.e. the standard Anthropic streaming contract: a `tool_use` block starts with `{id, name, input:{}}` and the `input` is built by concatenating `input_json_delta.partial_json` fragments, parsed only once the block's `content_block_stop` arrives. A malformed-accumulation fallback is required here in practice (the tool `parse` step defensively re-validates), but the explicit `JSON.parse`-with-repair helper is **not found** as a distinct symbol.
- **Eager tool streaming** is a first-class, opt-in beta flag on the tool schema itself: `eager_input_streaming: true` (`cli.js:7926@11494883`), enabled when `T7()==="firstParty" && kP()` and either the gate `tengu_fgts` is set or `CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING=1`. That is the mechanism that lets the UI show a tool row populate its args before the block closes.
- **Partial rendering before execution**: there is a dedicated system message for long-running tool progress — `task_progress` (`cli.js:2022`):

  ```js
  function Jh8(q) {
    Yo({ type: "system", subtype: "task_progress", task_id: q.taskId, tool_use_id: q.toolUseId,
         description: q.description, usage: { total_tokens: q.totalTokens, tool_uses: q.toolUses,
         duration_ms: Date.now() - q.startTime }, last_tool_name: q.lastToolName,
         summary: q.summary, workflow_progress: q.workflowProgress });
  }
  ```

- **Running vs finished row**: a tool row is rendered from the `tool_use` block (running, args streaming) and re-rendered from its matching `tool_result` (finished) — correlation key is `tool_use_id`, which `hN6`/`fS4` stamp via `mapToolResultToToolResultBlockParam(result, toolUseId)`. The finished-state text is the same text sent to the model (possibly the `<persisted-output>` envelope), which keeps UI and model consistent.

---

## 7. Prompt / Schema Plumbing

### 7.1 Zod → JSON Schema → API

Tool descriptions and schemas are **lazily computed**: `prompt()` is an async function and `inputSchema`/`outputSchema` are getters, so a tool's description can depend on session state (`agents`, `tools`, `getToolPermissionContext`, `allowedAgentTypes`). The API payload builder (`cli.js:7926@11494883`):

```js
let A = "inputJSONSchema" in q && q.inputJSONSchema ? q.inputJSONSchema : hp(q.inputSchema);
if (!lq()) A = tbY(q.name, A);
let Y = {
  name: q.name,
  description: await q.prompt({ getToolPermissionContext: K.getToolPermissionContext, tools: K.tools,
                                agents: K.agents, allowedAgentTypes: K.allowedAgentTypes }),
  input_schema: A,
};
if (O /* gate tengu_tool_pear */ && q.strict === !0 && K.model && E$6(K.model)) Y.strict = !0;
if (T7() === "firstParty" && kP() && (u8("tengu_fgts", !1) || Q6(process.env.CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING)))
  Y.eager_input_streaming = !0;

let $ = { name: Y.name, description: Y.description, input_schema: Y.input_schema,
          ...Y.strict && { strict: !0 },
          ...Y.eager_input_streaming && { eager_input_streaming: !0 } };
if (K.deferLoading)  $.defer_loading = !0;
if (K.cacheControl)  $.cache_control = K.cacheControl;
```

Key points:

- **The wire schema is `input_schema`** (snake_case, Anthropic native), produced by `hp()` from the zod schema. The tool result is memoised in a `Map` keyed by `` `${q.name}:${JSON.stringify(q.inputJSONSchema)}` `` so descriptions are not recomputed every turn.
- **Caching markers**: `cache_control` is forwarded per tool when the caller supplies `cacheControl` — that is the prompt-cache breakpoint on the (large, stable) tool block, not on the system prompt.
- **`strict: true`** is forwarded for tools so marked (e.g. `Bash`) when the model supports structured outputs.
- **`defer_loading: true`** marks tools that should not be shipped eagerly — this is what `ToolSearch` resolves against.
- **`eager_input_streaming`** is the fine-grained streaming beta.
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` strips everything except `name`/`description`/`input_schema`/`cache_control` and logs which fields were dropped (`ebY`).

### 7.2 System prompt ↔ tools

The built-in system prompt does **not** enumerate tools by hand. There is a short per-tool prompt-fragment contract (each `tq` definition carries its own `prompt()`), plus one explicit instruction fragment found near the classifier tool that documents the shared **thinking-block + tool-call** convention:

> "...required to override blocks. Use `<thinking>` before responding with `<block>`." (`cli.js:2022@6954276`)

The MCP-tool token budgeter (`cli.js:4567@9502534`) also shows the shape used for *counting* what will be sent: it computes `tokens(name, description, input_schema)` per tool and allocates the budget proportionally (`Math.round(G/H*w)`), i.e. description text is itself a budgeted resource.

---

## 8. Robustness: retries, timeouts, abort, budget, hooks, subagents

**Retries.** Automatic retry of API calls lives in the streaming client (`tx6` class, `cli.js:37@90125` region) which tracks `sx6` (retry count) and `aX6`/`T96` abort flags. Retry counts/backoff constants were **not found** as named symbols.

**Timeouts.** Per-hook timeouts are configurable: shell-command hooks declare `timeout: L.number().positive().optional().describe("Timeout in seconds for this specific command…")` (`cli.js:168@998324`). Background tasks have a dedicated kill tool, `TaskStop`.

**Abort / interrupt.**
- `canUseTool` deny results may set `interrupt: true` (`cli.js:2176`), which terminates the turn.
- Hook events include both `Stop` and `StopFailure`, and `SessionEnd` reasons enumerate `["clear","resume","logout","prompt_input_exit","other","bypass_permissions_disabled"]`.
- Abort is threaded through as an `AbortController` on the session context (used by the sub-agent loop and by the SDK's `BetaToolRunner`).

**Budget limits.** Turn budget → synthetic `error_max_turns` (`cli.js:4194@9439702`). Token budget → the MCP tool-description budgeter (§7.2). Size budget → `DS4`/`ZS4` (§3.2).

**Hooks — this is the most developed part of the design.** 27 hook events are defined (`cli.js:168@998324` and again at `cli.js:2176@8058918`):

```
PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit, SessionStart,
SessionEnd, Stop, StopFailure, SubagentStart, SubagentStop, PreCompact, PostCompact,
PermissionRequest, PermissionDenied, Setup, TeammateIdle, TaskCreated, TaskCompleted,
Elicitation, ElicitationResult, ConfigChange, WorktreeCreate, WorktreeRemove,
InstructionsLoaded, CwdChanged, FileChanged
```

Hook payloads are zod-validated and **share a common envelope** (`Ew`, `cli.js:2176`):

```js
{ session_id, transcript_path, cwd, permission_mode?, agent_id?, agent_type? }
```

with per-event extension — e.g.:

```js
PreToolUse:        { hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id }
PostToolUse:       { hook_event_name: "PostToolUse", tool_name, tool_input, tool_response, tool_use_id }
PostToolUseFailure:{ hook_event_name: "PostToolUseFailure", tool_name, tool_input, tool_use_id, error, is_interrupt? }
PermissionRequest: { hook_event_name: "PermissionRequest", tool_name, tool_input, permission_suggestions? }
PermissionDenied:  { hook_event_name: "PermissionDenied", tool_name, tool_input, tool_use_id, reason }
SubagentStart/Stop, TaskCreated/TaskCompleted, TeammateIdle, Elicitation/ElicitationResult,
ConfigChange, WorktreeCreate/Remove, InstructionsLoaded, CwdChanged, FileChanged
```

Notes that matter for a rewrite:
- `agent_id` is present **only** in subagent context; docs in the schema explicitly say "Use this field (not agent_type) to distinguish subagent calls from main-thread calls."
- `Notifications` distinguishes `Stop` from `StopFailure` and `PostToolUse` from `PostToolUseFailure` — failures get their own event rather than being folded into a success event with an error field.
- Hooks are declaratively configured under a `hooks` key validated against `["PreToolUse","PostToolUse","Notification","UserPromptSubmit","SessionStart","SessionEnd","Stop","SubagentStop","PreCompact","PostCompact","TeammateIdle","TaskCreated","TaskCompleted"]` (`uC7`, `cli.js:168`).
- Hooks can be shell commands (`type: "command"`, `bash`/`powershell` interpreters) or async (`{async: true, asyncTimeout?}`).

**Subagents.** The `Agent` tool (`cli.js:3954@9233759`) is the Task tool. Its input schema is built from a base and conditionally omits `run_in_background` / `cwd`, and its output is a union:

```js
// sync completion
{ status: "completed", prompt, <AgentOutput fields> }
// async launch
{ status: "async_launched", agentId, description, prompt,
  outputFile, canReadOutputFile? }
```

Subagents run the *same* loop (`Dy`) with:
- their own `abortController`, `setAppStateForTasks`, and `toolPermissionContext`
- a restricted tool set — `prompt({agents, tools, getToolPermissionContext, allowedAgentTypes})` can filter tools and agent types (`allowedAgentTypes` is passed into `M18`) , and it auto-discovers MCP servers by scanning tool names for the `mcp__` prefix and extracting `name.split("__")[1]`
- mode/isolation options: `mode`, `isolation: "worktree"`, `team_name`, `name` (teammates), `model`
- guardrails: "Teammates cannot spawn other teammates — the team roster is flat"; in-process teammates cannot launch background agents (must use `run_in_background: false`); `Agent Teams` requires a plan entitlement (`lq()`).
- `SubagentStart` / `SubagentStop` hook events fire around them; `TaskCreated`/`TaskCompleted` for the task list.

**Session persistence.** Transcripts land in `/root/.claude/projects/<slugified-cwd>/*.jsonl`, one line per event, with `session_id` echoed into every hook payload.

---

## 9. What to steal for the rewrite

1. **One factory for all tools, with lazy getters.** `inputSchema`/`description` as getters/async functions let a tool's schema depend on session state without any registry mutation. Cheap and essential.
2. **Tools self-describe their output budget.** `maxResultSizeChars` per tool, clamped by a global `Math.min(K, 50000)`, with a per-tool settings override key. No global "truncate at N" constant fighting per-tool needs.
3. **Spill, don't truncate.** Big outputs go to disk and the model gets a `<persisted-output>` envelope with size, path, and a newline-aligned 2000-char preview. The model can `Read` the file for the rest. This is strictly better than head+tail cutting.
4. **Empty results get an explicit placeholder** (`(X completed with no output)`), not an empty string — avoids ambiguous "did it run?" reasoning.
5. **Error results are in-band `is_error: true`** with `Error: <msg>` text, never exceptions escaping the loop. Unknown tool names also become results, so the model self-corrects.
6. **Concurrency 10 by default, env-overridable, batched by a `isReadOnly()` marker, results yielded in input order.** Safety (mutating tools serialised) and speed (read-only tools parallel) without a scheduler.
7. **`PreToolUse` hooks can return `allow`/`deny`/`ask`** and short-circuit the interactive prompt — the single highest-leverage extension point.
8. **Separate failure hook events** (`PostToolUseFailure`, `StopFailure`) rather than overloading success events.
9. **`agent_id` in every hook payload** so hooks can tell main-thread from subagent without guessing.
10. **Cache breakpoints on the tool block via per-tool `cache_control`**, plus memoising the rendered description/schema keyed by name+hash so the cached prefix stays byte-stable.

---

### Appendix — unresolved items (explicitly **not found**)

- The top-level agent-loop generator's declaration/name.
- The retry/backoff constants for API calls.
- The exact allow/deny/ask arbitration function (inputs, outputs, constants are documented above; the function itself is not).
- A dedicated JSON-repair helper for malformed streamed tool input.
- The tool-registry *map* itself (tools are held in plain arrays and matched by linear `.find()` on `name` — see `RY5`; there is no name→tool dictionary).
