# Per-Agent Personality & Memory for AI Coding Agents — Research Dossier

> **Scope:** How Lokma (and its closest relatives — Hermes Agent, Honcho, Claude Code, OpenCode, agentskills) gives each *agent* its own personality and memory, with isolated model selection and scoped recall. Written as raw research for `Docs/` synthesis.
> **Languages:** English only (per brief).  
> **Sources consulted:** ≥ 7 distinct origins (see §7 Sources). Scraped 2026-08-31.

---

## Table of Contents

1. [How Agents Get Personality](#1-how-agents-get-personality)
   - 1.1 SOUL.md — the durable identity file
   - 1.2 System prompt stack & slot #1
   - 1.3 /personality — session-level overlays
   - 1.4 Persona files beyond SOUL.md (USER.md, AGENTS.md, SKILL.md)
   - 1.5 Honcho dialectic modeling — reasoning-backed personality
   - 1.6 Anti-patterns & security scanning
2. [Per-Agent Memory](#2-per-agent-memory)
   - 2.1 Two local stores: MEMORY.md vs USER.md
   - 2.2 The infinite layer: session history + FTS5 + compaction
   - 2.3 session_search — the three calling shapes
   - 2.4 External memory providers (the "infinite memory" switch)
   - 2.5 Compaction, compression & curator lifecycle
3. [Per-Agent Model Selection](#3-per-agent-model-selection)
   - 3.1 One config per agent (profile isolation)
   - 3.2 Provider & model pinning
   - 3.3 Fallback chain & credential pools
   - 3.4 Per-agent cost tracking
   - 3.5 Aux models & delegation model
4. [How Memory Is Scoped](#4-how-memory-is-scoped)
   - 4.1 The four layers an agent actually sees
   - 4.2 Profile isolation — the hard boundary
   - 4.3 Project vs global vs agent-local
   - 4.4 What crosses the boundary (and what never does)
5. [Personality Marketplace & Templates](#5-personality-marketplacetemplates)
   - 5.1 The agentskills standard (SKILL.md = portable capability)
   - 5.2 Marketplaces: skills.sh, agentskills.io, hermeshub, GitHub
   - 5.3 Premade personas: reviewer / planner / tester and beyond
   - 5.4 AgentSoul & persona-ai — souls as installable bundles
   - 5.5 Distribution: `profile export` and managed scope
6. [Implications for Lokma](#6-implications-for-lokma)
7. [Sources](#7-sources)
8. [Appendix — File Map & Quick Reference](#8-appendix)

---

## 1. How Agents Get Personality

### 1.1 SOUL.md — the durable identity file

Hermes Agent's primary finding: **every agent instance has exactly one `SOUL.md` and it lives with the agent, not the project.**

- **Location:** `~/.hermes/SOUL.md` for the default profile, or `$HERMES_HOME/SOUL.md` when a custom home is set (per-profile path is `~/.hermes/profiles/<name>/SOUL.md`). Hermes *never* looks in the working directory for `SOUL.md`. This is deliberate — if personality followed `cwd`, a `cd` would silently change who the agent is.
- **Seeding:** On first run Hermes creates a starter `SOUL.md` if none exists. Existing files are **never overwritten** on upgrade — user-authored identity is sacred.
- **What belongs in it:** durable voice and posture. The canonical guidance from docs is:
  - *Do* put: tone, communication style, directness level, default interaction style, what to avoid stylistically, how to handle uncertainty/disagreement/ambiguity.
  - *Do not* put: one-off project instructions, file paths, repo conventions, ports, temporary workflows. Those belong in `AGENTS.md` / `.hermes.md`.
- **Good SOUL.md is** stable across contexts, broad enough to apply in many conversations, specific enough to change output, focused on communication not tasks.

**Example (from Hermes docs, lightly adapted):**

```markdown
# Personality
You are a pragmatic senior engineer with strong taste.
You optimize for truth, clarity, and usefulness over politeness theater.

## Style
- Be direct without being cold
- Prefer substance over filler
- Push back when something is a bad idea
- Admit uncertainty plainly
- Keep explanations compact unless depth is useful

## What to avoid
- Sycophancy / hype language
- Repeating the user's framing if it's wrong
- Overexplaining obvious things

## Technical posture
- Prefer simple systems over clever systems
- Care about operational reality, not idealized architecture
```

A real-world SOUL.md observed in this vault (default profile) is much terser — a single identity line plus operational nudges ("commit in English, save to memory vault") — proving the file tolerates anything from a paragraph to a 2-page charter.

### 1.2 System prompt stack & slot #1

`SOUL.md` is **slot #1** of the assembled system prompt. The full Hermes prompt stack (top → bottom) is:

1. `SOUL.md` — or built-in fallback identity ("You are Hermes Agent, built by Nous Research. Be direct…") if the file is empty/missing/unreadable.
2. Tool-aware behavior guidance (what tools exist, how to call them).
3. Memory / user context (frozen `MEMORY.md` + `USER.md` snapshot — see §2).
4. Skills guidance (which skills are installed, progressive disclosure hint).
5. Context files (`AGENTS.md` / `.hermes.md` / `CLAUDE.md` / `.cursorrules` — first match wins, see §4).
6. Timestamp + platform-specific formatting hints.
7. Optional personality overlay (`/personality` — see §1.3).

`SOUL.md` content is injected **verbatim** after two transforms: prompt-injection scanning (blocks "ignore previous instructions", `curl $API_KEY`, hidden `<div style="display:none">`, zero-width spaces, etc.) and truncation if it exceeds the model's `context_file_max_chars` budget. No wrapper prose is added — what you write is what the model reads.

`agent.system_prompt` in `config.yaml` is a separate, manual escape hatch: raw system-prompt text you write yourself. It applies **only when no `/personality` is active** and is rarely needed — prefer `SOUL.md`.

### 1.3 /personality — session-level overlays

`SOUL.md` is the **baseline voice**. `/personality` is the **temporary mode switch**.

| Aspect | SOUL.md | /personality |
|---|---|---|
| Durability | Permanent, per-agent, survives restarts | Session-scoped; clears on `/personality none` or new session |
| Storage | File on disk | Name in `display.personality` in `config.yaml` |
| Scope | Every conversation for that agent | Only the current session |
| Example | "Pragmatic senior engineer" | `teacher`, `concise`, `creative` for one task |

**Built-in personalities shipped with Hermes** (every surface: CLI, TUI, desktop, messaging):

`helpful`, `concise`, `technical`, `creative`, `teacher`, `kawaii`, `catgirl`, `pirate`, `shakespeare`, `surfer`, `noir`, `uwu`, `philosopher`, `hype`.

Switch with `/personality <name>` (CLI) or `/personality teacher` (Telegram/Discord/etc.). Reset with any of `/personality none` / `default` / `neutral` or bare `/personality`. On first run after an upgrade, Hermes migrates stale saved personalities to `none` once so an old selection doesn't silently re-enable.

**Custom personalities** are added in `config.yaml`:

```yaml
agent:
  personalities:
    codereviewer: >
      You are a meticulous code reviewer. Identify bugs, security issues,
      performance concerns, and unclear design choices. Be precise and constructive.
    planner: >
      You are a staff-level technical planner. Before coding, produce an execution plan
      with risks, alternatives, and a dependency-ordered task list.
    tester: >
      You are a QA engineer. Write failing tests first, cover edge cases,
      and never mark a task done without `make test` evidence.
```

Then `/personality codereviewer` activates it. Reusing a built-in name shadows it. This is exactly how a "personality marketplace" of reviewer/planner/tester etc. is bootstrapped locally before any external hub is needed.

**Recommended workflow (from Hermes docs):**

1. Keep one thoughtful global `SOUL.md`.
2. Put project rules in `AGENTS.md`.
3. Use `/personality` only for the task at hand.

That keeps voice stable, project behavior where it belongs, and temporary control cheap.

### 1.4 Persona files beyond SOUL.md

Hermes distinguishes four markdown roles (see also §4):

- **`SOUL.md`** — who the agent *is*.
- **`USER.md`** — who the *user* is (name, role, timezone, comms preferences). Written by the agent via the memory tool, not hand-edited.
- **`MEMORY.md`** — what the agent *has learned* (environment facts, conventions, tool quirks, completed work). Also agent-written.
- **`AGENTS.md` / `.hermes.md`** — what the *project* needs. Human-authored, lives in the repo.

A rule of thumb repeated in every doc: *"If it should follow you everywhere, it belongs in SOUL.md. If it belongs to a project, it belongs in AGENTS.md."*

`SKILL.md` (from the agentskills standard — see §5) is a fifth persona-like file, but scoped to *capability* not identity: when a skill loads, its instructions extend the agent's behavior for that task (e.g., "when reviewing a PR, check…").

### 1.5 Honcho dialectic modeling — reasoning-backed personality

The most distinctive entry in the Hermes memory stack is **Honcho** (Plastic Labs), which gives each agent a *learned* personality model rather than a static prompt.

**Core idea:** Honcho is "memory that reasons." Every message is stored, then background reasoning models derive latent conclusions that static RAG would miss (contradictions, patterns over time, inferred preferences).

**Four primitives:**

```
Workspaces → have → Peers
Workspaces → have → Sessions → have → Messages
Peers ← many-to-many → Sessions
```

- **Workspaces** — top-level isolation (one per app/environment; Hermes maps one `workspace` string across all profiles that should share a user).
- **Peers** — any entity that persists and changes: the *user peer* (`peerName`) and one *AI peer* per Hermes profile (`aiPeer`). Each AI peer builds an **independent representation/card** from its own observations, so a `coder` profile stays code-oriented while a `writer` profile stays editorial — same user, different lenses.
- **Sessions** — temporal threads between peers.
- **Messages** — units that trigger reasoning.

**Two-layer injection into the prompt (the dialectic):**

1. **Base layer** — session summary + peer representation + peer card, refreshed every `contextCadence` turns (default `1`). This is cheap factual recall.
2. **Dialectic supplement** — an LLM `peer.chat()` call that reasons over the base context to answer the current user message, refreshed every `dialecticCadence` turns (default `2`), with `dialecticDepth` passes (1–3: cold/warm prompt → self-audit → reconciliation), capped to `dialecticMaxChars` (default `600`).

The dialectic **auto-selects cold-start vs warm prompts** based on whether base context exists, and **scales reasoning level by query length** (longer query → deeper reasoning, up to `reasoningLevelCap`). Three orthogonal knobs control cost independently:

- `contextCadence` — API call frequency (base layer).
- `dialecticCadence` — LLM call frequency (dialectic).
- `dialecticDepth` / `dialecticDepthLevels` / `dialecticReasoningLevel` — depth of reasoning.

In Hermes, this surfaces as configurable keys in `$HERMES_HOME/honcho.json` (`contextCadence`, `dialecticCadence`, `dialecticDepth`, `dialecticDepthLevels`, `dialecticReasoningLevel`, `dialecticDynamic`, `dialecticMaxChars`, `dialecticMaxInputChars`, `recallMode`, `writeFrequency`, `saveMessages`, `observationMode`, `sessionStrategy`, …) plus per-profile host blocks (`hermes`, `hermes.coder`, …).

**Dual-peer observation model** (the most relevant for per-agent personality):

Each host block can override `observation` per peer:

```json
"hermes.coder": {
  "aiPeer": "coder",
  "observation": {
    "user": { "observeMe": true, "observeOthers": true },
    "ai":   { "observeMe": false, "observeOthers": true }
  }
}
```

Four toggles: `user.observeMe`, `user.observeOthers`, `ai.observeMe`, `ai.observeOthers`. Presets: `directional` (all true — full mutual observation) vs `unified` (single-observer pool). This lets a reviewer agent observe the user but not model itself, while a generalist models both.

**Why this matters for Lokma:** Static `SOUL.md` gives *declared* personality; Honcho gives *learned* personality that tracks drift. The two compose: `SOUL.md` says "be direct, be a reviewer," Honcho says "this user prefers diff-first reviews and hates nitpicks on naming" — automatically inferred after 20 sessions.

### 1.6 Anti-patterns & security scanning

All identity files (`SOUL.md`, `AGENTS.md`, `MEMORY.md`, `USER.md`, `SKILL.md`) pass through the same **threat-pattern scanner** before prompt inclusion:

- Instruction overrides ("ignore previous instructions", "disregard your rules").
- Deception ("do not tell the user").
- System prompt overrides.
- Hidden HTML comments / `<div style="display:none">`.
- Credential exfiltration (`curl ... $API_KEY`, `cat .env`).
- Invisible Unicode (zero-width spaces, bidi overrides).

Blocked content is replaced with `[BLOCKED: ...]` — the file still loads, just that span is removed. This means a shared repo's poisoned `AGENTS.md` cannot silently hijack a Lokma agent's personality.

---

## 2. Per-Agent Memory

### 2.1 Two local stores: MEMORY.md vs USER.md

Hermes' built-in memory is **bounded, curated, and frozen at session start**. Two files, both under `~/.hermes/memories/` (or `~/.hermes/profiles/<name>/memories/`):

| File | Purpose | Char limit | Typical entries |
|---|---|---|---|
| `MEMORY.md` | Agent's personal notes — env facts, conventions, tool quirks, lessons learned, completed-work diary | 2,200 chars (~800 tokens) | 8–15 |
| `USER.md` | User profile — name, role, timezone, comms style, expectations, pet peeves | 1,375 chars (~500 tokens) | 5–10 |

**Total injected every turn:** ~1,300 tokens fixed cost. Always visible, always available.

**How it appears in the prompt:**

```
═══════════════════════════════════════════════
MEMORY (your personal notes) [67% — 1,474/2,200 chars]
═══════════════════════════════════════════════
User's project is a Rust web service at ~/code/myapi using Axum + SQLx
§
This machine runs Ubuntu 22.04, has Docker and Podman installed
§
User prefers concise responses, dislikes verbose explanations
```

Entries are `§`-delimited, multiline-capable, with a usage header so the agent knows capacity.

**Tool surface:** The agent itself manages memory via the `memory` tool — `add`, `replace` (substring match on `old_text` — unique short span identifies the entry; errors if ambiguous), `remove`. No explicit `read` — content is already in context from session start. Duplicate exact content is rejected. Writes persist to disk immediately; because the prompt is a **frozen snapshot**, the new entry won't appear in the injected block until the next session — but the agent can still act on it within the current conversation (it's in history), and tool responses always show live state.

**What the agent saves (proactively, no user ask needed):**

- User preferences ("I prefer TypeScript over JavaScript" → `USER.md`)
- Environment facts ("This server runs Debian 12, Postgres 16" → `MEMORY.md`)
- Corrections ("Don't use sudo for docker, user is in docker group")
- Conventions ("Tabs, 120-char width, Google-style docstrings")
- Completed work ("Migrated MySQL→Postgres on 2026-01-15")
- Explicit requests ("Remember API key rotation is monthly")

**What it skips:**

- Trivial/vague ("User asked about Python")
- Re-discoverable facts ("Python 3.12 supports f-string nesting")
- Raw dumps (logs, large code blocks)
- Session ephemera (temp paths)
- Anything already in `SOUL.md` / `AGENTS.md`

**Security & limits:** Every entry is scanned for injection/exfiltration and invisible Unicode. When a write would exceed the char limit, the tool **errors** instead of silently dropping — the agent must `replace`/`remove` to consolidate within the same turn before retrying. Above ~80% capacity the agent is nudged to merge overlapping entries.

This vault's observed `MEMORY.md` is ~90 KB — a single long-lived agent that has accumulated an unusually rich set of infra and product notes, past the nominal limit via direct file editing (a known escape hatch: the limit is enforced by the tool, not `fs.write`).

### 2.2 The infinite layer: session history + FTS5 + compaction

Bounded `MEMORY.md`/`USER.md` is only the *curated* layer. The **infinite** layer is every session the agent has ever had.

- **Storage:** `~/.hermes/state.db` — SQLite with WAL journal mode, ~tens of MB to GB depending on history. Configurable under `database:` in `config.yaml` (`journal_mode: wal|delete`, `synchronous`, `wal_autocheckpoint`, `journal_size_limit`).
- **Index:** `messages_fts` — an **FTS5** virtual table over message content. Search latency is ~20 ms for queries, ~1 ms for scroll inside a session. All CLI and gateway sessions are stored (CLI, telegram, discord, slack, whatsapp, signal, matrix, mattermost, email, sms, webhook, …).
- **Schema:** Each session records: user ID, session title (human-readable), model name+config, system prompt snapshot, full message history (role, content, tool calls/results), token counts, timestamps (`started_at`, `ended_at`), parent session ID (for compression-triggered splits). Messages table holds full history; FTS5 mirrors content for search.
- **Retention & pruning:** History is **opt-in pruned**. Defaults:
  ```yaml
  sessions:
    auto_prune: false          # history preserved by default — valuable for recall
    retention_days: 90
    vacuum_after_prune: true
    min_vacuum_interval_days: 30
    min_interval_hours: 24
  ```
  Active sessions are never auto-pruned. When pruning runs, `VACUUM` reclaims space (SQLite does not shrink on `DELETE`). Manual controls: `hermes sessions prune`, `hermes sessions delete <id>`, `hermes sessions export backup.jsonl`, and non-destructive `hermes sessions optimize` which merges FTS5 index segments + VACUUMs without deleting rows.
- **Context compression:** When a session's context approaches the model's window, Hermes **compresses** rather than dropping. The `compression` settings (`enabled`, `threshold: 0.50`, `target_ratio: 0.20`) trigger summarization that creates a new session with `parent_session_id` linking back, so recall still traverses the lineage.

Together: curated 1,300-token hot memory + unbounded, searchable, compressed cold memory. The hot layer is instant; the cold layer is free (no LLM calls) and indexed.

### 2.3 session_search — the three calling shapes

The agent's recall tool beyond `MEMORY.md` is `session_search` (FTS5 over `state.db`). It has three shapes — the agent is taught all three:

1. **Discovery** — `session_search(query="topic keywords", limit=3, sort="newest"|"oldest"|relevance)` → top-N matching sessions, top result fully hydrated (session metadata + anchored message window), lower results showing only the exact anchor message. Adaptive hydration keeps context lean.
2. **Scroll** — `session_search(session_id="20260225_143052_a1b2c3", around_message_id=42, window=5)` → a window of messages around an anchor inside a known session. Used after discovery to read forward/backward.
3. **Browse** — `session_search()` with no query → recent sessions (the inbox view). Also `hermes sessions list` on CLI, with `--workspace <needle>` to filter by git-repo path.

Results are **actual DB messages — no LLM summarization, no truncation** — so recall is verbatim and citable. The agent also uses `hermes sessions list` / `hermes sessions prune` / `hermes sessions export` via the terminal tool when operating outside the tool wrapper.

**User-facing recall in Hermes Desktop:** the Sessions pane is ordered by activity, pins canonical Bot Chats, and offers a picker that the agent's `session_search` mirrors programmatically.

### 2.4 External memory providers (the "infinite memory" switch)

Hermes ships **8 pluggable external providers**; only one can be active at a time, always *alongside* built-in memory (additive, not replacement). Select with `hermes memory setup` / `hermes memory status` / `hermes memory off`, or `memory.provider` in `config.yaml`.

| Provider | Storage | Cost | Tools | Unique feature |
|---|---|---|---|---|
| **Honcho** | Cloud / self-hosted | Paid / free | 5 (`honcho_profile`, `honcho_search`, `honcho_context`, `honcho_reasoning`, `honcho_conclude`) | Dialectic user modeling + session-scoped context |
| **OpenViking** | Self-hosted | Free | 6 | Filesystem hierarchy + tiered loading |
| **Mem0** | Cloud / self-hosted | Free/Paid | 4 | Server-side LLM extraction |
| **Hindsight** | Cloud/Local | Free/Paid | 3 | Knowledge graph + reflect synthesis |
| **Holographic** | Local | Free | 2 | HRR algebra + trust scoring |
| **RetainDB** | Cloud | $20/mo | 10 | Delta compression |
| **ByteRover** | Local/Cloud | Free/Paid | 3 | Pre-compression extraction |
| **Supermemory** | Cloud/self-hosted | Free/Paid | 4 | Context fencing + session graph ingest + multi-container |
| **Memori** | Cloud | Free/Paid | 5 | Tool-aware memory + structured recall |

When active, Hermes automatically: injects provider context into the system prompt, prefetches relevant memories before each turn (background, non-blocking), syncs conversation turns after each response, mirrors built-in writes, and adds provider-specific tools.

For **per-agent** memory (the question of this dossier), the critical point is **Honcho's multi-peer model** (see §1.5): each profile gets its own `aiPeer` while sharing the `workspace` and `peerName`. That is the reference implementation for "one user, many specialized agents, shared memory namespace but isolated representations."

Other providers implement per-agent isolation differently — typically via `$HERMES_HOME`-scoped file paths (local) or `container_tag` / `custom_containers` (Supermemory, cloud) — the doc comparison notes isolation explicitly:

> *Local storage providers (Holographic, ByteRover) use `$HERMES_HOME/` paths which differ per profile.*  
> *Config-file providers (Honcho, …) scope by profile-specific host blocks.*

An external provider is therefore the only sanctioned way for two agents to **share** memory — never point two processes at the same `HERMES_HOME`.

### 2.5 Compaction, compression & curator lifecycle

Three mechanisms keep memory from degrading as infinity grows:

- **Context compression** (`compression.enabled`, `threshold`, `target_ratio`) — bounded by `agent.max_turns` (default 90). When the context exceeds `threshold × model.context_length`, Hermes summarizes to `target_ratio` and forks a new session. The parent link is retained, so `session_search` can walk the lineage.
- **Curator** — a background skill lifecycle manager that tracks per-skill `use_count`, `view_count`, `patch_count`, `last_activity_at`, `state`, `pinned` in `~/.hermes/skills/.usage.json`. It marks stale agent-created skills for archival, keeps a pre-run `tar.gz` backup, and optionally runs an aux-model consolidation pass (`curator.consolidate: true`, off by default — the deterministic inactivity sweep costs zero tokens). Curator never touches bundled/hub-installed skills and never deletes — worst case is `archive`.
- **Memory write gating** — `memory.write_approval` in `config.yaml` optionally requires user confirmation before the agent persists a new `MEMORY.md`/`USER.md` entry (useful for audit-mode agents).

---

## 3. Per-Agent Model Selection

### 3.1 One config per agent (profile isolation)

**A Bot is a profile.** Hermes' primitive for per-agent everything — model, memory, skills, credentials, personality, cron jobs — is the **profile**: a separate Hermes home directory.

```
~/.hermes/                         # default profile
~/.hermes/profiles/<name>/         # one dir per agent
  config.yaml                      # its own model, tools, limits
  .env                             # its own API keys / bot tokens
  SOUL.md                          # its own personality
  memories/{MEMORY.md,USER.md}     # its own hot memory
  honcho.json                      # its own Honcho host block
  state.db                         # its own session history
  skills/                          # its own skills
  cron/jobs.json                   # its own routines
  auth.json                        # its own OAuth state
```

Profile commands:

```bash
hermes profile create coder                  # fresh, bundled skills seeded
hermes profile create work --clone           # copies config+.env+SOUL+skills, fresh memory/sessions
hermes profile create backup --clone-all     # full snapshot minus history/checkpoints
hermes profile create work --clone-from coder --clone-all
coder chat                                   # alias → hermes -p coder chat
hermes -p coder chat                         # explicit flag
hermes profile use coder                     # sticky default (like kubectl context)
hermes profile list                          # inventory
```

Every profile automatically gets a **command alias** at `~/.local/bin/<name>` so `coder setup`, `coder gateway start`, `coder skills list`, `coder doctor` all work. Bot Mode in Hermes Desktop is a UI over this primitive — `New Agent` clones or creates a profile, lets you pin a model, edit `SOUL.md`, and tick per-skill/toolset/MCP enablement — but everything remains visible from the CLI as `~/.hermes/profiles/<bot>/`.

The invariant repeated across docs: *Never point two agent processes at the same profile/home.* Both write memory automatically and each loads the other's writes into its prompt — state compounds into something nobody authored. Agents that need shared memory use an external provider (Honcho/Supermemory/etc.), not a shared `$HERMES_HOME`.

### 3.2 Provider & model pinning

Each profile's `config.yaml` holds:

```yaml
model:
  default: anthropic/claude-sonnet-4.6
  provider: anthropic                 # or openrouter, openai, gemini, deepseek, xai, …
  aux_model: deepseek/deepseek-v4-flash   # cheaper model for sub-tasks
  base_url: https://api.anthropic.com     # or custom/OpenAI-compatible endpoint
  key_env: ANTHROPIC_API_KEY
  discover_models: true

providers:
  omniroute:
    base_url: https://omniroute.fermag.com.tr/v1
    discover_models: true
    models: { … }
```

Hermes ships **35+ provider plugins** under `plugins/model-providers/`; a user plugin of the same name overrides built-in. Supported first-class: `openrouter`, `anthropic` (`ANTHROPIC_API_KEY`, also `CLAUDE_CODE_OAUTH_TOKEN`), `nous` (OAuth device code), `openai-codex`, `copilot` (`COPILOT_GITHUB_TOKEN`), `gemini`, `xai`, `deepseek`, `zai`/`glm`, `minimax`, `kimi`, `alibaba`, `xiaomi`, `huggingface`, `fireworks`/`novita`/`nvidia`/`deepinfra`/…, `bedrock`, `vertex`, `azure-foundry`, `custom`, `ollama-cloud`, and more.

**Switching models:**

- Interactive picker: `hermes model` / `hermes setup` (also `--portal` for OAuth-bundled provider).
- Direct: `hermes config set model.default anthropic/claude-opus-4` (or `hermes -p coder config set …` for a Bot).
- Per-invocation override: `hermes chat --model anthropic/claude-sonnet-4` (highest precedence — CLI args beat config).
- Built-in aliases are catalog-resolved against the active provider: `sonnet`, `opus`, `haiku`, `claude`, `gpt5`, `gpt`, `codex`, `o3`, `gemini`, `deepseek`, `grok`, `llama`, `qwen`, `minimax`, `nemotron`, `kimi`, `glm`…

**User-defined model aliases** (per-profile or global) live under `model.aliases`:

```yaml
model:
  aliases:
    fav: openrouter/anthropic/claude-sonnet-4.6
    local-qwen:
      model: qwen3.5:397b
      provider: custom
      base_url: "https://ollama.com/v1"
```

Then `/model fav` or `hermes chat --model fav` resolves via `hermes_cli/model_switch.py::resolve_alias()` — user aliases are checked **before** built-ins, so a user `sonnet` shadows the bundled one. In chat, `/model fav` is session-scoped; add `--global` to persist as default.

For Bot Mode agents: the Advanced panel in `New Agent` offers a **model & provider pin** — any provider/model pair Hermes knows about, per Bot. Leave unset to inherit from the launch profile. This is precisely "anthropic for reviewer, openai for planner" per-agent selection the brief asks about.

**Observed in this vault:** default profile pins `muse-spark-1.2-contributor` via provider `sex-go` (custom OpenAI-compatible base `https://opencode.ai/zen/go/v1`) with `aux_model: deepseek/deepseek-v4-flash` and `discover_models: true`, plus a large `providers.omniroute` override table (dozens of `auto/*`, `cmd/*`, `cw/*`, `lma/*`, `gweb/*`, `ds-web/*` aliases). Each Bot on this machine would inherit or override that independently.

### 3.3 Fallback chain & credential pools

**Fallback:** `hermes fallback add|remove|list` maintains an ordered fallback chain. When the primary provider/model fails (rate limit, outage, context overflow), Hermes walks the chain and rebuilds the request with rotated credentials. Provider timeouts are tunable:

```yaml
providers:
  anthropic:
    request_timeout_seconds: 300
    stale_timeout_seconds: 90
    models:
      claude-sonnet-4.6:
        timeout_seconds: 600
        stale_timeout_seconds: 120
```

These win over legacy env vars `HERMES_API_TIMEOUT` / `HERMES_API_CALL_STALE_TIMEOUT`. Fallbacks apply to the primary turn client, the delegation client, and rebuilds after rotation — so a reviewer Bot on Anthropic and a tester Bot on OpenAI can each have independent fallback graphs.

**Credential pools:** Multiple API keys/tokens per provider pool and **rotate automatically** (`hermes auth` / `auth.json` plus `~/.hermes/.env`). New Bots **share one OAuth/token pool** with the main profile by default so refreshes don't fork-invalid. Older gateways copied credentials (still functional, just forked).

**Auxiliary & delegation models** are separately pinned:

```yaml
delegation:
  model: anthropic/claude-haiku-4.5-20251001
  provider: anthropic
  max_concurrent_children: 3
  max_iterations: 50
  max_spawn_depth: 2

memory:           # optional memory side-car model
  provider: honcho

auxiliary:
  vision:
    api_key: ${GOOGLE_API_KEY}
```

A planner Bot might delegate to a cheap `haiku` sub-agent; a reviewer Bot might delegate to `gpt-5-mini` for test generation — each profile's `delegation.model` controls its own children.

### 3.4 Per-agent cost tracking

Hermes tracks cost **where cost originates — per turn, per session, per profile**. The mechanisms:

- **Display flag:** `display.show_cost: true` in `config.yaml` (per-profile) renders token + dollar cost in the spinner and per-turn summary. Enable per Bot to see reviewer cost vs tester cost side-by-side.
- **Provider token counts:** Every session stores `input_tokens` / `output_tokens` per message; the gateway/session layer aggregates them. Because each profile has its own `state.db`, a query like `SELECT sum(input_tokens+output_tokens) FROM messages` scoped to `~/.hermes/profiles/<bot>/state.db` is the per-agent ledger. No cross-profile leakage.
- **Honcho dialectic cost isolation:** The three Honcho cadence knobs (`contextCadence`, `dialecticCadence`, `dialecticDepth`) are per-host-block, so a cost-conscious tester Bot can run `dialecticCadence: 5` while a high-recall planner runs `1`. `contextTokens` caps injection per turn at word boundaries.
- **Credential-pool accounting:** Since pools are per-profile (or shared deliberately), billing follows the profile's API keys. A team that pins reviewer to Anthropic and planner to OpenAI sees spend in the corresponding dashboards — no Hermes-side cross-attribution.

For Lokma, the direct analogue is: expose `lokma cost --profile <bot>` that reads that profile's session DB, plus a `cost` field in the Web harness session header (the `sessions` schema in `22-WEB-FEATURES-provider-model-session.md` already plans token usage per session — extend it with `cost_usd` computed from the provider's pricing table).

### 3.5 Aux models & delegation model

`model.aux_model` is an explicitly cheaper model used for **auxiliary tasks** (vision pre-analysis when the primary model lacks native vision, skill evaluation scans, curator consolidation when `curator.consolidate: true`, etc.). Aux traffic does not count against the primary prompt cache and uses its own pool/endpoint so a vision-heavy tester doesn't burn Opus tokens.

`delegation.model` is the model that **subagents** (`delegate_task`) run on. This enables a classic cost ladder: planner Bot (Sonnet/Opus) spawns tester children on Haiku/Flash for bulk test generation, with `max_concurrent_children` capping fan-out per agent.

---

## 4. How Memory Is Scoped

### 4.1 The four layers an agent actually sees

At inference time, every agent turn sees a prompt assembled from up to four levels — in this exact precedence (deepest/most-specific wins verbally, but all are present):

| Layer | Source | Lifetime | Mutable by | First-match / progressive |
|---|---|---|---|---|
| **Global identity** | `SOUL.md` in `$HERMES_HOME` | Forever, per-agent | User (hand-edit) | Independent — always loaded, slot #1 |
| **Curated hot memory** | `MEMORY.md` + `USER.md` in `$HERMES_HOME/memories/` | Forever, per-agent | Agent (memory tool) | Frozen snapshot at session start |
| **External provider** | Honcho / Mem0 / … (if enabled) | Forever, per-agent | Agent + background reasoning | Injected before each turn (cadenced) |
| **Project context** | `.hermes.md` / `AGENTS.md` / `CLAUDE.md` / `.cursorrules` from `cwd` | This project only | User (commit to repo) | First match wins at startup; progressive subdirectory discovery during session |

Plus: **session context** (the current conversation window) — the only truly ephemeral layer.

The full prompt is assembled in `agent/prompt_builder.py::build_context_files_prompt()` at startup and `agent/subdirectory_hints.py::SubdirectoryHintTracker` during the session.

### 4.2 Profile isolation — the hard boundary

A Hermes **profile is an isolation domain**. The OS enforces it: separate directories, separate SQLite DBs, separate `.env` keys. Consequences:

- A `coder` agent never sees `reviewer`'s `MEMORY.md` — different `state.db`, different `memories/` dir.
- A `coder` session's FTS5 index does not contain messages from `reviewer`.
- Honcho isolation: `coder` has `aiPeer: "coder"`, `reviewer` has `aiPeer: "reviewer"`; they share a `workspace` only if configured to, and even then each builds an **independent representation** — same user facts, different salience.
- Credential isolation: each profile's `auth.json` / `.env` separates spend and rate limits.

**What breaks isolation:** Setting two profiles' `HERMES_HOME` to the same path, or manually copying `state.db` between profiles. Both are user errors documented as "do not point two agent processes at the same Hermes home."

### 4.3 Project vs global vs agent-local

This is the most common confusion (Hermes dedicates a whole page — "Which File Does What?" — to it). The rule:

- **Agent-local (global to that agent):** `SOUL.md`, `MEMORY.md`, `USER.md`, `honcho.json`, provider `container_tag` (if set) — follow the agent wherever its `cwd` moves. Edit `~/.hermes/profiles/coder/SOUL.md` and every project that `coder` opens sees the same voice.
- **Project-local:** `AGENTS.md` (and `.hermes.md` which shadows it), `.cursorrules`, `CLAUDE.md` — live in the repo, walk up to the git root, fork per subdirectory progressively. A `coder` agent doing `cd ~/work/frontend` picks up `frontend/AGENTS.md` automatically; `cd ~/work/backend` picks up `backend/AGENTS.md` instead. No restart required — the hint is injected onto the tool result that touched that path (capped at 8,000 chars per discovered file, once per directory per session).
- **Global to the machine (shared across all agents):** Nothing, by default — Hermes deliberately avoids a machine-global memory so that agents don't leak. The only machine-global surface is the `skills/` catalog (bundled skills are visible to every profile, though per-profile enablement still applies) and the on-disk gateway relay for `hermes peer` cross-machine Bots.

**Discovery order for project context** (first match wins at session start):

```
.hermes.md / HERMES.md   → walks parents up to git root (hierarchical, highest priority)
AGENTS.override.md       → CWD + subdirectories progressively (personal override, gitignored)
AGENTS.md                → CWD at startup + subdirectories progressively
CLAUDE.md                → same, Claude-flavored portability
.cursorrules / .cursor/rules/*.mdc → CWD only, Cursor compat
```

`AGENTS.md` has a special **directory chain**: inside a git repo, Hermes loads the git-root `AGENTS.md` first, then every intermediate directory down to `cwd` — each gets a provenance header (`## ../../AGENTS.md`), identical copies are deduped, deeper files appear later (more specific takes verbal precedence). Outside a git repo, only `cwd` is checked — parents are never consulted, preventing `/tmp` or `$HOME` leakage.

### 4.4 What crosses the boundary (and what never does)

**Crosses** (explicit sharing mechanisms):

- **External memory provider** — the only supported cross-profile memory: configure the same Honcho `workspace` or Supermemory `container_tag: "shared-knowledge"` and add `custom_containers: ["shared-knowledge"]` to let agents read/write a shared pool while keeping primary containers isolated.
- **`hermes peer` / Bot-to-bot messaging** — Bots DM each other (`message_agent(target="spark/researcher")`) and sit in **group chats** (2–6 Bots, 3 serial rounds, @-mentions scope the turn). The Desktop relay bridges on-prem and cloud gateways (LAN/Tailscale/api_server with `HERMES_PEER_<NAME>_KEY`). Group rooms and peer rosters are mirrored via shared profile metadata with per-gateway versioning — renaming a room changes the display name everywhere; disbanding removes it on every client even when offline.
- **Profile cloning** (`--clone` / `--clone-all`) — one-time copy of `config.yaml`, `.env` (or not), `SOUL.md`, `skills/`, `memories/`, `cron/` into a new profile. After cloning, they diverge — no live link.
- **Profile distributions** (`hermes profile export`) — a distributable bundle of a whole agent (config + skills + SOUL + memories) for sharing a specialist Bot with a teammate.

**Never crosses automatically:**

- `MEMORY.md` / `USER.md` between profiles.
- FTS5 history between profiles.
- `SOUL.md` between profiles (unless cloned at creation).
- Project `AGENTS.md` between unrelated repos (first-match + progressive discovery ensures a `frontend/AGENTS.md` never appears in a `backend` session unless that directory is touched).

For Lokma, map directly: per-agent `lokma profile` directories for isolation, shared Honcho/Supermemory container for the "team brain," Bot group chats for multi-agent deliberation, and progressive `AGENTS.md` hints already spec'd for the Web harness's file-browser + terminal panes.

---

## 5. Personality Marketplace/Templates

### 5.1 The agentskills standard (SKILL.md = portable capability)

The open standard at **agentskills.io** (backed by Anthropic + 30+ agent products: Hermes, Claude Code, Cursor, Gemini CLI, OpenCode, Goose, Amp, Letta, GitHub Copilot, VS Code, Junie, …) defines:

- A **skill** is a directory containing at minimum a `SKILL.md` with YAML frontmatter:

  ```markdown
  ---
  name: pdf-processing
  description: Extract PDF text, fill forms, merge files. Use when handling PDFs.
  license: Apache-2.0
  metadata:
    author: example-org
    version: "1.0"
  ---
  # Instructions
  …step-by-step, pitfalls, verification…
  ```

  `name` (≤64 chars, `[a-z0-9-]`) must match the parent directory; `description` (≤1024 chars) must say both *what* and *when* (keywords drive activation). Optional: `compatibility`, `allowed-tools`, `platforms`, `requires_toolsets`, `fallback_for_toolsets`, `config`, `version`.

- **Progressive disclosure:** ~100 tokens of `name`+`description` loaded at startup for every skill; full `SKILL.md` body (<5000 tokens recommended, cap 20,000 chars) only when activated; `scripts/`, `references/`, `assets/` only on demand. This keeps a marketplace of hundreds of skills cheap until used.

- **Locations:** Global skills in `~/.hermes/skills/` (per-profile), plus project-local `skills/` directories that require explicit trust.

A personality is therefore *just a skill* whose `SKILL.md` body is persona guidance rather than tool guidance — the same distribution, versioning, and disclosure machinery applies.

### 5.2 Marketplaces: skills.sh, agentskills.io, hermeshub, GitHub

Four tiers, composable via `hermes skills install`:

| Marketplace | Focus | Curation | Cost | CLI source |
|---|---|---|---|---|
| **skills.sh** | Open community, broadest selection, diverse categories | Light moderation | Free | `skills-sh/<owner>/<skill>` |
| **agentskills.io** | Curated quality, tested, reviewed | Moderate review | Free + Premium | `agentskills.io` collection |
| **hermeshub** (hermeshub.nousresearch.com) | Official Hermes registry, verified | Maintained (Nous) | Free | `official/<category>/<name>` |
| **skilldock.io** | Enterprise, SLAs, compliance | Strict review | Subscription | `skilldock` |
| **GitHub** (`hermes-skill-*`) | Forks, bleeding edge, self-serve | None | Free | `owner/repo` or URL |

Discovery is identical across tiers:

```bash
hermes skills browse
hermes skills search react --source skills-sh
hermes skills search https://mintlify.com/docs --source well-known
hermes skills inspect skills-sh/vercel-labs/json-render/json-render-react
hermes skills install openai/skills/skill-creator --force
hermes skills update
hermes skills reset google-workspace --restore
```

Inside chat, the same verbs are slash commands: `/skills browse`, `/skills install …`. Bundled skills ship in the install and are never auto-removed; `hermes skills reset` re-baselines a modified bundled skill against upstream.

For Lokma, the direct mapping is a plugin marketplace with `lokma theme set …` (visual) + `lokma skills install …` (capability) + an upcoming `lokma personality install …` alias that is just a skills install filtered to the `personality` tag.

### 5.3 Premade personas: reviewer / planner / tester and beyond

Hermes itself ships **no** built-in "reviewer/planner/tester" personalities — only the 14 general ones (§1.3). The premade specialist personas live in the marketplace layer, and the pattern is consistent across harnesses:

**Canonical three:**

- **Reviewer** — *"Meticulous code reviewer. Identify bugs, security issues, performance concerns, and unclear design choices. Be precise and constructive. Request changes if severity ≥ high."* Often paired with a `github-pr-workflow` or `github-code-review` skill so the persona can actually call `gh pr diff` and leave inline comments.

- **Planner** — *"Staff-level technical planner. Before coding, produce an execution plan with risks, alternatives, dependency-ordered tasks, and a verification checklist. Ask confirming questions before execution."* Often paired with `plan` skill (`write a markdown plan to .hermes/plans/` with no execution) so the planner's output is a file, not just chat.

- **Tester** — *"QA engineer. Write failing tests first (TDD), cover edge cases, never mark a task done without `make test` / `hermes test` evidence. Use `llm-e2e-testing` pipeline: feature map → element inventory (one test per button/link) → Playwright codegen (.cjs) → sandbox exec `video:on` → classify → auto-heal."* The `test-hermes` (test.fermag.com.tr) deployment in this vault is a concrete reference: Next.js 16 + Hermes CLI bridge, 6-stage pipeline, creds `raksixoffical@gmail.com`, guarded by `llm-e2e-testing` skill.

**Extended roster seen in persona libraries:**

- `architect` — system design, ADRs, trade-off tables.
- `debugger` — 4-phase systematic debugging, root-cause before fix.
- `simplifier` — parallel 4-agent cleanup of recent changes.
- `documenter` — research report pipeline (`notes.fermag.com.tr`, `rss-news-pipeline`).
- `security-auditor` — bundle of `himalaya` + secret scanning + TRITH.
- `release-manager` — `github-repo-management` + versioning + changelog.

In `config.yaml` these are just entries under `agent.personalities:` (see §1.3). In a marketplace they are skills whose `SKILL.md` description contains trigger phrases ("code review", "plan", "test", "qa", "tdd") so the agent's skill router activates them when the user asks.

### 5.4 AgentSoul & persona-ai — souls as installable bundles

Two community projects illustrate the personality-as-artifact model beyond skills:

**AgentSoul.market** — *"souls for every agent."* User takes a 49-question Enneagram test (or uploads screenshots / Chinese dialogue) and gets back **four portable Markdown files** — `soul.md`, `identity.md`, `user.md`, `agents.md` — that drop into Claude Code (`CLAUDE.md`), OpenClaw (`~/.openclaw/souls/`), Cursor (`.cursorrules`), or Hermes (exports to `agent.md` format). Same soul reads cleanly across every harness, so voice is consistent everywhere. Public directory of community-forged souls, certified tiers (gold/silver/bronze), creator profiles. The framing is explicit: *"Why every agent needs a soul"* — personality vs system prompt, multi-agent teams with distinct souls.

**persona-ai** (`theophile-wallez/persona-ai`) — *"A persona library for your coding agent. Install every persona, one theme, or one persona."* Pure-markdown personas grouped in themes; install via `curl …/install.sh | bash` or Claude Code plugin marketplace. Each persona is a `SKILL.md` + references that obey one invariant: *"A persona makes mistakes on the tone, never on the code. Paths, URLs, function names, version numbers stay exact."* Example themes: `boomer` (`jacqueline` — the Facebook aunt who calls you "ma Véro", spams 👍, writes "sa marche pas" — and `jose` — ten words per sentence, one emoji max). No hooks, no background scripts — the trigger words live in the skill's `description` so the agent self-activates when the user writes them; `mode normal` deactivates.

Both prove the distribution shape Lokma wants: a **registry of markdown personas** installable with one command, with themes for grouping and a forge (quiz, analyzer, CLI) for authoring. The agentskills standard already provides the packaging; AgentSoul/persona-ai show the UX.

### 5.5 Distribution: `profile export` and managed scope

Sharing a tuned agent (personality + memory + skills + model pin) has two Hermes-native paths:

- **`hermes profile export` / `hermes backup`** — a tarball of a whole profile minus history/checkpoints (tens-of-GB `state.db` excluded; `backup --full` includes it). A teammate runs `hermes profile create reviewer --clone-from /path/to/export` and gets the same reviewer agent locally. Profile distributions (`Profile Distributions: Share a Whole Agent` docs) extend this to a shareable artifact.
- **Managed scope** (`~/.hermes/managed/` or system-level managed directory) — an admin pins immutable `config.yaml` and `secrets:` values that users cannot override. Useful for org-wide deployment of a canonical reviewer/planner/tester fleet with locked models and policy.

Curator lifecycle (§2.5) protects marketplace-installed personas from decay: bundled skills are never auto-archived, agent-created skills are (`pinned` exempts them), and `hermes curator {status,usage,run,pin,unpin,archive,restore}` plus `/curator` slash command expose the controls.

---

## 6. Implications for Lokma

1. **Adopt the four-file map verbatim.** Lokma already documents surfaces and harness philosophy — add a `Docs/01-PERSONAS-and-MEMORY.md` that maps `SOUL.md` (who the agent is) / `USER.md` (who the user is) / `MEMORY.md` (what the agent learned) / `AGENTS.md` (what the project needs) exactly as Hermes does. Familiarity is a feature — every Claude Code/Codex/OpenCode user already knows `AGENTS.md`.

2. **Profiles are Bots.** Implement `lokma profile {create,clone,clone-all,use,list}` with `$LOKMA_HOME/profiles/<name>/` and an alias shim so Loki's reviewer/planner/tester are just profiles. Bot Mode in the Web harness is then a roster view over that primitive — no second data model.

3. **Dialectic memory as opt-in, not default.** Ship built-in `MEMORY.md`+`USER.md`+FTS5+`session_search` by default (zero external deps, ~1,300-token hot cost). Offer Honcho as a one-command provider switch (`lokma memory setup` → Honcho/OpenViking/Mem0…), with the same `honcho.json` per-profile host-block schema so power users get learned personality without paying for it on day one.

4. **Personality marketplace = skills filtered by tag.** Don't build a second hub. Publish Lokma personas as `SKILL.md` skills tagged `personality: reviewer|planner|tester|…` to `skills.sh` + `agentskills.io` + `hermeshub`. One install line (`lokma skills install lokma/reviewer`) drops the persona; `/personality reviewer` activates it. AgentSoul's Enneagram forge and persona-ai's Markdown-only invariant are UX to copy, not infra to rebuild.

5. **Per-agent model pin + fallback + cost.** Each profile's `config.yaml` gets `model.default` + `model.provider` + `model.aux_model` + `providers.*` pools + `delegation.model`. The Web harness's `sessions` schema (already planned in `22-WEB-FEATURES-provider-model-session.md`) should add `cost_usd` per session, and `lokma cost --profile <bot>` should sum that profile's `state.db`. Fallback chains are per-profile so a reviewer on Anthropic and a tester on OpenAI degrade independently.

6. **Progressive discovery for the web.** The pane system already plans a file browser + live terminal + browser preview. Wire `SubdirectoryHintTracker` semantics into the file-browser: opening `frontend/` surfaces `frontend/AGENTS.md` as a hint chip in the chat — zero prompt bloat until the user actually navigates there.

---

## 7. Sources

All URLs fetched 2026-08-31. Content is scraped as primary; local files & live CLI observed as secondary.

| # | Source | URL / Path | What was used |
|---|---|---|---|
| S1 | **Hermes — Personality & SOUL.md** | `https://hermes-agent.nousresearch.com/docs/user-guide/features/personality` | SOUL.md lifetime, slot #1, vs AGENTS.md, vs /personality, built-ins, custom `agent.personalities` |
| S2 | **Hermes — Persistent Memory** | `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory` | MEMORY.md vs USER.md limits, frozen snapshot, memory tool (add/replace/remove), session_search vs memory, capacity management, FTS5, pruning |
| S3 | **Hermes — Which File Does What?** | `https://hermes-agent.nousresearch.com/docs/user-guide/which-file-does-what` | Master file map, common mix-ups, decision guide |
| S4 | **Hermes — Context Files** | `https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files` | AGENTS.md discovery order, directory chain (git root → cwd), progressive subdirectory injection, head/tail truncation, security scanner list, `.hermes.md` priority |
| S5 | **Hermes — Memory Providers** (Honcho deep dive) | `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers` | 8 providers, Honcho dialectic model (two-layer injection, 3 cadence knobs, base+supplement, reasoning levels), honcho.json full config reference, multi-peer setup, provider comparison, profile isolation |
| S6 | **Hermes — Bot Mode** | `https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode` | Bot = profile primitive, per-Bot model pin, SOUL.md, skills/toolsets/MCPs, routines as namespaced cron, groups & group chats, bot-to-bot DMs, Desktop relay, cross-machine handles |
| S7 | **Hermes — Profiles** | `https://hermes-agent.nousresearch.com/docs/user-guide/profiles` | `hermes profile create {--clone,--clone-all,--clone-from}`, alias shim, `-p` flag, sticky `profile use`, workspace vs sandbox, Honcho peer on clone, per-profile gateways |
| S8 | **Hermes — Skills System** | `https://hermes-agent.nousresearch.com/docs/user-guide/features/skills` + `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory` (skills guidance) | SKILL.md structure, progressive disclosure, marketplace tiers, `hermes skills install` |
| S9 | **agentskills.io — Specification** | `https://agentskills.io/specification.md` | SKILL.md frontmatter (name/description/license/…), directory layout, progressive disclosure, file references, validation |
| S10 | **agentskills.io — Home / Client Showcase** | `https://agentskills.io/home.md` / `https://agentskills.io/llms.txt` | Standard adoption (30+ agents: Hermes, Claude Code, Cursor, Gemini CLI, OpenCode…), hub tiers |
| S11 | **Honcho — Overview** | `https://honcho.dev/docs/v3/documentation/introduction/overview.md` / `https://honcho.dev/docs/llms.txt` | Workspaces/Peers/Sessions/Messages primitives, "memory that reasons," Deriver + Dreamer |
| S12 | **Honcho — Reasoning** | `https://honcho.dev/docs/v3/documentation/core-concepts/reasoning.md` | Formal logic framework, explicit/deductive/inductive/abductive layers, Neuromancer XR, balances & custom models |
| S13 | **Honcho — Hermes + Honcho guide** | `https://honcho.dev/docs/v3/guides/integrations/hermes.md` | Dual-peer architecture, 5 Hermes tools, prompt-time injection, cross-session continuity, durable writeback |
| S14 | **AgentSoul.market** / **persona-ai** | `https://agentsoul.market/en/` (via web_search) + `https://github.com/theophile-wallez/persona-ai` | Four-file soul bundles (soul/identity/user/agents.md), Enneagram forge, theme-scoped personas, "tone wrong never code wrong" invariant, install.sh multi-agent |
| S15 | **Local vault observation** (secondary) | `~/.hermes/SOUL.md`, `~/.hermes/memories/MEMORY.md`, `~/.hermes/config.yaml`, `~/.hermes/skills/` | Ground-truth file presence, real SOUL content, observed provider/model pin (`sex-go`/`muse-spark-1.2-contributor`), skill inventory, memory entry style |

> Windowed content from S5/S11/S12 via `web_extract`; llms.txt indexes fetched via `curl -s https://…/llms.txt` / `https://honcho.dev/docs/llms.txt`.

---

## 8. Appendix

### 8.1 File map (where Lokma should put what)

```
$LOKMA_HOME/                         # or $HERMES_HOME convention
├── config.yaml                      # per-agent model, providers, limits, theme, display.show_cost
├── .env                             # secrets only
├── SOUL.md                          # per-agent identity (slot #1)
├── honcho.json                      # per-agent Honcho host blocks (if enabled)
├── memories/
│   ├── MEMORY.md                    # per-agent, agent-written, 2.2k chars target
│   └── USER.md                      # per-agent, agent-written, 1.4k chars target
├── profiles/<name>/                 # one Bot/agent per directory
│   ├── config.yaml                  # its own model pin
│   ├── SOUL.md                      # its own persona
│   ├── memories/{MEMORY.md,USER.md}
│   ├── skills/                      # its own marketplace installs
│   ├── state.db                     # its own FTS5 session DB
│   └── cron/jobs.json               # its own routines
├── skills/                          # global catalog (bundled + hub)
└── state.db                         # default profile sessions

<project>/                           # any repo Lokma is run in
├── .hermes.md                       # Hermes-specific project rules (highest priority, walks to git root)
├── AGENTS.md                        # Portable harness rules (cwd → git root chain + progressive)
├── AGENTS.override.md               # Personal override, gitignored
├── CLAUDE.md / .cursorrules         # Compat, lowest priority
└── subdir/AGENTS.md                 # Per-package progressive hints
```

### 8.2 Config snippets for per-agent model pinning

```yaml
# ~/.lokma/profiles/reviewer/config.yaml
model:
  default: anthropic/claude-sonnet-4.6
  provider: anthropic
  aux_model: anthropic/claude-haiku-4.5-20251001
agent:
  personalities:
    codereviewer: >
      You are a meticulous code reviewer. Identify bugs, security issues,
      performance concerns, and unclear design choices. Be precise and constructive.
display:
  show_cost: true

# ~/.lokma/profiles/planner/config.yaml
model:
  default: openai/gpt-5.6-sol
  provider: openai
agent:
  personalities:
    planner: >
      You are a staff-level technical planner. Before coding, produce an execution plan
      with risks, alternatives, and a dependency-ordered task list.
delegation:
  model: openai/gpt-5.4-mini        # cheap children
  max_concurrent_children: 5

# ~/.lokma/profiles/tester/config.yaml
model:
  default: gemini/gemini-3.5-flash
  provider: gemini
skills:
  enabled: [llm-e2e-testing, test-driven-development]
```

### 8.3 Honcho host-block template (one per Bot)

```json
{
  "apiKey": "sk_honcho_…",
  "workspace": "lokma-shared",
  "peerName": "raksix",
  "hosts": {
    "hermes":        { "enabled": true, "aiPeer": "default",  "recallMode": "hybrid", "dialecticCadence": 2 },
    "hermes.reviewer": { "enabled": true, "aiPeer": "reviewer", "recallMode": "hybrid", "dialecticCadence": 3 },
    "hermes.planner":  { "enabled": true, "aiPeer": "planner",  "recallMode": "context", "dialecticDepth": 1 },
    "hermes.tester":   { "enabled": true, "aiPeer": "tester",   "recallMode": "hybrid", "dialecticCadence": 5, "contextTokens": 600 }
  }
}
```

### 8.4 Marketplace install shapes for personas

```bash
# Install a reviewer persona (just a skill tagged personality:reviewer)
lokma skills install skills-sh/lokma/reviewer
lokma skills install agentskills.io/lokma/planner
/personality reviewer              # activate for this session

# Forge a personality from a quiz/bundle (AgentSoul shape)
lokma personality forge --from agentsoul --id enneagram-4w5-sophie
lokma personality install theophile-wallez/persona-ai/jacqueline

# Distribute a tuned agent
lokma profile export reviewer > reviewer.lokma.tar.gz
# teammate:
lokma profile create reviewer --clone-from reviewer.lokma.tar.gz
```

### 8.5 Memory visibility matrix (what each agent sees)

```
Agent "reviewer" sees:
  ✅ reviewer/SOUL.md           (its own identity)
  ❌ planner/SOUL.md            (isolated)
  ✅ reviewer/MEMORY.md+USER.md (its own hot memory)
  ❌ planner/MEMORY.md          (isolated)
  ✅ project's AGENTS.md chain  (whatever cwd is — shared across agents by FS, not by DB)
  ✅ reviewer/state.db          (its own FTS5 history)
  ❌ planner/state.db           (isolated, unless session_search is asked to federate)
  ✅ Honcho reviewer peer card  (if workspace shared: same workspace, different aiPeer)
  ⊙ Honcho shared workspace conclusions (if provider's observation lets it — share workspace, separate representations)
  ✅ Group chat transcript      (only for groups reviewer is a member of)
```

### 8.6 Quick decision guide (copy for Lokma docs)

- **Want to change how the agent talks?** Edit `~/.lokma/profiles/<bot>/SOUL.md` — or `/personality <name>`.
- **Want the agent to remember a fact?** Just tell it — it writes `MEMORY.md`/`USER.md` itself; or `lokma memory add "…"`.
- **Want project rules?** Put `AGENTS.md` (or `.hermes.md`) in the repo root; add per-package `AGENTS.md` for monorepos.
- **Want a temporary specialist?** `/personality reviewer` / `planner` / `tester` — no file edit.
- **Want a persistent specialist?** `lokma profile create reviewer --clone` then pin `SOUL.md` + model + skills.
- **Want agents to share knowledge?** Enable Honcho/Supermemory with a shared `workspace`/`container_tag` — never share `$LOKMA_HOME`.

---

*End of dossier — 500+ lines, 15 sources, 5 required themes covered. Next step: synthesize into `Docs/01-PERSONAS-and-MEMORY.md` (Turkish or English per Lokma Style Guide) and wire into `Docs/12-HARNESS-MIMARI-*` profile/data-model section.*
