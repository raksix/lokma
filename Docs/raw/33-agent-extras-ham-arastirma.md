# Lokma Agent System — Extra Features Brainstorm (Raw Research Draft)

> **Purpose:** Beyond the user spec, what *else* could Lokma's agent system do? 25 detailed ideas researched against 2025-2026 agent harness trends. Each idea has What / Why / How for Lokma.
> **Research date:** 2026-08-31
> **Sources:** 30+ web results on harness engineering, agentic trends, multi-agent orchestration, HITL, observability, sandbox, cron, cost governance, A2A/MCP protocols, evaluation benchmarks.
> **Length target:** 300+ lines, 20+ ideas. This doc = ~470 lines.

---

## Research Synthesis — What the Internet Says in 2025-2026

### The Harness is the Product
Faros AI ("Harness engineering: A guide to building better AI coding agents," May 2026) defines `Agent = Model + Harness` and argues harness engineering is phase 3 after prompt engineering (2022-23) and context engineering (2024-25). The five harness layers they identify: tool interface, context curation, feedback loops, safety rails, verification. Lokma already has a harness — the extras below deepen each layer.

Anthropic's "2026 Agentic Coding Trends Report" predicts single agents → coordinated teams, minimal human intervention for tasks that took hours/days, but stresses the transformation is fundamentally collaborative. Organizations that "scale human oversight without creating bottlenecks" win. Gap between early adopters and late movers is widening on agent coordination.

### Orchestration is Enterprise-Grade
Gartner via Business Research Company: Agentic AI Orchestration & Memory Systems market $6.49B in 2025 → $33.54B by 2030 (38.9% CAGR). Multi-agent orchestration patterns now production: supervisor/hierarchical, sequential pipeline, group chat, parallel execution. Kore.ai Agent Platform (Mar 2025) ships with 100+ connectors, graph-RAG, agent marketplace, memory, standardized agent communication API.

McKinsey 2025 State of AI: orgs deploying AI in automated/semi-automated workflows report 3x productivity gains vs query-response assistants. Microsoft Copilot Studio now supports multi-agent orchestration in Azure; Anthropic Claude Tool Use + Computer Use; Google Project Mariner browser automation — all infrastructure bets.

### HITL is Tiered, Not Binary
AWS re:Invent 2025 session "Implementing Human-in-the-Loop controls for multi-agent AI systems" (Dhiraj Mahapatro) lays out: HITL is needed for high-stakes decisions, irreversible actions, regulatory requirements, and trust-building. Implementation patterns: MCP elicitations (pause mid-execution), AWS Step Functions wait-for-callback (task token → email/Slack → resume), Lambda durable functions (2025), LangGraph interrupts (approve/reject/modify state). Goal = progressive autonomy — start high oversight, remove checkpoints as confidence + audit trails + feedback loops justify it. Harvard "centaur" model = divide work by reliability.

### Observability is Backbone
Gartner July 2025: "Enterprise-grade agentic AI requires continuous observability across all layers." Digital Thought Disruption (July 2025) + OpenTelemetry blog 2025 outline telemetry pipelines: metrics (CPU/mem/error counts), logs (structured), traces (spans across agents), events (policy signals). Prominent stacks: Datadog AI Monitoring (native multi-agent), LangSmith, Langfuse, Arize, Braintrust, Galileo, AgentOps, Maxim AI. LLM observability market $1.97B in 2025 → $6.8B by 2029 (36.5% CAGR). OpenTelemetry is the cross-vendor standard. Core capabilities: distributed tracing, token-level cost tracking, decision path viz, hallucination detection, real-time alerting.

### Cost Governance is Urgent
Augment Code (May 2026): multi-agent systems cost 5-15x single-agent equivalent. Formula: `Workflow Cost = (Base calls × token cost) + (Handoffs × context tokens) + (Retries × re-execution) + (Verification × duplicate) + (Redundant tool calls × API cost)`. AgentBudget, AgentLedger, TokenOps, aisecuritygateway.ai all ship budget enforcement at gateway/proxy/layer — per-request ceilings, per-session rolling budgets, per-key monthly caps, model-tier routing, circuit breakers (rate-of-spend 3x trailing avg → throttle). Consensus: enforcement must live *outside* agent code (HTTP proxy, gateway, middleware) so buggy agent cannot skip check. Supports 40+ models, OpenRouter, flat-rate vs metered billing (Claude Max etc. forced to $0 with `unknown` confidence).

### Sandboxes are Table Stakes
Ry Walker "AI Agent Sandboxes Compared" (June 2026, 19 platforms): E2B (1B+ sandboxes, 94% F100), Daytona (72.5k★, open source + computer use), Modal (GPU T4–B200, $4.65B valuation), Vercel Sandbox (ms starts, Firecracker), Cloudflare Sandbox SDK, AWS AgentCore Code Interpreter (8hr sessions, S3, CloudTrail), Google Agent Sandbox (Gemini Enterprise). Trends: checkpoint/restore (~300ms) now table stakes, per-second pricing, network policy, snapshot/branch, firecracker/gVisor isolation, browser/desktop computer use standard by 2028. Choice matrix: scale vs GPU vs persistent state vs idle-cost vs VPC/BYOC.

### Scheduling is Proactive Shift
OpenClaw (ex-Clawdbot, 250k+ GitHub stars) defines agent cron as contract not script: schedule + priority queue + task context + memory reference + structured heartbeats + metrics + self-healing + checkpoint-aware resumable runs. Hermes Agent cron docs show patterns: website change monitor with `[SILENT]`, weekly reports, GitHub watcher (`gh issue/pr list`), data collection pipeline (script + agent reasoning), multi-skill workflow, job chaining via `context_from`, no-agent script mode (zero LLM tokens). Overlap policies (`skip_if_running`), heartbeat payloads, file-based locks, cold-start lag handling.

### Marketplace & Protocols
A2A (Google Agent2Agent protocol) standardizes cross-vendor handoff payloads alongside MCP for tool calls. Agent marketplaces emerging: AgentMarketplace (VPC, audit logs), Kore.ai marketplace, ClawHub (skills). FutureAGI: handoffs that include goal + state + rollback path hit TaskCompletion >0.85 vs 0.62 for history-only. Benchmark-driven competition (ImageNet moment for agents): GAIA, τ-bench, SWE-bench, WebArena, AgentBench, CLASSic framework. Vendors publish per-domain standardized eval harnesses (Google Vertex AI Agents, OpenAI, Anthropic, AWS, Microsoft) — 5-15pt success gains vs mid-2025, 20-30% unit cost reduction.

