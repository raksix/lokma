# Hermes Agent Tool-Calling Engine — Technical Teardown

Source of truth: installed package on this machine (`/usr/local/lib/hermes-agent`, `hermes_agent 0.21.0`).
All claims cite `file:line`. Anything not located in the source is marked **not found**.

---

## 0. Where the code lives

`/usr/local/bin/hermes` is a thin shim; the engine is a plain source tree (not a zip/wheel import):

- Entry point / agent object: `run_agent.py` (`AIAgent`)
- Turn loop: `agent/conversation_loop.py:1479`
- Iteration accounting: `agent/iteration_budget.py:13`
- Tool registry (schemas + dispatch): `tools/registry.py`
- Tool-call execution: `agent/tool_executor.py`
- Result shaping (message envelope): `agent/tool_dispatch_helpers.py:369`
- Result budgeting / spillover: `tools/budget_config.py`, `tools/tool_result_storage.py`
- Batched-call planning (parallel vs sequential): `agent/tool_dispatch_helpers.py:133`
- Streaming + delta accumulation: `agent/chat_completion_helpers.py`
- Approval gates: `tools/approval.py`
- Hooks / plugins: `hermes_cli/plugins.py`

---

## 1. The agent loop

The loop is a `while` in `agent/conversation_loop.py:1479`:

```python
1479|    while (s.api_call_count < agent.max_iterations and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:
1480|        if _run_phase(begin_iteration, agent, s).action == "break":
1481|            break
1482|        _run_phase(prepare_iteration, agent, s)
1483|        _run_phase(assemble_api_request, agent, s)
1484|        _pg = _run_phase(run_preflight_gate, agent, s)
...
1507|        try:
1508|            _ri = _run_phase(normalize_model_response, agent, s)
...
1513|            _v = _run_phase(
1514|                run_tool_round if s.assistant_message.tool_calls else finish_text_response, agent, s
1515|            )
```
(`agent/conversation_loop.py:1479-1521`)

Shape of one iteration:

1. **Budget check** — loop condition consumes from `IterationBudget` (`agent/iteration_budget.py:22-28`). Cap is `agent.max_iterations`, default `sys.maxsize` at the constructor (`run_agent.py:238`) but documented effective defaults of **500** for the parent agent and **50** per subagent via `delegation.max_iterations` (`agent/iteration_budget.py:3-5`). Budget object is installed at `agent/agent_init.py:2245` and reset per turn at `agent/turn_context.py:474`.
2. **`begin_iteration` / `prepare_iteration` / `assemble_api_request`** phases (`agent/conversation_loop.py:1480-1483`).
3. **API retry loop** — `early_result = _run_api_retry_loop(agent, s)` (`agent/conversation_loop.py:1497`), with `s.max_retries = agent._api_max_retries` (`:1493`).
4. **Reply parsing** — `normalize_model_response` (`:1508`) turns the provider response into `s.assistant_message`. Tool calls are read off that normalized message: the branch test is literally `if s.assistant_message.tool_calls` (`:1514`). So parsing is **not** a text scan — it is attribute access on the normalized `AssistantMessage.tool_calls` list, populated by the streaming accumulator (§6) or by the non-streaming path.
5. **Dispatch** — tool calls go to `run_tool_round`; otherwise `finish_text_response` ends the turn (`:1513-1515`).
6. **Errors** — `handle_outer_loop_error` (`:1522-1524`).
7. Post-loop: `finalize_turn` (`:1526-1535`).

**Where results are appended.** Not in the loop — in the executor, at `agent/tool_executor.py:1021-1022`:

```python
1021|    tool_message = make_tool_result_message(function_name, _tool_content, tool_call_id, effect_disposition=effect_disposition)
1022|    messages.append(tool_message)
```

The tool-result dict shape is built in `agent/tool_dispatch_helpers.py:369-401`:

```python
385|    message = stamp_message_timestamp({
386|        "role": "tool",
387|        "name": name,
388|        "tool_name": name,
389|        "content": wrapped,
390|        "tool_call_id": tool_call_id,
391|    })
```
(`agent/tool_dispatch_helpers.py:385-391`)

Note the dual key: `name` is the OpenAI wire field, `tool_name` is Hermes' session-DB field (`:376-378`). Content for high-risk tools is wrapped in untrusted-data delimiters — tool names `web_extract`, `web_search`, and any name starting with `browser_` / `mcp_` (`agent/tool_dispatch_helpers.py:405-414`), with a 32-char floor (`:407`). Optional extra keys: `_tool_output_risk` and `effect_disposition` (`:398-400`).

---

## 2. Tool registration and schema

### 2.1 Mechanism — hand-written JSON Schema, NOT type hints

There is **no decorator** and **no type-hint → schema inference**. I searched for `@tool`, `register_tool`, `typing.get_type_hints`, `inspect.signature`, `pydantic`, `typed_dict` on the tool path — the only registration primitive is `registry.register(...)` and schemas are literal dicts authored next to the handler.

Class definition (`tools/registry.py:596-604`):

```python
596|    def register(
597|        self, name: str, toolset: str, schema: dict, handler: Callable,
598|        check_fn: Callable = None, requires_env: list = None, is_async: bool = False,
599|        description: str = "", emoji: str = "", max_result_size_chars: int | float | None = None,
600|        dynamic_schema_overrides: Callable = None, override: bool = False,
601|        scope: Optional[str] = None):
```

A registration stores a `ToolEntry` (`tools/registry.py:649-654`) with `schema`, `handler`, `check_fn`, `requires_env`, `is_async`, `max_result_size_chars`, `dynamic_schema_overrides`.

