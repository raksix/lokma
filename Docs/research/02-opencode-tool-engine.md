# opencode CLI — Agent / Tool Engine Teardown

Reverse-engineered from the copy installed on this machine. Everything below is read from the
shipped artifacts, not from docs or upstream source.

## 0. How this was obtained (reproducible)

| Item | Value |
|---|---|
| Entrypoint | `/usr/bin/opencode` (symlink) |
| npm package | `/usr/lib/node_modules/opencode-ai/` |
| Real artifact | `/usr/lib/node_modules/opencode-ai/bin/opencode.exe` — **177 MB ELF, Bun single-file compiler output** |
| Platform deps | `/usr/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64{,-baseline}/` |
| Runtime state | `/root/.local/share/opencode/` (logs, `tool-output/`) |

The npm package is **not** a launcher: it ships the whole engine as one Bun-compiled binary.
Bun embeds each original source file as a `$bunfs/root/<name>` entry inside the ELF `.bun`
section. Carving it gives back the pre-bundle JavaScript:

```sh
# .bun section is at file offset 0x593f000, size 0x56be5e0
dd if=/usr/lib/node_modules/opencode-ai/bin/opencode.exe \
   bs=1 skip=$((0x593f000)) count=$((0x56be5e0)) of=/tmp/bun.bin status=none
# split on the embedded-path table; 1174 chunks land in /tmp/chunks/
```

**Citation format used below:** `chunk-<name>.js:+<byte offset>` = the extracted file
`/tmp/chunks/chunk-<name>.js`, byte offset within it (files are minified, so byte offsets
are the only stable locator). `bun.bin:+N` means an offset in the carved section.
Offsets are accurate to the enclosing recorded region (typically ±200 bytes, since regions
were read as byte ranges); quoted strings and identifiers are verbatim.

Bundled identifiers are mangled (`j(...)`, `s.gen(...)`, `p.Struct(...)`). Where a name is
preserved (Effect `Service` tags, log messages, event names, string literals) it is quoted
verbatim — those are the load-bearing parts.

---

## 1. Agent loop shape

The loop is `SessionPrompt.run`, a single `while(!0)` in `chunk-k8tzd51e.js` starting at
`chunk-k8tzd51e.js:+68783` (`s.fn("SessionPrompt.run")(function*(t){ ... while(!0){ ... } })`).

Per iteration:

1. `yield*e.set(t,{type:"busy"})` and `logInfo("loop",{"session.id":t,step:R})` — the step
   counter is the loop-local `R`, initialized `R=0` at `chunk-k8tzd51e.js:+68740`.
2. Reload history, split into `{user,assistant,finished,tasks} = Me.latest(C)`
   (`chunk-k8tzd51e.js:+68800`). `tasks` is a queue of deferred work items
   (`{type:"subtask"}` / `{type:"compaction"}`) drained later in the same iteration.
3. **Exit check** (`chunk-k8tzd51e.js:+68700`–`+68760`):
   ```js
   if(j?.finish && !["tool-calls","unknown"].includes(j.finish) && !fe && j.parentID===X.id){
     let B = ne?.parts.find((A)=>A.type==="tool"&&Rh(A));
     if(B) yield* s.logWarning("loop exit with orphaned interrupted tool",{...});
     yield* s.logInfo("exiting loop",{"session.id":t}); break }
   ```
   So the loop terminates on the provider finish reason — it does **not** count tool calls.
   `fe` is "has unsettled tool parts". `"tool-calls"` and `"unknown"` are the two reasons
   that keep the loop alive. Orphaned interrupted tools are logged, not fatal.
4. `R++`; on `R===1` it fires the first-turn side jobs (`to({...history:C})` — title
   generation etc., forked so failures are ignored).
5. Drain the `tasks` queue *before* calling the model: a `{type:"subtask"}` entry runs the
   subagent and `continue`s (new iteration), a `{type:"compaction"}` entry runs
   `r.process({messages,parentID,auto,overflow})` and `continue`s if it returns `"stop"`.
6. Auto-compaction: if `he && he.summary!==!0 && (yield*r.isOverflow({tokens:he.tokens,model:Z}))`
   → `r.create({sessionID,agent,model,auto:!0})`, then `continue`
   (`chunk-k8tzd51e.js:+69300`).
7. **Step limit** (`chunk-k8tzd51e.js:+69560`):
   ```js
   let ee = Y.steps ?? 1/0, L = R>=ee;
   ```
   `Y` is the agent record (`l.get(X.agent)`); `steps` is the per-agent cap, default
   **unbounded** (`Infinity`). When exceeded, `L` is true and the final model call is made
   with a synthetic assistant message appended:
   `messages:[...is, ...L?[{role:"assistant",content:oa}]:[]]` (`chunk-k8tzd51e.js:+70100`).
8. Build the assistant message record — id `Oe.ascending()`, `cost:0`,
   `tokens:{input:0,output:0,reasoning:0,cache:{read:0,write:0}}`, `time:{created:Date.now()}`
   (`chunk-k8tzd51e.js:+69340`). `o.updateMessage(G)` writes it *before* the model call, so
   partial output is always persisted.