---

## Table of Contents — 25 Ideas

1. Agent Templates & Marketplace (Internal + External)
2. Agent Evaluation & Benchmarking Harness
3. Cost Budgets & Quotas Per Agent (with Graceful Degradation)
4. Auto-Scaling & Fleet Management (Warm Pools, Concurrency Caps)
5. Agent Handoff Protocols (A2A/MCP-Native, State-Preserving)
6. Human-in-the-Loop Approvals Per Agent (Tiered Checkpoints)
7. Agent Analytics & Observability (Traces, Metrics, Decision Graphs)
8. Replay / Time-Travel / Checkpoint-Restore
9. Agent Skill Sharing & Composition (DAG of Skills)
10. Voice Per Agent (STT/TTS Persona)
11. Cron Per Agent (Proactive Autonomous Schedules)
12. Browser Per Agent (Computer Use Isolation)
13. Sandbox Per Agent (Firecracker/gVisor Isolation)
14. Memory Tiers Per Agent (Short/Episodic/Semantic Long-Term)
15. Agent Identity, Auth & Permission Scoping (Per-Agent Vault)
16. Inter-Agent Messaging Bus & Event Choreography
17. Agent Tool Budget & Rate Limiting (Tool-Level Throttling)
18. Prompt & Policy Versioning Per Agent (Git-Like)
19. Agent Regression Testing & Canary Deploys
20. Agent Secrets Rotation & Credential Brokering
21. Agent Knowledge Sync & RAG Per Agent
22. Agent Workflow Composition (Visual DAG + Code)
23. Agent Fault Tolerance & Self-Healing (Supervisor Pattern)
24. Agent Billing & Showback (Team/Project Attribution)
25. Agent Safety & Compliance Guardrails (PII, Policy-as-Code)

Plus: 5 Bonus Wildcard Ideas, Prioritization Matrix, and Sources.

---

## Idea 1 — Agent Templates & Marketplace (Internal + External)

**What:** Curated template library for scaffolding agents (e.g., "PR Reviewer," "SWE-Bench Fixer," "Docs Writer," "SRE Incident Responder") plus a marketplace where teams can publish, discover, fork, and rate agents. Each template bundles system prompt, tools whitelist, budgets, sandbox profile, eval suite, and cron defaults. Inspired by Kore.ai marketplace, ClawHub's 250k-star skill store, and Vercel/AgentCore packaging.

**Why useful for coding harness:** Lokma users currently spec agents from scratch. Templates cut time-to-first-agent from hours to seconds, enforce best practices (least-privilege tools, eval gates), and let orgs share proven patterns. Marketplace creates network effects — the 10x best coding agents become reusable across projects, like Docker Hub for agents.

**How it could work in Lokma:** Add `/agents/templates` in Lokma UI + CLI `lokma agent init --template pr-reviewer`. Store templates as YAML (`agent.template.yaml`) with fields `name, description, persona, tools[], mcp_servers[], budget, sandbox, evals[]`. Publish flow: `lokma agent publish ./my-agent --visibility org|public`. Registry backed by git repo or S3 + Postgres for ratings. Template inheritance: `extends: base/coding-agent@v2`. Governance: admin approves external imports; scanners flag templates requesting `exec` or `browser` broadly. Discovery: search by tags `["code-review","python","budget<$5"]`.

---

## Idea 2 — Agent Evaluation & Benchmarking Harness

**What:** Per-agent eval suites that run automatically on every prompt/tooling/model change — not just end-to-end but per-dimension: reasoning quality, tool selection accuracy, retrieval effectiveness, latency, cost, safety. Pluggable benchmarks: SWE-bench, GAIA-lite, τ-bench style, plus custom Lokma "coding harness" tasks (e.g., "fix failing test in repo X"). Produces leaderboards and regression alerts.

**Why:** Faros and InfoQ both stress continuous evaluation pipeline > single benchmark. Without evals, prompt tweaks silently regress. Teams using LangSmith/Galileo ship eval gates that block deploys. For Lokma, evaluation is how you prove one agent variant is 15% cheaper/faster/better before promoting.

**How:** `lokma eval run --agent pr-reviewer --suite coding-harness-v1` runs N tasks in sandboxed clones, captures traces, scores via LLM-as-judge (OpenAI Evals / LangChain Evals pattern) + deterministic checks (tests pass, lint clean). Store results in `evals/` table with dimensions: `task_completion, trajectory_score, tool_accuracy, token_cost, latency_p95`. Dashboard shows trend lines, compares branches. Hook into PR workflow: agent PR runs eval suite in CI, posts summary comment. Support "golden traces" — human-approved ideal trajectories that future runs must stay within ±epsilon. Wire to Idea 19 canary gates: promote only if `task_completion > 0.85 && cost_delta < +5%`.

---

## Idea 3 — Cost Budgets & Quotas Per Agent (with Graceful Degradation)

**What:** Dollar and token budgets scoped per agent, per session, per crew/mission, per user/org, per time window (hour/day/mission). Modes: soft (warn + downgrade), hard (block), tiered (warn at 80%, block at 100%). Auto-downgrade chains (Opus → Sonnet → Haiku → mini), tool disabling (kill `web-search` at 80%), and circuit breaker on spend rate (3x trailing 7d avg → throttle to 1 req/s). Exactly as AgentBudget + Paymaster describe.

**Why:** Augment Code: 3-agent workflow = 5-15x single-agent cost. A runaway retry loop can burn $500 overnight with zero per-agent attribution today. Without budgets, Lokma operators discover cost at invoice time. Per-agent budgets make cost a first-class control, not afterthought.

**How:** Gateway/proxy pattern (not in-agent) — Lokma sidecar intercepts `POST /v1/chat/completions` before forwarding to OpenAI/Anthropic/Google. Table `budget_limits(scope_kind, scope_id, window, limit_usd, mode)`. Table `cost_ledger(agent_id, mission_id, model, input_tokens, output_tokens, billing_mode, cost_usd, quota_remaining_pct)`. Enforcement: check before forward; `402 Payment Required` or `429` with `X-Budget-Remaining`. Downgrade: proxy rewrites `model` param. Flat-rate handling: `billing_mode=flat_rate` → `$0` with `cost_confidence=unknown`, not metered against budgets. CLI: `lokma budget set --agent backend-dev --limit 20 --window day --mode tiered`. Dashboard: per-agent burn-down chart, top spenders, anomaly alerts via Slack webhook.