Notes on registration semantics:
- Shadowing a tool from another toolset is **rejected** unless `override=True` (`tools/registry.py:640-648`); plugin overrides additionally need operator opt-in (`:626-639`).
- Availability is dynamic: `check_fn` gates whether the tool is advertised at all (`tools/registry.py:770-773`).

### 2.2 The emitted wire schema

`get_definitions()` is the only serializer (`tools/registry.py:760-788`):

```python
774|            schema_with_name = {**entry.schema, "name": entry.name}
775|            # Runtime-dynamic overrides (e.g. delegate_task limits); ...
777|            if entry.dynamic_schema_overrides is not None:
...
786|                    schema_with_name.update(overrides)
787|            result.append({"type": "function", "function": schema_with_name})
```
(`tools/registry.py:774-788`)

So the **stored** schema is `{"name", "description", "parameters"}` and the **emitted** schema is the OpenAI function-tool envelope `{"type": "function", "function": {...}}`. `dynamic_schema_overrides` is a zero-arg callable returning a dict merged over the static schema at every call (`:777-786`) — used e.g. to inject the current `max_concurrent_children` limits into `delegate_task`.

### 2.3 Simple tool — exact JSON emitted for `show_tip`

Declared at `tools/tip_tool.py:36-69`, registered at `tools/tip_tool.py:77-81`:

```python
36|TIP_SCHEMA = {
37|    "name": "show_tip",
38|    "description": (
39|        "Point at one thing in the desktop UI with a small arrow bubble (no "
40|        "dimming, no tour chrome) — for when a sentence is clearer with a "
41|        "finger on its subject. Get selectors from tour(action='targets'), "
42|        "prefer stable:true, never guess. One tip at a time (new replaces "
43|        "last); say the same thing in chat too — the bubble is a pointer, "
44|        "not the message. Sparingly: a bubble every turn stops being read."
45|    ),
46|    "parameters": {
47|        "type": "object",
48|        "properties": {
49|            "text": {
50|                "type": "string",
51|                "description": "The one-sentence bubble text.",
52|            },
53|            "selector": {
54|                "type": "string",
55|                "description": "Selector from tour targets.",
56|            },
57|            "title": {
58|                "type": "string",
59|                "description": "Optional heading.",
60|            },
61|            "side": {
62|                "type": "string",
63|                "enum": list(SIDES),
64|                "description": "Omit for 'top'; flips at screen edges.",
65|            },
66|        },
67|        "required": ["text", "selector"],
68|    },
69|}
```
(`tools/tip_tool.py:36-69`)

```python
77|registry.register(
78|    name="show_tip", toolset="desktop_ui", schema=TIP_SCHEMA, check_fn=check_tips_enabled,
79|    handler=lambda args, **kw: tip_tool(
80|        **{k: args.get(k, "") for k in ("text", "selector", "title", "side")}),
81|    emoji="💡")
```
(`tools/tip_tool.py:77-81`)

Wire form on the request (`tools/registry.py:787`):

```json
{
  "type": "function",
  "function": {
    "name": "show_tip",
    "description": "Point at one thing in the desktop UI with a small arrow bubble (no dimming, no tour chrome) — ...",
    "parameters": {
      "type": "object",
      "properties": {
        "text":     {"type": "string", "description": "The one-sentence bubble text."},
        "selector": {"type": "string", "description": "Selector from tour targets."},
        "title":    {"type": "string", "description": "Optional heading."},
        "side":     {"type": "string", "enum": ["top", "..."]}
      },
      "required": ["text", "selector"]
    }
  }
}
```

### 2.4 Complex tool — `delegate_task`

Declared at `tools/delegate_tool.py:562-636`. Key structural features:

```python
562|DELEGATE_TASK_SCHEMA = {
563|    "name": "delegate_task",
564|    # description / tasks.description are placeholders: the real text is built per get_definitions() call by
565|    # _build_dynamic_schema_overrides() so the model sees the user's actual max_concurrent_children / max_spawn_depth.
567|    "description": (
568|        "Spawn one or more subagents in isolated contexts. "
569|        "Description is rebuilt at every get_definitions() call to reflect the user's current delegation limits."
570|    ),
571|    "parameters": {
572|        "type": "object",
573|        "properties": {
578|            "tasks": {
579|                "type": "array",
580|                "minItems": 1,
581|                "items": {
582|                    "type": "object",
583|                    "properties": {
584|                        "goal": _p("string", "What this subagent should accomplish. ..."),
589|                        "context": _p("string", "Background THIS child needs: file paths, ..."),
594|                        "output_schema": _p("object", "Optional JSON Schema this child's final answer must validate against ..."),
601|                        "group": _p("string", "Optional result-delivery bucket within this call; all tasks still run in parallel. ..."),
610|                    },
611|                    "required": ["goal"],
612|                },
613|                "description": "(rebuilt at get_definitions() time)",
614|            },
617|            "action": _p(
618|                "string",
619|                "Default 'spawn'. Live control of running children: ...",
625|                enum=["spawn", "list", "steer", "stop"],
626|            ),
627|            "subagent_id": _p("string", "Target for action='steer'/'stop' ..."),
628|            "message": _p("string", "For action='steer': the course correction, ..."),
633|        },
634|        "required": [],
635|    },
636|}
```
(`tools/delegate_tool.py:562-636`)