9. Register an interrupt handler that marks the message `Aborted` (`DOMException("Aborted","AbortError")`,
   `aborted:!0`) and stamps `time.completed` (`chunk-k8tzd51e.js:+69480`).
10. Resolve system prompt parts in parallel via `s.all([...])`:
    `z.skills(agent)`, `z.environment(model)`, `K.system()`, `z.mcp(agent, permission)`,
    `Me.toModelMessagesEffect(history, model)` (`chunk-k8tzd51e.js:+69950`).
11. Call the model (`chunk-k8tzd51e.js:+70100`):
    ```js
    let tn = yield*p.process({user:X, agent:Y, permission:Q.permission, sessionID:t,
      parentSessionID:Q.parentID, system:uo, messages:[...], tools:oe, model:Z,
      toolChoice: Ie.type==="json_schema" ? "required" : void 0});
    ```
    `oe` is the resolved tool map; `p.process` is the provider call. Structured output
    (`X.format?.type==="json_schema"`) forces `toolChoice:"required"`.
12. If structured output completed (`U!==void 0`) → persist, return `"break"`.

**How tool results are fed back.** There is no separate "append tool result" step. The
provider stream handler writes each tool result into the session as a `tool` part
(`chunk-2tenmh09.js:+37900` and following), and the next loop iteration re-reads the whole
history with `Me.toModelMessagesEffect(C,Z)`. Tool output therefore re-enters the model
context only as converted messages, in the order the parts were persisted.

---

## 2. Tool definition / registration

Registration call shape (`chunk-xz32fdaq.js:+16700` for `glob`, `+17600` for `grep`):

```js
var xe = j("glob", s.gen(function*(){
  let o = yield* V.Service, e = yield* Uo.Service;
  return { description: Ee, parameters: Ns, execute: (r,t) => s.gen(function*(){ ... }) }
}))
```

So a tool is `j(name, Effect<{description, parameters, execute}>)`. `parameters` is a
**zod v4 struct**; descriptions are attached per-field with `.annotate({description:"..."})`:

```js
var Ns = p.Struct({
  pattern: p.String.annotate({description:"The glob pattern to match files against"}),
  path: p.optional(p.String).annotate({description:'The directory to search in. ... IMPORTANT: Omit this field to use the default directory. ...'})
})
```
(`chunk-xz32fdaq.js:+16100`)

No `name` field inside the object — the name is the first argument to `j(...)`.

### Built-in tool names

Canonical **default agent tool list** (`chunk-spc38nm7.js:+14183`):

```js
var nF = ["bash","read","edit","glob","grep","webfetch","task","todowrite","websearch","lsp","skill"]
```

The **TUI renderer registry** (authoritative list of everything the UI knows how to draw,
`chunk-8s17v29h.js:+11650`–`+12060`) has **18** entries:

```js
var _ = {
  invalid:{...}, bash:{...}, write:{...}, edit:{...}, apply_patch:{...}, batch:{...},
  task:{...}, todowrite:{...}, question:{...}, read:{...}, glob:{...}, grep:{...},
  list:{...}, lsp:{...}, webfetch:{...}, websearch:{...}, skill:{...}, plan_exit:{...}
};
```

| Tool | What it does | Evidence |
|---|---|---|
| `bash` | Runs a shell command (POSIX shell on Linux/macOS). ToolID literal is `"bash"`; kind normalizes `pwsh`/`powershell`/`cmd` | `chunk-1x59ktwm.js:+13900` (`ToolID:()=>Gi`, `Gi="bash"`), `chunk-1x59ktwm.js:+14000` (`toKind`) |
| `read` | Reads a file, returns content + line-number prefix | `chunk-8s17v29h.js:+1550` (`Read ${path}`) |
| `write` | Writes a whole file | `chunk-8s17v29h.js:+1610` |
| `edit` | Exact string replacement (`oldString`→`newString`, `replaceAll`) in an existing file | `chunk-xz32fdaq.js:+4700`, `+5180`–`+5545` |
| `apply_patch` | Applies a multi-file patch; renderer shows `Patch N files`, body from `metadata.diff` | `chunk-8s17v29h.js:+12043`, `+1740` |
| `glob` | Fast file-pattern matching, returns paths; hard limit 100 results | `chunk-xz32fdaq.js:+15475` (desc), `+16700` (`u=100`) |
| `grep` | Regex content search, returns path + line numbers | `chunk-xz32fdaq.js:+16600` (desc) |
| `list` | Lists a directory | `chunk-8s17v29h.js:+2210` (`List ${path}`) |
| `webfetch` | Fetches a URL | `chunk-xz32fdaq.js:+43048`; `chunk-8s17v29h.js:+2290` |
| `websearch` | Web search; provider name surfaces in the renderer title | `chunk-spc38nm7.js:+14254`; `chunk-8s17v29h.js:+2480` |
| `task` | Spawns a subagent (`subagent_type`, `description`, foreground/background) | `chunk-xz32fdaq.js:+31900`; `chunk-8s17v29h.js:+2630` |
| `todowrite` | Writes the todo list (`input.todos[]` with `content`/`status`) | `chunk-8s17v29h.js:+2790`; renderer maps `completed/in_progress/pending` to `[✓]/[•]/[ ]` |
| `todoread` | **not found** — no such tool in this build; only `todowrite` | searched `"todoread"` → 0 hits |
| `question` | Asks the user multiple-choice questions and returns answers | `chunk-1x59ktwm.js:+2400`–`+3300` |
| `skill` | Loads a skill by `name` | `chunk-8s17v29h.js:+2930` |
| `lsp` | LSP operation at a file position (`operation`, `filePath`, `line`, `character`) | `chunk-8s17v29h.js:+3080` |
| `batch` | Groups N tool calls; input is `{tool_calls:[...]}` | `chunk-8s17v29h.js:+11760` (`p(f(t.input).tool_calls).length` → ``Batch ${o} tools``) — registration site not located |
| `plan_exit` | Exits plan mode | `chunk-8s17v29h.js:+12060` |
| `invalid` | Sentinel renderer for unknown/failed tool frames | `chunk-8s17v29h.js:+11680` |
| `multiedit` | **not found** — removed; superseded by `edit`+`replaceAll` and `apply_patch` | searched `"multiedit"` → 0 hits |