---

## Idea 4 — Auto-Scaling & Fleet Management (Warm Pools, Concurrency Caps)

**What:** Lokma agents are not just single processes — they're fleets. Auto-scale based on queue depth, p95 latency, or schedule triggers. Keep warm sandboxes (pre-booted Firecracker microVMs) to cut cold-start from seconds to ~90ms (Daytona) or ms (Vercel). Enforce concurrency caps per agent (max 5 parallel coding tasks), queue with priority, and burst to cloud when local pool exhausted.

**Why:** Coding harness workloads are spiky: PR burst Mon 9am, idle overnight. Without pooling, each job pays cold-start tax fetching repo + installing deps. With pooling, Sprites-style ~300ms checkpoint/restore gives near-instant agent availability. Concurrency caps prevent one noisy agent from starving fleet.

**How:** Control plane `fleetd` manages pools: `pool: { agent: "coder", min: 1, max: 20, warm: 2, sandbox: "daytona|e2b|local-firecracker", snapshot: "repo-base@v3" }`. Scheduler watches NATS/Redis queue length; scales via `POST /v1/fleet/scale`. Warm sandboxes are snapshotted after `git clone + pnpm install`, kept paused, restored CoW. Metrics: `fleet_size, queue_depth, p95_start_latency, idle_seconds`. Policies: `overlap_policy: skip_if_running|queue|fork`. Integration with Idea 13 sandbox: sandbox provider plug transports sandboxes across clouds (E2B for scale, Daytona self-hosted for PII). Cost tie to Idea 3: scaling respects budget limits.

---

## Idea 5 — Agent Handoff Protocols (A2A/MCP-Native, State-Preserving)

**What:** Formal handoff primitive (not just function call) that transfers goal, conversational state, artifacts, and rollback path between specialized agents. Wire format follows Google A2A + MCP elicitation specs so handoff is observable span, evaluable, and reversible. Supports symmetric/asymmetric routing, shared scratchpad vs message-passing, and human handoff queue.

**Why:** FutureAGI 2026 evals: unstructured handoffs hit TaskCompletion 0.62; structured A2A payloads hit 0.85 — same models, different protocol. Coding harness naturally decomposes: planner → coder → tester → reviewer. Without explicit handoff, state leaks (reviewer re-asks order ID, re-runs tool calls doubling latency).

**How:** Define `Handoff { from, to, goal: string, context: {history_slice, artifacts[], decisions[]}, rollback: {on_failure: "hand_back|escalate|retry", deadline} }`. Runtime emits `handoff` span with `agent.trajectory.step`. Implementation options: OpenAI Agents SDK tool-call handoff for minimal payload, LangGraph state graph shared scratchpad for pointer, A2A for cross-vendor. Lokma API: `lokma handoff --from planner --to coder --goal "implement auth middleware"` or declarative `handoff_rules.yaml` (if intent == "needs tests" → tester). Observability (Idea 7) renders handoff graph; eval (Idea 2) scores `re-asked-question rate` and `TrajectoryScore`. Rollback restores checkpoint (Idea 8).

---

## Idea 6 — Human-in-the-Loop Approvals Per Agent (Tiered Checkpoints)

**What:** Per-agent, per-action HITL checkpoints — not global toggle. Each risky tool/action (e.g., `git push --force`, `rm -rf`, `deploy`, `send_email`, `spend >$5`) declares approval tier: auto, require_review, require_two_person, require_human_in_session. Reviewer can approve, reject & redirect, or modify state (correct value before continuation). Supports async callback (Step Functions token), MCP elicitation inline, and LangGraph interrupt node.

**Why:** AWS re:Invent 2025 guidance: HITL needed for irreversible actions, high-stakes decisions, regulatory, and trust-building. Progressive autonomy: start conservative, let data justify removing checkpoints. For coding harness, `apply_patch` to main branch deserves HITL; `run_tests` doesn't. Without per-agent tiers, teams either over-gate (slow) or under-gate (dangerous).

**How:** Agent manifest `approvals: [{ tool: "exec", pattern: "git push.*main", tier: "require_review", reviewers: ["@backend-owners"], timeout: "10m", on_timeout: "deny" }]`. Runtime pauses execution, emits task token to Slack/email/Lokma inbox, and workflow sleeps. Reviewer UI shows diff preview, trace, and confidence score. Actions: Approve / Edit & Approve (mutates state — e.g., fix branch name) / Redirect to alternate branch / Deny. Audit log stores who approved what and latency. Telemetry tracks `hitl_rate` per agent; auto-remove suggestion fires when agent's approval pass rate >98% over 100 runs (centaur rebalancing). Tie to sandbox (Idea 13): high-tier actions run in stricter veto sandbox first.

---

## Idea 7 — Agent Analytics & Observability (Traces, Metrics, Decision Graphs)

**What:** Five-pillar observability per agent: (1) distributed tracing (OpenTelemetry spans for every LLM call, tool use, handoff, HITL), (2) token-level cost & latency histograms, (3) decision path visualization (why the agent chose tool X), (4) hallucination / tool-error detection, (5) real-time alerting (error rate >5%, p95 latency >30s, cost spike). Built on OTel, Prometheus, Grafana + Langfuse-style trace viewer.

**Why:** Gartner July 2025: observability backbone for reliable agentic AI. Without it, debugging multi-agent failure is "reading raw logs and guessing what state was lost." Coding harness traces are long (dozens of tool calls); devs need to see at a glance where coder agent strayed.

**How:** SDK auto-instruments Lokma agent loop: every iteration emits `span {agent_id, mission_id, parent_span, llm.model, tokens_in/out, tool.name, duration, cost}`. Prometheus metrics: `agent_health (0/1), tasks_processed, error_rate, spend_rate`. Trace backend: OTLP endpoint → Jaeger/Tempo; Lokma UI embeds trace waterfall + agent graph. Decision graph: render LLM reasoning → tool selection as DAG with confidence scores; highlight low-confidence nodes. Alerting via PromQL: `rate(agent_errors[5m]) > 0.05`. Log retention policy per agent (PII agents 7d, coding agents 30d). Export to Datadog/New Relic if desired. Ties to Idea 2 evals: traces feed evaluators.

---

## Idea 8 — Replay / Time-Travel / Checkpoint-Restore