Things worth copying for a rewrite:
- **Nested array-of-object schema** with per-item `required` (`:578-612`).
- **`minItems` on the array** (`:580`) and an explicit comment that `maxItems` is deliberately *not* used — the runtime limit is enforced with a clear error instead (`:576-577`). Good pattern: don't make the model fight the schema.
- **Enum-constrained string for a mode switch** (`:617-626`).
- **`_p(type, description)` helper** to keep a large schema readable.
- **Deliberately unadvertised legacy fields** (`goal`/`context` at top level, `background`) are documented in comments as accepted-but-hidden (`:574-577`, `:615-616`).

### 2.5 Anthropic conversion

Anthropic wants `input_schema`, not `parameters`. Conversion is `agent/anthropic_message_convert.py:146-166`:

```python
161|        anthropic_tool: Dict[str, Any] = {
162|            "name": name, "description": fn.get("description", ""),
163|            "input_schema": _normalize_tool_input_schema(fn.get("parameters") or {}),
164|        }
165|        result.append(_carry_cache_control(anthropic_tool, t, copy=True))
```
(`agent/anthropic_message_convert.py:161-165`)

Two behaviours to note: duplicate tool names are **dropped with a warning** because Anthropic hard-400s on them (`:154-160`), and `cache_control` on the OpenAI tool dict is forwarded to the Anthropic tool (`:148`, `:165`). The transform is invoked from the transport layer at `agent/transports/anthropic.py:50-53`.

---

## 3. Tool result format returned to the model

### 3.1 Text, always — but with a multimodal escape hatch

Handlers return either a `str` or a multimodal envelope. The registry normalizes at the dispatch boundary:

> `_normalize_handler_result(name, result)` — "Results must be a string or the multimodal envelope; anything else becomes a ..." (`tools/registry.py:792-794`)

`handle_function_call` itself returns `str` (`model_tools.py:801-809`: *"Route a tool call through hooks/middleware to the registry; returns a JSON string"*). Multimodal dicts are converted to an OpenAI-style content list, with a string-safe fallback for text-only providers, at `agent/tool_executor.py:1018-1020`.

### 3.2 Success and error shapes

Success helper (`tools/registry.py:941-943`):

```python
941|def tool_result(data=None, **kwargs) -> str:
942|    """JSON-encode a dict positional arg *or* keyword arguments (not both)."""
943|    return json.dumps(data if data is not None else kwargs, ensure_ascii=False)
```

Error helper (`tools/registry.py:935-938`):

```python
935|def tool_error(message, **extra) -> str:
936|    """``'{"error": "<message>", **extra}'`` — the error body is bounded so a raw
937|    exception can't bloat history across retries."""
938|    return json.dumps({"error": _bound_error_text(str(message)), **extra}, ensure_ascii=False)
```

So a failure is **not** a distinct wire type — it is a normal tool message whose content is a JSON object with an `"error"` key. Handlers in practice also return plain prose errors (e.g. `tip_tool` returns `tool_error("tip is only available in the Hermes desktop app.")`, `tools/tip_tool.py:32`).

Error text is capped at **2048 chars** with a `"… [truncated]"` marker, while logs keep a longer 8192-char prefix (`tools/registry.py:25-38`):

```python
25|_MAX_TOOL_ERROR_CHARS = 2048
26|_TOOL_ERROR_TRUNCATION_MARKER = "… [truncated]"
28|_MAX_LOGGED_ERROR_CHARS = 8192
33|    if len(text) <= _MAX_TOOL_ERROR_CHARS:
34|        return text
...
38|    return text[:_MAX_TOOL_ERROR_CHARS] + _TOOL_ERROR_TRUNCATION_MARKER
```

There is a second guard for handlers that bypass `tool_error` and `json.dumps({"error": str(exc)})` directly — `_bound_json_error_result` trims the oversized `error` field at the dispatch boundary "to stop unbounded errors stacking across retries" (`tools/registry.py:41-44`).

### 3.3 Failure detection

`is_error` is derived from the result by `_detect_tool_failure(ref.name, result)` (`agent/tool_executor.py:1201`), not from an exception alone. Exceptions raised inside a tool are caught and stringified in place (`agent/tool_executor.py:1195-1197`):

```python
1195|        except Exception as tool_error:
1196|            result = f"Error executing tool '{ref.name}': {tool_error}"
1197|            logger.error("_invoke_tool raised for %s: %s", ref.name, tool_error, exc_info=True)
```

So a crashing tool yields a **valid tool result** reading `Error executing tool '<name>': <exc>` — the turn never breaks on a tool exception.

### 3.4 Truncation and large-output spillover

Two tiers, both in `tools/budget_config.py:11-18`:

```python
11|DEFAULT_RESULT_SIZE_CHARS: int = 100_000
12|DEFAULT_TURN_BUDGET_CHARS: int = 200_000
13|DEFAULT_PREVIEW_SIZE_CHARS: int = 1_500
18|DEFAULT_MCP_RESULT_SIZE_CHARS: int = 50_000
```

- **Per result**: over threshold → the full body is written to disk and the model gets a preview + path (`tools/tool_result_storage.py:192-208`):

```python
192|def maybe_persist_tool_result(content: str, tool_name: str, tool_use_id: str, env=None,
193|                              config: BudgetConfig = DEFAULT_BUDGET,
194|                              threshold: int | float | None = None) -> str:
195|    """Layer 2: persist an oversized result, return preview + path. ..."""
198|    if threshold is None:
199|        threshold = config.resolve_threshold(tool_name)
200|    if threshold == float("inf") or len(content) <= threshold:
201|        return content
```

- The replacement block is a delimited envelope with an explicit recovery instruction (`tools/tool_result_storage.py:163-178`):