MCP adds its own tools dynamically (see §8).

### Tool definition examples (verbatim schema shapes)

glob (`chunk-xz32fdaq.js:+16100`):
```js
p.Struct({ pattern: p.String.annotate({description:"The glob pattern to match files against"}),
           path: p.optional(p.String).annotate({description:"The directory to search in. ..."}) })
```

grep (`chunk-xz32fdaq.js:+17100`):
```js
p.Struct({ pattern: p.String.annotate({description:"The regex pattern to search for in file contents"}),
           path: p.optional(p.String).annotate({description:"The directory to search in. Defaults to the current working directory."}),
           include: p.optional(p.String).annotate({description:'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'}) })
```

`question` (`chunk-1x59ktwm.js:+2900`):
```js
var he = { question: p.String.annotate({description:"Complete question"}),
           header: p.String.annotate({description:"Very short label (max 30 chars)"}),
           options: p.Array(we).annotate({description:"Available choices"}),
           multiple: p.optional(p.Boolean).annotate({description:"Allow selecting multiple choices"}) }
// reply: { answers: p.Array(p.Array(p.String)) }  — one array of selected labels per question
```

MCP tool passed to the model (`chunk-k8tzd51e.js:+44000`) uses the **JSON-Schema** shape
instead of zod:
```js
tool = { description:"...", inputSchema: {type:"object", properties:{server:{type:"string",...}, uri:{...}},
         required:["server","uri"], additionalProperties:false},
         execute(u,W){...} }
```
Non-MCP tools are converted the same way at `chunk-k8tzd51e.js:+45600`:
`b.inputSchema = ve(ke.schema(model, {...Rl(b.inputSchema).jsonSchema, properties: ...}))`.

---

## 3. Tool result format, errors, truncation

### Success shape

Every built-in `execute` returns an object of this shape (see `glob`, `chunk-xz32fdaq.js:+16900`):

```js
{ title: <string>,                    // human label, e.g. path.relative(worktree, dir)
  metadata: { count, truncated, ... }, // UI-only
  output: <string>,                   // what the model sees
  attachments?: [ {type, ...} ] }
```

`bash` adds `exit` and optional `outputPath`:
```js
return {title: c.command, metadata:{output:w||Ze(B), exit:I, truncated:N, ...(N&&q?{outputPath:q}:{})}, output:B}
```
(`chunk-xz32fdaq.js:+3160`)

### Error representation

Tools `throw Error(...)` inside the Effect and the wrapper lets it propagate; the stream
layer converts it to a `tool` part with `state.status==="error"`. Concrete error strings
verbatim from the bundle:

- `glob`: `glob path must be a directory: ${n}` (`chunk-xz32fdaq.js:+16820`); empty result is
  **not** an error — it returns `"No files found"`.
- `grep`: `pattern is required` (`chunk-xz32fdaq.js:+17700`).
- `edit`: `oldString not found in content` and
  `Found multiple matches for oldString. Provide more surrounding context to make the match unique.`
  (`chunk-xz32fdaq.js:+15080`, `+15100`).
- `bash`: negative timeout → `Invalid timeout value: ${w.timeout}. Timeout must be a positive number.`
  (`chunk-xz32fdaq.js:+2990`).

The TUI error frame formats as `✖ ${t.name} failed` / `✖ ${t.name} failed: ${o}`
(`chunk-8s17v29h.js:+960`).

### Truncation

Owner: `@opencode/Truncate` service (`chunk-m7902nnw.js:+95250` onward).

```js
var Ue = o.String.check(o.isStartsWith("tool")).pipe(o.brand("ToolID"))   // +95270
var v  = We.join(W.Path.data,"tool-output")                              // +95400  storage dir
var He = C.days(7), R = 2000, X = 51200;                                 // +95450  TTL, MAX_LINES, MAX_BYTES
```

- **Defaults: 2000 lines / 51200 bytes** (`chunk-m7902nnw.js:+95460`).
- **Configurable**, read from the tool-output config file at call time:
  `d?.tool_output?.max_lines ?? R`, `d?.tool_output?.max_bytes ?? X`
  (`chunk-m7902nnw.js:+96300`, `Truncate.limits`).