**What:** Deterministic replay of any agent run from any checkpoint — like `git bisect` for agents. Persist full state snapshot at each step (messages, tool outputs, file diff, sandbox filesystem) so operator can rewind to step N, tweak prompt/model/tool, and resume. Includes branch (fork alternative path without losing original) and snapshot/pause/resume across machines. Inspired by Microsoft Agent Framework checkpointing/time-travel, LangGraph checkpointing, and sandbox snapshot (~300ms, Sprites/Runloop/E2B).

**Why:** Coding agents are non-deterministic and expensive to re-run from scratch. Time-travel lets you debug the failure step directly instead of replaying full 30-step trajectory. It also powers A/B testing: fork at decision point, try two models, compare outcomes. Essential for harness development where you iterate on prompts.

**How:** State store (SQLite/Postgres or durable filesystem) writes `checkpoint {run_id, step_idx, messages[], tool_state, sandbox_snapshot_id, llm_params}` after each node. Sandbox snapshot: Firecracker rootfs snapshot or E2B pause/resume or Daytona checkpoint. API: `lokma run replay <run_id> --from-step 12 --with-model gpt-4o-mini --fork` or UI "Rewind" slider. Branch metadata tracks parent. Instrumentation emits `checkpoint_created` event. Storage policy: keep last 100 steps per run, GC older; compress sandbox diffs. Integration with Idea 5: failed handoff triggers auto-rewind to handoff source. Safety: replay respects same budgets/approvals; requires `replay` permission.

---

## Idea 9 — Agent Skill Sharing & Composition (DAG of Skills)

**What:** Skills are reusable capabilities (e.g., `read_repo`, `run_tests`, `browser_navigate`, `voice_speak`) that agents compose — not monolithic prompts. Skills declare inputs/outputs/tool needs, version, and permissions; agents declare required skills; runtime composes them into DAG with dependency resolution. Skills share via same marketplace as Idea 1 but at finer granularity than full agents. Think ClawHub skills + MCP servers + npm for agent capabilities.

**Why:** Without composition, each coding agent re-implements git handling, lint, test runner. Skill sharing DRYs the harness, lets specialist owners maintain `python-test-runner` skill while many agents reuse. It also enables least-privilege: give `pr-reviewer` only `read_code + comment` skills, not `deploy`.

**How:** Skill manifest `skill.yaml`: `name: run_tests, version: 1.2.0, inputs: {repo_path, test_cmd}, outputs: {passed, logs}, tools: [exec], mcp: [filesystem], permissions: [read, exec:pytest]`. Registry: `lokma skill install run_tests@1.2` fetches from marketplace/git. Agent manifest `skills: [read_repo@^1, run_tests@^1.2, llm:claude-sonnet]`. Resolver builds DAG, validates no circular dep, checks permission intersection. Runtime loads skills as MCP servers or in-process handlers. Version pinning: `skill.lock.yaml`. Sharing: org-private vs public. Analytics (Idea 7) tracks per-skill usage/cost/error to spotlight flaky skills.

---

## Idea 10 — Voice Per Agent (STT/TTS Persona)

**What:** Each agent gets optional voice persona — STT for inbound voice commands, TTS for outbound narration of its actions. Agents could voice-announce "I just pushed a fix for PR #42" in a team Discord/Telegram call, or let operator dictate "fix the flaky test" hands-free. Per-agent voice profile (name, avatar, tone, language) plus shared Hermes voice mode docs.

**Why:** Hermes docs show `/voice` mode is already a premium UX; extending voice per agent makes multi-agent teams feel ambient and present, especially for SRE/review workflows where heads-down coding + voice triage is useful. It also enables accessibility and on-the-go operation.

**How:** Hogwarts-style: agent config `voice: { enabled: true, provider: "elevenlabs|openai-tts|xtts", voice_id: "adam", stt: "whisper", wake_word: "hey lokma", deliver: "telegram-voice" }`. STT path: push-to-talk in Lokma UI or Telegram voice note → Whisper → intent → route to correct agent via name. TTS path: agent emits `speak` event → TTS service → audio chunk streamed to deliver channel. Persona overlay: system prompt injects voice tone hint ("speak concisely, friendly hacker"). Cost control: voice disabled when budget >90% (Idea 3). Privacy: voice logs optionally not stored; require opt-in per agent. Integration with Idea 12 browser: voice-controlled browser agent ("scroll down").

---

## Idea 11 — Cron Per Agent (Proactive Autonomous Schedules)

**What:** Built-in cron scheduler per agent so agents become proactive, not just reactive to prompts. Each agent declares its own schedules: `nightly at 2am run swe-bench subset`, `every 30m poll Sentry for new errors`, `Mon 9am generate weekly report`. Schedules support all Hermes cron patterns (relative `every 30m`, standard `0 9 * * 1`, at `2025-06-15T09:00`), plus `context_from` chaining, overlap policies, heartbeats, and script-only no-LLM mode.

**Why:** OpenClaw/Hermes research shows shift from "wait for prompt" → "do this every day" is most impactful agent upgrade. Savior: proactive codebase health agents that open PRs before humans notice tech debt. Without per-agent cron, you need external orchestrator and lose agent-local memory/context.

**How:** Agent manifest `schedules: [{ name: "nightly-tests", cron: "0 2 * * *", prompt: "Run test suite in sandbox, open PR if flaky test found", timezone: "Europe/Istanbul", timeout: 600, overlap: "skip_if_running", memory_required: [recent_failures] }]`. Persistence: scheduler stores jobs in DB (not single `jobs.json` — avoid OpenClaw pitfall), `jobs.d/` directory support for GitOps, declarative sync from repo. Heartbeat payload: `{agent_id, task_id, status, stage, progress_pct, next_heartbeat}`; missed 3× → alert human, log, self-heal (restart with exponential backoff). Cost: script-only ` --no-agent` for heartbeat check (zero tokens) + `[SILENT]` for quiet runs. UI: per-agent schedule list + `lokma cron run <id>` manual force + history with status/duration/errors. Tie to budgets: cron job inherits agent budget; alert at 80% daily spend.

---

## Idea 12 — Browser Per Agent (Computer Use Isolation)

**What:** Dedicated isolated browser session per agent (its own cookie jar, storage, viewport, CDP connection) so web-capable agents can scrape docs, test UIs, or automate SaaS without colliding. Built on headless Chrome/Playwright/Firecracker + Daytona Computer Use pattern. Each browser agent gets viewport recording, screenshot-on-demand, and WAF-aware stealth options.

**Why:** Agentic browser automation (Project Mariner, Claude Computer Use, Browserbase) is 2025's breakout. Coding harness: "go check MDN docs," "verify staging deploy renders correctly," "file GitHub issue with screenshot" — all need browser. Without isolation, two agents sharing browser clobber cookies/auth.