```
163|def _build_persisted_message(preview: str, has_more: bool, original_size: int,
164|                             file_path: str) -> str:
165|    """Build the <persisted-output> replacement block."""
168|    return (
169|        f"{PERSISTED_OUTPUT_TAG}\n"
170|        f"This tool result was too large ({original_size:,} characters, {size_str}).\n"
171|        f"Full output saved to: {file_path}\n"
172|        "Use the read_file tool with offset and limit to access specific sections of this output.\n"
173|        "Recovery: page through the saved file with read_file (offset/limit) or "
174|        "process it with execute_code — do NOT re-request the same data from the "
175|        "remote API; the full result is already on disk.\n\n"
176|        f"Preview (first {len(preview)} chars):\n"
177|        + preview + ("\n..." if has_more else "")
178|        + f"\n{PERSISTED_OUTPUT_CLOSING_TAG}")
```

- **`read_file` is pinned to `inf`** so persist→read→persist cannot loop (`tools/budget_config.py:7-8`).
- **`mcp_` tools get a tighter 50K default** because MCP servers routinely return 20–50K un-paginated payloads (`tools/budget_config.py:15-20`).
- **Per-turn aggregate** enforcement runs after the whole batch: `enforce_turn_budget(messages[-num_tools:], ...)` (`agent/tool_executor.py:1036-1042`), and it deliberately runs **before** `/steer` injection so a user steer is never the thing that gets truncated (`:1037-1038`).
- If persistence fails entirely, it falls back to inline truncation (`tools/tool_result_storage.py:196-197`). Host-side spillover is written first and is "the single canonical home" (`:210-214`).

---

## 4. Parallel tool calls

Multiple calls in one assistant turn are planned into ordered segments, then each parallel segment runs on a thread pool.

### 4.1 Planning: which calls may run together

`_plan_tool_batch_segments(tool_calls, *, execution_cwd)` (`agent/tool_dispatch_helpers.py:133-142`):

> "Split a tool-call batch into ordered `("parallel"|"sequential", calls)` segments. Call order is preserved exactly (a later call never crosses an earlier barrier), so result order and side-effect boundaries match fully-sequential execution. Barriers: `_NEVER_PARALLEL_TOOLS`, unparseable/non-dict args, anything not parallel-safe. Path-scoped tools join a run only if they don't conflict with its reservations: reader↔reader overlap stays parallel; any overlap involving a writer closes the run so the call starts a NEW run after the conflicting one lands. Runs shorter than two calls demote to sequential (it owns the richer inline dispatch); adjacent sequential merge."

The allow/deny sets (`agent/tool_dispatch_helpers.py:28-40`):

```python
28|_NEVER_PARALLEL_TOOLS = frozenset({"clarify"})
30|# Read-only tools with no shared mutable session state.
31|_PARALLEL_SAFE_TOOLS = frozenset({
32|    "ha_get_state",
33|    "ha_list_entities",
34|    "ha_list_services",
35|    "image_generate",
36|    "read_file",
37|    "search_files",
38|    "session_search",
39|    "skill_view",
40|    "skills_list",
```

So parallelism is **whitelist-driven with a path-conflict resolver**, not "run everything at once".

### 4.2 Execution: bounded thread pool

```python
107|_MAX_TOOL_WORKERS = 8  # concurrent worker threads per batch
```
(`agent/tool_executor.py:107`)

```python
210|def _max_workers_for_tool_batch(runnable_calls) -> int:
214|    max_workers = _MAX_TOOL_WORKERS
216|        max_workers = min(max_workers, _image_generate_parallel_limit())
217|    return min(len(runnable_calls), max_workers)
```
(`agent/tool_executor.py:210-217`)

```python
1318|        max_workers = _max_workers_for_tool_batch([(i, None, self.parsed_calls[i].name) for i in runnable])
1320|        from tools.daemon_pool import DaemonThreadPoolExecutor
1321|        executor = DaemonThreadPoolExecutor(max_workers=max_workers)
```
(`agent/tool_executor.py:1318-1321`)

Workers are daemon threads so a hung tool cannot block interpreter exit. Submission is `executor.submit(propagate_context_to_thread(self.run_worker), i, submit_index)` (`agent/tool_executor.py:1233`) — turn `ContextVar`s and thread-local approval/sudo callbacks are propagated into each worker (`:1226-1228`).

**Start ordering.** Workers receive both their slot index and a `start_order` (`agent/tool_executor.py:1208-1223`) and gate on `_WorkerStartOnce(self.gate, start_order, pc.name)` (`:1216`), so call *order* is honoured for start-sensitive tools while execution overlaps. `start_gate.advance()` in `finally` keeps later-ordered workers moving even if an earlier one throws or the batch is abandoned (`:1222-1223`).

**Waiting.** `await_completion(...)` polls in 5-second slices with heartbeats and interrupt checks, against an optional deadline (`agent/tool_executor.py:1254-1264`). Timeout is resolved once per batch by `_resolve_concurrent_tool_timeout()` (`:161`, `:1418`).

**Interrupt short-circuit.** If the interrupt flag is set before dispatch, no tool runs at all; every call gets a synthesized result (`agent/tool_executor.py:1400-1409`):

```python
1400|    if agent._interrupt_requested:
1401|        print(f"{agent.log_prefix}⚡ Interrupt: skipping {num_tools} tool call(s)")
1402|        _append_skipped_tool_results(
...
1404|            content="[Tool execution cancelled — {name} was skipped due to user interrupt]",
1405|            hook_error_type="user_interrupt",
```

