# Conflict-Free Parallel File Editing for AI Agents — Research Dossier

> **Scope:** How multiple autonomous AI coding agents can edit a shared codebase concurrently without clobbering each other. Covers isolation primitives, coordination protocols, merge strategies, scheduling, and production examples.
> **Audience:** Builders of multi-agent harnesses, coordinator services, and AI-assisted IDE tooling.
> **Date:** 2026-08-31

---

## Table of Contents

1. [1 — How Parallel Agents Avoid Editing the Same File at Once](#1--how-parallel-agents-avoid-editing-the-same-file-at-once)
   - 1.1 The Problem Statement
   - 1.2 Advisory File Locks
   - 1.3 OS-Level / Mandatory Locks vs Advisory
   - 1.4 Worktree Isolation (One Clone, Many Trees)
   - 1.5 CRDT & Operational Transform
   - 1.6 Comparison Matrix
2. [2 — Inter-Agent Communication to Avoid Collisions](#2--inter-agent-communication-to-avoid-collisions)
   - 2.1 Lock-File Protocols
   - 2.2 Message Bus / Mailbox
   - 2.3 Coordinator Agent / Orchestrator
   - 2.4 Heartbeat / Lease
   - 2.5 Combined Architecture
3. [3 — Merge Strategies When Both Edit](#3--merge-strategies-when-both-edit)
   - 3.1 Hashline / Snapshot-Guarded Edits
   - 3.2 Three-Way Merge
   - 3.3 Last-Writer-Wins vs CRDT
   - 3.4 Entity-Level / AST-Aware Merge
   - 3.5 Decision Guide
4. [4 — Scheduling Limits](#4--scheduling-limits)
   - 4.1 Why Scheduling Matters
   - 4.2 Caps: max-agents, max-concurrent, max-task-priority
   - 4.3 Queues, Backpressure & Admission Control
   - 4.4 Priority, Affinity & Work-Stealing
   - 4.5 Rate Limits & Token Budgets
5. [5 — Real Examples](#5--real-examples)
   - 5.1 Claude Code Worktree Isolation
   - 5.2 gptme / hashline_edit 3-Way Merge Recovery
   - 5.3 Ataraxy Weave & Aura — Semantic Merge Drivers
   - 5.4 OpenHands Runtime & Parallel Tool Execution
   - 5.5 OpenMP Task Fan-Out as Analogy
   - 5.6 Agent Coordinator & MCP Agent Mail
6. [6 — Anti-Patterns & Pitfalls](#6--anti-patterns--pitfalls)
7. [7 — Recommended Reference Architecture](#7--recommended-reference-architecture)
8. [8 — Sources](#8--sources)

---

## 1 — How Parallel Agents Avoid Editing the Same File at Once

### 1.1 The Problem Statement

When N AI agents share one filesystem checkout, every `read → modify → write` cycle is a race:

```
Agent A: read auth.ts (v1) ──► edit ──► write auth.ts (v2-A) ─┐
Agent B: read auth.ts (v1) ──► edit ──► write auth.ts (v2-B) ─┴─► last writer silently wins
```

Without coordination the second write overwrites the first, producing lost updates, half-applied refactors, or syntactically broken files. The failure scales poorly: with 3 agents on a shared `src/types/index.ts` the probability of collision during a large refactor approaches 1. Git does not help at runtime — it only surfaces the conflict *after* both commits exist.

There are four families of prevention, in increasing isolation:

| Family | Isolation unit | Where conflict is resolved | Cost |
|---|---|---|---|
| File locks (advisory) | Single path / glob | Before edit (acquire fails) | Near-zero — one file under `.agentlocks/` |
| Worktree isolation | Entire working directory | Never (agents never share a path) | Disk + setup per agent |
| CRDT / OT | Character or operation | At merge time (mathematically) | Data-structure complexity |
| Semantic / AST merge | Code entity | At `git merge` time | Parser + grammar maintenance |

Production harnesses routinely combine the first two and add the fourth as a safety net. The BSWEN study of three parallel Claude Code agents tripping over `auth.ts` / `types/index.ts` is a canonical war story: two agents' changes were silently overwritten, requiring an hour of manual untangling — the exact failure advisory locks or worktrees prevent.

### 1.2 Advisory File Locks

**Idea:** Before touching a file, an agent creates a small lock record that says *who* holds *what* until *when*. Other well-behaved agents check before editing and either wait, pick different work, or escalate to a worktree.

**How it works in practice (AgentLocks / agent-locks pattern):**

```
.agentlocks/locks/
  auth.ts.lock          → { owner: "agent-1", reason: "refactor auth", ttl: 600s, fence: 42 }
  @git/index.lock       → { owner: "agent-2", reason: "staging", ttl: 120s }
.git/agents-locks/      → (alternative location under git common dir, invisible to git add)
  2026-07-17T18-45-12-hindsight-route-tests.md
```

Key properties from the two open-source implementations:

- **Advisory, not mandatory.** The OS does not block a rogue `write()`. The lock is a *social contract* among agents that check `acquire()` / `lock_check_conflict` before mutating. This is intentional: no daemon, no privilege escalation, no kernel dependency; it works over NFS, in containers, and in sandboxes where `flock()` is unavailable.
- **TTL / lease.** Every lock carries a time-to-live (default 10 min, max ~30 min in AgentLocks). If the holder crashes, the lease expires and another agent can `reclaim` after a grace window. Without TTL a crashed agent blocks a file forever — the classic hard-lock failure.
- **Owner-only mutation.** Only the recorded `agent_id` can `expand`, `refresh`, or `release`. This prevents one agent from accidentally releasing another's claim.
- **Git-index lock.** A synthetic resource `@git/index` serialises `git add` / `git commit` races. Acquiring it is `git begin`; releasing is `git end`. File locks alone are insufficient because two agents can edit disjoint files yet collide on the single shared index.
- **Pre-commit guard.** Installed as a `PreToolUse` hook for `git commit`, it runs `git verify` (are staged paths covered by a held lock?) and *surfaces* violations without blocking the commit. Enforcement at commit time catches late violations; enforcement before edit prevents wasted work.
- **Glob / scope awareness.** Locks can cover `src/auth/**` or `**/*.ts`. Conflict detection uses scope-overlap (static-prefix heuristic deliberately biased toward false positives — a false positive prompts a double-check; a false negative hides a real collision).

**Minimal Python sketch (from BSWEN):**

```python
class FileLockManager:
    def acquire(self, agent_id: str, path: str, ttl_ms=600_000) -> bool:
        if path in self.locks and not self._expired(path):
            return False
        self.locks[path] = {"owner": agent_id, "expires": now() + ttl_ms}
        return True

    def refresh(self, agent_id: str, path: str) -> bool:
        rec = self.locks.get(path)
        if rec and rec["owner"] == agent_id:
            rec["expires"] = now() + ttl_ms
            return True
        return False
```

**When to use:** 2–5 agents on file-disjoint tasks; small repos where worktree overhead is unwarranted; as a cheap first gate even when worktrees exist.

**When it breaks:** Shared hot files (`types/index.ts`, `schema.prisma`) become bottlenecks; deadlock when A holds `a.ts` and waits for `b.ts` while B does the reverse (solved by ordered acquisition or timeout-retry with jitter).

**Limits:** advisory implies opt-in — a buggy agent that skips the check still corrupts state. For mandatory enforcement a daemon or filesystem-level `flock` / `fcntl` lease is required, at the cost of portability.

### 1.3 OS-Level / Mandatory Locks vs Advisory

For completeness, three OS primitives exist — none is a drop-in replacement:

- **`flock(2)` / `fcntl(2)` on Unix, `LockFileEx` on Windows** — kernel-enforced, released on process exit (no stale locks). But they do not work reliably over NFS, they are per-open-file-description (subtle `fork()` / `dup()` semantics), and they have no notion of TTL or repo-relative glob scope. `py-filelock`'s `FileLock` auto-selects the best backend and falls back to a cooperative `SoftFileLock` using `O_EXCL` creation where `fcntl` is absent.
- **`SoftFileLock` (file-existence via `O_EXCL`)** — portable, needs stale detection via PID + start-token. Without a start token a recycled PID is mistaken for the live holder.
- **`StrictSoftFileLock` / leases** — immutable owner claims plus expiry; overlapping holders are permitted structurally but an `on_compromise` hook forces resolution.

The distributed-systems lesson (Chubby / ZooKeeper / etcd) is that portable agent harnesses should not rely on kernel locks. Instead they rely on **leased advisory records + fencing tokens + heartbeat**, with the storage layer (SQLite WAL, git object store, or a small HTTP service) acting as the arbiter.

### 1.4 Worktree Isolation (One Clone, Many Trees)

**Idea:** Give each agent its own *working directory* that shares the same `.git` object database but has its own index, HEAD, and branch.

```bash
# manual
git worktree add .worktrees/agent-1 -b agent-1/task
git worktree add .worktrees/agent-2 -b agent-2/task
git worktree list

# Claude Code equivalent
claude --worktree feature-auth      # → .claude/worktrees/feature-auth on branch worktree-feature-auth
claude --worktree bugfix-123
```

Every agent can now edit the *same* logical path (`src/auth.ts`) concurrently — they are physically different files on disk. The merge happens later via ordinary `git merge` (or an AI supervisor), not via runtime contention.

**What is isolated per worktree**

- Checked-out files, index/staging area, HEAD/branch, untracked files, stashes (per-worktree in newer Git).
- Build artefacts *outside* the repo are **not** isolated: ports, Postgres, Docker, `node_modules` symlinked or shared caches remain shared. Two agents running `npm run dev` still fight over port 3000.

**What is shared**

- The `.git` object store, refs, remotes, commits — a commit in one worktree is immediately visible in all.
- Claude Code plugin installs and `settings.local.json` approvals (granted inside one worktree, applied everywhere).

**Claude Code specifics**

- Default location: `.claude/worktrees/<name>` on branch `worktree-<name>`, base = default branch on remote (`worktree.baseRef = "fresh"`). Set to `"head"` to branch from the current local HEAD (needed when work depends on unpushed work).
- `.worktreeinclude` copies gitignored files (`.env`, `.env.local`) into every new worktree by pattern; tracked files are never duplicated.
- `isolation: worktree` in a subagent frontmatter gives each subagent a throwaway worktree, auto-removed if it finishes with no changes; otherwise it persists until a periodic sweep (`cleanupPeriodDays`) can safely remove it.
- Enforcement is at the *tool* layer: while inside a worktree Claude Code blocks `Edit`/`Write` to paths in the main checkout, Bash/PowerShell commands whose `cwd` resolves to the main checkout, and git redirects (`git -C`, `--git-dir`, `GIT_DIR`, `cd` before git). The check covers every subagent spawned from the isolated session.
- Worktrees are locked via `git worktree lock` while an agent runs so the sweep cannot delete a live tree.

**Trade-offs vs file locking**

| Dimension | File locks | Worktrees |
|---|---|---|
| Parallelism | Limited by file overlap | Full — same file concurrently |
| Merge conflicts | Never (serialised) | Possible (resolved by supervisor / merge driver) |
| Disk cost | ~KB per lock | Full checkout per agent (~100s MB; 10 GB/day observed without cleanup) |
| Setup | `agentlocks init` | `git worktree add` or `claude --worktree` |
| Bottleneck file | Serialises on hot file | No bottleneck |
| Best for | Disjoint tasks, 2–3 agents, simplicity | Overlapping edits, large refactors, 3–6 agents |

**Hybrid coordinator** (BSWEN) uses locks for disjoint tasks and upgrades to a worktree only when overlap is detected:

```python
class HybridCoordinator:
    def assign_task(self, task):
        if self._has_file_overlap(task.files):
            return self._create_worktree(task)   # overlap → isolate
        return self._create_locked_context(task)  # disjoint → cheap lock
```

A single-branch variant rejects worktrees entirely: all agents commit directly to `main` behind three mechanical guards — advisory reservations with TTL, a pre-commit hook that rejects conflicting staged paths, and a Destructive Command Guard that blocks `reset --hard`, `push --force`, `rm -rf`, etc., at the shell layer. Single-branch suits 10+ fungible agents with pre-partitioned, file-disjoint work; below that threshold worktrees are lower risk.

### 1.5 CRDT & Operational Transform

When agents truly must converge on the *same* live document (real-time co-editing, a shared task board, or a memory store) the file-lock / worktree model is too coarse. Two families solve this:

**Operational Transform (OT)** — used by Google Docs-era systems. Operations (insert, delete) are transformed against concurrent operations so that applying them in different orders yields the same result. OT requires a central server to order operations and is sensitive to transformation correctness.

**Conflict-free Replicated Data Types (CRDTs)** — used by Figma, Automerge, Yjs, and `weave`'s shared state. A CRDT's merge function is **commutative, associative, and idempotent**: `merge(A,B) == merge(B,A)`, any order and any replay count converge to the same state. No central ordering, no conflicts, works offline.

Two CRDT flavours relevant to code agents:

- **Character-level / JSON CRDT (Automerge).** `weave` stores claims, agent roster, heartbeats, and the entity map as an Automerge document — an ordinary JSON file on disk that two agents can modify concurrently; the library merges automatically. Each agent tends to one `bead` or `entity`; claims are advisory — even if B edits A's claimed entity the CRDT merges without corruption and the merge driver (see §3.4) decides the code outcome.
- **Set / LWW-Register / Counter CRDTs.** Used for labels, assignees, titles, and counters. `grite` uses Last-Writer-Wins (LWW) for scalars (`(ts, actor, event_id)` total order), Add/Remove Sets for collections, and append-only lists for comments/attachments — so merging events from many agents never requires manual intervention.

**Where CRDTs fit vs advisory locks:**

- CRDT for *coordination state* (who claims what, task board) — small, frequently mutated, must never corrupt.
- Advisory locks / worktrees for *source files* — large, syntactic, where convergence must preserve program correctness, not just eventual byte equality. A CRDT that merges two incompatible refactors of the same function character-by-character will converge — to broken code. That is why code prefers AST-aware merge as the semantic layer *above* the CRDT.

### 1.6 Comparison Matrix

| Aspect | Advisory locks | Worktree per agent | CRDT/OT | AST / entity merge |
|---|---|---|---|---|
| Granularity | File / glob | Working directory | Character / JSON key | Function / class / entity |
| Coordination | Opt-in check before edit | None needed | None (mathematical) | At `git merge` |
| Stale handling | TTL + liveness probe | N/A (independent) | N/A | N/A |
| Works offline | Yes | Yes | Yes (CRDT) | Yes |
| Guarantees syntax | N/A | N/A | No | Yes (per entity) |
| Setup cost | Minutes | Minutes–hour (worktree + deps) | Library integration | Grammar + merge driver |
| Scales to | ~5 agents before hot-file queuing | 3–6 before review bottleneck | Dozens for state | Depends on parser coverage |

> **Rule of thumb from practitioner reports:** Start with file locks. When hot-file waiting dominates, graduate to worktrees. Keep an entity-level merge driver and a CRDT-backed claim board as safety nets regardless.

---

## 2 — Inter-Agent Communication to Avoid Collisions

Preventing two agents from editing the same byte is only half the problem; they must *know* what each other intends. Four communication patterns exist, often combined.

### 2.1 Lock-File Protocols

The simplest message is a file whose existence *is* the message.

**Shapes:**

- **`.agentlocks/locks/<path>.lock`** (AgentLocks) — JSON with owner, reason, TTL, fence token. Checked via `acquire` / `status --json` / `prune --dry-run --json`.
- **`.git/agents-locks/<timestamp>-<slug>.md`** (agent-locks MCP) — Markdown+YAML under the shared `git common dir` (`git rev-parse --git-common-dir`), so every worktree sees the same directory and `git add` structurally cannot stage it (it lives under `.git/`). No database, no server; re-resolved on every tool call via fresh `git rev-parse`, never cached, so worktree-aware `cwd` is always correct.
- **`.worktreeinclude` / reservation files** (single-branch pattern) — `reservations/<agent>.json` listing intended files plus TTL.

**Protocol (lease-based claiming):**

```
1. Agent calls lock_check_conflict(globs) → informational, never blocking
2. If clear → lock_create(resources, reason, ttl_ms) → O_EXCL create
3. Edit files covered by the lock
4. Periodically refresh TTL or expand scope (owner-only)
5. On finish: commit scoped paths → release (or move lock to done/)
6. If agent dies: lease expires → liveness check (PID + start token / harness session probe) → reclaim
```

**Why leases beat hard locks:**

- A hard lock held by a crashed agent blocks others until a human intervenes.
- A lease degrades gracefully: expired locks are classified by liveness (alive / dead / unknown) and become reclaimable after an unknown-liveness grace window.

**Verification:** `git verify` (AgentLocks) checks *staged* paths against held locks at commit time — catches violations even when the edit-time check was skipped. `agent-locks`'s `lock_check_conflict` uses a static-prefix heuristic on globs biased toward false positives (safe) over false negatives (hiding a real conflict).

**Storage choices for lock files:**

- Under `.agentlocks/` inside the working tree — simple, but must be gitignored; `git add .` would otherwise stage lock metadata.
- Under `<git-common-dir>/agents-locks/` — structurally unstaged, visible to all worktrees, survives `git clean`. Demonstrated to require `git rev-parse --git-common-dir` (not `--git-dir`, which differs per worktree).

### 2.2 Message Bus / Mailbox

Lock files answer *can I edit X?* A message bus answers *what is everyone doing?*

**Options:**

- **File-based queue** — `mailbox/<agent>/inbox/*.json` or date-partitioned messages (MCP Agent Mail). Append-only per-agent files avoid races; a coordinator sweeps and delivers. Git-backed mailboxes persist through crashes.
- **SQLite WAL mode** — `PRAGMA journal_mode=WAL` allows concurrent readers alongside one writer, essential when many agents poll the coordination DB. Default journal mode uses exclusive write locks and collapses under multi-agent load. Used by Agent Coordinator, weave's Automerge store, and multi-session coordination guides.
- **HTTP / FastAPI service** — Agent Coordinator exposes REST endpoints for tasks, locks, messages, memory, and a real-time dashboard. Any LLM that can `curl` can participate — no framework lock-in. `INSERT...SELECT` gives atomic task claiming.
- **MCP (Model Context Protocol)** — Tools like `agent-locks` and `MCP Agent Mail` expose lock / mailbox operations as MCP tools, so Claude Code / Codex sessions call them natively without shelling out.

**Message taxonomy:**

| Message kind | Example | Delivery |
|---|---|---|
| Task assignment | "Agent B: handle `auth.ts` refactor" | Coordinator → agent inbox |
| Claim broadcast | "Agent A claims `src/api/**` for 10 min" | Agent → shared board / pub-sub |
| Heartbeat | "Agent A alive @ 12:03:14, fence=42" | Agent → lease record |
| Completion / handoff | "Agent A done, branch `agent-1/task` ready for review" | Agent → coordinator → reviewer |
| Conflict notification | "Staged `auth.ts` not covered by your lock" | Pre-commit guard → agent (stderr) |

**Ordering & persistence:**

- Date-partitioned, append-only logs give a total order without a central sequencer.
- Acknowledgments + TTL on messages ensure a crashed consumer does not lose a task.
- Event subscriptions let a coordinator react to `lock_created` / `lock_expired` without polling.

### 2.3 Coordinator Agent / Orchestrator

A dedicated agent (human, LLM, or plain service) owns the global view and enforces policy.

**Roles:**

- **Task decomposer** — splits a large feature into file-disjoint beads (Code-Native Substrates in Agent Flywheel vocabulary). Pre-partitioning is what makes single-branch and worktree models scale; without it even worktrees produce merge conflicts at review time.
- **Admission controller** — checks `_has_file_overlap()` before assigning work (hybrid coordinator pattern).
- **Merger / reviewer** — sequentially merges worktree branches (`git merge agent-1 → agent-2 → agent-3`), invokes a semantic merge driver, or delegates to an AI supervisor agent for conflict resolution.
- **Reaper** — runs `prune --dry-run` → `prune` or sweeps expired leases, reclaims stale claims, and enforces retention (`cleanupPeriodDays`).

**Implementations:**

- **Agent Coordinator** — FastAPI + SQLite, 17 API routers (agents, tasks, locks, messages, memory, teams, dashboard), 41 built-in skills, 5 presets (developer / reviewer / investigator / analyst / research), hierarchical memory (L1 agent-local, L2 shared, L3 cross-project), cost tracking per agent.
- **MCP Agent Mail** — Git-backed mailboxes plus advisory locking; single-branch guide's recommended coordination layer; Rust variant for production.
- **Custom supervisor loop** — a plain shell loop that polls `status --json` and merges branches; the Reddit CAS example does exactly this after fanning out three worktrees.

**Coordination is infrastructure, not framework.** Agent Coordinator's comparison table makes the point: CrewAI / LangGraph / gstack *orchestrate what agents do*; the coordinator handles *how they share resources without conflicts* (atomic claiming, lease locks, health monitoring, provider-agnostic HTTP API).

### 2.4 Heartbeat / Lease

A heartbeat turns a lock from a *claim* into a *lease* — proof the holder is still alive.

**Structure:**

```json
{
  "owner": "agent-7f3a",
  "resource": "src/auth.ts",
  "fence_token": 42,
  "lease_ms": 600000,
  "last_heartbeat": "2026-08-31T12:03:14Z",
  "ttl_expires": "2026-08-31T12:13:14Z"
}
```

**Renewal loops:**

- etcd: `Lease.Grant(TTL) → KeepAlive stream at TTL/3`.
- Kubernetes `coordination.k8s.io/v1 Lease`: 15 s TTL, 10 s renew deadline, 2 s retry.
- Chubby: session lease; locks die with the session.
- AgentLocks: `refresh` re-issues the lease; `prune` classifies by liveness (probes harness session transcript / Codex thread index, falls back to PID start-token check).

**Why heartbeats matter for agents:**

- LLMs pause unpredictably (tool calls, context compression, rate-limit sleeps). Without a heartbeat, a slow agent looks dead and its work is reclaimed mid-edit.
- GC / scheduling stalls (the JVM 12-second pause story) are analogous: an agent that *thinks* it still holds a lock has already lost it from the cluster's perspective.
- **Fencing tokens** solve the *stale writer* problem: every lease grant returns a monotonic token stored alongside the data. The storage layer refuses writes bearing an older token, even if the stale holder wakes up and retries. Martin Kleppmann's prescription — token must come from the lease granter, storage persists the highest seen token per resource — is the only safe distributed lock. Redis Redlock without fencing is an efficiency lock, not a correctness lock.

**Heartbeat tuning:**

- Too short → flapping reclaim, wasted work.
- Too long → slow recovery after a crash (single-branch guide uses short TTL for this reason).
- Rule of thumb: renew at TTL/3; expire at TTL; grace for unknown liveness before reclaim.

### 2.5 Combined Architecture

A production harness typically layers all four:

```
                    ┌─────────────────────────────────┐
                    │         Coordinator Service       │
                    │  FastAPI + SQLite (WAL) / etcd   │
                    │  tasks │ locks │ messages │ mem  │
                    └──────┬──────────────────┬─────────┘
                           │                  │
              ┌────────────┼──────────────────┼──────────────┐
              │            │  leases+heartbeat│              │
     ┌────────▼────┐ ┌─────▼─────┐   ┌──────▼──────┐ ┌─────▼─────┐
     │  Agent A    │ │ Agent B   │   │  Agent C    │ │ Message Bus│
     │ worktree A  │ │ worktree B│   │  worktree C │ │ (mailbox / │
     │ .agentlocks │ │ .agentlocks│  │  .agentlocks │ │  SQLite)   │
     └──────┬──────┘ └─────┬─────┘   └──────┬──────┘ └───────────┘
            │              │                │
            └──────────────┼────────────────┘
                           │ git merge (weave / hashline 3-way)
                           ▼
                     main branch
```

Key invariants from multi-session coordination guides:

- Append-only state → per-session files, no race (handoffs, session logs, inbox).
- Mutable state → lock file + heartbeat + stale-reclaim (GPU allocation, file editing, task ownership).
- SQLite → always `PRAGMA journal_mode=WAL` for multi-agent concurrency.
- Pre-commit guards fire in the *worktree's* git context — use `git rev-parse --show-toplevel` for path resolution, not a relative path from the main repo.

---

## 3 — Merge Strategies When Both Edit

When prevention fails — two agents touched the same file — the system must reconcile. Four strategies span the spectrum from "reject" to "always converge."

### 3.1 Hashline / Snapshot-Guarded Edits

**Idea:** Every edit is anchored to a snapshot hash of the file *as read*. The writer must prove the file has not changed since that snapshot.

**gptme `hashline_edit` flow (pre-Phase 2):**

```
1. read(file) → snapshot + hash
2. model proposes hashline_edit(snapshot_hash, changes)
3. if live_hash != snapshot_hash → reject: "file has changed since snapshot"
4. model must re-read and restate the entire edit
```

This prevents silent overwrites but is expensive: a concurrent external change forces a full re-read, wasting tokens and time, and still leaves the model to manually merge.

**Post-Phase 2 — 3-way merge recovery:**

When `live_hash != snapshot_hash`, the tool no longer rejects outright. Instead it attempts automatic recovery via `git merge-file`:

```
base   = snapshot content (common ancestor)
ours   = snapshot + model's edits applied
theirs = current live file
result = git merge-file -L "your edit" -L "original snapshot" -L "current file"
         base ours theirs
```

- Clean merge → merged content is written atomically (write to temp file in same dir, `os.replace` — one `rename(2)` syscall, POSIX-atomic; readers never see a partial write), snapshot is updated to the merged content, success message includes `(recovered via 3-way merge)` for auditability.
- Conflicts remain → file is left untouched, conflict markers (with `-L` labels, not temp-path noise) are reported, prompting manual resolution before the next `read`.

Four new tests in `TestMergeRecovery` cover clean preservation of concurrent changes, conflicting markers with file intact, absence of the merge note on normal applies, and snapshot update after recovery. Two further fixes: atomic write and a pre-write freshness check even during edit confirmations (a concurrent change arriving mid-confirmation dialog previously slipped through).

**When to use:** Token-efficient guard for single-file edits in a shared checkout; pairs naturally with advisory locks (lock prevents most collisions; hashline catches the remainder).

### 3.2 Three-Way Merge

Git's classic merge uses three inputs:

- **base** — common ancestor (last committed version both agents started from)
- **ours** — agent A's branch
- **theirs** — agent B's branch

Git computes line-level diffs `base→ours` and `base→theirs` via Myers diff, groups changes into **hunks** (contiguous changed-line ranges), and declares a conflict if any hunk from ours overlaps or is adjacent to a hunk from theirs. The critical limitation: Git has zero understanding of code structure. Two agents editing different functions on adjacent lines trigger a conflict even though the changes are logically independent.

**Conflict markers:**

```
<<<<<<< ours (Agent A)
function processData() { /* A's version */ }
=======
function processData() { /* B's version */ }
>>>>>>> theirs (Agent B)
```

Humans (or an AI supervisor) resolve by editing the file to the intended result and committing.

**Strengths:** Battle-tested for 40 years, language-agnostic, well-understood. **Weaknesses:** False conflicts on independent changes; misses real semantic conflicts on non-adjacent but logically coupled lines; markers are painful in large blocks.

### 3.3 Last-Writer-Wins vs CRDT

These are the two poles for replicated state.

**Last-Writer-Wins (LWW):**

- Each scalar field keeps one value — the write with the highest `(timestamp, actor, event_id)` wins.
- Grite's projection: higher `ts_unix_ms` wins; ties broken by lexicographically greater `actor`, then `event_id` — a total order guaranteeing convergence. Collections are sorted (labels lexicographically, comments by timestamp) for deterministic output.
- Used for: title, body, state, file context (per path), project context (per key).
- **Pros:** Trivial, deterministic, no history needed beyond the winning event.
- **Cons:** Loses data (the non-winning write silently disappears). Unacceptable for source code where both edits matter.

**CRDT (Conflict-free Replicated Data Type):**

- Merge function is commutative, associative, idempotent — any order, any replay count, any subset of events converge to the same state.
- Flavours: counter (sum of increments), Add/Remove Set (labels/assignees where adds and removes commute), append-only list (comments/attachments never deleted), JSON CRDT (Automerge — nested maps, lists, scalars).
- Used for: task boards, claims, agent roster; `weave`'s shared state is an Automerge JSON document on disk — two agents claiming different entities concurrently both claims survive the merge.
- **Pros:** No conflicts, works offline, no central ordering, preserves all operations.
- **Cons:** Merged *character* convergence does not imply *syntactic* or *semantic* correctness. Two agents extracting a trait vs inlining methods in the same class will CRDT-merge to syntactically valid but logically broken code. CRDTs are the right layer for *coordination state*, not for *code convergence*.

**Hybrid in practice (Grite):**

| Field | Strategy | Why |
|---|---|---|
| Title/Body/State | LWW | Single correct current value |
| Labels/Assignees/Dependencies | Add/Remove Set | Commuting add/remove |
| Comments/Links/Attachments | Append-only list | Preserve all |
| File context | LWW per path | Latest index wins per file |

### 3.4 Entity-Level / AST-Aware Merge

The sweet spot for code: merge at the granularity of *language entities* rather than lines or characters.

**Weave (entity-level git merge driver):**

1. Parse all three versions (`base`, `ours`, `theirs`) with tree-sitter (`sem-core`) into entities — functions, classes, methods, interfaces, JSON keys.
2. Match entities across versions by stable ID `file:type:name:parent`.
3. Per-entity resolution:
   - Changed in one branch only → that version wins, no conflict.
   - Changed in both → attempt intra-entity `diffy::merge` (3-way line merge scoped to the entity body); conflict only if truly incompatible.
   - Modified in one, deleted in the other → explicit conflict: `function 'validateToken' (modified in ours, deleted in theirs)`.
4. Reconstruct file from merged regions, preserving `ours` ordering.
5. Fallback to line-level merge for files >1 MB, binary files, or unsupported languages.

**Measured impact:**

- ~95% reduction vs line-based merge on false conflicts.
- Zero regressions across benchmark repos — every "win" was a false conflict Git forced a human to resolve; `weave` resolved cleanly and matched the human's authored merge.
- In the canonical example, Agent A expands `processData()` and Agent B edits `validateInput()` in the same file: Git conflicts (hunk overlap after line-shift), `weave` auto-resolves (`2 entities matched, 2 modified, 0 conflicts`).

**Aura (AST-aware) adds a taxonomy:**

| Property | CRDT (char) | AST-aware (Aura) | Git 3-way (line) |
|---|---|---|---|
| Granularity | Character | Syntax node | Line |
| Parser required | No | Yes (tree-sitter grammar) | No |
| Preserves validity | No | Yes (at commit) | No |
| Conflict model | Implicit tie-break | Explicit flagged | Explicit flagged |
| Handles rename/move | Poor | Good | None |
| Latency | Microseconds (live) | Milliseconds per sync | At merge time |
| Language coverage | All text | Grammar-dependent | All text |

Aura explicitly *rejected* CRDT for code: CRDT latency is attractive but syntactic awareness matters more; two peers editing the same function simultaneously at CRDT granularity would silently produce broken code at scale. The correct answer at that concurrency is *coordination* (claims), not a fancier merge.

**Fallback chain:** AST/entity merge → intra-entity 3-way text merge → full-file 3-way text merge. Each level handles what the layer above cannot parse.

### 3.5 Decision Guide

```
Is the state coordination metadata (claims, roster, task board)?
  └─► CRDT (Automerge JSON) — small, frequently mutated, must never corrupt

Is the state a scalar with one correct current value (title, file context)?
  └─► LWW — latest (ts, actor, event_id) wins

Is the state source code edited by agents on overlapping files?
  ├─► Prefer prevention (locks/worktrees) so merge is rare
  └─► When merge needed: entity/AST-aware driver (weave/aura)
       └─► fallback: hashline 3-way (git merge-file) for single-file recovery
           └─► fallback: Git line-based 3-way (human/AI resolves markers)

Is live real-time co-editing required (shared editor)?
  └─► OT or character-CRDT (Yjs/Automerge) for the editor buffer
      + AST driver at commit time for code correctness
```

The honest summary from the Aura docs: CRDT is strong on consistency, weak on syntax; AST merge is strong on syntax, weak on microsecond live sync; Git 3-way is strong on universality, weak on semantics. Code needs coordination first, semantic merge second, and CRDT only for the coordination state itself.

---

## 4 — Scheduling Limits

### 4.1 Why Scheduling Matters

Parallelism is not free. Practitioner reports converge on 3–5 concurrent agents as the *human* bottleneck — review and merge capacity, not tooling, is the ceiling. Beyond that, additional agents produce more branches than a human can understand, and they consume the shared LLM rate limit ~N× faster. Without scheduling, agents also thrash on hot files, exhaust disk with worktrees, or starve low-priority tasks.

Scheduling answers: *how many agents may run, how many may run at once, in what order, and what happens when the limit is hit.*

### 4.2 Caps: max-agents, max-concurrent, max-task-priority

Three distinct caps apply, analogous to OpenMP but re-interpreted for agent harnesses:

| Cap | OpenMP analogue | Agent meaning | Typical value |
|---|---|---|---|
| `max_agents` | Thread team size | Total agents that may exist (queued + running) | 10–20 (hard) |
| `max_concurrent` | `tool_concurrency_limit` / `OMP_NUM_THREADS` | Agents actually executing (editing / running tools) at one instant | 3–5 (effective), 4–8 (I/O-bound) |
| `max_task_priority` | `max-task-priority-var` ICV | Upper bound on priority values agents may request | Implementation-defined |

**Agent Coordinator** exposes per-agent budgets and auto-model-downgrade on cost; **OpenHands** SDK exposes `tool_concurrency_limit` (default 1 — sequential; 2–8 moderate parallelism; >8 only for I/O-heavy independent tools, with resource-exhaustion risk). The concurrency limit is per-agent, per-response: when the LLM requests multiple tool calls in one response, the executor runs up to that many concurrently rather than sequentially.

**Enforcement points:**

- Admission: `agent-os agent create` / `claude --worktree` refuses when `max_agents` is reached (or queues — see §4.3).
- Dispatch: the executor's thread pool / asyncio semaphore gates `max_concurrent`.
- Priority cap: if an agent requests `priority > max_task_priority`, the value is clamped to the ICV, as in OpenMP's `priority` clause.

### 4.3 Queues, Backpressure & Admission Control

When `max_concurrent` is saturated, new tasks must wait.

**Queue shapes:**

- **FIFO queue** — simplest; tasks run in submission order. Adequate for file-disjoint batches.
- **Priority queue** — higher `priority` value runs first (OpenMP: "higher priority tasks are recommended to execute before lower priority ones" — a hint, not a guarantee). Agent Coordinator's message bus supports priority levels on messages.
- **Dependency-aware queue** — a task with `depend(task: X)` does not start until X completes (OpenMP Task Scheduling Constraint #2). In agent terms: "refactor `auth.ts`" depends on "decide new auth interface."
- **Backpressure / rejection** — when both `max_agents` and queue depth are full, the harness returns `429` / `queue_full` rather than OOM. Callers retry with backoff — identical to the file-lock retry sketch: `for attempt in range(max_retries): if acquire(): break; sleep(backoff)`.

**Worktree reclamation as queue management:** The periodic sweep (`cleanupPeriodDays`) is effectively a queue drain — worktrees with no changes are removed immediately; those with changes persist until a human merges. Without it, an afternoon of headless `claude -p --worktree` runs fills 10 GB with orphaned checkouts.

### 4.4 Priority, Affinity & Work-Stealing

**Priority (OpenMP model):**

```c
#pragma omp task priority(100) { critical_path(); }
#pragma omp task priority(1)   { background_cleanup(); }
```

The OpenMP spec is explicit: priority is a *hint*; a program that relies on execution order being determined by priority has unspecified behaviour. Agent harnesses inherit this caution: priority influences queue ordering but does not guarantee it; correctness must not depend on order.

**Affinity / locality:**

- OpenMP hierarchical schedulers steal work on behalf of all threads sharing a cache, limiting costly remote steals; per-core LIFO queues exploit parent↔child locality.
- Agent analogue: assign file-adjacent tasks to the same agent/worktree to exploit filesystem and context cache locality (the agent already has `auth.ts` in context; giving it `auth.test.ts` is cheaper than cold-starting a new agent).
- `symlinkDirectories` / `sparsePaths` in monorepos: worktrees checkout only the directories named, and `node_modules` is symlinked to the main checkout to avoid N-installs.

**Work-stealing:**

- Qthreads hierarchical work-stealing is the high-water mark for OpenMP. For agents, the analogue is a deque per agent: when an agent finishes its queue early it steals the *oldest* task from the busiest agent's queue (LIFO local, FIFO steal). This balances load without central coordination.
- Agent Coordinator's `INSERT...SELECT` claiming is a simpler form: idle agents atomically claim the next unclaimed task — implicit stealing without explicit queues.

**Tied vs untied (OpenMP nuance):**

- *Tied* tasks always resume on the same thread (preserves thread-local state). Agent analogue: a task tied to its worktree (must continue on the same branch/filesystem).
- *Untied* tasks may migrate. Agent analogue: a pure research task that only reads files can run anywhere.
- Scheduling Constraint #1 ("a new tied task may be scheduled only if it is a descendant of every tied task currently bound to the thread") maps to: do not schedule a new worktree-bound edit that is not a descendant of the current edit stack — prevents interleaving two unrelated file mutations on the same worktree.

### 4.5 Rate Limits & Token Budgets

A dimension OpenMP does not have:

- **LLM rate limit:** All sessions on one account share one quota. Four agents hit the wall ~4× faster. Scheduling must account for tokens/sec, not just CPU.
- **Cost cap:** Agent Coordinator tracks per-agent spend and auto-downgrades the model when a budget is exceeded (e.g., Sonnet → Haiku).
- **Disk / port budget:** Each worktree costs disk and may need a unique port/DB. The scheduler must assign ports (`PORT=3000+worktree_index`) and database names before dispatch — otherwise two agents bind the same port and one fails with a misleading test error.
- **Cleanup budget:** `py-filelock` warns that thousands of lock files consume filesystem resources; prefer an in-memory service (Redis/Consul/etcd) at that scale.

**Practical scheduling recipe for 3–5 agents:**

```
1. max_agents = 6, max_concurrent = 4, queue = priority FIFO
2. Pre-partition work into file-disjoint beads (so priority is a hint, not a correctness requirement)
3. Admit tasks via atomic claim (SQLite INSERT...SELECT or HTTP 201)
4. Dispatch up to max_concurrent; excess queues with backoff
5. Assign ports/DBs deterministically by worktree index
6. Sweep worktrees daily; prune expired leases hourly
7. Track tokens & cost per agent; downgrade or pause on budget hit
```

---

## 5 — Real Examples

### 5.1 Claude Code Worktree Isolation

**Source:** Claude Code docs — *Run parallel sessions with worktrees*; ContinuumCode guides; Tim Schipper deep-dive.

**How it works:**

- `claude --worktree <name>` (or `claude -w <name>`) creates `.claude/worktrees/<name>` on branch `worktree-<name>` from the default branch (`worktree.baseRef = "fresh"`; set to `"head"` to include local unpushed work). In Desktop, every new session gets a worktree automatically.
- `.worktreeinclude` (gitignore-syntax) copies ignored config (`.env`) into each worktree.
- Isolation enforced at the tool layer, not by asking the model: blocked are (a) `Edit`/`Write`/`NotebookEdit` to main-checkout paths, (b) Bash/PowerShell commands with `cwd` in main, (c) git redirects (`git -C`, `--git-dir`, `GIT_DIR`, `GIT_WORK_TREE`, `cd` before git). Covers the session and every subagent it spawns, interactive or background.
- `isolation: worktree` in `.claude/agents/<agent>.md` frontmatter gives each subagent its own throwaway worktree. Temporary worktrees with no changes are auto-removed; those with changes persist until `cleanupPeriodDays` sweep can safely remove them. While live, `git worktree lock` protects the directory.
- Shared correctly: `.git` object store, history/branches/remotes/tags (commits visible everywhere), plugin installs, `settings.local.json` approvals (granted in one worktree, applied everywhere — file flows inward, permission flows outward).
- Manual `git worktree add` remains the path for existing branches, non-default paths, or fully custom locations (with `WorktreeCreate`/`WorktreeRemove` hooks for non-git VCS like SVN/Perforce).

**Failure modes documented:**

- Base branch surprises (agent starts from `origin/main`, missing local commits).
- Missing deps per worktree (each needs its own `npm install` / `cargo build`; 10 GB/day without cleanup observed).
- Shared ports/DBs (assign per-worktree).
- Approvals leaking outward (by design — one approval survives worktree deletion).
- Headless `claude -p` never prompts for cleanup — schedule `git worktree remove` / sweep.
- Human ceiling: 3–4 parallel sessions before terminal/review becomes unusable; tooling supports 8+, but "generation parallelises, review does not."

**Takeaway:** Worktrees are the official Claude Code answer for file isolation; file-level coordination (locks, claims) is needed *on top* for task partitioning so parallel diffs remain reviewable.

### 5.2 gptme / hashline_edit 3-Way Merge Recovery

**Source:** gptme commit `c3bdfb4` — *feat(tools/hashline_edit): 3-way merge recovery* (#3476 Phase 2, #3520).

**Problem:** `hashline_edit` previously rejected any edit where the file had changed between `read` and `edit`, forcing the model to re-read and restate the entire edit — wasteful and brittle under concurrent agents.

**Solution:** On hash mismatch, automatically attempt `git merge-file` 3-way:

```
base   = snapshot (common ancestor)
ours   = snapshot + model edits
theirs = live file (concurrent external change)
```

- Clean merge → atomic write via `NamedTemporaryFile` + `os.replace` (single `rename(2)`, POSIX-atomic), snapshot updated, log says `(recovered via 3-way merge)`.
- Conflicts → leave file untouched, report conflict markers with `-L` labels (`your edit (via hashline_edit)`, `original snapshot`, `current file`) rather than temp-path noise.
- Also fixed: non-empty stdout with nonzero exit now correctly classified as conflict (not silent success), and the pre-write freshness check now runs even during confirmation dialogs.

**Tests:** `TestMergeRecovery` — clean merge preserves concurrent change; conflicting merge reports markers and leaves file intact; no merge note on normal apply; snapshot updated after recovery. All 131 `hashline_edit` tests pass.

**Takeaway:** Snapshot-guarded editing + automatic 3-way recovery is the minimal merge strategy for shared-checkout agents; it pairs with advisory locks (prevent) and AST drivers (semantic resolve) to cover the full spectrum.

### 5.3 Ataraxy Weave & Aura — Semantic Merge Drivers

**Sources:** Ataraxy Labs `weave` (entity-level git merge driver) + Aura docs *CRDT vs AST Merge vs Git Hybrid*.

**Weave:**

- Replaces Git's line-based merge with entity-level: tree-sitter parses base/ours/theirs into functions/classes/interfaces/JSON keys, matches by `file:type:name:parent`, resolves per-entity (one-side change wins; both-changed → intra-entity `diffy::merge`; modify-vs-delete flagged explicitly), reconstructs preserving order, falls back to line merge for >1 MB / binary / unsupported.
- Result: ~95% fewer false conflicts (measured on real repos), zero regressions (every "win" was a false Git conflict that `weave` auto-resolved to the human-authored result).
- Example: Agent A edits `processData()`, Agent B edits `validateInput()` in same file → Git conflicts (hunk overlap after line shift), `weave` reports `2 matched, 2 modified, 0 conflicts`.

**Aura taxonomy:**

- Explicitly rejected CRDT for code (character convergence → broken code at scale) and rejected Git 3-way as sole strategy (spurious conflicts + missed semantic conflicts). Chose AST-aware merge as the semantic layer over Git, with Git as fallback when AST cannot parse.
- Comparison: CRDT strongest on consistency/character latency, weakest on syntax; AST strongest on syntax/validity, weakest on microsecond live sync; Git strongest on universality, weakest on semantics.
- Honest limits: non-trivial structural refactors (trait extraction vs inlining) still produce honest AST conflicts; 20 writers on one function will produce repeated conflicts regardless — coordination, not a better merge, is the answer.

**Shared state (weave's CRDT):** Claims, agent roster, heartbeats stored as an Automerge JSON document on disk — CRDT for *coordination state*, AST driver for *code* — the correct layering.

**Takeaway:** Semantic merge is the safety net *below* worktree/lock prevention; it makes overlapping edits reviewable instead of conflict-ridden.

### 5.4 OpenHands Runtime & Parallel Tool Execution

**Source:** OpenHands docs — *Parallel Tool Execution*; OpenHands SDK guides; agentsapis.com overview.

**Runtime model:** OpenHands (formerly OpenDevin, 82k+ stars, MIT) runs each agent inside a sandboxed Workspace with its own shell, filesystem, and browser — identical code runs locally (Docker) or remotely (Cloud). Given a task it edits files, runs commands/tests, browses, iterates, and opens a PR without step-by-step human control; a proprietary critic model evaluates quality and may refine or abort low-confidence work.

**Parallelism primitives:**

- **Workspace abstraction** — same agent code against a local or remote sandbox; multi-file edits across the repo (write-level, not single-file).
- **TaskToolSet / sub-agent delegation** — an orchestrator delegates to specialised sub-agents (`code_analyst`, `doc_reviewer`, `dependency_checker`) each with its own tools; file-based agents can be defined as Markdown + YAML frontmatter without Python.
- **Parallel tool execution** — when the LLM requests multiple tool calls in one response the SDK can execute them concurrently rather than sequentially; controlled by `tool_concurrency_limit` (default 1 = sequential; 2–8 moderate; >8 I/O-heavy only, with resource-exhaustion risk). Sub-agents inherit their own limit. Persistence: each conversation stores `event-*.json` under `events/`, grouped by `llm_response_id` to prove parallelism.

**Safety notes from docs:**

- "Not all tools are safe to run concurrently. Be careful with tools that modify shared state, write to the same files, have external side effects depending on order, deadlock on each other's resources, or exhaust file handles/memory/network."
- "When NOT to use: tools that must execute in order, operations that modify the same files, workflows where one tool's output feeds into another."
- Parallel agent execution in OpenHands Cloud — multiple agents on different tasks simultaneously.

**Historical parallel:** The OpenHands rebranding (OpenDevin → OpenHands) and SDK's explicit `tool_concurrency_limit` mirror OpenMP's evolution: both expose parallelism as an opt-in knob with a safe default (1) and documented hazards when raised.

**Takeaway:** OpenHands composes sandbox isolation (per-workspace filesystem) with executor-level parallelism (per-response concurrent tool calls) and sub-agent delegation — the same three layers (§1, §3, §4) in a single runtime.

### 5.5 OpenMP Task Fan-Out as Analogy

**Source:** OpenMP 5.1 / 5.2 spec — *Task Scheduling*; OpenMP Advanced Tutorial; *OpenMP Task Scheduling Strategies for Multicore NUMA Systems*.

Although OpenMP targets threads, not LLM agents, its scheduling model is the mature reference for fan-out coordination:

**Core constraints:**

- **Task Scheduling Points (TSPs):** implied at task creation, completion, `taskwait`, `barrier`, `taskyield`; at each TSP the implementation may switch tasks.
- **Constraints:** (1) new tied tasks only if descendant of every currently-tied task (prevents interleaving unrelated work on the same thread); (2) dependent tasks (`depend(in/out)`) do not start until dependencies fulfilled; (3) mutually exclusive tasks (`mutual exclusion` via `critical`/`ordered`) do not overlap; (4) `if(false)` tasks execute immediately.
- **Priority:** `priority(value)` is a *hint* — higher value recommended to execute first, clamped to `max-task-priority-var` ICV; programs that rely on order have unspecified behaviour.

**Scheduling strategies evaluated:**

- Hierarchical work-stealing (steal on behalf of all threads sharing a cache, per-core LIFO for locality), per-core work-stealing, centralised, round-robin (LIFO/FIFO), vs Intel and GNU runtimes on Nehalem / Magny Cours / Altix up to 192 CPUs. Hierarchical work-stealing won on 5/7 benchmarks by limiting costly remote steals.

**Agent translation:**

| OpenMP concept | Agent analogue |
|---|---|
| `max-task-priority-var` | Max priority agents may request |
| `depend(in/out: x)` | File-dependency gate before dispatch |
| Tied task | Worktree-bound edit (must resume on same branch) |
| Untied task | Pure read / research (may migrate) |
| TSP | Agent yield point (between tool calls, after commit) |
| Hierarchical work-stealing | Deque-per-agent, steal oldest from busiest |
| `if(false)` immediate | Small edits executed inline, not fanned out |

**Takeaway:** OpenMP's lesson — *priority is a hint, correctness must not depend on order; locality-aware stealing beats central queuing; fan-out scales only when tasks are independent* — applies directly to agent scheduling. Pre-partition into file-disjoint beads before fanning out; otherwise even perfect scheduling produces merge conflicts at review.

### 5.6 Agent Coordinator & MCP Agent Mail

**Sources:** `mkalkere/agent-coordinator` (FastAPI + SQLite); `happyin.space` multi-session coordination; MCP Agent Mail.

**Agent Coordinator:**

- Lightweight HTTP server (FastAPI + SQLite WAL) giving agents atomic task claiming (`INSERT...SELECT`), lease-based file locks (auto-expire, no deadlocks on crash), message bus (priority, acks, TTL, subscriptions), and health monitoring (stale at 30 min, reclaim at 60 min) plus a real-time dashboard (roster, Kanban, locks, streaming output).
- 17 API routers, 41 markdown-based skills, 5 presets, hierarchical memory (L1/L2/L3), cost tracking with auto-downgrade, git worktree per agent for workspace isolation. Any LLM that can make HTTP requests can be an agent — no framework lock-in.
- Invariant: state split correctly — append-only (handoffs, logs, inbox) per-session files, no race; mutable (GPU, file ownership) via lock + heartbeat + reclaim.

**MCP Agent Mail / multi-session primitives:**

- The ecosystem's converged primitives: git worktrees (files), tmux (sessions), SQLite WAL (coordination DB), advisory leases (ownership), pre-commit guards (enforcement), Claude Code hooks (`SessionStart`/`PreToolUse`/`PostToolUse`).

**Takeaway:** Production harnesses do not choose *between* worktrees, locks, buses, and leases — they compose all four, each handling the state shape it fits best.

---

## 6 — Anti-Patterns & Pitfalls

1. **Two agents, one checkout, no coordination.** Silent overwrites, no audit trail. Seen in the three-agent `auth.ts` incident. Fix: at minimum advisory locks; ideally worktrees.

2. **Hard locks without TTL.** Crashed holder blocks file indefinitely. Fix: leases + heartbeat + `prune --dry-run` liveness check (PID start-token or harness session probe) before reclaim.

3. **Locking only at edit time, not at stage/commit.** Two agents edit disjoint files but race on `git add`. Fix: synthetic `@git/index` lock + `git verify` pre-commit guard.

4. **Worktrees without dependency isolation.** Each worktree needs its own `node_modules` / build cache, or `cargo build` in worktree A invalidates worktree B's cache. Fix: `symlinkDirectories` / `sparsePaths` / container per worktree.

5. **Shared ports/DBs.** Agents bind `3000`, run migrations concurrently, and produce flaky tests blamed on code. Fix: deterministic per-worktree `PORT`, `DATABASE_URL`.

6. **Relying on priority for correctness.** OpenMP warns: priority-dependent order is unspecified. If task B *must* follow task A, express it as `depend`, not `priority`.

7. **`max_concurrent` too high.** >8 concurrent tools on shared state → race conditions, deadlocks, resource exhaustion (OpenHands docs). Fix: cap at 4–8; profile before raising.

8. **Treating CRDT as code merge.** Character-level convergence of two refactors → syntactically convergent but semantically broken. Fix: CRDT for coordination state, AST driver for code, human review for semantic intent.

9. **Ignoring stale worktree reclamation.** Headless agents never clean up; disk fills. Fix: daily `git worktree list` + `cleanupPeriodDays` sweep + `git worktree remove` in CI.

10. **File locks on network filesystems without verification.** `flock` semantics vary by server/protocol/mount. Fix: verify `SoftFileLock` with `O_EXCL` on the target filesystem, or use a service (etcd/Consul/Redis with fencing) when no shared filesystem exists.

11. **Same-UID trust boundary.** On one host, any same-UID process can delete another's lock file regardless of `0o600`. File locks defend cooperating peers, not hostile tenants. Fix: privilege boundary or broker process where trust does not hold.

12. **Caching `git rev-parse --git-common-dir`.** The value differs per linked worktree when mis-resolved via `--git-dir`; caching at startup breaks worktree-aware coordination. Fix: re-resolve fresh on every tool call (as `agent-locks` does).

---

## 7 — Recommended Reference Architecture

For a team running **3–6 coding agents** on a shared repo:

```
Layer 0  Isolation:      git worktree per agent  (.claude/worktrees/<name>)
                         + .worktreeinclude for .env
                         + per-worktree PORT / DATABASE_URL / symlinkDirectories
Layer 1  Prevention:     Advisory file leases (.agentlocks/locks/ or .git/agents-locks/)
                         TTL 10 min, heartbeat, owner-only refresh/expand/release
                         Synthetic @git/index lock around git add/commit
                         Pre-commit guard: git verify staged paths
Layer 2  Coordination:   SQLite WAL coordination DB (or FastAPI service)
                         Atomic task claiming, priority message bus, append-only handoffs
                         MCP tools (lock_*, mailbox) for native agent calls
Layer 3  Scheduling:     max_agents=6, max_concurrent=4, priority FIFO queue
                         Pre-partition into file-disjoint beads before fan-out
                         Hierarchical/deque work-stealing for balance
                         Token/cost budget per agent, auto-downgrade
Layer 4  Merge safety:   Entity/AST merge driver (weave) as git merge driver
                         hashline snapshot + git merge-file 3-way fallback for shared-checkout edits
                         LWW for scalars, Add/Remove Set & Automerge CRDT for coordination state
Layer 5  Reclamation:    Hourly lease prune (liveness probe), daily worktree sweep
                         Dashboard (roster, Kanban, locks, streaming output)
```

**When to scale beyond 6 agents:** Do not add more agents — remove overlap. Enforce one-file-one-owner via the claim board, or split the repo (monorepo `sparsePaths`). Review bandwidth is the true ceiling; generation is cheap, judgment is not.

**When to adopt single-branch:** Only when you have (a) mechanical guards (reservations + pre-commit + DCG), (b) fungible agents, (c) pre-partitioned disjoint work, and (d) Agent-Mail-grade coordination — and you need 10+ agents. Below that, worktrees are strictly safer.

---

## 8 — Sources

1. **AgentLocks — Advisory file locks for shared Git worktrees.** GitHub `simke9445/agentlocks` — file-level leases with TTL, owner-only mutation, synthetic `@git/index` lock, `git verify` PreToolUse hook, stale-reclaim via `prune`. <https://github.com/simke9445/agentlocks>

2. **BSWEN — Preventing file conflicts between AI coding agents: Git Worktrees vs File Locking.** Covers three-agent `auth.ts` collision, `FileLockManager` sketch, worktree vs lock comparison, hybrid coordinator pattern. <https://docs.bswen.com/blog/2026-03-12-prevent-file-conflicts-ai-agents/>

3. **AgentPatterns.ai — Single-Branch Git for Agent Swarms: A Trade-Off Pattern.** Advisory reservations with TTL, pre-commit guard, Destructive Command Guard (DCG), fungible vs specialist agents, worktree vs single-branch trade-offs, Agent Flywheel methodology. <https://agentpatterns.ai/workflows/single-branch-git-agent-swarms/>

4. **agent-locks MCP — Filesystem-based, git-worktree-safe work claiming.** GitHub `luohoa97/agent-locks` — Markdown+YAML under `git common dir`, `O_EXCL` semantics, `lock_check_conflict` static-prefix heuristic, per-call `resolveLocksRoot()` re-resolution, stdio MCP server mechanics. <https://github.com/luohoa97/agent-locks>

5. **Happyin Knowledge Space — Multi-Session Agent Coordination.** Converged primitives (worktrees, tmux, SQLite WAL, advisory leases, pre-commit guards, Claude Code hooks), append-only vs mutable state split, SQLite WAL requirement. <https://happyin.space/llm-agents/multi-session-coordination/>

6. **Claude Code Docs — Run parallel sessions with worktrees.** Official worktree spec: `claude --worktree`, `.worktreeinclude`, tool-layer isolation (file edits / cwd / git redirects), `isolation: worktree` subagents, shared `.git` semantics, `WorktreeCreate`/`WorktreeRemove` hooks, cleanup sweep. <https://code.claude.com/docs/en/worktrees>

7. **ContinuumCode Guides — Claude Code worktree: the --worktree flag and setup.** Tool-layer enforcement vs shell wrappers, `.worktreeinclude` semantics, isolation checks, subagent worktrees, base-branch (`fresh` vs `head`) nuance. <https://continuumcode.ai/guides/claude-code-worktree/>

8. **Tim Schipper — Git worktrees for parallel coding agents: what they isolate and what they share.** Deep-dive on what worktrees isolate (files/index/HEAD) vs share (`.git` objects, remotes, stashes, approvals), `.worktreeinclude`, `sparsePaths`/`symlinkDirectories`, port/DB sharing, disk cost, review bottleneck (3–5 agents). <https://tim-schipper.nl/en/blog/git-worktrees-parallel-coding-agents>

9. **gptme — feat(tools/hashline_edit): 3-way merge recovery (commit c3bdfb4, #3476/#3520).** Snapshot-guarded edits, `git merge-file` recovery (base/ours/theirs), atomic `os.replace`, `-L` labels, freshness check during confirmations, `TestMergeRecovery` suite. <https://github.com/gptme/gptme/commit/c3bdfb46d>

10. **Ataraxy Labs weave — Entity-level git merge driver.** `weave` parsing via tree-sitter, entity ID `file:type:name:parent`, per-entity resolution, ~95% false-conflict reduction with zero regressions, fallback to `diffy::merge`. <https://ataraxy-labs.github.io/weave/learn.html> and <https://github.laiyagushi.com/Ataraxy-Labs/weave>

11. **Aura Docs — CRDT vs AST Merge vs Git Hybrid.** CRDT (character, Figma/Automerge/Yjs), AST-aware (Aura/mergiraf/Spork, tree-sitter, syntax-valid), Git 3-way (line, Myers, hunks) comparison, why Aura rejected CRDT for code, hybrid fallback chain. <https://docs.auravcs.com/crdt-vs-ast-merge/>

12. **Grite Docs — CRDT Merging.** LWW for scalars (`ts, actor, event_id` total order), Add/Remove Sets for collections, append-only lists, deterministic projection, convergence/commutativity/idempotency guarantees. <https://docs.neullabs.com/grite/architecture/crdt-merging/>

13. **Agent Coordinator — Lightweight coordination server (mkalkere/agent-coordinator).** FastAPI + SQLite WAL, atomic `INSERT...SELECT` claiming, lease-based locks, message bus with priority/acks/TTL, health monitoring (30 min stale / 60 min reclaim), 17 routers, 41 skills, hierarchical memory, cost tracking, worktree per agent. <https://github.com/mkalkere/agent-coordinator>

14. **OpenHands Docs — Parallel Tool Execution & SDK Guides.** Workspace abstraction, TaskToolSet sub-agent delegation, `tool_concurrency_limit` (default 1, 2–8 moderate, >8 I/O-heavy), thread-safety warnings, per-response concurrent execution, persistence via `event-*.json`. <https://docs.openhands.dev/sdk/guides/parallel-tool-execution>

15. **agentsapis.com — OpenHands Agent API: Complete SDK & Developer Guide.** OpenHands architecture (Workspace, sandbox, critic model), 82k+ stars, cloud parallel execution, MCP support, sub-agent delegation. <https://agentsapis.com/openhands-api/>

16. **OpenMP Spec 5.1/5.2 — Task Scheduling & task Construct.** Task scheduling points, constraints (tied descendants, `depend`, mutual exclusion, `if(false)`), `priority` hint and `max-task-priority-var` ICV, `taskyield`, `mergeable`/`untied`. <https://www.openmp.org/spec-html/5.2/openmpse77.html> and <https://www.openmp.org/spec-html/5.1/openmpsu54.html>

17. **OpenMP Task Scheduling Strategies for Multicore NUMA Systems (Qthreads, ROSE, Nehalem).** Hierarchical work-stealing vs per-core stealing vs centralised vs round-robin, evaluated on 7 benchmarks, scaling to 192 CPUs. <https://journals.sagepub.com/doi/10.1177/1094342011434065>

18. **Distributed Systems — Lease Pattern & Stale Lock Handling.** Lease vs lock, heartbeat at TTL/3, fencing tokens (Kleppmann), Chubby / ZooKeeper / etcd / Kubernetes Lease / HDFS / Consul / Redlock comparison, stale-lock runbooks. <https://singhajit.com/distributed-systems/lease/> and <https://distributedrequest.com/distributed-coordination-locking-strategies/lock-timeout-lease-management/handling-stale-locks-in-distributed-systems/>

19. **py-filelock Docs — Concepts and Design.** `FileLock` / `SoftFileLock` / `StrictSoftFileLock` comparison, `O_EXCL` stale detection via PID+start-token, advisory vs mandatory, same-UID trust boundary, SQLite-backed `ReadWriteLock`, network filesystem caveats. <https://py-filelock.readthedocs.io/en/latest/concepts.html>

---

*Generated 2026-08-31 for Lokma parallel agent conflict research. File: `/tmp/agent-conflict-raw.md`.*