**How:** Agent config `browser: { enabled: true, headless: true, viewport: "1280x800", record: true, proxy: "residential?", isolate_cookies: true, max_pages: 5 }`. Runtime spawns Playwright browser context per agent inside its sandbox (Idea 13). API: agent tool `browser_navigate`, `browser_click`, `browser_screenshot`, `browser_extract`. Orchestration: `Daytona.create({ language: "typescript" })` with Computer Use (Linux/Win/macOS/Android desktops) or `agent-sandbox` for local. Security: browser runs in gVisor/Firecracker, no host network except allowlist; secrets never visible to page. Observability: trace includes DOM snapshots + screenshot thumbnails. Cost controllable: max 30 browser steps per mission.

---

## Idea 13 — Sandbox Per Agent (Firecracker/gVisor Isolation)

**What:** Hard isolation per agent: each executes in its own microVM/container with resource limits (vCPU, RAM, disk, network policy, lifetime TTL). Options mirror 2026 landscape: E2B (scale), Daytona (open source), Firecracker microVM, gVisor, Docker. Sandboxes snapshot/restore in ~300ms, persist to 14 days, per-second billing, allowlist egress.

**Why:** Coding agents run arbitrary generated code — `rm -rf /` is not hypothetical. Isolation prevents one agent's buggy `npm install` from poisoning another's filesystem or exfiltrating secrets. It also enables reproducibility: same snapshot → deterministic builds.

**How:** Agent config `sandbox: { provider: "e2b|daytona|firecracker|docker|modal", vcpu: 2, memory: "4GB", disk: "20GB", network: "allowlist: [github.com, pypi.org]", ttl: "8h", snapshot: true, idle_timeout: "15m" }`. Control plane provisions sandbox on mission start, injects repo clone + deps install from cached snapshot, mounts per-agent vault (Idea 15). Network policy: default deny, explicit allowlist; DNS exfil blocked. Lifecycle: `create → warm → pause/resume → snapshot → destroy`; auto-sleep zero idle cost (Sprites/Blaxel hibernation). Metrics: `sandbox_start_ms, cpu_seconds, disk_used`. Fallback: local `microsandbox` via `libkrun` for offline dev. Tie to Idea 4 warm pools: snapshots shared across fleet.

---

## Idea 14 — Memory Tiers Per Agent (Short/Episodic/Semantic Long-Term)

**What:** Per-agent memory architecture with tiers: (a) short-term (current mission context window + scratchpad), (b) episodic (past missions/tasks with outcomes, traces, artifacts), (c) semantic (distilled knowledge: coding conventions, repo quirks, reviewer preferences), (d) vector memory (RAG over docs/tickets/PRs). With consolidation pipeline (nightly "dream" like autoDream: review→compress→heal at 3:30am).

**Why:** Single-context agents forget why `utils/foo.py` is special after mission ends. Memory tiers give continuity: episodic lets agent recall "last time this test flaked, fix was X"; semantic stores org style guide. MarkTechPost 2025: enterprise agentic memory market core to orchestration; Kore.ai ships graph-RAG memory.

**How:** Store: short-term in in-memory context manager (sliding window + summarizer), episodic in Postgres `agent_memory_episodes` (mission_id, summary, outcome, trace_ref), semantic in `agent_memory_facts` (fact, confidence, source, last_verified), vector in Qdrant/pgvector per agent namespace. Nightly consolidation cron (Idea 11) at 3:30am runs 4-phase: review episodes → compress duplicates → heal contradictions → prune low-confidence. Retrieval: hybrid (vector + BM25 + recency). Isolation: per-agent memory by default, opt-in shared org memory with ACL. Tool: `memory_search("flaky test checkout")` returns top-k episodes. Cost control: consolidation uses cheaper model (Haiku/mini), query uses Sonnet. Privacy: episodes redact PII before semantic extraction.

---

## Idea 15 — Agent Identity, Auth & Permission Scoping (Per-Agent Vault)

**What:** First-class identity per agent — its own service account, API keys, scoped permissions, and vault — so "coder agent" cannot read prod DB while "migrator agent" can. Identity anchored on-chain optional (ERC-8004) or local PKI. Permissions declarative (RBAC + ABAC): which repos, branches, tools, secret prefixes, spend limits. Supports credential brokering (short-lived tokens, OIDC).

**Why:** AgentOps incident lore: over-privileged agent deleted prod data. Principle of least privilege is security table stakes. Per-agent vault also enables safe multi-tenancy: tenant A's agent never sees tenant B's GitHub token.

**How:** Agent config `identity: { id: "coder-1", role: "code-contributor", vault: "hashicorp|doppler|lokma-vault", allowed_repos: ["org/web-*"], allowed_tools: ["exec:pytest", "git:push:*"], secret_allowlist: ["github_pat_coder", "sentry_ro"] }`. Control plane issues short-lived tokens via Vault dynamic secrets (TTL 1h), agent fetches via sidecar never seeing raw secret (Microsandbox network-layer injection pattern). Auth audit: every tool call logs `agent_id, principal, resource, allowed`. Integration with Idea 6 HITL: privilege escalation requires HITL approval. On-chain optional: AgentLux-style ERC-8004 identity for billing traceability; x402 protocol for payment-gated services.

---

## Idea 16 — Inter-Agent Messaging Bus & Event Choreography

**What:** Async pub/sub bus for agents to publish/consume events (`task.completed`, `pr.opened`, `test.failed`, `budget.warning`) without direct coupling. Topics partitioned by workspace/crew. Supports event sourcing, DLQ, and exactly-once delivery. Alternative to direct handoff (Idea 5) for fan-out patterns.

**Why:** Not every coordination is 1:1 handoff. Example: coder finishes feature → tester, reviewer, and docs writer all need to react. Choreography via events decouples — add `security-scanner` later without touching coder. Production pattern for large Lokma deployments.

**How:** Backed by NATS JetStream / Redis Streams / Kafka lite. Agent manifest `subscribes: [{ topic: "tests.failed", filter: "repo == myrepo" }]` and `publishes: ["task.completed"]`. Runtime helper `bus.emit("pr.opened", {pr: 42})`. Exactly-once via idempotency key `event_id`. Observability: bus events appear in trace (Idea 7). Dead-letter queue after 3 retries → human queue (Idea 6). Retention: 7d hot, archive to S3. Cost/latency: in-memory bus <1ms; optional persistence for cross-region.

---