### 4.3 Result ordering — the important bit

**Results are appended in original call order regardless of completion order.** The batch is run to completion, then `_append_batch_results` walks slots in index order (`agent/tool_executor.py:1355-1358`):

```python
1355|def _append_batch_results(agent, messages: list, effective_task_id: str, batch: _ConcurrentBatch, budget: BudgetConfig) -> bool:
1356|    """Append every slot's result in original call order; returns False at the first
1357|    failed flush (the caller must stop the batch)."""
1358|    for i, pc in enumerate(batch.parsed_calls):
1359|        r = batch.results[i]
```

A worker that finished between the deadline snapshot and the append loop still wins over a fabricated timeout (`:1360-1366`). The batch aborts on the **first failed session-DB flush** (`:1378-1379`), and the sequential path's completion logging is deliberately different (`:1377`, `:1385-1386`).

### 4.4 Two more dispatchers

- `execute_tool_calls_sequential(...)` (`agent/tool_executor.py:1650`) — richer inline dispatch, used for single calls and for demoted segments.
- `execute_tool_calls_segmented(...)` (`agent/tool_executor.py:1707`) — owns turn-end work, which is why the concurrent entry point takes `finalize=False` to skip budget enforcement and `/steer` injection (`agent/tool_executor.py:1393-1395`).

---

## 5. Permission gating and hooks

### 5.1 The approval gate

Single shared decision core, `_run_approval_gate(...)` (`tools/approval.py:783-799`). Its documented order:

> "Order: yolo bypass → session-cache short-circuit → interactive/gateway/unattended branch → prompt → persistence. Input-shape checks (hardline, allowlist, pattern detection) are the caller's job. `fail_closed_when_no_human`: a non-interactive, non-gateway, non-cron context BLOCKS instead of auto-approving, so a plugin-flagged action never runs ungated."

```python
800|    # Hardline blocks are the caller's job BEFORE this gate, so yolo here only skips the recoverable approval layer.
801|    if _yolo_active():
802|        return _approved()
803|    session_key = get_current_session_key()
804|    if is_approved(session_key, pattern_key):
805|        return _approved()
806|
807|    approval_callback, is_cli, is_gateway, is_ask = _presence(approval_callback)
808|    if not is_cli and not is_gateway:
809|        log_args = (autoapprove_log_prefix, pattern_key, description)
810|        # Every unattended context resolves instantly — never a pending approval nobody can answer.
```
(`tools/approval.py:800-810`)

Key properties to copy:
- **Decisions are cached per session+pattern**, so approving a pattern once stops the re-prompt (`tools/approval.py:804`).
- **Unattended contexts never hang**: cron / `single_query` / unattended each have their own deny-or-approve mode (`:811-843`). A `single_query` approve-mode returns immediately *before* the fail-closed branch (`:825-830`, with the comment explaining why).
- **Fail-closed option for plugin-flagged actions** — blocks rather than auto-approving when no human is present (`:833-840`).
- Interactive/gateway cases fall through to `_human_decision(...)` with a `_GateSpec`/`_ACTION_GATE` (`:845-849`, `_human_decision` at `:643`).
- Operator `approvals.deny` rules are documented as never bypassable — not by yolo, not by mode=off, not by an isolated container (`tools/approval.py:860-863`).
- Container isolation skips the dangerous-command prompt, **except** Docker with host bind-mounts (`_should_skip_container_guards`, `tools/approval.py:852-857`).

Result dict shapes (`tools/approval.py:369-388`):

```python
369|def _approved() -> dict:
370|    return {"approved": True, "message": None}
373|def _denied(message: str, *, pattern_key: str, description: str, outcome: str, **extra) -> dict:
374|    """Standard non-consent result: the agent must not retry or rephrase."""
375|    return {"approved": False, "message": message, "pattern_key": pattern_key,
376|            "description": description, "outcome": outcome, "user_consent": False, **extra}
379|def _blocked(message: str, *, pattern_key: str, description: str) -> dict:
380|    """Non-interactive block (cron / -q / unattended / no-human): no consent keys."""
381|    return {"approved": False, "message": message, "pattern_key": pattern_key, "description": description}
384|def _user_approved(session_key: str, description: str) -> dict:
385|    """A human approval (incl. ESCALATE-then-approve or a smart-DENY owner
386|    override) resets the consecutive-denial tally."""
387|    _reset_denials(session_key)
388|    return {"approved": True, "message": None, "user_approved": True, "description": description}
```

The `denied` vs `blocked` distinction is worth stealing: `denied` carries `user_consent: False` and an `outcome` (a human said no — do not retry), `blocked` deliberately omits consent keys (nobody was asked).

### 5.2 The hook system

Hooks live in the plugin layer, `hermes_cli/plugins.py:107-108`:

```python
107|VALID_HOOKS: Set[str] = {
108|    "pre_tool_call", "post_tool_call", "transform_terminal_output", "transform_tool_result",
```

`pre_tool_call` is the **policy** hook and is dispatched once per call (`hermes_cli/plugins.py:1771-1839`, dispatcher at `:1874`):

```python
1874|def _dispatch_pre_tool_call_hooks(
...
1877|    """Invoke ``pre_tool_call`` hooks once; return ``(block_message, modified_args)`` — the resolved
```
(`hermes_cli/plugins.py:1874-1879`)

Two returns matter for a rewrite: a hook can **veto** with `{"action": "block", "message": ...}` (`hermes_cli/plugins.py:1776`) and it can **rewrite the args** (`:1877`). Invalid or irrelevant returns are silently ignored (`:1921`).

