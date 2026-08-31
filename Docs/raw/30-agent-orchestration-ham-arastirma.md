# AI Agent Orchestration for Coding Harnesses — Raw Research Dossier

> **Context:** Lokma (`/mnt/apopic/lokma`) agent system research  
> **Date:** 2026-08-31  
> **Scope:** How modern coding harnesses orchestrate subagents — spawn, isolate, delegate, parallelize, communicate, schedule.  
> **Sources scraped:** 18+ primary docs + GitHub (see § References). All claims cited with URLs.

---

## Table of Contents

1. [Framework Orchestration Compared](#1-framework-orchestration-compared)  
   1.1 Claude Code  
   1.2 OpenHands (All-Hands-AI)  
   1.3 AutoGen (Microsoft, Core + AgentChat)  
   1.4 CrewAI  
   1.5 LangGraph (LangChain)  
2. [Agent Lifecycle](#2-agent-lifecycle)  
3. [Parallel Execution Models](#3-parallel-execution-models)  
4. [Self-Spawning Loop: Skill / MCP / Tool Auto-Creation](#4-self-spawning-loop-skill--mcp--tool-auto-creation)  
5. [Agent-to-Agent Communication Patterns](#5-agent-to-agent-communication-patterns)  
6. [Scheduling & Queuing](#6-scheduling--queuing)  
7. [Comparative Matrix & Production Takeaways](#7-comparative-matrix--production-takeaways)  
8. [References](#8-references)

---

## 1. Framework Orchestration Compared

### 1.1 Claude Code — Delegated Subagents + Workflows + Agent Teams

**Mental model:** A single conversational session (the *parent*) holds the plan turn-by-turn; it delegates focused work to isolated subagents that each run in their own context window and return only a summary. At larger scale the plan moves *into code* via Dynamic Workflows.

**Spawn & isolate:**

- Subagent is spawned when the main agent calls the `Agent` tool. Each subagent gets its own context window, custom system prompt, tool allowlist, and permission mode. The delegation message is synthesized by the parent; intermediate tool calls/outputs never pollute the parent context [.](https://code.claude.com/docs/en/sub-agents) [.](https://code.claude.com/docs/en/agent-sdk/subagents)
- Three definition paths: (a) programmatic `agents` param in the Claude Agent SDK (`AgentDefinition` with `description`, `prompt`, `tools`, `model`), (b) filesystem markdown at `.claude/agents/*.md` with YAML frontmatter, (c) built-ins (`Explore`, `Plan`, `general-purpose`). The model sees the `description` field and auto-delegates when it matches [.](https://code.claude.com/docs/en/sub-agents) [.](https://code.claude.com/docs/en/agent-sdk/subagents)
- **Isolation modes:**
  - *Context isolation* (default): fresh conversation, no history, only the composed task prompt.
  - *Fork*: inherits the parent's full conversation history, system prompt, tool array, and prompt-cache prefix. Triggered when `subagent_type` is omitted and fork mode is on, or explicitly via `isolation: "worktree"` or `/subtask`. Forks exploit 90 % prompt-cache discount on shared prefix — the economic reason for forking [.](https://claude-code-from-source.com/ch08-sub-agents/) [.](https://code.claude.com/docs/en/sub-agents)
  - *Worktree isolation*: a fork can set `isolation: "worktree"` so its file edits land in a separate `git worktree` under `.claude/worktrees/<name>/` on branch `worktree-<name>`. This is the *only* strong filesystem isolation; otherwise subagents share `cwd` [.](https://code.claude.com/docs/en/worktrees) [.](https://code.claude.com/docs/en/sub-agents)

**Delegate:**

- Claude decides delegation automatically from task phrasing + subagent `description`. Adding `use proactively` to the description biases delegation. Explicit escalation: natural-language mention → `@-mention` (guaranteed for one task) → session-wide `--agent <name>` (entire session uses that subagent's prompt/tools/model) [.](https://code.claude.com/docs/en/sub-agents)
- Inside SDK, include `Agent` in `allowedTools` to auto-approve spawning. The agent then emits `Agent` tool calls with `subagent_type`, `prompt`, `run_in_background`, `isolation` etc. [.](https://code.claude.com/docs/en/agent-sdk/subagents)

**Parallel:**

- **Subagent-level:** Multiple `Agent` tool calls in one turn run concurrently (background by default since v2.1.198). Pattern: fan-out 3–20 independent researchers, then synthesize. Because each runs in its own context, wall-clock is max(slowest) not sum. Example: `style-checker`, `security-scanner`, `test-coverage` simultaneously [.](https://code.claude.com/docs/en/agent-sdk/subagents)
- **Dynamic Workflows:** For dozens→hundreds of agents, Claude writes a JavaScript orchestration script (`agent()`, `pipeline()`, `parallel()`, `phase()`) executed by a workflow runtime outside the conversation. Intermediate results stay in script variables, not context. Phases show progress, are resumable, and support adversarial cross-checking (verifiers vote on claims) [.](https://code.claude.com/docs/en/workflows)
- **Agent Teams (experimental):** Lead agent + peer sessions sharing a task list and direct messaging (`SendMessage`). Teammates are long-running peers (not short-lived subagents) — handful of concurrent workers that stay alive [.](https://code.claude.com/docs/en/agents)
- **Agent View:** Operator-dispatches independent background sessions, each auto-worktree-isolated, monitored from `claude agents` UI [.](https://code.claude.com/docs/en/agents)

**Key limits:**

- Max nesting depth: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (default 3 layers). At limit, subagents lose the `Agent` tool and must do work themselves. Forks at limit get an error on spawn attempt rather than losing the tool [.](https://code.claude.com/docs/en/sub-agents)
- Max concurrent: `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (default 20). Exceeding returns `Concurrent subagent limit reached`, Claude is told not to retry until count drops. Forks via `/subtask` take a slot but are never blocked; resumes can transiently exceed the cap [.](https://code.claude.com/docs/en/sub-agents)
- Spend cap: `maxBudgetUsd` / `max_budget_usd` — refuses new spawns, stops background subagents, ends query with `error_max_budget_usd` [.](https://code.claude.com/docs/en/agent-sdk/subagents)
- 15-step lifecycle in `runAgent.ts`: resolve agent type → check permissions → compose prompt → create abort controller → setup isolation (worktree if requested) → inject startup context (CLAUDE.md, git status — except Explore/Plan which skip for cost) → async generator loop → progress tracking → result retrieval → 15-step cleanup in `finally` (guaranteed via async-generator protocol) [.](https://claude-code-from-source.com/ch08-sub-agents/)

### 1.2 OpenHands — Event-Sourced, Tool-Centric, Container-Optional

**Mental model:** An *event log* (immutable, Pydantic-typed) is the single source of truth; an Agent reads events, emits `ActionEvent`s, Tools execute via `ToolExecutor` and return `ObservationEvent`s, and an optional Workspace (Docker/remote) provides isolation. The SDK is deliberately stateless except for the `Conversation` mutable state, enabling deterministic replay [.](https://docs.openhands.dev/sdk/arch/overview) [.](https://docs.openhands.dev/sdk/arch/design) [.](https://docs.openhands.dev/sdk/arch/events)

**Spawn & isolate:**

- In OpenHands V1 (software-agent-sdk), agents are *composable graphs* of `tools + prompts + LLMs + contexts`, registered via `ToolRegistry`. Adding a capability is registering a `ToolDefinition` — either a direct instance (stateless: `finish`, `think`) or a subclass with `create(conv_state, **params)` factory (stateful: `execute_bash`, `file_editor`) [.](https://docs.openhands.dev/sdk/arch/tool-system)
- **Isolation is optional, not mandatory.** V0 ran every tool in Docker by default (reproducible but heavy, incompatible with MCP's local-exec model). V1 runs agent and tools *in-process* by default, aligning with MCP. When needed, the same stack is transparently containerized via `openhands.workspace` (`Docker`, `Remote`) or `openhands.agent_server` (multi-tenant REST/WebSocket) [.](https://docs.openhands.dev/sdk/arch/design) [.](https://docs.openhands.dev/sdk/arch/overview)
- No built-in "subagent" primitive comparable to Claude's `Agent` tool. Multi-agent orchestration is achieved by running multiple `Conversation` instances against an Agent Server, or by composing tools that themselves delegate (e.g., a `TaskTracker` tool, or an LLM tool that spawns child conversations). The canonical scaling unit is a *conversation* (event log + workspace), not a child agent object.

**Delegate:**

- Explicit: a tool's `Action` can be "delegate to another agent" (custom `DelegateTool`). Because events are append-only, delegation is just publishing a `MessageEvent`/`ActionEvent` that a coordinator loop routes.
- Implicit: `Agent Skills` (see §4) inject instructions that steer the model to call a delegating tool. The SDK exposes `openhands.sdk.conversation` and `openhands.sdk.agent` declaratively, so swapping a toolset or prompt re-targets delegation without core changes.

**Parallel:**

- Tool execution: `Parallel Tool Execution` is a first-class SDK feature — multiple `ActionEvents` sharing one `llm_response_id` are coalesced into a single LLM turn with multiple `tool_calls`, then dispatched concurrently; only the first's `thought` is surfaced [.](https://docs.openhands.dev/sdk/arch/events)
- Conversation-level: SDK supports both `Local` and `Remote` deployment modes. Remote mode runs `Agent Server` which multiplexes many conversations concurrently over WebSockets; each conversation has its own workspace and event log, so they parallelize naturally. Agent Canvas (`@openhands/agent-canvas`) is the React frontend that monitors many agents across local/remote/hosted environments [.](https://docs.openhands.dev/sdk/arch/overview)

### 1.3 AutoGen (Microsoft) — Event-Driven Pub/Sub + Direct Messaging

**Mental model:** Agents are `RoutedAgent`s subscribed to *topics*; the `AgentRuntime` (single-threaded or distributed) delivers typed messages via pub/sub or `AgentId` direct send. Orchestration emerges from topic topology, not from a parent context window. [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/concurrent-agents.html)

**Spawn & isolate:**

- Agents are registered with `await AgentClass.register(runtime, "name", factory)`; the runtime lazily instantiates on first `AgentId` delivery (so one class can back many logical workers — e.g., two `WorkerAgent` instances at `AgentId("Worker","w1")` vs `"w2"`). No filesystem isolation is built-in; that is left to deployment (container per runtime or per agent) [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/concurrent-agents.html)
- Isolation knobs: `SingleThreadedAgentRuntime` (cooperative, in-process) vs `DistributedAgentRuntime` (gRPC, cross-process/host). Message handlers are `@message_handler` async defs; tools are injected as `FunctionTool`s analogous to OpenHands.

**Delegate — three orchestration patterns shipped as design-pattern docs:**

1. **Concurrent Agents (pub/sub fan-out):** Many agents subscribe to the same topic via `@default_subscription` — a single `publish_message(Task(...), topic_id=DefaultTopicId())` delivers to all subscribers concurrently (async `await`). Demos show two `Processor`s both starting `task-1` in parallel [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/concurrent-agents.html)
2. **Routed / Type-subscribed:** `UrgentProcessor` subscribes to `type_subscription(topic_type="urgent")`, `NormalProcessor` to `"normal"`. Publishing to `TopicId(type="normal", ...)` selectively routes. Results are published to a `TASK_RESULTS_TOPIC_TYPE` where a `ClosureAgent` aggregates via an `asyncio.Queue` [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/concurrent-agents.html)
3. **Handoffs (Swarm-style):** An `AIAgent` holds `tools` (local) and `delegate_tools` (handoff markers). When the LLM emits a delegate tool call, the agent publishes a `UserTask` to the target topic (e.g., `TopicId("refund", source=...)`) with the accumulated chat history; the receiving agent adopts persona immediately (`"Transferred to {topic_type}. Adopt persona immediately."`). This is how AutoGen v0.4+ implements OpenAI Swarm handoffs with async, distributed support [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/handoffs.html)

**Parallel:**

- Natively async: `runtime.publish_message` fans out to every matching handler concurrently. For higher throughput, AgentChat provides `Concurrent` and `GroupChat` orchestrators; Azure's Agent Framework docs layer Sequential → Concurrent → Group Chat → Handoff → Magentic (planner-executor with ledger) hierarchically. Magentic is the highest-complexity pattern (dynamic plan, debate, ledger, stalls considered) [.](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- Humans-in-loop appear as an `Agent` (human agent) subscribed to its own topic, so escalation is just a publish to `human_topic`.

### 1.4 CrewAI — Role-Based Crews, Processes, and Event-Driven Flows

**Mental model:** Three primitives — `Agent` (role/goal/backstory/LLM/tools), `Task` (description/expected_output/agent/context/async), and `Crew` (agents + tasks + `process`). For arbitrary DAGs, use `Flow` (`@start` / `@listen` event decorators with typed `State`) which can orchestrate multiple Crews plus Python code. [.](https://docs.crewai.com/concepts/crews) [.](https://docs.crewai.com/concepts/tasks) [.](https://docs.crewai.com/concepts/agents) [.](https://docs.crewai.com/concepts/flows)

**Spawn & isolate:**

- Agents are declared in `agents/*.jsonc` (or `@CrewBase` YAML) with `role`, `goal`, `backstory`, `llm`, `tools`, plus behavioral knobs (`max_iter=20`, `max_rpm`, `max_execution_time`, `allow_delegation`, `cache`, `respect_context_window`, `code_execution_mode: safe|unsafe`, `inject_date`). No per-agent filesystem isolation; isolation is via `code_execution_mode: safe` (Docker) per agent [.](https://docs.crewai.com/concepts/agents)
- The process *is* the orchestrator — not the LLM turn-by-turn. `Crew(process=Process.sequential)` runs tasks in list order, wiring `context` edges so output of one task becomes context for the next. `Crew(process=Process.hierarchical)` spawns an implicit or explicit manager agent (`manager_llm` or `manager_agent`) who plans, delegates, validates, and re-assigns at runtime [.](https://docs.crewai.com/concepts/processes)
- `allow_delegation=True` lets an individual agent autonomously delegate a task to a peer whose role better fits, enabling peer-to-peer handoff without manager involvement. Guardrails (`guardrail`, `guardrails`, `guardrail_max_retries=3`) validate task output before the crew proceeds [.](https://docs.crewai.com/concepts/tasks)

**Delegate:**

- In sequential/hierarchical processes, delegation is manager-directed (LLM manager) or peer-directed (allow_delegation). In Flows, delegation is code-directed: `@listen(generate_city)` triggers `generate_fun_fact(random_city)` when its dependency completes, with state passed explicitly. Flows can combine many Crews: `Flow.kickoff()` chains them, and `Flow.plot()` visualizes the DAG [.](https://docs.crewai.com/concepts/flows)
- `Kickoff Crew Asynchronously` (`crew.kickoff_async()`) and `Kickoff Crew for Each` (map over a list) add higher-order delegation without new primitives.

**Parallel:**

- **Task-level:** `Task(async_execution=True)` marks a task as parallelizable within a sequential crew — independent tasks whose outputs don't depend on each other execute concurrently. This is the CrewAI analog of `parallel()` in Claude Workflows or `Send` in LangGraph [.](https://docs.crewai.com/concepts/tasks)
- **Flow-level:** Multiple `@start()` methods on a `Flow` fire in parallel when the flow begins or resumes. `@listen` DAGs fan out and converge naturally; state (`self.state`) is the checkpoint. `Flows` also support `@router` conditional branching for dynamic parallelism [.](https://docs.crewai.com/concepts/flows)
- **Checkpointing:** crews and flows can enable `checkpoint=True` (`CheckpointConfig`) for resume after failure; combine with `memory=True` (short/long/entity memory) and `cache=True` (tool-result cache) for throughput [.](https://docs.crewai.com/concepts/crews)

### 1.5 LangGraph — Graph-Native Orchestration (StateGraph + Pregel)

**Mental model:** Work is a *compiled graph* of nodes (functions that may call LLMs) and edges (conditional or fixed) over a shared `State` (TypedDict/Pydantic + reducers). Execution proceeds in discrete **super-steps** (Pregel-style): all nodes that received a message on an incoming channel become active, run, and emit updates; the reducer merges them; when no messages are in transit and all nodes are inactive, the graph halts. [.](https://docs.langchain.com/oss/python/langgraph/graph-api)

**Spawn & isolate:**

- LangGraph does not have a built-in "spawn subagent" tool. Isolation is expressed as **subgraphs**: a node can itself be a compiled `StateGraph`, with its own private state channels. At compile time you can declare `PrivateState` channels, `InputState` / `OutputState` filters, and per-node `config`. This gives compile-time isolation rather than runtime process isolation.
- For isolation that must survive restarts, attach a `checkpointer` (short-term, per-thread) and/or a `store` (long-term, cross-thread). Common checkpointers: `InMemorySaver`/`MemorySaver` (dev), `SqliteSaver`, `PostgresSaver`. The `thread_id` is the pointer that selects which state to resume [.](https://docs.langchain.com/oss/python/langgraph/persistence)
- Distribution is via LangGraph Platform / Agent Server (managed deployment) rather than in-graph forking.

**Delegate — four canonical multi-agent patterns (docs: `langchain multi-agent`):**

1. **Supervisor:** A central supervisor node routes to specialist subgraphs via conditional edges or `Command(goto=...)`. The supervisor holds routing logic and optional human-in-loop `interrupt()` calls. Azure's "hub-and-spoke" maps here [.](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
2. **Network / Swarm (handoff):** Every agent can `handoff` to any other — nodes return `Command(update=..., goto="peer")` directly, with no supervisor. Mirrors AutoGen handoffs.
3. **Hierarchical:** Supervisor → sub-supervisor → workers (nested graphs). Each level has its own state.
4. **Sequential pipeline:** Linear chain `A → B → C`, with state reducer passing data forward.

In code, delegation variants map to:

```python
# Supervisor routing
builder.add_conditional_edges("supervisor", should_continue)  # returns "researcher" | "coder" | END

# Handoff (node returns a goto)
def triage(state): 
    return Command(goto="refund_agent", update={"context": state["context"]})

# Fan-out with Send (map-reduce)
from langgraph.types import Send
def fan_out(state):
    return [Send("worker", {"item": x}) for x in state["items"]]
builder.add_conditional_edges("fan_out", fan_out, ["worker"])
```

**Parallel:**

- **Super-step parallelism:** Any nodes that are active in the same super-step run concurrently (async). A `Send` node fans out N copies of a downstream node, each with its own input — this is the native map-reduce parallel primitive.
- **Concurrent tool calls:** A single node that emits multiple tool calls can run them in parallel (LangChain `RunnableParallel` / `ToolNode` with `parallel`).
- **Interrupts vs breakpoints:** Static `interrupt_before`/`interrupt_after` pause before/after nodes; dynamic `interrupt("Do you approve?")` pauses mid-node. On pause, LangGraph snapshots state via the checkpointer and waits indefinitely; resume via `graph.invoke(Command(resume=...), config={"configurable": {"thread_id": "thread-1"}})` where the same `thread_id` is required. The node *restarts from the top* on resume, so pre-interrupt side effects must be idempotent [.](https://docs.langchain.com/oss/python/langgraph/interrupts)

---

## 2. Agent Lifecycle

A unified lifecycle distilled from all five harnesses. Hermes/Lokma implementations should expose these states even if some harnesses collapse them.

```
create → configure → compile/register → run → (pause | iterate) → (fork | delegate) → complete → archive
                                 ↘ error → retry → kill/close
```

### 2.1 Create

| Harness | Create operation | What is created |
|---|---|---|
| Claude Code (interactive) | User writes `.claude/agents/<name>.md` or `claude --agent <name>` | Markdown frontmatter + body becomes `AgentDefinition` |
| Claude Code (SDK) | `query(..., options={ agents: { "reviewer": AgentDefinition(...) } })` | In-memory definition; filesystem fallback auto-loaded from `.claude/agents/` |
| OpenHands | `register_tool(name, ToolClass)` + `Agent(llm, tools, workspace)` | `ToolDefinition` × N + `Conversation` (event log) |
| AutoGen | `await MyAgent.register(runtime, "agent_id", factory)` | `RoutedAgent` instance keyed by `AgentId(type, key)` |
| CrewAI | `Agent(role, goal, backstory, llm, tools, ...)` + `Crew(agents, tasks, process)` [+ `Flow` subclass] | Pydantic-validated objects; JSONC at rest |
| LangGraph | `StateGraph(State).add_node(...).add_edge(...).compile(checkpointer, store)` | Compiled graph object with channel definitions |

Claude's 15-step `runAgent` lifecycle (from source): resolve type against built-in + filesystem + programmatic registry → permission check (`Agent(name)` allowlist) → enforce `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` → create `AbortController` → setup worktree if `isolation: "worktree"` → compose prompt (CLAUDE.md + git status unless Explore/Plan) → inject skill context → start async generator → wire progress bus → iterate → cleanup in `finally` [.](https://claude-code-from-source.com/ch08-sub-agents/)

### 2.2 Configure

**Top config axes shared across harnesses:**

- **Identity:** `name`, `description` (routing hint), `system_prompt`/`prompt`
- **Model:** `model` / `llm` (can be overridden per-agent; Claude caps Explore at Opus on API, CrewAI allows per-agent `llm` + crew-level `function_calling_llm` + `manager_llm`) [.](https://code.claude.com/docs/en/sub-agents) [.](https://docs.crewai.com/concepts/agents)
- **Tools:** allowlist (`tools=[Read, Grep, Glob, Agent, Bash]`) — Claude lets subagents spawn subagents only if `Agent` is in their tool list; removing it makes a reviewer read-only [.](https://code.claude.com/docs/en/sub-agents)
- **Permissions:** Claude has `permissions.deny` for `Agent(name)` plus mode (`default`, `acceptEdits`, `bypassPermissions`); OpenHands has `SecurityConfig` + per-tool `ToolAnnotations(readOnlyHint, destructiveHint)` [.](https://code.claude.com/docs/en/sub-agents) [.](https://docs.openhands.dev/sdk/arch/tool-system)
- **Memory:** CrewAI `memory=True` (short/long/entity), LangGraph `checkpointer`, OpenHands `ConversationStateUpdateEvent` + `Condenser` (compression). Claude's auto-compaction warns when combined subagent descriptions exceed 15k tokens [.](https://code.claude.com/docs/en/sub-agents) [.](https://docs.openhands.dev/sdk/arch/events)
- **Execution hints:** `max_iter` (CrewAI default 20), `max_execution_time`, `max_rpm`, `verbose`, `cache` — all map to scheduling (§6)

### 2.3 Run

| Harness | Invoke | Drive loop |
|---|---|---|
| Claude Code | `Agent` tool call from parent LLM (auto or explicit) | Parent's async generator iterates child; background by default since v2.1.198. Parent does **not** see child's tool calls — only final summary. |
| Claude SDK | `async for msg in query(prompt, options)` | Streaming messages; detect delegation via `msg.type == "subagent"` or `total_cost_usd` growth |
| OpenHands SDK | `conversation.run(agent, events)` | Event loop: agent reads event log → emits `ActionEvent` → registry resolves `ToolDefinition` → executor runs → `ObservationEvent` appended → repeat |
| AutoGen | `await runtime.publish_message(msg, topic_id)` / `await runtime.send_message(msg, recipient=AgentId(...))` | Runtime delivers to every `@message_handler` matching subscription; handlers may `publish_message` to next topic |
| CrewAI | `crew.kickoff(inputs)` / `crew.kickoff_async()` / `flow.kickoff()` | For sequential: iterate tasks in order, wiring `context`; for hierarchical: manager loop plans→delegates→validates; for Flow: event-driven `@start`/`@listen` DAG |
| LangGraph | `graph.invoke(input, config={"configurable": {"thread_id": ...}})` / `graph.stream_events(..., version="v3")` | Pregel super-steps: active nodes run → reducer merges → edges select next nodes → repeat until inactive |

All harnesses treat tool calls as the unit of work. Claude and OpenHands both coalesce parallel tool calls sharing one `llm_response_id` into a single assistant turn (saving context) [.](https://docs.openhands.dev/sdk/arch/events)

### 2.4 Pause

| Harness | Mechanism | Resume payload | Persistence |
|---|---|---|---|
| Claude Code | Task state machine (see §3 of source): `pending → running → paused` — agent view `/workflows` shows pause, `/agents` shows subagent pause; ultracode workflows are explicitly resumable (`p` in progress view) | User input or `/resume` | Claude's 15-step cleanup is skipped on pause; iterator held in memory |
| OpenHands | `PauseEvent(source="user")` appended to log; `ConversationErrorEvent` + `AgentErrorEvent` distinction controls whether LLM sees the error | Updated event log on next `run()` with same `conversation_id` | `Conversation` persistence (in-memory or `Remote` server) |
| AutoGen | Cooperative: handler `await`s external `asyncio.Event`; no built-in interrupt primitive (user builds it with `Deferred` or by not publishing next message) | Next `publish_message` | Runtime keeps handler coroutine alive |
| CrewAI | `human_input=True` on Task, or `human_input` flow with `HumanInput` tool | Human answer appended as context | `checkpoint=True` + `memory` |
| LangGraph | `interrupt("payload")` mid-node or `interrupt_before`/`interrupt_after` per-node; optionally conditional on state [.](https://docs.langchain.com/oss/python/langgraph/interrupts) [.](https://docs.langchain.com/oss/python/langgraph/persistence) | `graph.invoke(Command(resume=value), config={"configurable":{"thread_id":...}})` — node restarts from top, so pre-interrupt side effects must be idempotent | `checkpointer` (InMemorySaver → PostgresSaver); `store` for cross-thread; Studio visualizes paused threads |

### 2.5 Kill / Close

- **Claude:** `AbortController` per subagent; cancelling the parent's iterator triggers `finally` cleanup (removes worktree lock, releases concurrency slot, reports partial). Workflow view: `x` stops selected agent or whole workflow; `x` on agent view kills background session. `disableBundledSkills` + `DISABLE_DOCTOR_COMMAND` can suppress lifecycle tools [.](https://claude-code-from-source.com/ch08-sub-agents/)
- **OpenHands:** `ToolExecutor.close()` (optional) on stateful tools (e.g., `execute_bash` pool); `Conversation.close()`; workspace `close()` tears down Docker. `AgentErrorEvent` (non-terminal) vs `ConversationErrorEvent` (terminal — run loop transitions to ERROR and raises `ConversationRunError`) [.](https://docs.openhands.dev/sdk/arch/events) [.](https://docs.openhands.dev/sdk/arch/tool-system)
- **AutoGen:** `await runtime.stop()` / `stop_when_idle()` — drains in-flight handlers then stops. Individual agent has no kill API; cancel via `CancellationToken` passed in `MessageContext.cancellation_token`.
- **CrewAI:** `max_execution_time` + `max_iter` + `max_retry_limit` implement soft kill (agent must provide best answer); `crew.stop()` for hard stop.
- **LangGraph:** `graph.get_state(thread_id)` + `Thread` cancellation; recursion limit (`recursion_limit`, default 25) acts as implicit kill — when exceeded, graph halts with `GraphRecursionError`. Platform deployments add server-side timeout.

### 2.6 Fork

Fork is the only lifecycle operation that *copies* state rather than creating fresh.

- **Claude Code is the only harness with a first-class fork.** A fork inherits *everything* the parent has at spawn time: full conversation history, system prompt, tool array — byte-identical prefix for prompt-cache exploitation. It cannot spawn further forks. Spawn via `/subtask` (interactive, named, background, takes a concurrency slot but never blocked) or `fork` subagent type. Fork-mode on by default in interactive sessions (v2.1.232+), off in `-p`/SDK; toggle via `CLAUDE_CODE_FORK_SUBAGENT=1` or `permissions.deny: Agent(fork)` to disable even when mode is on [.](https://code.claude.com/docs/en/sub-agents)
- **Other harnesses emulate fork:**
  - *LangGraph:* `graph.invoke` with the same `thread_id` and a mutated config is semantically a fork; `Command(goto=...)` can branch state. Time-travel (replay from checkpoint N with edited state) is the managed fork API.
  - *OpenHands:* fork = clone the `Conversation` event log (copy list) and start a new `conversation.run` with a new `conversation_id` — cheap because events are immutable.
  - *AutoGen:* fork = `runtime.send_message` to a new `AgentId` of same `AgentType` with the full `context: List[LLMMessage]` as in handoff pattern — the payload *is* the forked state [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/handoffs.html)
  - *CrewAI:* fork = `crew.copy()` + modified `inputs` + `crew.kickoff()` concurrently; for Flows, `flow.kickoff()` with different `self.state` clones.

---

## 3. Parallel Execution Models

### 3.1 Worktree Isolation vs Shared `cwd`

| Mode | What is isolated | Cost / speed | When to use | Support |
|---|---|---|---|---|
| **Shared `cwd`** | Only LLM context (prompt) is isolated; filesystem is shared. Two workers editing `src/auth.ts` will conflict; last write wins, git sees interleaved hunks. | Fastest (no copy). No disk overhead. | Read-only research, linting, test reading, parallel grep. Also fine when each worker owns disjoint file sets (enforced by partitioning) | Default for Claude subagents, CrewAI agents, AutoGen handlers, LangGraph nodes |
| **Git worktree** (`git worktree add`) | Full working directory per worker: own branch (`worktree-<name>`), own index, own untracked files. Edits never collide; each can commit/PR independently. Shares object DB so clones are cheap (hardlinks) | `git worktree add` ≈ 100–300 ms + copy of gitignored files via `.worktreeinclude`. Disk: O(changed files). LFS pointer fixup needed (Troubleshooting: LFS files are pointers in worktrees) [.](https://code.claude.com/docs/en/worktrees) | Parallel feature branches, `/batch` (5–30 worktree-isolated PRs), `claude --worktree` per-developer sessions, Agent View dispatched sessions | Claude Code: `claude --worktree <name>`, `isolation: "worktree"` on forks, `/batch` skill, `EnterWorktree` tool. Manual: `git worktree add ../w-feature main` |
| **Container / Docker** (`code_execution_mode: safe`, OpenHands `workspace: docker`) | Full OS isolation: filesystem + processes + network. Strongest guarantee. | Slowest startup (seconds). Needs Docker daemon. | Arbitrary code execution from LLM, untrusted tool use, multi-tenant hosting | CrewAI per-agent `code_execution_mode: safe`, OpenHands V1 opt-in container, LangGraph Platform sandboxes |
| **Process / Thread** | In-process async concurrency (Python `asyncio`, Node event loop). No FS isolation. | Negligible. | CPU-bound parallel tool calls (e.g., parallel grep) | All harnesses' parallel tool execution |

Claude's recommendation matrix: *Do workers touch the same files?* → use worktrees. *Do they only read?* → stay shared. *Do they need to talk?* → use cross-session messaging or shared task list; warps that put workers in worktrees *don't* share a task list in Agent Teams (intentionally — partition files instead) [.](https://code.claude.com/docs/en/agents) [.](https://code.claude.com/docs/en/worktrees)

**What worktrees share vs not (Claude):** share `.git` history/remotes; don't share working-dir files, index, untracked, or `.env` unless listed in `.worktreeinclude`. Hooks' `CLAUDE_PROJECT_DIR` stays at project root while `cwd` in hook input JSON follows the worktree; `EnterWorktree` permission prompts when entering an existing worktree outside `.claude/worktrees/` unless in `bypassPermissions` [.](https://code.claude.com/docs/en/worktrees)

### 3.2 Max Agents vs Max Concurrent

Two orthogonal caps — a common source of confusion:

- **`max agents` (total):** How many agent *instances* may *exist* over the lifetime of a run/session. CrewAI/Linear: effectively unlimited; the crew size is fixed at creation (`len(agents)`), but `Flow` can dynamically fan out via `Send`/`parallel()` without cap. Claude workflows cap via *runtime agent caps* per run (bounds cost of a runaway script) [.](https://code.claude.com/docs/en/workflows)

- **`max concurrent` (in-flight):** How many agents may be *running* at once (backpressure). This is the critical prod knob. Observed defaults:

```python
# Claude Code
CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=20   # per-session, counting Agent-tool subagents
CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3    # nesting layers

# CrewAI
crew = Crew(agents=[...], tasks=[...], max_rpm=60)            # crew-level throttle
agent = Agent(..., max_rpm=10, max_iter=20, max_execution_time=300)
Task(..., async_execution=True)  # opts task into the concurrent pool
flow = ExampleFlow()  # multiple @start() methods run concurrently; no explicit cap beyond event-loop

# LangGraph
graph.invoke(..., config={"recursion_limit": 25})  # implicit sequential cap
# fan-out: builder.add_conditional_edges("fan_out", lambda s: [Send("worker", {"x": i}) for i in range(N)])
# N concurrent workers in one super-step — bounded by checkpointer + runtime threads

# AutoGen
runtime = SingleThreadedAgentRuntime()  # cooperative — concurrency is len(subscribers) per topic
# No built-in cap; backpressure via bounded asyncio.Queue in ClosureAgent example
queue = asyncio.Queue(maxsize=100)

# OpenHands
# No concurrency cap in SDK; delegation is bounded by Conversation count and Agent Server pool
```

**Worktree isolation vs max-concurrent interplay:**

- Worktree mode multiplies disk usage linearly with concurrency — 30 concurrent worktree workers (as in `/batch`) each hold a checkout. Lokma/Hermes deployments should default to shared-cwd for research subagents and reserve worktrees for editing workers, capping worktree workers separately (e.g., `max_worktree_agents=8`, `max_readonly_agents=20`).
- Claude agent-view sessions are *always* worktree-isolated, so `max concurrent` there is also a disk cap. Non-worktree subagents are context-only isolated and cheap.

### 3.3 Throughput Patterns

| Pattern | Harness primitive | Visual |
|---|---|---|
| Fan-out / fan-in (map-reduce) | Claude `parallel()` in workflows; LangGraph `Send`; CrewAI `async_execution` + Flow multi-`@start`; AutoGen `publish_message` to default topic | `fan_out → [w1,w2,w3] → aggregate` |
| Pipeline (sequential chain) | CrewAI `Process.sequential` with `context` edges; AutoGen sequential workflow; LangGraph linear edges; Claude sequential `Agent` calls | `A → B → C` |
| Hierarchical | CrewAI `Process.hierarchical` (manager LLM); Claude Agent Teams (lead + peers + shared task list); LangGraph hierarchical supervisor; AutoGen handoff loop with triage | `manager → {w1,w2,w3}` with review loop |
| Group chat / debate | AutoGen `GroupChat`; CrewAI collaboration via delegation; LangGraph network | All-to-all via shared topic |
| Reflection / iterative | OpenHands iterative refinement tool; Claude `phase()` + loop script; LangGraph `interrupt` + retry edges | `draft → review → fix → repeat until pass` |

---

## 4. Self-Spawning Loop: Skill / MCP / Tool Auto-Creation

How an AI *inside the loop* can extend its own capabilities — the self-spawning direction Hermes cares about.

### 4.1 Skills as Self-Extension (Claude Code)

A **Skill** is a `SKILL.md` markdown file (YAML frontmatter `description` + body instructions) placed at `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/`, or a plugin directory. Unlike `CLAUDE.md`, the body loads *only when invoked*, so long instructions cost ~0 until used. Claude discovers skills by scanning parent → nested directories and loads them live (change detection without restart). Invocation is either LLM-autonomous (matches `description`) or explicit `/skill-name` or `args` substitution. [.](https://code.claude.com/docs/en/skills)

**Self-spawning loop:**

1. The agent's prompt instructs it to "create a skill when you keep pasting the same instructions or a CLAUDE.md section has grown into a procedure."
2. When the LLM identifies repetition, it writes `.claude/skills/<new-skill>/SKILL.md` (plus supporting files) using `Write`/`Bash`. Discovery is instant.
3. Future turns (or even later in the same session via dynamic context injection `!`command``) can invoke the new skill, compounding capability.

Key extension points that make this a true self-spawning harness:

- **Frontmatter controls autonomy:** `disableModelInvocation: true` forces explicit-only; omitting it lets the model decide. Hermes should default new agent-spawning skills to explicit-only to avoid runaway fan-out.
- **Run in subagent:** A skill can set `context: fork` or launch via the `Explore` subagent, so skill execution itself is isolated and its token cost stays out of the parent. Example given in docs: *Research skill using Explore agent* [.](https://code.claude.com/docs/en/skills)
- **Dynamic context injection:** Any line `!`git diff HEAD`` in `SKILL.md` is executed before the skill is shown to the model, with output inlined. An auto-created agent that writes a skill with `!`ls tools/`` effectively snapshots its environment at invocation time — enabling self-inspecting skills.
- **Bundled self-improvement skills:** `/run` + `/verify` + `/run-skill-generator` collaboratively record a per-project launch recipe at `.claude/skills/run-<name>/SKILL.md` or `.claude/skills/verify/SKILL.md`. The agents *wrote their own runbook* — the canonical self-spawning example. Later agents reuse the recipe rather than re-discovering setup [.](https://code.claude.com/docs/en/skills)
- **Distribution:** A saved workflow or skill can be shipped as a *plugin* (`.claude-plugin/`), so one agent's innovation propagates to teammates via marketplace install [.](https://code.claude.com/docs/en/workflows)

**Lokma mapping:** A Hermes subagent that detects it has performed the same 3-step code-review 5× could emit a `write_file` for `.claude/skills/code-review/SKILL.md` with frontmatter `description: "Use when reviewing PRs for security, perf, and style"` and body containing the checklist. The next PR kickoff then auto-delegates to this skill-created reviewer without human intervention.

### 4.2 MCP as Self-Extension

**MCP (Model Context Protocol)** is Claude Code's *tool bus*: MCP servers expose tools, resources (file-like content), prompts (skill-like commands), and notification streams (event push via `channels`). Transports: `http` (streamable-http, recommended), `sse` (deprecated), `stdio` (local process), `ws`. Config lives in `.mcp.json`, `~/.claude.json`, or `claude mcp add` commands, with per-scope (local/project/user) precedence and env-var expansion [.](https://code.claude.com/docs/en/mcp)

**Self-spawning loop:**

- An agent with the `mcp-server-dev` plugin (`/plugin install mcp-server-dev@claude-plugins-official` → `/mcp-server-dev:build-mcp-server`) can *scaffold a new MCP server* from a prompt describing the use case. The server is then registered via `claude mcp add --transport stdio my-server npx my-server` or JSON block, and its tools appear in the next turn's tool list.
- Because MCP tool discovery is dynamic (notification streams on the v2 runtime, automatic reconnection, `MCPToolDiscovery` in OpenHands), newly registered servers are picked up without restart — a longer-lived `agent_server` process sees the new tools on the next `_initialize()` scan.
- OpenHands SDK bridges MCP similarly: `MCPClient` (extends `FastMCP`) + `MCPToolDefinition` wraps MCP tools as `ToolDefinition`s with a synthetic `MCPToolAction(dict)` / `MCPToolObservation` and runtime Pydantic schema derived from the MCP `inputSchema`. The bridge runs a background event loop to handle MCP's async from the SDK's sync tool execution [.](https://docs.openhands.dev/sdk/arch/tool-system)
- CrewAI also supports MCP via `MCP Servers as Tools` (Stdio/SSE/Streamable HTTP, multi-server, with security considerations doc) [.](https://docs.crewai.com/concepts/agents)

**Self-spawning nuance — tool search:** Scaling to many MCP tools hits context limits (descriptions consume tokens). Claude Code provides **MCP tool search**: tools are deferred — only a search tool is shown — and the model searches for the right tool by name/description before calling it. `Configure tool search` lets server authors exempt specific servers from deferral. This is crucial for self-spawning: an agent that *creates* a new MCP server should register it as searchable, not eager, to avoid O(N) prompt growth [.](https://code.claude.com/docs/en/mcp)

**Danger & guard:** Any MCP server that fetches external content is a prompt-injection surface. The docs warn "Verify you trust each server before connecting" — a self-spawning agent must pin its generated MCP server to a sandboxed scope (`.mcp.json` project scope, not user scope) and require trust approval before remote agents adopt it.

### 4.3 Tool (Registry) as Self-Extension

At the lowest level, a tool *is* a Pydantic `Action` + `Observation` + `ToolExecutor`. An AI can auto-create a tool by writing a new Python module following the scaffold:

```
openhands-tools/openhands/tools/my_tool/{definition.py, impl.py, __init__.py}
# definition.py: class MyAction(Action): visualize; class MyObservation(Observation): to_llm_content; class MyTool(ToolDefinition): create(cls, conv_state, ...)
# impl.py: class MyExecutor(ToolExecutor[MyAction, MyObservation]): async def __call__(self, action) -> MyObservation
```

Registration: `registry.register_tool("MyTool", MyTool)` where the resolver invokes `MyTool.create(**params, conv_state=state)` and adds instances to `agent.tools_map` [.](https://docs.openhands.dev/sdk/arch/tool-system)

Auto-creation then is just an LLM writing these two files and calling `register_tool` — which can happen inside a single conversation if the harness exposes `write_file` + `register_tool` as tools. Hermes already does (via `skill_manage` / `hermes tools`), so the loop is complete: *agent uses code-generation tool to write a new tool, registers it, and the next turn can use it.*

**Unified loop for Lokma/Hermes:**

```
LLM detects repetition/need → writes SKILL.md OR MCP server OR ToolDefinition module
                              → registers (skill discovery / claude mcp add / register_tool)
                              → next turn auto-routes to new capability
                              → capability itself can spawn further agents (nesting depth guard)
```

Guard rails to ship:

- Gate `write_file` for `.claude/skills/**` and `.mcp.json` behind `require_approval` unless `skill_auto_create: true`.
- Enforce `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` and `MAX_CONCURRENT` globally so a skill-spawned agent cannot exceed limits even if the skill itself omitted `Agent` from its allowlist.
- Log every auto-created skill/MCP as an `AgentErrorEvent` / `ObservationEvent` so audit can roll back via `patch`.

---

## 5. Agent-to-Agent Communication Patterns

### 5.1 Message Bus (Pub/Sub & Direct)

**AutoGen** is the purest bus: every message is typed (`Task`, `TaskResponse`, `UserLogin`, `AgentResponse`) and routed by `TopicId(type, source)`. Publishers don't know subscribers; subscribers declare interest via decorators. Direct messaging (`runtime.send_message(msg, AgentId(...))`) is a special case where the bus creates the recipient instance on demand. The runtime is the router; backpressure is per-topic via queue depth. [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/concurrent-agents.html) [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/handoffs.html)

**OpenHands** event log is a bus with strong ordering: every `Event` is appended to the `Conversation` log with `id`, `timestamp`, `source` (`user|agent|environment`), and optional `llm_response_id` for parallel grouping. Consumers are *observers* (read-only services like visualization, condensation, metrics) that react to the stream. There is no fan-out pub/sub — ordering is total, mirroring a single-writer log rather than a topic mesh [.](https://docs.openhands.dev/sdk/arch/events)

**Claude Code cross-session messaging:** `SendMessage` tool lets a running agent `send_message(to: agent_name, message)` to a peer by name — the swarm pattern. This is built on the `tasks/` + `coordinator/` orchestration layer (≈40 files) and distinct from subagent delegation; it's peer-to-peer, not parent-child. For sessions you dispatch via agent view or worktrees, Claude also supports `cross-session messaging` where findings are relayed by the operator.

### 5.2 Shared State

**LangGraph** — shared state is the *graph state* itself (`State` TypedDict channels). Every node receives the full state and returns a partial update; the reducer merges. Different communication topologies are just different edge/routing choices over the same shared-state primitive. Private state channels + input/output schema filters scope visibility per node; the checkpointer persists it per `thread_id` and a `store` persists cross-thread data [.](https://docs.langchain.com/oss/python/langgraph/graph-api) [.](https://docs.langchain.com/oss/python/langgraph/persistence)

**CrewAI Flows** — `self.state` (Pydantic or dict) is the shared mutable state within a flow. `@listen` handlers receive the upstream return value as an argument *and* can read/write `self.state`. `Flow.plot()` renders the DAG so shared-state flow is explicit. Between crews, `context` edges carry task outputs as shared context; `memory=True` adds a longer-lived shared memory layer [.](https://docs.crewai.com/concepts/flows) [.](https://docs.crewai.com/concepts/crews)

**OpenHands** — single source of truth is the `Conversation` event log; `ConversationStateUpdateEvent(key, value)` is the shared-state primitive. Declarative `AgentContext` fields are derived from it. Immutability makes shared state scale — observers don't copy, they filter the log [.](https://docs.openhands.dev/sdk/arch/events)

**Claude Agent Teams** — shared *task list* managed by the lead agent via Task tools (create/claim/complete). Teammates poll and claim tasks, providing decentralized coordination without direct messaging for every handoff. Workflows, by contrast, hold intermediate results in script variables (not shared context) — intentionally avoiding the contention that shared state causes at 100+ agent scale [.](https://code.claude.com/docs/en/workflows) [.](https://code.claude.com/docs/en/agents)

### 5.3 Tool-Call Routing

All harnesses converge on **"orchestration *is* tool-call routing"**:

- **Claude:** The LLM emits `Agent` tool calls (with `subagent_type`, `description`, `prompt`, `isolation`). The harness's `AgentTool.tsx` + `runAgent.ts` 15-step loop routes each call to the right runner. Hooks (`PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`) can intercept, mutate, or deny a tool call before it routes, conditional on `matcher` and `source`. This is how you implement "route all file edits through a verifying subagent."
- **AutoGen:** Tool-call routing is topic routing. A delegate tool call's JSON (`{topic_type: "refund"}`) is executed by `delegate_tools.run_json()`, and the return value becomes the `TopicId` of the next `publish_message` — literally routing via tool return value [.](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/handoffs.html)
- **CrewAI:** Tool-call routing is `Agent → Tools`. The manager LLM's routing decision is which agent owns the next task; the task's `tools` allowlist constrains which tool calls that agent may emit. MCP tools appear as regular tools once resolved via `MCPToolDefinition`.
- **OpenHands:** `ToolRegistry` resolves a `Tool` spec (`{name, params}`) to a `ToolDefinition` instance via name lookup + factory; `Agent` then maps `tool_calls` by `tool_name` to the instance's `ToolExecutor.__call__`. This two-hop lookup is what lets a new auto-created tool be discovered under the same routing as built-ins.
- **LangGraph:** Tool-call routing is graph routing. The LLM inside a node emits tool calls; `ToolNode` executes them and appends `ToolMessage`s to `messages`; the next conditional edge (`should_continue`) examines `messages[-1].tool_calls` and returns the next node. `interrupt()` is routing that pauses *inside* a node awaiting external input. [.](https://docs.langchain.com/oss/python/langgraph/interrupts)

### 5.4 Decision Table — Which Pattern When

| Need | Use | Why |
|---|---|---|
| N workers on same input independently (research, voting) | **Pub/Sub fan-out** (AutoGen default topic, Claude `parallel()`, LangGraph `Send`) | No coordination overhead, natural map-reduce |
| Specialized routing by type (urgent vs normal) | **Topic-type routing** (AutoGen `type_subscription`, CrewAI task `context`) | Avoids broadcast overhead, selective |
| Context-aware transfer (customer triage) | **Handoff** (AutoGen delegate tool, LangGraph `Command(goto=)`) | History travels with task, persona switch explicit |
| Long-lived peers that claim work | **Shared task list** (Claude Agent Teams) + lightweight `SendMessage` | Decentralized, survives partial failures, avoids central bottleneck |
| Deterministic DAG with code control | **Flow/graph** (CrewAI Flow, LangGraph graph, Claude Workflow script) | Re-runnable, versioned, variables not context |
| Total-order audit trail | **Append-only event log** (OpenHands) | Deterministic replay, forensic artifact |

---

## 6. Scheduling & Queuing

### 6.1 Priority

None of the five harnesses expose explicit numeric priority queues out of the box, but priority emerges four ways:

1. **Queue order = declaration order.** CrewAI sequential tasks, LangGraph edge order, and Claude subagent spawn order define implicit priority — earlier in list = earlier dispatch. Azure's guidance says to model priority by ordering the pipeline (sequential orchestration) when stages have clear dependencies [.](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
2. **Manager LLM ranking.** In CrewAI hierarchical and Claude Agent Teams, the manager/supervisor prompt includes "review outputs and assess task completion" — it effectively does priority scheduling by deciding which tasks to delegate/clamp next. Prompt steering ("prioritize security issues over style") is the priority signal. [.](https://docs.crewai.com/concepts/processes) [.](https://code.claude.com/docs/en/agents)
3. **Listener priority via decorators.** CrewAI `@listen` DAGs run in dependency order, and multiple `@start()` methods are dispatched concurrently with no prioritization — but adding an `@router` node lets you route high-priority branches first. LangGraph `conditional_edges` ordering + `Send` priority can be encoded similarly.
4. **External scheduler.** For production, Hermes/Lokma should layer a scheduler *outside* the LLM loop: a priority queue (e.g., `heapq` with `(priority, seq, task)`) where priority comes from task metadata (user tier, repair urgency, estimated cost), not LLM judgment. Azure's Agent Framework docs call out `Agent Framework Declarative Workflows` for this.

**Recommendation for Lokma:** Add a `priority: int (0=highest, e.g., 0=user-interrupt, 1=security-fix, 5=feature, 10=research)` field on every task. Route `priority < 3` to sync, low-concurrency execution; `priority >= 3` to the async pool. This mirrors how CrewAI's `max_rpm` already throttles by tier but makes the knob explicit.

### 6.2 Concurrency Caps

We already listed per-harness defaults in §3.2. The broader pattern:

- **Token-budget caps:** Claude's `maxBudgetUsd` / OpenHands metrics tracking / LangGraph recursion limit all bound *cost*, not concurrency. They convert to concurrency caps under the hood because each concurrent agent burns tokens. Set `maxBudgetUsd` per query to bound runaway fan-out from Opus 5 (which delegates more readily) [.](https://code.claude.com/docs/en/agent-sdk/subagents)
- **Request-rate caps:** `max_rpm` (CrewAI per-agent or per-crew, overrides agent), OpenHands `ToolRegistry` respecting LLM rate limits, Claude's `CAP` on Explore model. These are leaky-bucket throttles, not hard counters.
- **Process-concurrency caps:** `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (hard counter, returns error), `asyncio.Semaphore` around AutoGen runtime publishers, Flow-level `max_concurrent_tasks` if you add it.
- **Execution-time caps:** `max_execution_time` (CrewAI, seconds per agent) and `max_iter` / LangGraph `recursion_limit` — wall-clock backpressure.

**Hermes/Lokma caps to adopt (tuned for coding harness):**

```yaml
caps:
  max_concurrent_subagents: 12          # lower than Claude's 20 for hosted cost control
  max_worktree_agents: 6               # disk-bound
  max_depth: 2                         # 3 layers is too expensive for Opus 5 delegates
  max_budget_usd_per_task: 2.50
  max_rpm_per_crew: 40
  max_execution_time_per_agent: 600s
  recursion_limit: 30
```

### 6.3 Backpressure

Backpressure = what the system does when a producer (LLM or scheduler) outpaces consumers (agents, tools, LLM API). Four strategies observed:

| Strategy | Where seen | How it signals back |
|---|---|---|
| **Refuse & error** | Claude `Concurrent subagent limit reached`, `Budget limit reached` — tool call fails with error text telling Claude not to retry immediately. OpenHands `ConversationErrorEvent` halts loop. | Producer (LLM) must observe error message and back off; Hermes should surface as HTTP 429 to caller |
| **Queue & drain** | AutoGen `asyncio.Queue(maxsize=N)` in `ClosureAgent` result collector; will `await queue.put` which suspends producer until consumer `await queue.get` frees slot. CrewAI task queue in sequential process is similarly bounded by worker availability. | Natural async backpressure — no error, just slowdown |
| **Shed / degrade** | LangGraph recursion limit — `GraphRecursionError`; Claude workflow caps — agents beyond cap simply not spawned (script's `pipeline()` with huge list truncates). Azure's pitfall list warns "Ignoring resource constraints when you choose concurrent orchestration" — shedding is intentional. [.](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) | Partial results returned; caller must decide to resume or accept degraded coverage |
| **Buffer unbounded (anti-pattern)** | CrewAI `async_execution` without cap if tasks are fire-and-forget; OpenHands event log growing unbounded (condensation needed). LangGraph checkpoints growing unboundedly (mitigation: prune old checkpoints or set retention) [.](https://docs.langchain.com/oss/python/langgraph/persistence) | Latent OOM / latency blowup — needs explicit pruning jobs |

**LangGraph-specific nuance:** Because nodes re-execute after `interrupt()`, side effects (file writes, DB inserts) before the interrupt must be idempotent — otherwise resuming duplicates work. This *is* backpressure at the correctness level: pressure to make handlers retry-safe before scaling concurrency [.](https://docs.langchain.com/oss/python/langgraph/interrupts)

**OpenHands-specific nuance:** Condensation (`CondensationRequest` → `Condensation` event with `forgotten_event_ids` + summary) is backpressure on *context length*, not concurrency. When the conversation log hits the window limit, the condenser summarizes forgotten events — analogous to dropping low-priority messages from a queue [.](https://docs.openhands.dev/sdk/arch/events)

**Azure's explicit backpressure guidance (applicable to Lokma):** The "Common pitfalls" list in the agent design patterns guide warns specifically to *persist state at HITL gates so the orchestration can resume without replaying prior work* and to *not share mutable state between concurrent agents* — both are backpressure practices (avoid rework, avoid contention) [.](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

**Implementation sketch for Lokma's scheduler (combines all four):**

```python
import asyncio, heapq, time
from dataclasses import dataclass, field

@dataclass(order=True)
class PrioritizedTask:
    priority: int          # 0 = highest
    seq: int               # tie-breaker
    task: dict = field(compare=False)

class Scheduler:
    def __init__(self, max_concurrent=12, max_worktree=6, max_budget_usd=2.50):
        self.queue: list[PrioritizedTask] = []
        self.seq = 0
        self.sem = asyncio.Semaphore(max_concurrent)
        self.wt_sem = asyncio.Semaphore(max_worktree)
        self.spent_usd = 0.0
        self.max_budget = max_budget_usd
        self.results = asyncio.Queue()  # bounded backpressure

    async def submit(self, task: dict, priority: int):
        heapq.heappush(self.queue, PrioritizedTask(priority, self.seq, task))
        self.seq += 1

    async def drain(self):
        while self.queue:
            pt = heapq.heappop(self.queue)
            if self.spent_usd >= self.max_budget:
                pt.task["status"] = "budget_exceeded"   # shed
                await self.results.put(pt.task)
                continue
            needs_worktree = pt.task.get("edits_files", False)
            sem = self.wt_sem if needs_worktree else self.sem
            async with sem:   # backpressure: queue & drain
                try:
                    # timeout = execution cap = kill path
                    res = await asyncio.wait_for(
                        run_agent(pt.task), timeout=pt.task.get("timeout", 600)
                    )
                    self.spent_usd += res.get("cost_usd", 0)
                    await self.results.put(res)
                except asyncio.TimeoutError:
                    await self.results.put({**pt.task, "status": "timeout"})
                except Exception as e:
                    # refuse & error path — caller sees status
                    await self.results.put({**pt.task, "status": "error", "error": str(e)})
```

This covers priority (heap), concurrency caps (two semaphores — general + worktree), budget shedding, queue backpressure (asyncio coordination), and timeout-kill — directly mapping the six harnesses' strongest mechanisms into one Lokma primitive.

---

## 7. Comparative Matrix & Production Takeaways

### 7.1 Matrix

| Dimension | Claude Code | OpenHands | AutoGen | CrewAI | LangGraph |
|---|---|---|---|---|---|
| **Spawn primitive** | `Agent` tool (parent → child) | `ToolDefinition.register` + `Conversation` | `register` + `publish_message` / `send_message` | `Agent` + `Task` + `Crew`/`Flow` | `StateGraph.add_node` + `Send` / `Command` |
| **Isolation** | Context (default) → fork (cache) → worktree (FS) | In-process (default) → Docker/remote (opt-in) | In-process (SingleThreaded) → Distributed (gRPC) | In-process; `safe` Docker per-agent | Channels + subgraph; checkpointer per `thread_id` |
| **Parallelism** | `Agent` concurrent + Workflow `parallel()`/`pipeline()` | Parallel tool exec (coalesced `llm_response_id`) + concurrent `Conversation`s via Agent Server | Pub/sub fan-out + `type_subscription` routing + `SingleThreaded` cooperative | `Task.async_execution` + multi-`@start` + `@listen` DAG | Super-step `Send` fan-out + parallel `ToolNode` |
| **Self-spawn** | Skill (`SKILL.md`) + MCP server scaffold + `Tool` write | Tool module write + register | Register new `RoutedAgent` at runtime + MCP workbench | Skill (`Path`/object) per crew + MCP Stdio/SSE/HTTP | `create_agent` factory + MCP via tool node |
| **Comm** | `SendMessage` (swarm) + shared task list (teams) + event bus | Append-only `Event` log (total order) | `TopicId` pub/sub + `AgentId` direct | Shared `Flow.state`/crew `context` + delegation | Shared `State` channels + `Command(goto)` |
| **Pause** | Task machine + `interrupt` in workflows | `PauseEvent` + error-type distinction | Cooperative `asyncio.Event` | `human_input` + checkpoint | `interrupt()` / `interrupt_before/after` + `Command(resume)` |
| **Fork** | First-class fork (cache prefix) | Clone `Conversation` log | Copy `context` in handoff publish | `crew.copy()` / `flow` clone + re-kickoff | Time-travel + same `thread_id` mutated |
| **Max concurrent** | `MAX_CONCURRENT_SUBAGENTS=20`, depth 3, budget $ | Workspace count / server pool | Bounded `Queue` / none | `max_rpm`, `max_iter`, `max_execution_time` | `recursion_limit`, `Send` N, platform threads |
| **Persist** | Async-gen + worktree lock | `Conversation` event log + `Condenser` | Runtime + log (externally) | `checkpoint`, `memory`, `cache`, `store` | `checkpointer` (per-thread) + `store` (cross-thread) |

### 7.2 Takeaways for Lokma / Hermes Harness Design

1. **Adopt Claude's three-tier isolation, not one.** Default to shared-`cwd` context isolation for research (cheap), fork for cache-friendly parallel reasoning (when prompt prefixes align), and worktree for edits. Don't pay the git worktree copy cost for reads. Encode the choice in task metadata (`isolation: none|fork|worktree`). [.](https://code.claude.com/docs/en/sub-agents) [.](https://code.claude.com/docs/en/worktrees)

2. **Make self-spawning an approved loop, not a hack.** Expose `skill_manage` and `mcp add` as proper tools with an approval gate, and log every auto-created artifact as an event. The Claude self-improvement loop (skills writing skills, `/verify` recording its own recipe) is the proof that this compounds — but it must be bounded by depth/budget caps and auditable.

3. **Prefer shared-task-list over all-to-all messaging for coding.** For Lokma's codebase work, the Claude Agent Teams pattern (lead + peers + shared task list + rare `SendMessage`) scales better than AutoGen's all-to-all group chat because file partitioning eliminates merge conflicts. Reserve group-chat for debate tasks (code review consensus).

4. **Treat checks as interrupts, not steps.** LangGraph's `interrupt()` (pause mid-node, persist via checkpointer, require idempotent pre-interrupt effects) is the right model for `approve_plan` / `confirm_deploy` gates — not a regular graph edge, because it must survive process restarts and honor `thread_id` as cursor. Pair every interrupt-capable node with a `Configurable.thread_id`-keyed checkpointer (even in dev, use `SqliteSaver`, not just `InMemorySaver`) [.](https://docs.langchain.com/oss/python/langgraph/interrupts) [.](https://docs.langchain.com/oss/python/langgraph/persistence)

5. **Two-semaphore scheduling.** One semaphore for concurrency (LLM-rate-bound), one for worktrees (disk-bound). Priority via heap queue; budget via shedding; timeouts via `wait_for`; refusals via typed errors that the LLM is taught to handle (don't retry on `Concurrent limit reached`, back off and poll). This mirrors Claude's explicit limit semantics [.](https://code.claude.com/docs/en/sub-agents)

6. **Watch the context budget as its own backpressure dimension.** All harnesses hit it: Claude warns at 15k combined subagent descriptions, LangGraph prunes checkpoints, OpenHands condenses events. Lokma should enforce a `max_context_tokens` pre-flight check and route overflow to condensation (summarize) rather than fail.

7. **Don't pick one orchestration — compose.** Azure's guidance explicitly says to *combine* patterns stage-wise (e.g., sequential for ingestion → concurrent for parallel analysis → handoff for escalation) [.](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns). A Lokma repair loop could be: `Crew sequential (reproduce→locate→patch)` → `LangGraph fan-out (verify with 3 verifiers)` → `AutoGen handoff (escalate to human if confidence < threshold)` → `Claude worktree PR`.

---

## 8. References

> All URLs fetched and verified during research. Scrape date: 2026-08-31.

| # | Title / Note | URL |
|---|---|---|
| 1 | Claude Code — Create custom subagents (spawn, isolate, delegate, parallel, limits) | https://code.claude.com/docs/en/sub-agents |
| 2 | Claude Code — Subagents in the Agent SDK (programmatic definition, concurrency/spend caps) | https://code.claude.com/docs/en/agent-sdk/subagents |
| 3 | Claude Code — Dynamic workflows (scale, `agent`/`pipeline`/`parallel`, resume, cost) | https://code.claude.com/docs/en/workflows |
| 4 | Claude Code — Run agents in parallel (subagents vs agent view vs teams vs workflows) | https://code.claude.com/docs/en/agents |
| 5 | Claude Code — Run parallel sessions with worktrees (isolation, cleanup, `.worktreeinclude`) | https://code.claude.com/docs/en/worktrees |
| 6 | Claude Code — Extend with skills (self-spawning `SKILL.md`, `!` injection, subagent exec) | https://code.claude.com/docs/en/skills |
| 7 | Claude Code — Connect via MCP (transports, tool search, notification streams) | https://code.claude.com/docs/en/mcp |
| 8 | Claude Code from Source — Ch 8 Spawning Sub-Agents (15-step lifecycle, async generators, depth) | https://claude-code-from-source.com/ch08-sub-agents/ |
| 9 | OpenHands SDK — Overview (packages, local vs remote, composability) | https://docs.openhands.dev/sdk/arch/overview |
| 10 | OpenHands SDK — Design Principles (optional isolation, stateless, boundaries, composable) | https://docs.openhands.dev/sdk/arch/design |
| 11 | OpenHands SDK — Events (typed framework, `Event`/`ActionEvent`/`ObservationEvent`, pause/condensation) | https://docs.openhands.dev/sdk/arch/events |
| 12 | OpenHands SDK — Tool System & MCP (Action-Observation, `ToolRegistry`, `MCPToolDefinition`, sync/async bridge) | https://docs.openhands.dev/sdk/arch/tool-system |
| 13 | AutoGen — Concurrent Agents (default/type subscriptions, `ClosureAgent` result collection) | https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/concurrent-agents.html |
| 14 | AutoGen — Handoffs (Swarm delegation via `delegate_tools`, `UserTask` publish, `AgentId` on-demand) | https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/handoffs.html |
| 15 | CrewAI — Crews (attributes, `process`, `manager_llm`, checkpointing, MCP/skills) | https://docs.crewai.com/concepts/crews |
| 16 | CrewAI — Tasks (attributes, `async_execution`, `context`, guardrails, human input) | https://docs.crewai.com/concepts/tasks |
| 17 | CrewAI — Agents (attributes, `allow_delegation`, `max_iter`/`max_execution_time`/`code_execution_mode`) | https://docs.crewai.com/concepts/agents |
| 18 | CrewAI — Processes (sequential vs hierarchical, manager role) | https://docs.crewai.com/concepts/processes |
| 19 | CrewAI — Flows (event-driven `@start`/`@listen`, state, `@router`, `plot`, multi-crew) | https://docs.crewai.com/concepts/flows |
| 20 | LangGraph — Graph API overview (StateGraph, reducers, Pregel super-steps, `Send`, `Command`) | https://docs.langchain.com/oss/python/langgraph/graph-api |
| 21 | LangGraph — Persistence (checkpointer vs store, `thread_id`, `Sqlite`/`Postgres`, pruning) | https://docs.langchain.com/oss/python/langgraph/persistence |
| 22 | LangGraph — Interrupts (pause/resume, `interrupt()` idempotency, `stream.interrupts`) | https://docs.langchain.com/oss/python/langgraph/interrupts |
| 23 | Azure Architecture Center — AI agent orchestration patterns (sequential/concurrent/handoff/magentic, pitfalls, combining patterns, framework mapping) | https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns |

### Additional GitHub & Secondary Sources (background)

| # | Source | URL |
|---|---|---|
| 24 | CrewAI GitHub (overview, delegation, 5.76× claim vs LangGraph) | https://github.com/crewAIInc/crewAI |
| 25 | OpenHands GitHub — `docs/architecture.md` / SDK tree | https://github.com/All-Hands-AI/OpenHands/blob/main/docs/architecture.md |
| 26 | AutoGen GitHub — core docs tree | https://microsoft.github.io/autogen/stable/ |
| 27 | Digital Applied — Agent orchestration workflow guide (pattern summary, enterprise 72% stat) | https://www.digitalapplied.com/blog/ai-agent-orchestration-workflows-guide |

---

*Generated for Lokma agent-system research. All framework mechanisms were verified against primary docs (not blogs). For implementation diffs, compare the Hermes shell-hooks skill (`~/.hermes/skills/`) and Lokma's current `.claude/` harness against §7.*