- Direction defaults to `"head"`; iterates lines accumulating `Buffer.byteLength(line)`
  until the byte cap trips, so the byte cap can cut mid-list (`chunk-m7902nnw.js:+96650`).
- Truncated output is **written to disk** and the returned text is replaced by a message
  (`chunk-m7902nnw.js:+97300`), verbatim:
  ```
  The tool call succeeded but the output was truncated. Full output saved to: ${s}
  Use Grep to search the full content or Read with offset/limit to view specific sections.
  ```
  (when a `task` permission is not denied, the second line instead reads
  *"Use the Task tool to have explore agent process this file…"*)
- Body becomes `…N lines truncated…` / `…N bytes truncated…` depending on which cap tripped
  (`chunk-m7902nnw.js:+97150`, `+97450`).
- Files under `<data>/tool-output/tool_*` older than 7 days are swept hourly
  (`chunk-m7902nnw.js:+97900`: `e.repeat(ne.spaced(C.hours(1))), e.delay(C.minutes(1))`).
- `glob` has its own truncation, independent of the above: hard cap `u=100` results and the
  appended note `"(Results are truncated: showing first ${u} results. Consider using a more
  specific path or pattern.)"` (`chunk-xz32fdaq.js:+16930`).
- `bash` escalates before truncating: on truncation it writes the **full** output to the
  tool-output store (not just the truncated tail) and prefixes the returned text with
  `...output truncated...\n\nFull output saved to: ${q}\n\n` (`chunk-xz32fdaq.js:+3120`).
  Timeout and abort are reported out-of-band in a `<shell_metadata>` block, not as errors
  (`chunk-xz32fdaq.js:+3160`):
  ```
  <shell_metadata>
  shell tool terminated command after exceeding timeout ${c.timeout} ms. ...
  User aborted the command
  </shell_metadata>
  ```

---

## 4. Parallel tool calls

OpenCode does **not** fan out tool execution itself. Each provider turn's tool calls are
executed by the bundled Vercel AI SDK v5 runtime (`streamText` / `stopWhen` / `prepareStep`
live in `chunk-jj193ytb.js:+216479`, `+225380`), and opencode's per-tool wrapper
(`chunk-k8tzd51e.js:+45600`) simply runs `execute` for each call it is handed. There is no
`Promise.all` over tool calls in the session engine.

What opencode *does* control is **prompting** the model to emit multiple calls in one turn.
Verbatim from the system prompt (`chunk-c7rjensx.js:+60800`):

> If the user specifies that they want you to run tools "in parallel", you MUST send a single
> message with multiple tool use content blocks. For example, if you need to launch multiple
> agents in parallel, send a single message with multiple Task tool calls.

and the `bash` tool description (`chunk-1x59ktwm.js:+21300`):

> If the commands are independent and can run in parallel, make multiple bash tool calls in a
> single message. For example, if you need to run "git status" and "git diff", send a single
> message with two bash tool calls in parallel.

There is also an explicit `batch` tool whose input is `{tool_calls:[...]}` and whose UI label is
`Batch N tools` (`chunk-8s17v29h.js:+11760`) — i.e. grouping is a model-visible artifact, not a
scheduler feature. Ordering of results is by persisted part order; nothing in the bundle
re-orders tool parts.

Internal concurrency that *is* parallel is unrelated to tools: `s.forEach(_,_,{concurrency:"unbounded"})`
for message-part conversion (`chunk-k8tzd51e.js:+66200`) and `s.all([...])` for system-prompt
assembly (`chunk-k8tzd51e.js:+69950`).

---

## 5. Permission / approval model

Core service `@opencode/Permission` (`chunk-2tenmh09.js:+401378`). Rules are matched by
`g.match(permission, pattern)` with this resolver (`chunk-2tenmh09.js:+401330`):

```js
function c(j,J,...K){ return K.flat().findLast((z)=>g.match(j,z.permission)&&g.match(J,z.pattern))
                      ?? {action:"ask", permission:j, pattern:"*"} }
```

**Default is `ask`** for any unmatched permission+pattern.

`Permission.ask` (`chunk-2tenmh09.js:+401600`):

```js
K = A.fn("Permission.ask")(function*(X){
  let {approved:M, pending:T} = yield*H.get(J), {ruleset:$, ...Z} = X, _=!1;
  for(let Y of Z.patterns){
    let W = c(Z.permission, Y, $, M);
    yield* A.logInfo("evaluated", {permission:Z.permission, pattern:Y, action:W});
    if(W.action==="deny") return yield* new U.DeniedError({ruleset: $.filter((F)=>g.match(Z.permission,F.permission))});
    if(W.action==="allow") continue;
    _ = !0 }
  if(!_) return;                              // all patterns allowed → proceed silently
  let N = Z.id ?? U.ID.ascending();
  let O = {id:N, sessionID:Z.sessionID, permission:Z.permission, patterns:Z.patterns,
           metadata:Z.metadata, always:Z.always, tool:Z.tool};
  yield* A.logInfo("asking", {id:N, permission:O.permission, patterns:O.patterns});
  let G = yield* w.make();
  T.set(N, {info:O, deferred:G});
  yield* j.publish(S.Asked, O);               // event: permission.asked
  yield* A.ensuring(w.await(G), A.sync(()=>{ T.delete(N) }))
})
```