Timeout discipline is explicit and load-bearing (`hermes_cli/plugins.py:1673-1675`):

> "Hot-path / observer hooks in `_HOOK_TIMEOUT_BOUNDED_HOOKS` and the policy hook `pre_tool_call` are [not] joined) so we do not reintroduce the #6622 hang. Timed-out or still-running `pre_tool_call` callbacks [are not awaited]."

`post_tool_call` is emitted from the dispatch core, `model_tools.py:825-829`:

```python
825|    def _emit(result: Any, **extra: Any) -> Any:
826|        """Emit post_tool_call with this call's identity fields; returns *result*."""
827|        _emit_post_tool_call_hook(function_name=function_name, function_args=function_args, result=result,
828|                                  **asdict(ids), middleware_trace=list(trace), **extra)
829|        return result
```

Call identity is a `_CallIds` struct (`task_id, session_id, tool_call_id, turn_id, api_request_id`) — `model_tools.py:822`. In the executor, a worker emits `post_tool_call` itself with `duration_ms` unless the call was blocked or already dispatched (`agent/tool_executor.py:1199-1200`), and the worker's own exception path still records `is_error` from the stringified result (`:1201-1203`).

### 5.3 Dispatch ordering inside `handle_function_call`

`model_tools.py:801-860` is the canonical per-call pipeline, in order:

1. `coerce_tool_args(function_name, function_args)` then a dict guard (`model_tools.py:817-819`).
2. Legacy alias resolution: `function_name = _LEGACY_TOOL_ALIASES.get(function_name, function_name)` (`:821`).
3. **Tool Search bridge unwrapping** — `tool_search` / `tool_describe` are served inline, and `tool_call` is unwrapped and **re-entered recursively** so that "every downstream hook (pre/post, edit approval, guardrails) sees the real tool name, never the bridge" (`:831-844`).
4. Request middleware may rewrite args (`:846-848`).
5. Loop-owned tools are refused: `if function_name in _AGENT_LOOP_TOOLS: return tool_error(f"{function_name} must be handled by the agent loop")` (`:851-852`).
6. Pre-dispatch guards (`:854-857`), which return a `(result, error_type, error_message)` triple on block and are emitted with `status="blocked"` (`:856-857`).
7. A consecutive-read-loop counter is reset by any non-read/search tool (`:859-861`).

---

## 6. Streaming

### 6.1 OpenAI-compatible: `_ToolCallAccumulator`

`agent/chat_completion_helpers.py:2743-2804`. The docstring states the two real-world problems it exists to solve:

```python
2743|class _ToolCallAccumulator:
2744|    """Assemble streamed tool-call deltas into complete ``tool_calls`` entries
2745|    (``acc``: slot index -> entry dict). Ollama-compatible endpoints reuse index 0
2746|    for every call in a parallel batch, distinguishing them only by id, so a new
2747|    id at an already-seen raw index is redirected to a fresh slot."""
2748|
2749|    def __init__(self):
2750|        self.acc: dict = {}
2751|        self._notified: set = set()
2752|        self._last_id_at_idx: dict = {}      # raw_index -> last seen non-empty id
2753|        self._active_slot_by_idx: dict = {}  # raw_index -> current slot in acc
2754|        # Argument deltas are collected per slot and joined once in ``materialize`` —
2755|        # ``+=`` per chunk rebuilds the whole string every delta (quadratic on big args).
2756|        self._argument_parts: dict[int, list[str]] = {}
```

Three engineering decisions to lift directly:

**(a) Slot redirection handles providers that reuse `index`.** (`:2774-2779`)

```python
2774|        self._active_slot_by_idx.setdefault(raw_idx, raw_idx)
2775|        if delta_id and raw_idx in self._last_id_at_idx and delta_id != self._last_id_at_idx[raw_idx]:
2776|            self._active_slot_by_idx[raw_idx] = max(self.acc, default=-1) + 1
2777|        if delta_id:
2778|            self._last_id_at_idx[raw_idx] = delta_id
2779|        idx = self._active_slot_by_idx[raw_idx]
```

**(b) Arguments are buffered as string *parts* and joined once** — `parts.append(...)` per delta (`:2794`) and `"".join(parts)` in `materialize()` (`:2758-2762`). The comment at `:2754-2755` gives the reason: per-chunk `+=` is quadratic on large arguments. `materialize()` is idempotent.

**(c) The name is *assigned*, never concatenated** (`:2789-2792`):

```python
2789|            if getattr(tc_function, "name", None):
2790|                # Assignment, not +=: names arrive complete and some providers (MiniMax via
2791|                # NVIDIA NIM) resend the full name every chunk — += gives "read_fileread_file".
2792|                entry["function"]["name"] = tc_function.name
```

Other robustness details: `index=None` defaults to 0 (`:2766-2768`); integer ids are coerced to `str` because "Poolside sends integer ids" (`:2771-2772`); `extra_content` is recovered from both the attribute and Pydantic's `model_extra` (`:2795-2799`); and `feed()` returns the tool name exactly once per slot so the UI can announce a tool start without duplicate events (`:2800-2804`, `_notified` at `:2751`).

The stream loop consumes it at `agent/chat_completion_helpers.py:3135-3154`:

```python
3135|            delta_tool_calls = getattr(delta, "tool_calls", None)
3136|            if delta_tool_calls:
3137|                _flush_pending_stream_text()
3138|                for tc_delta in delta_tool_calls:
3139|                    name = tool_calls.feed(tc_delta)
3140|                    if name is not None:
3141|                        self._emit_tool_started(name)
3142|                        # Lets the stub-builder warn if streaming dies before the args
3143|                        # complete instead of silently discarding the action.
3144|                        self.result["partial_tool_names"].append(name)
3145|
3146|        tool_calls.materialize()
```

Note `_flush_pending_stream_text()` before tool-call deltas (`:3137`) and `partial_tool_names` — a record of tools announced but possibly never completed, so a mid-stream death produces a warning rather than a silent action loss (`:3142-3144`, `:2817`).

### 6.2 Anthropic: native accumulator, assembled by the SDK

The Anthropic path does **not** hand-assemble JSON. It observes events for UI callbacks (`has_tool_use` / `content_block_start` with `type == "tool_use"` → `_emit_tool_started`, `agent/chat_completion_helpers.py:3309-3314`) and then takes the fully assembled `Message` from `get_final_message()` (`:3324-3332`). Accumulation itself is delegated to `relay_llm.AnthropicStreamAccumulator()` wired in via `finalizer=accumulator.finalize, on_chunk=accumulator.observe` (`:3281`, `:3297-3301`).

Text before a tool call is suppressed: `if text and not has_tool_use: self._emit_text(text)` (`:3318-3321`).

**The Anthropic stream-drop guard is the most valuable idea in this section** (`agent/chat_completion_helpers.py:3246-3262`):

```python
3247|    def _check_anthropic_message(message, *, tool_drop: bool = True):
3248|        """Raise EmptyStreamError for a message the stream never completed: no
3249|        content and no stop_reason (eventless -> retry), or with ``tool_drop`` a
3250|        ``tool_use`` block and no stop_reason — the SSE closed mid tool call and
3251|        its input is a partial snapshot (usually ``{}``), so raising blocks the
3252|        empty-args execution (bounded retry, or stub/continuation after text)."""
3253|        content = getattr(message, "content", None)
3254|        if not content and getattr(message, "stop_reason", None) is None:
3255|            raise EmptyStreamError(
3256|                "Provider returned an empty stream with no stop_reason (possible upstream error or malformed event stream).")
3257|        if tool_drop and getattr(message, "stop_reason", None) is None and any(
3258|            getattr(block, "type", None) == "tool_use" for block in content or []):
3259|            raise EmptyStreamError(
3260|                "Stream ended with no stop_reason while a tool_use block was still incomplete; "
3261|                "treating as a mid-tool-call stream drop (#80498).")
3262|        return message
```

Without this, a dropped stream executes the tool with `{}` args — the classic silent-corruption failure mode.

### 6.3 Non-streaming fallback

If an adapter returns a complete response object for a `stream=True` request, Hermes **switches the session to non-streaming** and replays the content as synthetic deltas (`_adopt_final_response`, `agent/chat_completion_helpers.py:3156-3165`):

```python
3159|        logger.info("Streaming request returned a final response object instead of an iterator; "
3160|            "switching %s/%s to non-streaming for this session.", ...)
3162|        self.agent._disable_streaming = True
```

---

## 7. Robustness: retries, timeouts, interrupt, budget, compaction

### 7.1 Retries
- API retries are a distinct loop inside the iteration: `_run_api_retry_loop(agent, s)` (`agent/conversation_loop.py:1497`) preceded by `s.retry_count, s.max_retries = 0, agent._api_max_retries` (`:1493`). `apply_retry_restarts` can convert a retry outcome into `break`/`continue` (`:1501-1505`).
- Interrupt is checked inside the stream loop itself: `if self.agent._interrupt_requested: break` (`agent/chat_completion_helpers.py:3306-3307`).
- The streaming client has a request-local cancel flag so a worker recognizes its **own** interrupt force-close (`RemoteProtocolError`) and exits instead of retrying (`agent/chat_completion_helpers.py:2819-2821`).
- A superseded stream attempt raises an explicit error so stale data cannot be adopted: `raise _httpx.RemoteProtocolError(f"stream attempt {stream_attempt_id} was superseded")` (`agent/chat_completion_helpers.py:3148-3149`).
- Concurrency has its own failure contract: on interpreter shutdown, unsubmitted tools get synthesized error results instead of raising (`agent/tool_executor.py:1225-1249`).

### 7.2 Timeouts
- Concurrent-tool deadline: `_resolve_concurrent_tool_timeout()` (`agent/tool_executor.py:161`, used at `:1418`), enforced by polling `await_completion(...)` in 5s slices (`:1254-1264`).
- A worker that finishes after the deadline snapshot still beats a fabricated timeout at append time (`agent/tool_executor.py:1360-1366`).
- Streaming has a **stale-connection detector** driven by `last_chunk_time` (`agent/chat_completion_helpers.py:2825-2829`), which distinguishes SSE-ping-only connections from real chunks.
- Hook timeouts are bounded and *not joined* on the hot path — a hung hook must not hang the turn (`hermes_cli/plugins.py:1673-1675`).

### 7.3 Interrupt
- Pre-dispatch: none of the batch runs; all calls get cancellation messages (`agent/tool_executor.py:1400-1409`).
- Mid-flight: worker thread ids are tracked and individually interrupted — `_interrupt_worker_tids(agent, [_worker_tid], reason=...)`, applied at worker registration *and* re-applied if an interrupt fanned out before registration (`agent/tool_executor.py:1211-1214`).
- Tool-timeout results are distinguishable from interrupt results via `_unfinished_tool_result(..., timed_out=..., timeout_s=...)` (`agent/tool_executor.py:1364-1366`).