## Idea 17 — Agent Tool Budget & Rate Limiting (Tool-Level Throttling)

**What:** Beyond LLM token budgets (Idea 3), enforce per-tool rate limits and spend budgets: max 20 `web-search` calls per mission, 10 `exec` per minute, 5 `browser_navigate` per mission, cost-per-tool accounting ($0.01/search). Differentiate cheap (read file) vs expensive (browser, GPT-4o) vs risky (exec). With token-bucket and sliding-window limiters.

**Why:** AgentLedger docs: MCP tool metering matters — tool calls are not free. An agent stuck in `search → scrape → search` loop can spend $10/hour without ever hitting LLM budget. Tool budgets catch that. Also rate-limits protect downstream APIs (GitHub 5k/hr, Sentry).

**How:** Agent config `tool_budgets: [{ tool: "web-search", max_calls: 20, window: "mission", cost_per_call: 0.01 }, { tool: "exec", max_calls_per_min: 10, burst: 5 }]`. Gateway/middleware enforces before invoking tool; returns structured error `TOOL_BUDGET_EXCEEDED {tool, limit, retry_after}` that LLM can reason about ("I hit search limit, try reasoning instead"). Token bucket per `agent_id:tool` in Redis (O(1)). Admin overrides via `lokma tool-limit set --agent coder --tool exec --max 100`. Alert at 80% tool budget. Tie to Idea 3: tool cost rolls into same `cost_ledger`.

---

## Idea 18 — Prompt & Policy Versioning Per Agent (Git-Like)

**What:** Version control for agent prompts, tool policies, model choices, and routing rules — with diff, blame, rollback, branch, and PR review. Every mission pins exact versions (prompt@v3 + policy@v2) for reproducibility; canary tests new prompt on 5% missions before promoting.

**Why:** Prompt is code. Without versioning, "someone tweaked the coder prompt" is invisible regression cause. Faros harness metrics: prompt changes are #1 source of variance. Git-like versioning brings software engineering discipline to agent engineering.

**How:** Store agents as git repo `lokma/agents/<agent-name>/` with `prompt.md`, `policy.yaml`, `tools.yaml`, `model.lock`. CLI `lokma agent edit pr-reviewer` opens editor, commits on save with `git commit`. Backend: Postgres `agent_versions(agent_id, version, prompt_hash, policy_hash, author, created_at)` + git mirror for blame/diff. Rollback: `lokma agent rollback pr-reviewer --to v12`. Pinning: mission records `agent_version_id`. Evaluation gate (Idea 2): new version must pass eval suite before auto-promote. Audit: who changed what, when, before incident.

---

## Idea 19 — Agent Regression Testing & Canary Deploys

**What:** Safe promotion pipeline for agent changes: shadow → canary (5% traffic) → staged (50%) → full. Automated regression harness runs golden tasks; compares new variant's traces/outputs/costs to baseline; auto-rolls back if `task_completion` drops >5% or `cost` spikes >20% or `error_rate` > baseline. Integrates with Idea 2 evals and Idea 18 versioning.

**Why:** Anthropic 2026 report: teams that master agent coordination ship features in hours not days, but deploy risk is real — one bad prompt can degrade PR review quality silently. Canary is how you move fast without breaking prod.

**How:** Promotion config `promotion: { stages: [{name: "canary", traffic: 0.05, duration: "2h", gates: [{metric: "task_completion", min: 0.85}, {metric: "cost_delta_pct", max: 20}]}, {name: "full", traffic: 1.0}] }`. Router splits missions by hash. Metrics collector (Idea 7) aggregates per-variant. Controller watches gates; violation → auto-rollback to previous `agent_versions` and alert. UI: promotion progress bar, comparison table. Manual gate: require HITL approval (Idea 6) before full.

---

## Idea 20 — Agent Secrets Rotation & Credential Brokering

**What:** Automatic secret rotation and just-in-time credential brokering per agent. Secrets (GitHub PATs, API keys, DB passwords) live in Vault, rotated on schedule (24h/7d) or on compromise signal. Agents never see long-lived secrets — they get ephemeral lease (Vault token, AWS STS) injected at sandbox network layer (Microsandbox pattern: secrets never visible to sandbox code).

**Why:** Static per-agent API keys are leakage risk, especially when browser agent could exfiltrate `env`. JIT brokering + rotation is zero-trust standard. 2026 sandbox hardening guidance explicitly recommends it.

**How:** Vault integration: `vault: { engine: "kv|aws|github", path: "secret/lokma/coder", rotation: "24h", lease: "1h" }`. Lokma secrets controller rotates, updates `vault_rev` hash. Sidecar intercepts agent's `exec`/`browser` and injects header/env via network proxy, not env var. Agent sees `GITHUB_TOKEN=<dynamic>` valid 1h then auto-revoked. Audit: `credential_issuances` table, alert on issuance spike (possible exfil). Integration with Idea 15 identity: lease scoped to agent's allowed resources only. CLI: `lokma secrets rotate --agent coder`.

---

## Idea 21 — Agent Knowledge Sync & RAG Per Agent

**What:** Per-agent RAG pipeline with dedicated corpus, chunking strategy, retriever, and re-ranker. Agent's knowledge syncs on schedule (Idea 11) or on repo push (webhook): ingest Markdown, code embeddings (AST-aware), tickets, Slack threads, Notion, into that agent's vector store partition. Supports graph-RAG (Kore.ai style) for codebase reasoning (imports, call graph) and citation tracking.

**Why:** Generic RAG gives generic answers. Per-agent corpus means `docs-writer` retrieves style guide + recent ADRs while `coder` retrieves repo embeddings + issue history. Graph-RAG beats plain vector for "why does this import fail?" Reasoning.

**How:** Agent config `rag: { corpus: [{source: "git:org/repo/docs/**", chunk: "markdown", schedule: "on_push"}, {source: "notion:db_id", chunk: "blocks"}], embedder: "voyage-3|gemini-embed|local-bge", reranker: "cohere-rerank", graph: true }`. Ingest pipeline: watcher (git webhook/S3 event) → chunker → embedder → vector store (pgvector/Qdrant) namespaced `agent_id:corpus`. Retrieval tool `knowledge_search(query, top_k=5, cite=true)` returns chunks with provenance. Trace shows retrieved docs (Idea 7). Update flow: incremental embeddings, dedupe by content hash, prune stale. Cost: embed cheap batch jobs off-peak.

---

## Idea 22 — Agent Workflow Composition (Visual DAG + Code)

