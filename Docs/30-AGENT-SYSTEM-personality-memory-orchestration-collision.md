# Agent System — Personality, Memory, Orchestration & Collision-Free Parallelism

> **Owner ask (verbatim):** *AI agent management — agents have their own personality, their own memory. I can pick which model an agent runs on. AI can also create agents itself via skill or MCP. Max agents & max concurrent caps. Parallel agents must communicate to avoid editing the same file.*
> **Inspired by:** `hermes-agent` (SOUL.md/MEMORY.md), Claude Code (subagents/worktrees), DeepSeek Cordis (jobs), AutoGen/CrewAI/LangGraph, OpenHands — plus `memory.fermag.com.tr` vault & `agentskills.io`
> **Raw:** `raw/30-agent-orchestration-ham-arastirma.md` (603 lines, 69KB) · `raw/31-agent-personality-ham-arastirma.md` (826 lines, 59KB) · `raw/32-agent-conflict-ham-arastirma.md` (857 lines, 64KB) · `raw/33-agent-extras-ham-arastirma.md` (413 lines, 50KB)
> **Companions:** `27-SKILLS-auto-discovery-hermes-inspired.md` · `28-MEMORY-infinite-vault-graph.md` · `26-CONFIG-and-CREDENTIALS.md`

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Agent Identity & Personality](#2-agent-identity--personality)
3. [Per-Agent Memory](#3-per-agent-memory)
4. [Per-Agent Model Selection](#4-per-agent-model-selection)
5. [Agent Lifecycle](#5-agent-lifecycle)
6. [Caps & Scheduling — maxAgents vs maxConcurrent](#6-caps--scheduling--maxagents-vs-maxconcurrent)
7. [Self-Spawning — AI Creates Agents via Skill/MCP/Tool](#7-self-spawning--ai-creates-agents-via-skillmcptool)
8. [Orchestration Patterns](#8-orchestration-patterns)
9. [Inter-Agent Communication](#9-inter-agent-communication)
10. [Collision-Free Parallel Editing](#10-collision-free-parallel-editing)
11. [Web Management — Agents Pane & DnD](#11-web-management--agents-pane--dnd)
12. [Config, Schema & APIs](#12-config-schema--apis)
13. [Extras — 20+ Ideas Beyond the Spec](#13-extras--20-ideas-beyond-the-spec)
14. [Roadmap Integration](#14-roadmap-integration)
15. [References](#15-references)

---

## 1. Design Principles

Lokma's agent system treats **agents as first-class, portable, durable entities** — not ephemeral tool calls. One harness loop, two surfaces (CLI + Web), three truths:

1. **One agent = one SOUL + one memory + one model + one lease.** Persona is stable, memory is scoped, model is pinned, concurrency is leased. An agent survives restarts (`~/.lokma/agents/<id>/`).
2. **Isolation by default, coordination by protocol.** Worktree isolation for filesystem, advisory locks for shared paths, message bus for negotiation. "Hope they don't collide" is not a strategy.
3. **AI can spawn AI, but always under human-set budgets.** Self-spawning is a skill-gated tool call bounded by `maxAgents` (how many exist) and `maxConcurrent` (how many run now), plus per-agent token/USD budgets. The user sets caps; the agent fills them.
4. **Everything an agent is can be exported.** `lokma agent export <id>` → a folder with `SOUL.md` + `config.json` + `MEMORY.md` — installable as a hub skill/persona elsewhere.

These mirror Hermes's `SOUL.md` durability, Claude Code's worktree isolation, and Cordis's `jobs` + `Context` — synthesized into one Lokma shape.

---

## 2. Agent Identity & Personality

### 2.1 One SOUL per agent, not per project

Hard-learned from Hermes: persona that follows `cwd` breaks when you `cd`.

```
~/.lokma/agents/<agentId>/
├── SOUL.md            # THIS agent's durable personality — voice, posture, style
├── IDENTITY.json      # { id, name, avatar, createdAt, createdBy: "human"|"ai:<parentId>" }
├── MEMORY.md          # agent-local memory (§-delimited, capped, see §3)
├── USER.md            # optional per-agent user model (who this agent thinks you are)
├── config.json        # model, provider, budgets, caps (see §4, §6)
└── sessions/          # sessions owned by this agent
```

**What belongs in SOUL.md vs elsewhere:**

| File | What goes there |
|------|-----------------|
| `SOUL.md` | Tone, directness, humor, how to handle uncertainty/disagreement, technical posture (terse vs pedagogical) — **stable** |
| `AGENTS.md` / `.lokma.md` (project) | Repo conventions, ports, build commands, file ownership — **project-scoped** |
| `MEMORY.md` (agent-local) | Lessons this agent learned ("user prefers X") — **accumulated** |
| `SKILL.md` | Procedural how-to for a task — **portable** |

Seeding: `lokma agent create <name> --persona reviewer` writes a starter `SOUL.md` from a template. Existing `SOUL.md` is **never overwritten on upgrade** — persona is sacred.

### 2.2 Template personas (shipped)

Lokma ships 6 starter personas as `skills/lokma-personas/*/SOUL.md` — auto-discoverable via skill routing (see `27-*`):

| Persona | Role | Voice |
|---------|------|-------|
| `reviewer` | PR review, tradeoff analysis | Direct, senior, cites specific lines |
| `planner` | Roadmapping, decomposition | Socratic, asks before building |
| `tester` | Test harness, coverage, fuzzing | Pedantic, boundary-obsessed |
| `researcher` | Deep reading, source synthesis | Thorough, cites URLs, no fabrication |
| `builder` | Fast iteration, scaffolding | Terse, ships working artifacts |
| `custodian` | Memory hygiene, vault curation | Quiet, proposes `MEMORY.md` entries post-task |

`lokma agent create --persona tester` or Web `New Agent → Tester` clones the template `SOUL.md` into the new agent. SOUL is editable in `Agent Settings` pane or `~/.lokma/agents/<id>/SOUL.md`.

### 2.3 Persona overrides (session-level)

- `/personality <name>` (CLI) or `Agent → Switch persona` (Web) overlays a persona for **this session only** — writes `sessions/<id>/persona-override.json`, reverts on session end. SOUL is untouched.
- Honcho-style dialectic modeling is **pluggable** (off by default, provider `honcho` in `credentials.json`) — when enabled, the agent calls `honcho` tools to model the user's perspective and adjusts tone. MVP runs without it.

### 2.4 Distribution

- `lokma agent export <id> --out ./my-reviewer` → folder with `SOUL.md + config.json + MEMORY.md` — publishable to `agentskills.io` or GitHub as `lokma-persona-*`.
- `lokma agent import ./my-reviewer` or `lokma skills install user/repo` — appears in `<available_personas>` next turn.

---

## 3. Per-Agent Memory

### 3.1 Scoping — what one agent sees

An agent's prompt is built from **4 layers** (most to least specific):

1. **Agent-local** — `~/.lokma/agents/<id>/MEMORY.md` + `USER.md` + `SOUL.md` (highest priority, frozen snapshot as in `28-*`).
2. **Project** — `.lokma.md` / `AGENTS.md` / `skills/` in the agent's worktree (`cwd → git root` walk).
3. **User-global** — `~/.lokma/memories/MEMORY.md` + `~/.lokma/memories/USER.md` (shared across agents, read-only for non-owner agents).
4. **Vault** — `session_search` (FTS5 over `state.db` scoped to agent + project) + `VaultPort.search()` over `vault/lokma/**` — retrieved, not injected.

Write rule: `memory` tool writes only to **agent-local** `MEMORY.md` unless `target=user` + `scope=global` (requires `--global` flag / web toggle). This prevents one agent's lessons from polluting another's persona. A reconciler can promote widely-useful entries to global on user approval (`lokma memory promote --from <agentId>` or curator suggestion).

### 3.2 Agent-local MEMORY.md

- Format: `§\n`-delimited entries (same parser as `28-*`, handles `ı/İ` via `norm()`), per-agent limit `$memory.agent_char_limit` (default **8000**, tunable), dedup exact match, `replace`/`remove` via substring `old_text` (0- or 2+-match → error with live entries echoed).
- Vault sync: hook `post_tool_call ^memory$` scoped per-agent — `agentId` is part of `routes.json` routing (`first 140 chars + agentId` → `vault/lokma/agents/<id>/MEMORY.md` + aggregated `vault/lokma/MEMORY.md` cross-agent rollup).
- Compaction: per-agent compressor tier (same 2-tier as `28-*`), archive to `~/.lokma/agents/<id>/sessions/*.jsonl` (FTS5 still queryable).

### 3.3 Session search scoped per agent

`session_search` gains `agentId` param:

```ts
session_search({ query: "auth refactor", agentId: "reviewer-01", limit: 10 })
session_search({ session_id, around_message_id, window: 20 }) // scroll as in 28-*
```

Default scope is the calling agent; `agentId: "*" ` searches global (privileged). Results include `agentId` tag so one agent can cite another's session.

---

## 4. Per-Agent Model Selection

### 4.1 One config per agent

```ts
// ~/.lokma/agents/<id>/config.json (Zod: AgentConfig)
{
  model: "anthropic/claude-4-opus",      // pinned — what this agent reasons with
  provider: "anthropic",                 // derived, but overridable for aliases
  fallback: ["openai/gpt-5-mini", "deepseek/deepseek-chat"],
  credentialRef: "anthropic:main",       // key in ~/.lokma/credentials.json
  budgets: { tokens: 500_000, usd: 5.00, perTurn: 50_000 }, // hard stops
  temperature: 0.2, topP: 0.95,          // per-agent sampling
  systemPromptExtra: "You are running as reviewer-01.", // appended after SOUL
  tools: { allow: ["*"], deny: ["browser_exec"] }       // per-agent toolset gate
}
```

- `model` is required; `fallback` is tried on `429/5xx/timeout` (as in `22-*` routing). `credentialRef` maps to `credentials.json` entry (`ant:sk-...`, `oai:sk-or-...`, `ollama:http://localhost:11434` via `credentials.*.apiKey`).
- Changing model in Web `Agent → Model` or `lokma agent config <id> --model openai/gpt-5` rewrites `config.json` and appears next turn (prompt is re-frozen on session (re)start).
- `lokma agent list` + `GET /api/agents` show `{ id, name, model, state, tokensToday, usdToday, sessions }` — same registry drives both surfaces.

### 4.2 Cost tracking per agent

Token accounting (`TokenLedgerEntry` JSONL + `state.db` matview as in `22-*`) gains `agentId`:

```ts
{ ts, agentId, sessionId, model, input, output, cached, costUsd, provider }
```

Web `Usage` pane: filter by **Agent** (stacked bar per agent per day), same CSV/JSONL export with `agentId` column.

### 4.3 Aux models & delegation model

- An agent's subagents inherit the parent's model by default; subagent `AgentDefinition.prompt` can override to a cheaper model (e.g. reviewer fans out 10 `haiku` researchers, synthesizes with `opus`). This is how Hermes `delegate_task` keeps costs bounded.
- `delegationModel` (optional) — a lighter model used **only** for delegation decisions (`should I spawn a subagent?`). When `delegationModel: "claude-haiku"` is set, the orchestrator's spawn classifier runs on haiku, saving opus tokens.

---

## 5. Agent Lifecycle

| Verb | CLI | Web | What happens |
|------|-----|-----|--------------|
| **create** | `lokma agent create <name> [--persona reviewer] [--model anthropic/...] [--cwd ./proj]` | `Agents → New Agent` | Allocates `id`, writes `SOUL.md` from template, writes `config.json`, creates `sessions/` and optional `worktree` (`git worktree add .lokma/worktrees/<id>`), registers in `state.db` + `registry.json`. Counted toward `maxAgents`. |
| **configure** | `lokma agent config <id> --model ... --persona ...` | `Agent → Settings` | Edits `config.json` / `SOUL.md` / `budgets`. Hot in next session; running sessions finish on old config. |
| **run** | `lokma agent run <id> --prompt "..."` or any `lokma chat` routed to agent | `Agent row → Open` | Transitions `idle → running`, assigns `sessionId`, acquires `concurrency` slot (see §6), streams via `WS /ws/:sessionId`, writes transcript JSONL. |
| **pause** | `lokma agent pause <id>` | `⏸` | Sends `SIGTSTP`-equivalent to PTY; state `paused`; lease kept but not counting toward active work (still holds `agentId` lock). |
| **resume** | `lokma agent resume <id>` | `▶️` | Re-acquires concurrency slot if needed, continues generator. |
| **kill** | `lokma agent kill <id> [--hard]` | `■` | Drains 15-step cleanup (`finally`) — flushes JSONL, releases locks/lease/worktree. `--hard` SIGKILLs. |
| **fork** | `lokma agent fork <id> [--name <new>]` | `Agent → Fork` | Deep-copies `SOUL.md` + `MEMORY.md` + `config.json` to new `id`; new `sessions/` empty. Cheapest "make a specialist clone". |
| **clone --with-memory** | `lokma agent clone <id>` | `Agent → Clone` | Same as fork but also copies `sessions/*.jsonl` index for `/compact` replay. |
| **delete** | `lokma agent delete <id> [--keep-worktree]` | `Agent → Delete` | Kills if running, removes `~/.lokma/agents/<id>/`, decrements `maxAgents` count. |
| **export/import** | `lokma agent export <id>` / `import <path>` | `Agent → Export` | Tarball of `SOUL + IDENTITY + MEMORY + config` — marketplace portable. |

State machine: `idle → queued → running → paused → running → completed|failed|killed` with `queued` inserted when `maxConcurrent` is full (see §6). All transitions emit `agent.state_changed` (typed event as in `23-*` Cordis: `emit/waterfall/bail`).

---

## 6. Caps & Scheduling — maxAgents vs maxConcurrent

The user's two caps are deliberately separate (from Claude Code's `MAX_CONCURRENT_SUBAGENTS` vs implied `MAX_AGENTS`):

| Cap | What it limits | Scope | Where |
|-----|----------------|-------|-------|
| **`maxAgents`** | How many agents **exist** (created, idle+queued+running combined). Creating the N+1th agent fails (or asks to `--replace` an idle one). Prevents unbounded `AI-creates-AI` growth. | Global (or per-project when `scopes.agents: "project"`). | `~/.lokma/config.json` `agents.maxAgents` (default **20**) |
| **`maxConcurrent`** | How many agents **run at once** (have a PTY/WS + concurrency slot). Exceeding enqueues with priority; dequeue when a slot frees. Prevents token/CPU blowup. | Same scope | `agents.maxConcurrent` (default **5**) |

Plus per-agent budgets (see §4.1): `budgets.tokens` / `budgets.usd` / `budgets.perTurn` — hard stops per agent run (emit `error_max_budget` as Claude does).

**Scheduling tiers:**

```
enqueue(agent, priority ∈ { low, normal, high, interactive })
  → priority queue (interactive > high > normal > low, FIFO within tier)
  → when slot frees: dequeue highest → run
  → backpressure: if queue length > maxQueue (default 20), reject with "queue full — free a slot or raise maxQueue"
  → starvation guard: after 3 dequeues of high, promote oldest normal to high (aging)
```

**CLI/Web surfaces:**

- `lokma config get agents.maxAgents` / `set`, `GET /api/config` (masked), `PATCH /api/config` (server enforces caps atomically).
- Web `Settings → Agents` shows two sliders + queue panel (`queued: [builder-2 (normal), tester-1 (low)]` + `ETA ~ 2 min`).

---

## 7. Self-Spawning — AI Creates Agents via Skill/MCP/Tool

This is the "AI de kendi ajan oluşturabilecek" requirement.

### 7.1 Tool shape

```ts
// Tool exposed to the model (both CLI and Web loops inject it)
registerTool({
  name: "create_agent",
  description: "Create a new agent when a task needs a dedicated persona, model, or isolation. Respects maxAgents/maxConcurrent — will queue or fail if caps reached.",
  inputSchema: z.object({
    name: z.string().min(1).max(40),                   // slug, unique
    persona: z.enum(["reviewer","planner","tester","researcher","builder","custodian","custom"]).default("builder"),
    model: z.string().optional(),                       // e.g. "anthropic/claude-4-haiku" — defaults to parent's model
    soul: z.string().optional(),                        // inline SOUL override for custom persona
    cwd: z.string().optional(),                         // worktree root for this agent
    budgets: z.object({ tokens: z.number().optional(), usd: z.number().optional() }).optional(),
    reason: z.string().min(10),                         // why this agent — logged, shown to user
  }),
  handler: async ({ name, persona, model, soul, cwd, budgets, reason }, ctx) => {
    const cap = await checkCaps();
    if (cap.maxAgentsReached) throw new ToolError(`maxAgents ${cap.maxAgents} reached — delete an idle agent or raise the cap`);
    const id = await agents.create({ name, persona, model: model ?? ctx.agent.model, soul, cwd, budgets, reason, createdBy: `ai:${ctx.agent.id}` });
    ctx.emit("agent.created", { id, parent: ctx.agent.id, reason });
    return { id, hint: `Agent ${id} created. It will appear in Agents pane. Use run_agent to delegate work to it.` };
  }
})
```

Sibling tools: `list_agents`, `get_agent`, `run_agent` (delegate), `send_to_agent` (message).

### 7.2 Skill-gated discovery

Self-spawning is not always available — the loop injects the `create_agent` tool only when the loaded skill says it should:

- `skill: agent-spawner` (`Use when the task needs multiple specialists, parallel tracks, or durable ownership of a subtask.`) — when this skill is loaded, `create_agent` appears in the toolset. Otherwise it's hidden (reduces bad spawns).
- MCP alternative: an MCP server can expose `create_agent` as an MCP tool (`lokma mcp serve --agents`) — same input schema, same cap checks, same audit log. This is how an MCP-provided team template can spawn a whole crew.

### 7.3 Guardrails

- **Cap enforcement** — `maxAgents` checked server-side, race-free (`agents.lock` file).
- **Audit** — every AI-created agent has `createdBy: "ai:<parentId>"` + `reason` + timestamp in `IDENTITY.json` and `AUDIT.md` (`~/.lokma/agents/<id>/AUDIT.md`).
- **Attribution in UI** — AI-created agents show `🤖 by <parent>` badge in Agents pane; deletable by user at any time.
- **Budget inheritance** — child inherits parent's `credentialRef` but gets its own `budgets` (defaults to `min(parent.budgets, global.defaults.agent)`).
- **Spawn depth** — `maxSpawnDepth: 3` as in Claude Code — third-layer agents lose `create_agent`.

---

## 8. Orchestration Patterns

| Pattern | When | How Lokma does it |
|---------|------|-------------------|
| **Single delegate** | Focused subtask (e.g. "audit auth.ts") | `run_agent({ agentId: "reviewer-01", prompt: "audit auth.ts for secret leaks" })` — isolated session, returns summary |
| **Fan-out (parallel)** | Independent subproblems (multi-file analysis, n-way research) | `parallel([run_agent(...), run_agent(...), ...])` — fan-out via `Promise.all`, each in own worktree, wall-clock = max |
| **Pipeline** | Staged transform (plan → build → test) | `pipeline([phase("plan", ...), phase("build", ...), phase("test", ...)])` — Cordis-style serial/parallel hybrid |
| **Map over commits/files** | `for file in dir: analyze` | Dynamic workflow script outside the conversation (Cordis `jobs`) — hundreds of agents via loop, intermediate results in script vars not context |
| **Team (long-lived peers)** | Handful of peers that outlive one turn (reviewer + builder chatting for 10 turns) | `Team` — lead + peers sharing a task list + `send_to_agent` messaging (as in Claude Code `Agent Teams` experiment) |
| **Coordinator** | N parallel builders needing merge policy | Dedicated `coordinator` agent per project (see §9) — holds file-ownership graph, assigns work, merges |

All patterns are available as `agent orchestrator` skill recipes (see `27-*`).

---

## 9. Inter-Agent Communication

### 9.1 Message bus

A per-project bus over SQLite WAL + WS fallback (so it survives restarts, and works offline):

```ts
// Mailbox per agent — append-only, polled + pushed
await bus.send({ to: "builder-02", from: "reviewer-01", type: "plan.note", body: "auth.ts is safe — no secrets", threadId })
await bus.broadcast({ from: "coordinator", type: "ownership.grant", body: { files: ["src/api/auth.ts"], to: "builder-01", leaseMs: 60_000 } })
```

Delivery: WS push when agent is running (`agent.mail` stream), SQLite poll when idle (on next `run`), plus `GET /api/agents/:id/mail` for Web.

Message types (typed, as in `23-*` Cordis): `plan.note`, `file.intent`, `file.claim`, `file.release`, `file.edited`, `task.assign`, `merge.request`, `merge.done`, `agent.spawned`, `agent.done`.

### 9.2 Coordinator agent

One per project (`~/.lokma/projects/<hash>/coordinator.json` → `{ agentId, mode: "auto"|"pinned" }`). Responsibilities:

- Maintains the **file-ownership graph** (`file → { owner, leaseUntil, watchers }`) derived from `Bus` claims + `.agentlocks/` (see §10).
- Assigns work (`task.assign` → agent) respecting `maxConcurrent` + affinity (reuse same model/provider when cheaper).
- Mediates `merge.request` when two agents touched overlapping hunks.

The coordinator can be `auto` (the most senior `builder` becomes coordinator) or `pinned` (a dedicated persona). Hermes `curator` is the prototype — Lokma's coordinator is `curator` for agents and `consistency` for files.

### 9.3 Heartbeat / lease

An agent that holds a file lock (see §10) must `heartbeat` every 30s (`POST /api/locks/:path/heartbeat`). Miss 2 beats (60s) → lock is **stolen** and `file.ownership.grant` is reassigned + `file.stolen` notification to the old owner. Prevents dead-agent deadlock (crash, `maxConcurrent` eviction).

---

## 10. Collision-Free Parallel Editing

This is the "aynı dosyayı editleyip çakışma olmaması için haberleşecekler" requirement — the hardest part. Lokma combines **three layers**, in order of strength.

### 10.1 Layer 1 — Advisory file locks (cheap, always)

The lightest, most reliable mechanism from the `32-*` raw.

**Location:** `.agentlocks/locks/<sha1(path)>.json` (gitignored) or `~/.lokma/agents/<id>/locks/` for private locks.

```json
{ "path": "src/api/auth.ts", "owner": "builder-01", "acquiredAt": 1724910000, "leaseUntil": 1724910060, "mode": "exclusive", "reason": "refactor auth flow" }
```

**Protocol:**

```ts
await locks.acquire("src/api/auth.ts", { owner: myId, leaseMs: 60_000, mode: "exclusive" })
// on success → edit freely for leaseMs (heartbeat to extend)
// on conflict → { ok: false, holder: "builder-02", until: ... } → wait, pick different file, or escalate to worktree
await locks.release("src/api/auth.ts")
```

Globs supported (`src/api/**/*.ts`) — the bus's `file.intent` is the soft pre-claim; `.agentlocks/` is the hard claim.

Cost: one `readFileSync` + `writeFileSync` + `mtime` check. No daemon, no port.

### 10.2 Layer 2 — Worktree isolation (strongest, default for parallel runs)

When `N` agents work in parallel, file locks are too fine-grained — give each agent **its own filesystem**.

```sh
git worktree add .lokma/worktrees/<agentId> -b worktree/<agentId> main
# each agent's cwd = its worktree; edits never touch each other
# merge: coordinator calls git merge worktree/<agentId> --squash per completed agent
```

This is Claude Code's `isolation: worktree` — the only primitive that makes `auth.ts` collision impossible at runtime. Lokma makes it the default when `maxConcurrent > 1` and agents diverge on `cwd`.

Merge is the only point where conflict surfaces — at which point we use §10.4.

### 10.3 Layer 3 — Snapshot guard + 3-way merge (safety net)

Even with locks/worktrees, a late heartbeat expiry or a manual `git stash` can cause a stale edit. Lokma's editors are **snapshot-guarded** (`hashline` pattern from `gptme`):

```ts
// Before edit, record sha256 of the file as the editor saw it
await edit_file({ path: "src/api/auth.ts", expectedSha: "a3f9...", newContent })
// Server: if current sha != expectedSha → reject with { conflict: true, currentSha, hunks }
// Caller can: re-read → 3-way merge → retry, or escalate to coordinator
```

No last-writer-wins. On reject, the editor does a **3-way merge** (`base: expectedSha`, `theirs: currentFile`, `ours: newContent`) via `diff3`. Hunks that don't overlap auto-merge; overlapping hunks emit `merge.request` to the coordinator, which asks one owner to rebase.

### 10.4 Combined architecture (the diagram)

```
   Agents (N concurrent)
      │  file.intent (bus broadcast — soft pre-claim)
      ▼
   Coordinator (quorum = 1 per project)
      │  grant/deny
      ▼
   .agentlocks/<sha1(path)>.json  ──heartbeat every 30s──► lease until
      │  + snapshotSha
      ▼
   Editor (edit_file / write_file / apply_patch)
      │  expectedSha guard
      ├─► worktree: each agent edits its own tree — no runtime conflict
      └─► shared cwd: lock wins, otherwise 3-way merge on stale sha
      ▼
   Merge (coordinator): squash per-agent branch, diff3/AST merge driver
```

A single `edit_file` therefore touches three protections: **who owns the lease, what sha you expected, what tree you edit in**. Redundancy is the point — one layer catching a bug the other missed is the correct outcome.

### 10.5 CRDT / OT — intentionally not v1

Raw §5 considered CRDT/OT (Yjs, Automerge). They solve convergence mathematically but impose data-structure tax (typed entities, not raw files) and still need UI for intent ("I intend to refactor auth.ts"). Lokma defers CRDT to a later pane-collaboration feature (multi-cursor on one file), not agent parallelism.

---

## 11. Web Management — Agents Pane & DnD

### 11.1 Layout (flexlayout-react, as in 24-*)

```
┌─ left sidebar (draggable TabSets) ─────────────────────────────────────┐
│ [Sessions] [Projects]  │           [Editor + Terminal]              │ [Agent Hub] │
│  ─ session list        │           [Monaco diff / xterm]            │  agent cards│
│  ─ project tree        │                                            │  model pill │
│                        │   center: session transcript + live logs   │  mem pill   │
│  draggable: Sessions ↔ Projects (swap), Projects ↔ Agent Hub        │  caps HUD  │
├────────────────────────┼────────────────────────────────────────────┼─────────────┤
│ [Vault] [Graph]        │           [Live terminal logs]             │ [File Browser] │
│  tree (folders)        │           one xterm per running agent      │  per-project│
│  force-graph 2D        │           multiplexed WS /ws/:sessionId    │  (worktree) │
└────────────────────────┴────────────────────────────────────────────┴─────────────┘
```

- Left: `Sessions` / `Projects` TabSets — swappable via drag. Right: `Agent Hub` (always visible when `maxAgents > 0`) + `File Browser` + `Vault` + `Graph`.
- Center: editor + terminal + the harness transcript for the selected session/agent.
- Each `agent card`: avatar (persona icon), name, model pill (`claude-opus`/`gpt-5`), state dot (`idle/running/paused/queued`), token/USD today, `SOUL` excerpt (hover), `⏸ ■` controls.
- Drag `session → agent card` → "hand this session to this agent" (reassign).
- Drag `agent card → agent card` → merge request (coordinator rewrites ownership).

### 11.2 Creation & settings flow

- `New Agent` → modal: name, persona (6 templates + Custom → `SOUL.md` editor), model picker (disabled models grey), `cwd`/worktree toggle, `budgets` + `max*` display.
- `Agent → Settings` → `SOUL.md` (Monaco), `MEMORY.md` (view + `Promote to global`), `Model & budgets`, `Tools` allow/deny, `Vault sync` toggle, `Delete`.

### 11.3 Browser harness per agent

`browser harness` (from `24-*`) is per-agent-capable: `GET /api/agents/:id/browser/open` → worktree-scoped browser tab. So one builder can drive a Chrome in its worktree while another runs tests.

---

## 12. Config, Schema & APIs

### 12.1 Config hierarchy (extends 26-*)

```jsonc
// ~/.lokma/config.json (global, §8 of 26-*)
{
  "agents": {
    "maxAgents": 20,         // cap #1 — how many exist
    "maxConcurrent": 5,      // cap #2 — how many run at once
    "maxQueue": 20,
    "maxSpawnDepth": 3,
    "defaultModel": "anthropic/claude-4-sonnet",
    "memory": { "agent_char_limit": 8000 },
    "budgets": { "tokens": 500_000, "usd": 10.0 }
  },
  "locks": { "heartbeatMs": 30_000, "leaseMs": 60_000, "dir": ".agentlocks/locks" },
  "coordinator": { "mode": "auto" } // auto | pinned | off
}
```

Per-project override: `.lokma/settings.json` `agents.*` — same keys, project-scoped. Per-agent: `~/.lokma/agents/<id>/config.json` `model/fallback/budgets/tools` as in §4. Precedence: `agent config > project settings > global config > env LOKMA_* > defaults`.

### 12.2 Zod schemas (shared, `lokma-shared`)

```ts
const AgentSchema = z.object({
  id: z.string(), name: z.string(), persona: z.enum(["reviewer","planner","tester","researcher","builder","custodian","custom"]),
  model: z.string(), provider: z.string(), fallback: z.array(z.string()).default([]),
  state: z.enum(["idle","queued","running","paused","completed","failed","killed"]),
  memory: z.object({ char_limit: z.number().default(8000), used: z.number() }),
  budgets: z.object({ tokens: z.number(), usd: z.number(), perTurn: z.number().optional() }),
  createdBy: z.string(), // "human" | "ai:<parentId>"
  worktree: z.string().optional(),
});
const LockSchema = z.object({ path: z.string(), owner: z.string(), leaseUntil: z.number(), mode: z.enum(["exclusive"]) });
```

### 12.3 REST + WS

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| `GET` | `/api/agents` | List agents (state, model, tokens) | Bearer |
| `POST` | `/api/agents` | Create agent `{ name, persona, model, soul, cwd, budgets, reason }` — enforces `maxAgents` | Bearer |
| `GET` | `/api/agents/:id` | One agent + `SOUL.md` + `MEMORY.md` preview + sessions | Bearer |
| `PATCH` | `/api/agents/:id` | Update SOUL/config/budgets/model | Bearer |
| `POST` | `/api/agents/:id/fork` | Fork/clone | Bearer |
| `POST` | `/api/agents/:id/run` | Start a session `{ prompt, priority }` — enforces `maxConcurrent` → queue or run | Bearer |
| `POST` | `/api/agents/:id/pause|resume|kill` | Lifecycle | Bearer |
| `DELETE` | `/api/agents/:id` | Delete (kills if running) | Bearer |
| `GET` | `/api/agents/:id/memory` | Agent-local MEMORY.md (§) | Bearer |
| `POST` | `/api/agents/:id/memory/promote` | Promote entry to global | Bearer |
| `GET` | `/api/agents/:id/mail` | Mailbox | Bearer |
| `POST` | `/api/agents/:id/mail/send` | Send to another agent `{ to, type, body }` | Bearer |
| `POST` | `/api/agents/:id/bus/broadcast` | Broadcast | Bearer |
| `GET` | `/api/locks` | File-ownership graph | Bearer |
| `POST` | `/api/locks/acquire` | Acquire `{ path, leaseMs }` | Bearer |
| `POST` | `/api/locks/:sha/heartbeat` | Extend lease | Bearer |
| `POST` | `/api/locks/:sha/release` | Release | Bearer |
| `GET` | `/api/vault/graph` | Graph (`?folder=lokma&depth=2`) | Bearer |
| `WS` | `/ws/:sessionId` | Transcript + live logs (per-agent) | query `token=` |

---

## 13. Extras — 20+ Ideas Beyond the Spec

Researched from 2025-26 harness trends (AutoGen Studio, LangGraph time-travel, Agent Canvas, CrewAI flows, OpenHands evals, Hermes Honcho, Kotaro graph, etc.). Not all for v1 — ranked by value for a **coding** harness.

| # | Idea | What | Why for Lokma | How |
|---|------|------|---------------|-----|
| 1 | **Agent templates marketplace** | Shareable `SOUL + config + MEMORY` packs as hub skills | Cold-start a specialist without writing SOUL | `agentskills.io/lokma-persona-secure-auditor`, `lokma skills install` |
| 2 | **Per-agent cost budgets** | Tokens + USD cap per agent (done above) + hard/soft alert at 80% | Keeps self-spawning from bankrupting you | Ledger per `agentId`, `error_max_budget` as in Claude Code |
| 3 | **Eval harness per agent** | Run `eval_suite` (bench: correctness, tool use, cost) as skill before promoting agent | Know if your "secure-auditor" persona actually finds bugs | `lokma agent eval <id> --suite coding` (OpenHands `openhands/evaluation` pattern) |
| 4 | **Time-travel / resume from checkpoint** | Fork any past turn, re-branch with different model/persona | "What if reviewer-01 had been on opus?" without re-running the whole session | JSONL checkpoint + `lokma session fork <id> --at turn 12 --model ...` |
| 5 | **Cron per agent** | `agent.cron: "every 2h"` — agent runs scheduled tasks autonomously | Nightly test runs, vault curation, dependency bumps | `hermes cron`-style, but scoped: `POST /api/agents/:id/cron` |
| 6 | **Human-in-the-loop approvals per agent** | Per-agent `approvalPolicy: { mode: "ask"|"auto"|"nuanced" }` | Let builder auto-edit but require approval for deploy | Approval service as in Cordis `ctx.approval` — WS push to Web |
| 7 | **Observability pane** | Trace per agent: latency, tokens, tool calls, lock waits, merge stalls | Debug "why is builder-02 slow?" | `POST /api/agents/:id/trace` → `Recharts` timeline (see §11) |
| 8 | **Handoff protocol** | Formal `handoff:{ to, why, contextPacket }` so one agent hands off *all* context to another without losing history | Planner → builder without re-explaining | `agent.handoff: { sessionId, compressedTranscript }` |
| 9 | **Auto-scaling** | Grow `maxConcurrent` with load up to a project cap, shrink on idle | Don't leave 4 cores idle when queue is 10 deep | `agents.autoscale: { min: 2, max: 8, scaleMs: 30_000 }` |
| 10 | **Sandbox per agent** | Modal: Docker per agent vs shared host (like OpenHands V1/V0) | Untrusted generated code can't touch host | `agents.sandbox: "docker"|"host"` — `openhands.workspace`-style switch |
| 11 | **Browser per agent** | One DevTools session per agent (isolated profile) | Two builders can each drive a Chrome on their worktree's storybook | `GET /api/agents/:id/browser/open` from §11 |
| 12 | **Skill sharing across agents** | `skill_view` result cached per-project, not per-agent; `patch` by one agent visible to all | One fix improves all agents of that type | `registry.shared = true` flag |
| 13 | **Voice per agent** | TTS `voiceId` per agent (ElevenLabs), spoken summary on completion | Glanceable "reviewer finished" without reading | `agents.voice: { provider: "elevenlabs", voiceId }` (Hermes `voice` parity) |
| 14 | **Agent-vs-agent adversarial review** | Auto-spawn a second agent to try to falsify the first's claim (as in Claude workflows' verifier vote) | Catches hallucinations cheaply | `orchestration.verify({ claim, verifierPersona: "skeptic" })` |
| 15 | **Token-tiered routing** | Cheapest model for planning/locking, expensive only for synthesis | Big savings on fan-out (10× haiku + 1× opus) | `delegationModel` (§4.3) + per-task model hint |
| 16 | **Worktree GC** | Auto-delete idle worktrees after TTL (`worktrees.ttl_days: 7`) | Disk doesn't fill with 20 stale trees | `lokma worktree gc --dry-run` |
| 17 | **Replay / deterministic re-run** | Re-run a session from JSONL with same model/tools but new prompt (for regression testing) | Test "does the new prompt still produce the same patch?" | `lokma session replay <id> --with-prompt "new"` |
| 18 | **Agent import from MCP** | An MCP server can return an `agentTemplate` (SOUL+config) — one MCP call installs a whole agent type | MCP team templates (e.g. `crewai-mcp:team.frontend`) | `tools/get_agent_templates` → `create_agent` loop |
| 19 | **Affinity & work-stealing** | Prefer running same-model agent on same machine/provider; idle agents steal from overloaded queues | Fewer cold starts, cheaper cache hits | `agents.affinity: "model"` + `queue.workStealMax: 2` |
| 20 | **Session drag→agent (the ask)** | Drag a session card onto an agent card → handoff + continue (or clone + continue) | Literally the user's "session içine başka session sürükleyip bırakma" | `POST /api/agents/:id/handoff --from <sessionId>` (flexlayout DnD) |
| 21 | **Gate: `lokma doctor` for agents** | Check: `SOUL.md` parseable, `MEMORY.md` under cap, worktree exists, model reachable, credential valid, locks not stale | One command to know if your 10 agents are healthy | `lokma doctor --agents` |
| 22 | **Vault: agent memory as marketed provenance** | Cross-agent vault graph highlights "who taught the vault this?" (edge label = `agentId`) | Explain where a memory came from | `links[].provenance: agentId` in `GET /api/vault/graph` |
| 23 | **Shareable share link per agent trace** | Like Sunumly's share-tier, but for an agent session (`/share/agent/<id>`) | Demo a builder's run without granting edit | `POST /api/agents/:id/share` (same tier as `26-*`) |

Pick 1-8 + 11 + 20 for v1; the rest are stretch.

---

## 14. Roadmap Integration

This doc auto-appends these items to the phase plan (see `25-WEB-ROADMAP.md` / `03-YOL-HARITASI.md`). Not a replacement — an **insertion** after the harness parity track.

| Phase | What this doc adds | Dependencies |
|-------|--------------------|--------------|
| **0 — Scaffold** | `~/.lokma/agents/` layout, `AgentSchema` Zod, `registry.ts` + `orchestrator.ts` stubs, `locks/` + `worktree` helpers, `.agentlocks/` gitignore, persona templates in `skills/lokma-personas/`, feature flag `agents` (off by default) | `26-*` config done |
| **1 — Core Loop + Agents (MVP)** | CRUD: `lokma agent create/config/run/pause/kill/fork/delete`, REST `GET/POST /api/agents`, `caps` enforcement (`maxAgents`/`maxConcurrent` → queue), `SOUL.md` editor, per-agent `model` + `MEMORY.md` + `budgets` + `TokenLedger agentId`, agent-scoped `session_search`, `Agent Hub` read-only pane | scaffold |
| **1.5 — Self-Spawning** | `create_agent` tool gated by `agent-spawner` skill, `createdBy: ai:<parentId>` + `AUDIT.md`, `maxSpawnDepth: 3`, MCP `agents` tools — user-toggleable safety | core |
| **2 — Parallel & Safe** | `.agentlocks/` advisory locks + `heartbeat`/`lease`, `git worktree` isolation per concurrent agent, `expectedSha` snapshot guard + `diff3` merge, `Bus` (SQLite+WS) + `Coordinator`, `heartbeat` reaping, live terminal multiplex | core |
| **2.5 — Communication** | Typed bus (`mailbox` + `broadcast`), `coordinator` ownership graph, `send_to_agent`, `merge.request` mediation, Web `Live logs` per agent + lock HUD | parallel |
| **3 — Polish & Extras** | Personas marketplace, per-agent `cron`, `handoff` (drag session→agent #20), `observe` trace timeline, `time-travel`, `doctor --agents`, `browser per agent`, `Vault graph provenance`, share links | all above |

---

## 15. References

- Raw dossiers (2026-08-31): `raw/30` (603L, 18+ sources, Claude/OpenHands/AutoGen/CrewAI/LangGraph) · `raw/31` (826L, SOUL/Honcho/personas) · `raw/32` (857L, locks/worktrees/CRDT/hashline) · `raw/33` (413L, 23 extras)
- Hermes: `hermes-agent/AGENTS.md`, `prompt_builder.py`, `skill_utils.py`, `agent/SOUL.md` pattern, `memory` tool, `session_search`, `HERMES_OPTIONAL_SKILLS_DIR`
- Claude Code: `code.claude.com/docs/en/sub-agents` (Agent tool, `maxConcurrent=20`, `maxDepth=3`, `isolation: worktree`, 15-step `runAgent`), `worktrees` doc, `workflows` (Dynamic Workflows `parallel/pipeline/phase`)
- DeepSeek: `deepseek-harness/docs/cordis-primer.md` + `architecture.md` + `cordis-tutorial/` (Context, `emit/waterfall/bail`, everything-is-a-plugin) · `dsh-market` — `30-*` extensions: agents as plugins
- OpenHands SDK: `docs.openhands.dev/sdk/arch/{overview,events,tool-system}` (append-only `Action/Observation` log, `Local` vs `Remote`/`Agent Server`, parallel tool coalescing)
- AutoGen / CrewAI / LangGraph: `auto-gents`, `LangGraph graph-api` (Supervisor + subgraph nodes, pub/sub `TopicId→AgentId`, CrewAI `Agent/Task/Crew`+tools)
- Vault: `memory.fermag.com.tr` (`vault/**/*.md`, `POST /api/ingest`, `GET /api/graph`), `memory-vault-sync.py`, `memory-vault-routes.json`, `basic-memory` (entity graph)
- Conflict: `gptme/hashline_edit`, `weave/aura` semantic merge, `openhands.workspace` (Docker vs in-process)

---

*Next: roadmap PR — `03-YOL-HARITASI.md` + `25-WEB-ROADMAP.md` expansion from this doc + `Docs/README.md` + `00-LOKMA-KONTEKST.md` + push. Raw: `raw/30-33`.*