### 7.4 Iteration and context budget
- `IterationBudget` is a plain thread-safe consume/refund counter (`agent/iteration_budget.py:13-44`). `consume()` returns `False` at the cap (`:22-28`); `refund()` exists specifically so **programmatic tool calls (`execute_code`) iterations don't eat the budget** (`:14-15`, `:30-34`).
- The loop's condition combines both counters: `s.api_call_count < agent.max_iterations and agent.iteration_budget.remaining > 0` (`agent/conversation_loop.py:1479`), plus a `_budget_grace_call` that permits exactly one extra call — the mechanism that lets a model deliver a final answer when the budget just ran out (`:1479`).
- Per-agent budgets scale with delegation: the parent cap is not shared with children (`agent/iteration_budget.py:3-5`).

### 7.5 Compaction interaction with tool history
`compress_after_tool_results(...)` is the post-tool-call compaction decision (`agent/turn_preflight.py:240-251`):

> "Post-tool-call compression decision. Pressure comes from API-reported `prompt_tokens` (a tight lower bound; thinking models inflate completion tokens), `0` right after compression (no real count yet), else the route-aware overhead-inclusive estimate. Over threshold but blocked → deduped warning plus the deterministic **tool-result-only prune**, committed only when the engine returns a NEW list (never rebuild `conversation_history` for it)."

The critical rule for a rewrite: there is a **deterministic tool-result-only prune** as the first-line reduction, and the engine must return a *new* list for the prune to be committed — the caller never rebuilds `conversation_history` itself (`agent/turn_preflight.py:250-251`). Real usage decides: the anchor is the provider's last `prompt_tokens` plus a rough delta for only the tool results appended since (the raw `last_prompt_tokens` ignores them); after a compaction there is no real count yet, and the schema-heavy rough estimate is explicitly *not* treated as pressure (`:266-270`).

Compression exhaustion is a first-class turn outcome: the result is rewritten with `error=_COMPRESSION_TIMEOUT_FINAL_RESPONSE, partial=True, compression_exhausted=True` while the transcript stays intact (`agent/conversation_loop.py:1531-1534`).

### 7.6 Things the executor does that are easy to miss
- Results are **flushed to the session DB immediately** after append, and a failed flush stops the batch — resume can reconstruct state (`agent/tool_executor.py:1023-1024`, `:1355-1357`).
- A `tool.completed` projection fires only **after** the canonical append + flush, so a UI bridge crash cannot lose the result (`agent/tool_executor.py:1026-1032`).
- Subdirectory hints are computed per call and appended to the result — onto the text summary part when the result is multimodal, so image blocks are untouched (`agent/tool_executor.py:1010-1016`).
- Untrusted-content wrapping happens **once at construction** (cache-safe), with the elision notice appended to the raw content *before* wrapping so it sits inside the untrusted block next to the data it describes (`agent/tool_dispatch_helpers.py:382-384`).
- Delimiters are matched case-insensitively so a differently-cased tag cannot forge or prematurely close the boundary (`agent/tool_dispatch_helpers.py:409-410`).
- `_maybe_append_elision_notice` exists because some MCP servers elide data **server-side** and mark it inside a structurally complete payload, so the model treats the visible slice as the whole dataset — "conservative explicit markers only — not a generic truncation heuristic" (`agent/tool_dispatch_helpers.py:421-424`).

---

## 8. Summary of transferable design decisions

1. **Schemas are authored, not inferred.** Hand-written dicts with rich descriptions; no type-hint magic. Dynamic fields are injected per-request via a callable (`tools/registry.py:777-786`).
2. **Tool failures are valid tool results**, stringified and truncated to 2 KB, never exceptions across the loop boundary (`tools/registry.py:935-938`, `agent/tool_executor.py:1195-1197`).
3. **Large outputs spill to disk** with a preview + recovery instruction, and `read_file` is pinned to infinity to break the loop (`tools/budget_config.py:7-8`, `tools/tool_result_storage.py:163-178`).
4. **Parallelism is planned, not assumed** — a whitelist plus a path-conflict resolver produces ordered parallel/sequential segments; results are appended in call order (`agent/tool_dispatch_helpers.py:133-142`, `agent/tool_executor.py:1355-1358`).
5. **Streamed tool calls need a stateful accumulator** that survives index reuse, integer ids, repeated names, and quadratic concatenation (`agent/chat_completion_helpers.py:2743-2804`).
6. **A truncated stream must not execute a tool with empty args** — assert on `stop_reason`/`tool_use` and raise (`agent/chat_completion_helpers.py:3246-3262`).
7. **Approval results distinguish "a human said no" from "nobody was there"** and never leave a pending prompt in an unattended context (`tools/approval.py:369-388`, `:808-843`).
8. **Budget accounting is refundable** so programmatic tool calls don't starve the loop, and a grace call lets the model answer after the last iteration (`agent/iteration_budget.py:30-34`, `agent/conversation_loop.py:1479`).

## 9. Not found
- No decorator-based tool registration (`@tool` / `def tool(...)`) — registration is an imperative `registry.register(...)` call (`tools/registry.py:596`).
- No type-hint → JSON-Schema inference anywhere on the tool path (searched `get_type_hints`, `inspect.signature`, `pydantic`, `TypedDict` under `tools/` and `agent/`) — **not found**.
- No global `max_iterations` constant equal to the constructor default; `run_agent.py:238` is `sys.maxsize` with effective caps documented as 500/50 in `agent/iteration_budget.py:3-5` — a single named module-level cap constant was **not found**.