**What:** Compose multi-agent workflows as DAGs — visually in UI (drag nodes, connect edges) and as code (YAML/Python). Nodes are agents or tools; edges are handoffs/events; branches/conditions (`if tests_failed → debugger`); loops (`retry up to 3x`); parallel forks (`run linter + tester + security-scan concurrently`). Serializable to LangGraph/Hermes workflow IR.

**Why:** Supervisor/hierarchical, sequential, group-chat, parallel patterns (AI Wiki, 2025) are proven but hard-coded today. Visual DAG makes orchestration accessible to PMs while code keeps it versioned (GitOps). Workflow is the natural abstraction for "PR pipeline: planner → coder → tester → reviewer → merger."

**How:** UI: canvas with node palette (agent, tool, condition, fork/join, HITL gate). Code: `workflow.yaml`:
```yaml
nodes:
  - id: planner
    agent: planner@v2
  - id: coder
    agent: coder@v1
    needs: [planner]
  - id: tests
    parallel: [linter, tester, sec-scan]
    needs: [coder]
edges:
  - from: tests
    to: reviewer
    when: "tests.passed"
  - from: tests
    to: debugger
    when: "tests.failed && retry < 3"
```
Runtime: orchestrator (Step Functions / LangGraph / custom) executes DAG respecting dependencies, concurrency caps (Idea 4), budgets (Idea 3), checkpoints (Idea 8). Observability: DAG overlay with per-node status. Export/import as OpenAPI-like spec for marketplace (Idea 1).

---

## Idea 23 — Agent Fault Tolerance & Self-Healing (Supervisor Pattern)

**What:** Supervisor agent that watches worker agents' health (heartbeat misses, exception loops, tool errors > threshold), decides remediation: retry with backoff, mutate prompt/model, re-route to fallback agent, checkpoint-restore to pre-failure, or escalate to human. Implements patterns from first-officer log: wrap every major op in try/catch that emits failure heartbeat immediately; file-based locks; version checks on deps.

**Why:** Without supervisor, a stuck agent silently burns budget (Idea 3) and blocks queue (Idea 4). Self-healing is why heartbeat + checkpoint ideas matter operationally — they close the loop.

**How:** Supervisor config `supervisor: { watch: ["coder", "tester"], heartbeat_interval: "60s", missed_threshold: 3, actions: [{on: "heartbeat_missed", do: "restart"}, {on: "tool_error_rate > 0.3", do: "downgrade_model"}, {on: "loop_detected", do: "checkpoint_restore --to last_good"}] }`. Detection: prometheus alerts + circuit breaker (Idea 3) signals + OTel error spans (Idea 7). Actions invoke control plane APIs. Learning: supervisor logs remediation outcomes → tunes thresholds. Integration: emit `supervisor.action` event to bus (Idea 16) for audit.

---

## Idea 24 — Agent Billing & Showback (Team/Project Attribution)

**What:** Rich attribution of every dollar spent to team, project, cost center, and mission — with dashboards, weekly reports, and chargeback/showback. Handles both metered (API key) and flat-rate (Claude Max etc.) credentials honestly: metered dollars roll into budgets; flat-rate rows show call/token counts with `unknown` dollars, never fake $0. Inspired by Faros "track AI coding costs across teams" and Paymaster's `billing_mode` discriminator + `cost_confidence`.

**Why:** Finance sees one OpenAI line item; engineering guesses which agent exploded. Attribution is prerequisite for budgeting and for proving ROI. Teams that can show "coder agent saved 40 hrs at $120 cost" get funding.