Semantics worth copying:

- **Per-pattern evaluation, deny wins.** Every pattern in the request is checked; a single
  `deny` aborts the whole call *before* any ask. `allow` for every pattern short-circuits
  with no prompt at all.
- **`always` is the escalation list.** Tools pass a broader pattern set for the "always
  allow" option, e.g. `grep` sends `{permission:"grep", patterns:[pattern], always:["*"]}`
  (`chunk-xz32fdaq.js:+17550`), while bash sends the derived command prefixes
  (`chunk-1x59ktwm.js:+35200`).
- **Reply** is `once` | `always` | `reject` (`chunk-2tenmh09.js:+402300`). `always` appends to
  the in-memory `approved` list; `reject` fails the deferred with `RejectedError`, or with
  `CorrectedError({feedback})` when the user supplies a message. A reject also clears **every
  other pending request in the same session** (`chunk-2tenmh09.js:+402500`).
- Unknown/expired request id → `Permission.NotFoundError`.

### Permission names in use

`read`, `edit`, `bash` (ToolID), `glob`, `grep`, `task`, `todowrite`, `external_directory`,
plus dynamic `mcp:<server>:<uri>` patterns. Examples:

```js
// external directory guard, applied by every path-taking tool
yield*o.ask({permission:"external_directory", patterns:[u], always:[u],
             metadata:{filepath:i, parentDir:y}})
```
(`chunk-xz32fdaq.js:+5000`, `Tool.assertExternalDirectory`; bash collects resolved dirs at
`chunk-1x59ktwm.js:+34500`)

```js
// bash
yield*o.ask({permission:lo.ToolID, patterns:Array.from(e.patterns),
             always:Array.from(e.always), metadata:{command:r.command}})
```
(`chunk-1x59ktwm.js:+35200`)

```js
// MCP resource read
yield*w.ask({permission:"read", metadata:{server:b.server,uri:b.uri},
             patterns:[`mcp:${b.server}:${b.uri}`], always:[`mcp:${b.server}:*`]})
```
(`chunk-k8tzd51e.js:+43100`)

### Per-agent rulesets and modes

Agents carry a ruleset `[{permission, pattern, action}]`. Subagents get a derived ruleset
(`chunk-xz32fdaq.js:+31600`) that denies the tools a read-only explorer must not have:

```js
function lt(o){
  let e = o.subagent.permission.some((t)=>t.permission==="task"),
      r = o.subagent.permission.some((t)=>t.permission==="todowrite");
  return [ ...o.parentSessionPermission.filter((t)=>t.permission==="external_directory"||t.action==="deny"),
           ...r?[]:[{permission:"todowrite",pattern:"*",action:"deny"}],
           ...e?[]:[{permission:"task",     pattern:"*",action:"deny"}] ] }
```

Session-level override (`chunk-k8tzd51e.js:+67400`) — a prompt may pass `tools:{name:bool}`,
which is rewritten into allow/deny rules:
```js
for(let [Q,C] of Object.entries(t.tools??{})) R.push({permission:Q, action:C?"allow":"deny", pattern:"*"});
if(R.length>0) O.permission=R, yield*o.setPermission({sessionID:O.id, permission:R});
```

Agent identity is `mode`/`name` on the assistant message (`mode:Y.name, agent:Y.name`,
`chunk-k8tzd51e.js:+69350`); plan mode exists as a separate agent plus the `plan_exit` tool
(`chunk-8s17v29h.js:+12060`). The literal mode strings `plan`/`build` were not found as a
hard-coded pair — modes are agent names, not an enum.

The TUI can auto-approve everything: `if(u.mode==="auto"){ U.client.permission.reply({requestID:Y.id, reply:"once"}) }`
(`chunk-mm5wgvmh.js:+10420`).

---

## 6. Streaming / rendering of tool state

### Provider-side event stream

The model stream is reduced to a normalized event queue in `chunk-2tenmh09.js:+36800`
(the `SessionRunner`). Events published on the bus, with exact names:

```js
OH.Step.Started        {sessionID, assistantMessageID, timestamp, snapshot}
OH.Text.Ended          {sessionID, assistantMessageID, timestamp, textID, text}
OH.Reasoning.Ended     {sessionID, assistantMessageID, timestamp, reasoningID, text, providerMetadata}
OH.Tool.Input.Started  {sessionID, timestamp, assistantMessageID, callID, name}
OH.Tool.Input.Ended    {sessionID, timestamp, assistantMessageID, callID, text}
OH.Step.Failed         {sessionID, timestamp, assistantMessageID, error:{type:"unknown", message}}
```
(`chunk-2tenmh09.js:+37100`–`+37600`)

The runner keeps a per-call state map and enforces a strict state machine, dying loudly on
protocol violations (`chunk-2tenmh09.js:+37400`):

```js
if(E.has(V.id)) return yield* M.die("Duplicate tool input start: "+V.id);
E.set(V.id,{assistantMessageID:R, name:V.name, inputEnded:!1, called:!1, settled:!1, providerExecuted:!1})
...
M.die(`${V} delta before start: ${X}`) / M.die(`${V} end before start: ${X}`)
M.die(`Tool input name changed for ${V.id}: ${R.name} -> ${V.name}`)
```

So a tool frame's lifecycle is **started → (deltas) → ended → called → settled**, and
`providerExecuted` marks calls the provider resolved server-side. `failUnsettledTools`
(`chunk-2tenmh09.js:+37900`) closes any call that never settled when the step fails.

### TUI frame shape

The renderer consumes a frame `{tool, callID, input, state, status, metadata}` where
`state.status` ∈ `pending`/`running`/`completed`/`error` (`chunk-8s17v29h.js:+13300`):

```js
function Ut(t){ let o=f(t.state); return {raw:"", name:t.tool, input:f(o.input),
  meta:"metadata"in t.state?f(t.state.metadata):{}, state:o,
  status:l(o.status), error:l(o.error)} }
```

Status → label (`chunk-8s17v29h.js:+1080`):
- error → `✖ ${name} failed` (or `✖ ${name} failed: ${msg}`)
- non-completed, non-error → raw running text
- completed → `${name} completed · ${title}`

Each tool has a `view` descriptor controlling whether output/diff/structured content is shown
and whether it is collapsed while running (`chunk-8s17v29h.js:+11700`), e.g.
`write:{view:{output:!1, final:!0, snap:"code"}}`, `edit:{view:{output:!1, final:!0, snap:"diff"}}`,
`todowrite:{view:{output:!1, final:!0, snap:"structured"}}`, `apply_patch:{..., snap:"diff"}`.

---

## 7. Provider abstraction (most important section)

Everything model-facing is the **Vercel AI SDK v5**, bundled into `chunk-jj193ytb.js`
(`streamText` at `+225380`, `stopWhen` at `+216479`, `prepareStep` at `+216554`). OpenCode's
own layer converts its zod tool map into AI SDK `tool({description, inputSchema, execute})`
objects (`chunk-k8tzd51e.js:+45600`) and converts history with `Me.toModelMessagesEffect`.

There are **two distinct reassembly paths**, because the two providers stream argument
fragments differently. Both produce the same normalized events
`tool-input-start` → `tool-input-delta` → `tool-input-end` → `tool-call`
(`chunk-568vr7rc.js:+94451`).

### 7a. OpenAI-compatible: `tool_calls[].function.arguments` string concat

`chunk-568vr7rc.js:+19000` (verbatim, de-minified in place only for readability):

```js
B.enqueue({type:"tool-input-start", id:T.id, toolName:T.function.name});
x[s] = { id: T.id, type:"function",
         function:{ name:T.function.name, arguments:(i=T.function.arguments)!=null?i:"" },
         hasFinished:!1 };
let M = x[s];
if(M.function?.name!=null && M.function?.arguments!=null){
  if(M.function.arguments.length>0)
    B.enqueue({type:"tool-input-delta", id:M.id, delta:M.function.arguments})
  continue                                  // first sighting: emit whole prefix, don't duplicate
}
let $Q = x[s];
if($Q.hasFinished) continue;
if(T.function?.arguments!=null)
  $Q.function.arguments += (e=(j=T.function?.arguments)!=null?e:"");   // <-- ACCUMULATION
B.enqueue({type:"tool-input-delta", id:$Q.id, delta:(N=T.function.arguments)!=null?N:""})
```

Note the two-branch design: the **first** delta for an index is treated as the full initial
string (and `continue`s), later deltas are appended. That guards against providers that
re-send the whole prefix.

Flush emits the completed call (`chunk-568vr7rc.js:+20000`):

```js
flush(H){
  if(q) H.enqueue({type:"text-end", id:"0"});
  for(let h of x) if(!h.hasFinished){
    H.enqueue({type:"tool-input-end", id:h.id});
    H.enqueue({type:"tool-call", toolCallId:(h.id ?? GQ()), toolName:h.function.name,
               input:h.function.arguments});      // <-- still a STRING here
    h.hasFinished = !0 }
  H.enqueue({type:"finish", finishReason:K, usage:ZW(f), ...(V!=null?{providerMetadata:V}:{})})
}
```

**`input` at this stage is the raw accumulated JSON string**, not a parsed object — parsing
happens downstream in the AI SDK layer.

An incremental-parse guard decides whether a chunk is worth forwarding at all
(`chunk-568vr7rc.js:+20300`):
```js
function oW(W){ if("error" in W) return !1;
  return W.choices.some((Y)=>{ let $=Y.delta;
    return ($?.content!=null&&$.content.length>0) || ($?.tool_calls!=null&&$.tool_calls.length>0)
        || ($?.annotations!=null&&$.annotations.length>0) }) }
```
Usage is mapped at `chunk-568vr7rc.js:+20500` (`prompt_tokens`→`inputTokens.total`,
`completion_tokens`→`outputTokens.total/text`; cache-read/write are left `undefined` for
OpenAI-compatible).

### 7b. Anthropic: `input_json_delta.partial_json`

The Anthropic path lives in the bundled official SDK (`chunk-m7902nnw.js:+183200`). Its
stream decoder switches on the delta type and re-emits a semantic event:

```js
case "content_block_delta": {
  let J = Y.content.at(-1);
  switch(X.delta.type){
    case "text_delta":        if(J.type==="text")     this._emit("text",     X.delta.text, J.text||""); break;
    case "citations_delta":   if(J.type==="text")     this._emit("citation", X.delta.citation, J.citations??[]); break;
    case "input_json_delta":  if(s7(J)&&J.input)      this._emit("inputJson", X.delta.partial_json, J.input); break;
    case "thinking_delta":    if(J.type==="thinking") this._emit("thinking", X.delta.thinking, J.thinking); break;
    case "signature_delta":   if(J.type==="thinking") this._emit("signature", J.signature); break;
    default: t7(X.delta) }
  break }
case "message_stop":      { this._addMessageParam(Y); this._addMessage(...); break }
case "content_block_stop":{ this._emit("contentBlock", Y.content.at(-1)); break }
```
(`chunk-m7902nnw.js:+183300`)

The key contrast with OpenAI: Anthropic deltas carry **no call id and no tool name** on the
delta — identity comes from the enclosing `content_block` index, and the SDK emits the
accumulated `J.input` alongside each `partial_json` fragment. The opencode layer therefore
never has to key by index itself; it receives `inputJson` events already associated with a
block, and the block is finalized at `content_block_stop`.

Provider-side reassembly differences to replicate:
- OpenAI-compatible → index-keyed map, string `+=`, id/name arrive on the first delta of each index.
- Anthropic → block-index scoped, `partial_json` fragments, name resolved at
  `content_block_start`, completion signalled by `content_block_stop`/`message_stop`.

### 7c. Tool schema conversion

Provider-specific JSON-Schema shaping happens through `ke.schema(model, jsonSchema)`
(`chunk-k8tzd51e.js:+44000` and `+45700`) — the model record drives the dialect. Tools
declared with zod are converted once via `Rl(inputSchema).jsonSchema`, then re-wrapped.
MCP tools skip zod entirely and supply `inputSchema` directly (their description strings are
provider-agnostic; see §8).

### 7d. JSON-schema (structured output) mode

When a prompt requests `format:{type:"json_schema"}`, opencode injects an extra tool and forces
`toolChoice:"required"` (`chunk-k8tzd51e.js:+70100`), then intercepts the result via
`oe.StructuredOutput = ia({schema, onSuccess(M){U=M}})` (`chunk-k8tzd51e.js:+69600`).

---

## 8. Retries, abort, timeouts, plugins/hooks, subagents, MCP

### Timeouts
- `bash` default: `(yield*to.Service).bashDefaultTimeoutMs ?? 120000` ms, per-call override via
  the `timeout` argument (`chunk-xz32fdaq.js:+1300`, `+3050`). Negative values throw.
- On timeout the process is killed (`D.kill({forceKillAfter:"3 seconds"})`) and the tool still
  **succeeds**, reporting through `<shell_metadata>` rather than as an error
  (`chunk-xz32fdaq.js:+2900`).
- MCP tools carry their own `W.timeout` (`Zh.convertTool(W.def, W.client, W.timeout)`,
  `chunk-k8tzd51e.js:+44700`).

### Abort
- Session interrupt marks the in-flight assistant message `Aborted` with
  `Me.fromError(new DOMException("Aborted","AbortError"), {providerID, aborted:!0})` and stamps
  `time.completed` (`chunk-k8tzd51e.js:+69480`).
- Tools receive `K.abortSignal`; on abort the wrapper force-settles the call so the UI cannot
  hang: `if(w.abortSignal?.aborted) yield*e.processor.completeToolCall(w.toolCallId, V)`
  (`chunk-k8tzd51e.js:+39800`, `+43400`).
- Bash distinguishes timeout from abort with the literal `"User aborted the command"`
  (`chunk-xz32fdaq.js:+2920`).
- Compaction/truncate cleanup loops are forked with `e.forkScoped` so they die with the scope.

### Retries
No explicit retry/backoff wrapper around tool execution was found in the session engine
(`not found`). Retry behaviour for the truncate cleanup is the only scheduled repetition
(`e.repeat(ne.spaced(C.hours(1)))`, `chunk-m7902nnw.js:+97900`).

### Plugin / hook system
Hooks are fired through `d.trigger(name, meta, payload)`; the payload is **mutable by hooks**
(it is passed by reference and returned). Verified hook points:

| Hook | Where |
|---|---|
| `tool.execute.before` | `chunk-k8tzd51e.js:+39400` |
| `tool.execute.after` | `chunk-k8tzd51e.js:+39500` |
| `chat.message` | `chunk-k8tzd51e.js:+66300` |
| `experimental.chat.messages.transform` | `chunk-k8tzd51e.js:+69900` |

```js
yield*i.trigger("tool.execute.before", {tool:u.id, sessionID:H.sessionID, callID:H.callID}, {args:b});
let h = yield*u.execute(b,H);
let V = {...h, attachments: h.attachments?.map((K)=>({...K, id:S.ascending(), sessionID:H.sessionID, messageID:e.processor.message.id}))};
yield*i.trigger("tool.execute.after", {tool:u.id, sessionID:H.sessionID, callID:H.callID, args:b}, V);
```
(`chunk-k8tzd51e.js:+39380`)