**How:** Tagging: every `cost_ledger` row carries `workspace_id, crew_id, agent_id, mission_id, tags {team, project, cost_center}, billing_mode, subscription_plan, rate_*_snapshot`. Ingestion: sidecar proxy (AgentLedger + Paymaster pattern) harvests rate-limit headers + prices at record time (snapshot so future pricing changes don't rewrite history). APIs: `GET /api/v1/paymaster/spend/by-crew?range=7d`, `/by-agent/{crewId}`, `/by-mission/{id}`, `/top-spenders?limit=10`, `/subscriptions?range=30d`. UI: bar chart by agent, heatmap by hour, flat-rate panel separate. Reports: weekly Cron (Idea 11) email "Team backend spent $84.32 (412k tokens, 3 agents) vs $100 budget". Export: CSV/JSON per tenant. Double-counting guard: `WHERE billing_mode='metered'` for dollar totals.

---

## Idea 25 — Agent Safety & Compliance Guardrails (PII, Policy-as-Code)

**What:** Policy-as-code guardrails evaluated on every agent input, tool output, and final answer: PII redaction/detection, prompt injection defense, tool allow/deny lists, output validators (Guardrails AI style), compliance regimes (SOC2, HIPAA, GDPR), and provenance receipts ("every agent decision needs a receipt" — TheNewStack July 2026). Fail-open vs fail-closed configurable per agent.

**Why:** TheNewStack: "Why every AI agent decision needs a receipt." 2025 AI Agent Index found transparency gaps on risk mitigation. For coding harness, guardrails prevent agent from pasting secrets into PR description, executing destructive command, or hallucinating license header.

**How:** Agent config `guardrails: { input: [{type: "pii_detect", action: "redact"}, {type: "prompt_injection", action: "block"}], output: [{type: "secret_scan", action: "block"}, {type: "policy:hipaa", action: "flag"}], tools: { deny: ["exec:rm -rf"], allow: ["exec:git*"] } }`. Runtime: middleware runs guardrail chain before LLM call and before tool exec; validators return `pass|flag|block` with explanation. Block emits `guardrail.blocked` event (Idea 16) → HITL queue (Idea 6) for review. Receipt: each decision logged with `inputs, policy_version, verdict, reason` for audit (OpenTelemetry baggage). Admin: policy repo versioned (Idea 18) and tested via eval suite (Idea 2) that includes adversarial cases. Metrics: `guardrail_block_rate` per agent.

---

## Bonus Wildcard Ideas (Short)

### 26. Agent Personality & Tone Studio
Per-agent persona editor with live preview — sliders for formality, humor, verbosity, emoji usage, and "teach via examples" few-shots. Lokma injects persona as system prompt fragment + token-efficient style adapter. Why: same coder agent with different tone fits different teams (terse for senior review, explanatory for juniors). How: persona.yaml + LoRA-style prompt compression.

### 27. Agent Simulation / Dry-Run Mode
"Plan mode" where agent emits intended tool calls without executing, rendering diff preview + cost estimate + risk score. Human approves dry-run → live replay. Why: confidence before `git push`. How: tool mocks + shadow sandbox snapshot, same checkpoint machinery as Idea 8.

### 28. Agent Forking with Speculative Execution
Launch 2-3 agent branches (different models/prompts) on same task concurrently, pick best via evaluator jury, discard rest. Why: exploits variance; cheapest way to beat 0.62→0.85 handoff problem. How: fleet (Idea 4) + eval jury (Idea 2) + branch metadata (Idea 8); cost capped by budget (Idea 3).

### 29. Agent Desktop / Persistent Session
Long-lived agent session like OpenClaw custom session (`session:custom-id`) that survives restarts with durable file context (`~/.lokma/sessions/<id>/`). Why: multi-day coding tasks (refactor epic) need continuity. How: session mounted as volume in sandbox, checkpointed, warm pool keeps it alive.

### 30. Agent-to-Agent Payments (x402) & Wallet Per Agent
Per-agent crypto/fiat wallet (USDC via x402 protocol) for pay-per-use tools/data. Parent budget allocates sub-wallet; each payment authorization is protocol-level gate, not prompt suggestion (AgentLux pattern). Why: autonomous purchasing of datasets, APIs, compute without sharing org credit card. How: `wallet: { balance: "$50", allowlist: ["tavily","github-copilot"], require_hitl_above: "$5" }`, x402 paywall before tool call.

---

## Prioritization Matrix (Suggested for Lokma)

| Priority | Ideas | Rationale |
|----------|-------|-----------|
| **P0 now** | Cost Budgets (3), Observability (7), Sandbox per Agent (13), HITL per Agent (6) | Safety + cost + debuggability; incidents without are expensive. |
| **P1 next quarter** | Eval Harness (2), Templates/Marketplace (1), Cron per Agent (11), Handoff Protocols (5), Memory Tiers (14) | Compounding value; unlock scale. |
| **P2 roadmap** | Auto-Scaling (4), Skill Sharing (9), Workflow DAG (22), Knowledge RAG (21), Billing Showback (24) | Power-user / enterprise features. |
| **P3 experimental** | Voice per Agent (10), Browser per Agent (12), Forking (28), x402 Payments (30) | Differentiation, narrower use cases. |

Vertical enablers that touch many others: Versioning (18), Replay/Time-Travel (8), Tool Budgets (17), Identity/Vault (15), Guardrails (25), Self-Healing (23), Messaging Bus (16), Regression/Canary (19).

---

## Implementation Notes — How Ideas Interlock

- **Budgets (3) ↔ Tool Budgets (17) ↔ Fleet (4) ↔ Billing (24):** shared `cost_ledger` + `budget_limits` + Prometheus. Gateway is single enforcement point.
- **Sandbox (13) ↔ Browser (12) ↔ Voice (10) ↔ Cron (11):** all declare per-agent `provider/config` and share warm pool + snapshot infra.
- **Handoff (5) ↔ HITL (6) ↔ Replay (8) ↔ Observability (7):** handoff is span; HITL is pause span; replay replays spans; all visible in trace viewer.
- **Templates (1) ↔ Skills (9) ↔ Knowledge (21) ↔ Workflows (22):** template is pre-wired skill + RAG + workflow DAG graph.
- **Eval (2) ↔ Versioning (18) ↔ Canary (19) ↔ Guardrails (25):** every version change auto-evals against safety + quality suites before canary promotion.
- **Identity (15) ↔ Secrets (20) ↔ Guardrails (25):** identity scopes vault lease; guardrail validates tool against identity allowlist.

---

## Sources & Further Reading

- Faros AI — Harness engineering: A guide to building better AI coding agents (May 22, 2026)
- Anthropic — 2026 Agentic Coding Trends Report
- Gartner via BRC — Agentic AI Orchestration And Memory Systems Market Report (2025 → 2030, 38.9% CAGR)
- Kore.ai — Agent Platform launch (Mar 2025, 100+ connectors, marketplace, graph-RAG)
- AWS re:Post — re:Invent 2025: Implementing HITL controls for multi-agent AI systems (Step Functions, MCP elicitations, LangGraph interrupts)
- AI Wiki / FutureAGI / Microsoft Agent Framework — Multi-agent orchestration & handoff patterns (supervisor, sequential, group chat, parallel; A2A protocol; TaskCompletion scoring)
- Digital Thought Disruption / Gartner / OpenTelemetry / Galileo / LangSmith — Agentic observability, telemetry pipelines, five pillars
- Augment Code (May 2026), Axme AI, aisecuritygateway.ai, AgentBudget, AgentLedger, TokenOps, AgentLux/x402 — Cost governance, per-session budgets, circuit breakers, gateway enforcement, run-level governance, on-chain identity
- Ry Walker Research — AI Agent Sandboxes Compared (June 2026, 19 platforms: E2B, Daytona, Modal, Vercel, Cloudflare, AWS AgentCore, Google Agent Sandbox)
- OpenClaw / Hermes Agent docs — Cron & heartbeat scheduling, proactive agents, `[SILENT]`, `jobs.d/`, `context_from`, no-agent mode, self-healing
- ArXiv / InfoQ / Agent Evaluation Guide — GAIA, τ-bench, SWE-bench, WebArena, AgentBench, CLASSic, SWE-bench, evaluation best practices
- TheNewStack — AI Engineering Trends in 2025: Agents, MCP and Vibe Coding; Why every AI agent decision needs a receipt (July 2026)
- Database snippets — Paymaster (`cost_ledger`, `budget_limits`), AgentC2 scheduling, Hermes cron patterns

---

## Appendix — Count Check

- Lines: ~470 (exceeds 300 requirement)
- Ideas: 25 primary + 5 wildcards = 30 total (exceeds 15 / 20 requirement)
- Each primary idea: What paragraph + Why sentence(s) + How paragraph with concrete Lokma mapping (config, CLI, table, API, integration notes)
- Web research: 30+ sources across 4 search batches synthesized above
- Coverage: requested list explicitly addressed — templates/marketplace (1), evaluation/benchmarking (2), cost budgets (3), auto-scaling (4), handoff/protocols (5), HITL per agent (6), analytics/observability (7), replay/time-travel (8), skill sharing (9), voice per agent (10), cron per agent (11), browser per agent (12), sandbox per agent (13) — plus 12 more angles.

> This is RAW — intended for product review, not polished spec. Next step: prioritize P0 slice, draft RFC per idea, estimate eng weeks, and wire into Lokma roadmap.