Note `tool.execute.before` receives a **mutable `{args}` object** (hooks can rewrite arguments),
and `tool.execute.after` receives the result by reference, so a hook can rewrite output.

### Subagent (`task`) tool
- Tool name literal `ir = "task"` (`chunk-xz32fdaq.js:+31800`); input includes `subagent_type`,
  `description`, and a `background` boolean.
- Background mode is a first-class branch — verbatim prompt text shipped with the tool
  (`chunk-xz32fdaq.js:+32000`):
  > `Background mode: background=true launches the subagent asynchronously and returns immediately.`
  > `Foreground is the default; use it when you need the result before continuing.`
  > `Use background only for independent work that can run while you continue elsewhere.`
  > `You will be notified automatically when it finishes.`

  and the result text:
  > `The task is working in the background. You will be notified automatically when it finishes.`
  > `DO NOT sleep, poll for progress, ask the task for status, or duplicate this task's work — avoid working with the same files or topics it is using.`
- Execution is a queue hop, not a recursive call: the loop pops `{type:"subtask"}` and calls
  `c({task, model, lastUser, sessionID, session, msgs})` then `continue`s
  (`chunk-k8tzd51e.js:+69150`).
- Subagents inherit a **derived** permission ruleset (`lt(...)`, §5) that denies `todowrite`
  and `task` unless the parent explicitly granted them.
- `deadline = 1/0` style: a subagent's own `steps` bound applies to its own loop.

### MCP integration
- Tools are injected into the same tool map with JSON-Schema inputs (`chunk-k8tzd51e.js:+44000`).
- Three opencode-owned MCP meta-tools exist (`chunk-k8tzd51e.js:+39500`–`+44000`):
  `list_mcp_resources` (`ro.list`), `list_mcp_resource_templates` (`ro.listTemplates`),
  `read_mcp_resource` (`ro.read`), with descriptions like *"Read a specific resource from an
  MCP server using the server name and resource URI."*
- External MCP tools are named with an `mcp:` namespace for permissions
  (`patterns:["mcp:"+server+":"+uri]`, `always:["mcp:"+server+":*"]`) and are discovered via
  `d.tools()` / `d.clients()` guarded by `getServerCapabilities()?.resources`.
- MCP status is part of the session state (`mcp:{}, mcp_resource:{}`,
  `chunk-mm5wgvmh.js:+9800`), and MCP servers are resolved into the system prompt via
  `z.mcp(agent, permission)` (`chunk-k8tzd51e.js:+69950`).
- `experimentalCodeMode` short-circuits MCP tool injection entirely
  (`chunk-k8tzd51e.js:+44600`: `if(k.experimentalCodeMode) return o;`).

---

## 9. Summary of file:offset index

| Topic | Locator |
|---|---|
| Agent loop `while(!0)`, step cap, exit conditions | `chunk-k8tzd51e.js:+68783` |
| Session prompt / system assembly | `chunk-k8tzd51e.js:+69950` |
| Tool exec wrapper + spans + hooks | `chunk-k8tzd51e.js:+45600` |
| Default tool list (11) | `chunk-spc38nm7.js:+14183` |
| TUI tool registry (18) | `chunk-8s17v29h.js:+11650` |
| glob/grep schemas + descriptions | `chunk-xz32fdaq.js:+15475`, `+16100`, `+16600`, `+17100` |
| edit schema + error strings | `chunk-xz32fdaq.js:+4700` |
| bash tool + timeout + metadata block | `chunk-xz32fdaq.js:+1300`, `+2900`, `+3160` |
| bash permission ask | `chunk-1x59ktwm.js:+35200` |
| ToolID / shell kinds | `chunk-1x59ktwm.js:+13900` |
| task/subagent ruleset + prompts | `chunk-xz32fdaq.js:+31600`, `+32000` |
| question tool schemas | `chunk-1x59ktwm.js:+2400`–`+3300` |
| Truncate service (limits, message, TTL) | `chunk-m7902nnw.js:+95250`–`+98400` |
| Permission engine | `chunk-2tenmh09.js:+401330`–`+402900` |
| SessionRunner event/state machine | `chunk-2tenmh09.js:+36800` |
| OpenAI tool-call delta accumulation | `chunk-568vr7rc.js:+19000`, flush `+20000` |
| Anthropic `input_json_delta` → `inputJson` | `chunk-m7902nnw.js:+183300` |
| AI SDK v5 `streamText`/`stopWhen`/`prepareStep` | `chunk-jj193ytb.js:+216479`, `+225380` |
| TUI permission store + auto mode | `chunk-mm5wgvmh.js:+9600`–`+10500` |

## 10. Gaps (explicitly not found)

- `todoread`, `multiedit` — do not exist in this build (0 hits for either literal).
- Registration site for the `batch` tool — renderer confirms input `{tool_calls:[...]}`, but the
  `j("batch", ...)` definition was not located.
- Hard-coded `plan`/`build` mode enum — modes are arbitrary agent names; only the
  `plan_exit` tool indicates plan mode as a distinct state.
- Retry/backoff policy around provider calls — handled inside the bundled AI SDK; not
  re-implemented in opencode's session engine.
