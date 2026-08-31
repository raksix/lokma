# Archify Deep Research — Raw Notes for Lokma Integration

> **Source:** `https://github.com/tt-a1i/archify` — scraped 2026-08-31  
> **Cached page:** `/root/.hermes/cache/web/github.com-26de699d3e.md` (409 lines, commit snapshot)  
> **Raw README:** `https://raw.githubusercontent.com/tt-a1i/archify/main/README.md`  
> **Skill contract:** `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md` (v2.16, ~15.7 KB)  
> **Schemas:** `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md`  
> **Viewer runtime:** `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md`  
> **Delivery contract:** `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md`  
> **Authoring contract:** `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md`  
> **Authoring cookbook:** `https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md`  
> **DSH integration:** `https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md`  
> **Workflow renderer:** `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/renderers/workflow/README.md`  
> **Project page:** `https://tt-a1i.github.io/archify/` · **Scenario guide:** `https://tt-a1i.github.io/archify/guide.html` · **Proof Lab:** `https://tt-a1i.github.io/archify/gallery.html`  
> **Target:** Detailed documentation for Lokma — ideas visible in web UI and future apps. English. 600+ lines.

---

## Table of Contents

1. [What Archify Is](#1-what-archify-is)
2. [How It Works — JSON IR → Validate → Compile](#2-how-it-works--json-ir--validate--compile)
3. [Five Diagram Types](#3-five-diagram-types)
4. [Four Visual Presets + Themes + Brand Marks](#4-four-visual-presets--themes--brand-marks)
5. [Viewer Contract](#5-viewer-contract)
6. [Exports](#6-exports)
7. [Validation — Atomic Gates, Repair Receipts, Last-Good Preview, Deployment-Ownership](#7-validation--atomic-gates-repair-receipts-last-good-preview-deployment-ownership)
8. [Deltas — Before / Delta / After](#8-deltas--before--delta--after)
9. [Installation](#9-installation)
10. [How Lokma Should Integrate](#10-how-lokma-should-integrate)
11. [File Map & CLI Surface](#11-file-map--cli-surface)
12. [Key Design Decisions & Non-Goals](#12-key-design-decisions--non-goals)
13. [References & Citations](#13-references--citations)

---

## 1. What Archify Is

### One-line pitch

> **Archify turns a codebase or system description into a polished, interactive system map — directly in chat.** — [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md)

Archify is a **Node.js rendering + validation system** that agents invoke as a skill. The agent produces **typed JSON IR**; Archify **deterministically compiles** it into **self-contained HTML/SVG** with optional finite motion and crisp export. It is **not a Mermaid theme** and **not a general-purpose drawing editor** — it turns technical intent into a communication artifact [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### Identity card

| Fact | Value | Source |
|------|-------|--------|
| **Repository** | `tt-a1i/archify` | [github.com/tt-a1i/archify](https://github.com/tt-a1i/archify) |
| **Stars** | **34.9k★** · 2.2k forks · 127 watchers · 36 issues · 38 PRs | GitHub nav / cached page line 100 |
| **Commits** | **207 commits** on `main` | GitHub history header |
| **License** | MIT — free to use, modify, distribute | [LICENSE](https://raw.githubusercontent.com/tt-a1i/archify/main/LICENSE) |
| **Current stable** | **v2.16.0** (2026-08-30) | [CHANGELOG.md#2.16.0](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md) |
| **Runtime** | **Node.js 18+** (DSH integration needs `^22.19.0 \|\| >=24.0.0`) — **zero runtime dependencies** after install | [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [docs/authoring-cookbook.md](https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md) |
| **Agent surfaces** | Cursor, Claude Code, Codex CLI, OpenCode (+ Raven ZIP, Claude.ai sandbox, Project Knowledge fallback, DeepSeek Harness community plugin) | [README.md §Installation options](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md) |
| **Skill mechanism** | `npx skills add tt-a1i/archify` — installs to `~/.claude/skills/`, `~/.agents/skills/`, `~/.config/opencode/skills/`, or `.agents/skills/` per agent | [README.md §Quick start](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md) |
| **Based on** | `Cocoon-AI/architecture-diagram-generator` MIT v1.0 | [SKILL.md frontmatter](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md) |
| **Topics** | `agent-skills`, `architecture-diagram`, `diagrams-as-code`, `mermaid-alternative`, `dsh-plugin`, etc. | GitHub topics footer |
| **Landing** | `https://tt-a1i.github.io/archify/` with Gallery/Proof Lab + Scenario guide + Start page | [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md) |

### What it ships

- **Five renderers** (architecture, workflow, sequence, dataflow, lifecycle) — each a typed JSON → HTML/SVG pipeline — see [archify/schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **11 checked-in scenario proofs** in the Proof Lab (Gallery) — each a live artifact with JSON IR, 9/9 showcase checks, SHA-256, dark/light, tagged views — [gallery.html](https://tt-a1i.github.io/archify/gallery.html).
- **Zero-dependency CLI** `archify/bin/archify.mjs` with `doctor`, `demo`, `guide`, `validate`, `deliver`, `preview`, `visual-check`, `compare`, `brands`, `migrate`, `inspect`.
- **DSH community plugin** `@tt-a1i/archify-dsh@0.1.0` for DeepSeek Harness — skill-only bundle, no telemetry, no postinstall hooks — [integrations/deepseek-harness/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md).

### Why it exists (product framing)

Users: software engineers, architects, tech leads, reviewers, AI coding agents needing to **understand or explain** a codebase/system/workflow/request path/pipeline/lifecycle without adopting a hosted diagram editor [PRODUCT.md](https://raw.githubusercontent.com/tt-a1i/archify/main/PRODUCT.md). Archify's promise:

1. **Open it and present** — five types, four presets, dark/light, brand marks, finite motion.
2. **Review changes before merge** — Before/Delta/After with exact authored facts.
3. **Every interaction stays grounded** — search, reach, route, lens, stories reuse authored topology — never invents it.
4. **One file, ready to trust and share** — typed JSON IR + deterministic checks → single HTML + exports [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### Commercial note

- Sponsors: **APINEBULA** (one API for Claude/GPT/Gemini) and **EverMind / Raven** (memory infra, Raven harness supports Archify as Skill) [README.md §Sponsors](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- Project page / Scenario guide / Proof Lab are the three canonical browsable surfaces [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

---

## 2. How It Works — JSON IR → Validate → Compile

### Pipeline at a glance

```
 Agent creates typed JSON IR (from description or repo trace)
        │
        ▼
 Validate ── schema (ajv draft 2020-12, strict) + layout/geometry + route/label/legend/profile checks
        │      failures → repair receipt (validate --json)
        ▼
 Preview (optional) ── loopback-only desktop watcher on one JSON file, random 127.0.0.1 port
        │              refreshes only after latest candidate passes every gate
        │              keeps last-good artifact visible through failures
        ▼
 Deterministic compile ── typed renderer → self-contained HTML + inline SVG
        │                  no Mermaid, no Graphviz, no dagre/elk-js, no hosted service
        ▼
 Deliver ── same-directory snapshot → render → full artifact checks → atomic replace
        │    SHA-256 + byte counts for spec + artifact, optional --open
        ▼
 Iterate / Visual-check / Export / Delta
```

**Caption:** Five rows from README §How it works: Generate → Validate → Preview → Deliver → Iterate [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md) and SKILL.md Fast authoring path [archify/SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

### 2.1 Typed JSON IR

- Every renderer consumes a **JSON intermediate representation** validated against one schema in `archify/schemas/` before any layout work [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- Shared definitions live in `common.schema.json` — `id` (`^[a-zA-Z][a-zA-Z0-9_-]*$`), `point` `[x,y]`, `componentType`, `variant`, `locale`, `brandMark`, `legendMode/Entry`, `guidedViews`, `cards` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Required top-level keys** (all five types): `schema_version`, `diagram_type`, `meta` (with `title`), plus the mode's structural arrays (`components`/`nodes`/etc.) [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- `additionalProperties: false` at every level — unknown fields are **rejected**, not silently ignored [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- Generated at commit `main` version; **207 commits** of renderer/validator/viewer iteration — GitHub history.

### 2.2 Validate (schema / layout / route / label)

- **Compile step for validators:** `scripts/generate-validators.mjs` compiles the five schemas with **ajv draft 2020-12** `strict:true, allErrors:true` into `renderers/shared/generated-validators.mjs` — committed and shipped, so **runtime has no npm/network dep** [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **CLI entrypoints:**
  ```bash
  node archify/bin/archify.mjs validate <type> <file.json> --quality showcase --json
  node archify/bin/archify.mjs validate workflow input.workflow.json --layout-json   # v2 readable compiler receipt
  node archify/bin/archify.mjs inspect architecture diagram.json                    # Architecture layout inspection
  ```
  See [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md) and [docs/authoring-cookbook.md](https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md).
- **What validate checks:** schema errors (types/enums/ranges/unknown fields) with path + nearest `id`/`label` annotation; then renderer layout checks — node overlap, out-of-range placement, edge-through-node (2px clearance, lanes/phases/groups are intentional pass-through), endpoint-direction, crossings/ambiguous corridors/border runs, route rhythm (segment ≥8px, interior turn ≥16px, facing direct edge gap), label-to-node/label-to-label/label-to-route clearance (4px showcase, 2px standard warning), legend viewBox fit, `mainPath` monotonicity, group non-empty, etc. [authoring-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md) and [workflow/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/renderers/workflow/README.md).
- **No Mermaid:** Mermaid `flowchart`/`sequenceDiagram`/`stateDiagram` input is handled by **prompt engineering** — the skill reads Mermaid for topology/meaning then authors fresh Archify JSON; no mechanical Mermaid render [SKILL.md §Mermaid input](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

### 2.3 Deterministic compile to self-contained HTML/SVG

- Each renderer (`renderers/<type>/render-*.mjs`) produces **one HTML file** with **inline SVG**, embedded CSS/JS, deterministic IDs, dark/light variables, and zero external fetches at view time [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Automatic Port Spread** — deterministic, symmetric 16px corner gutter — spreads shared automatic endpoints instead of piling arrows on one midpoint; skips single relationships and explicit `via`/`channelX`/`channelY`/`labelAt`/non-`auto` routes; near-parallel ports use an outside bridge to avoid sub-8px segments / sub-16px turns [SKILL.md §Authoring invariants](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **No hosted service, no storage surface, no telemetry.** The update check (if enabled) is a single GET to a fixed stable manifest, ~72h ±20% cadence, no version/agent/project data sent [README.md §Quick start](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 2.4 Preview (optional desktop loop)

- `node archify/bin/archify.mjs preview <in.json> <out.html> --quality showcase` — binds one random **127.0.0.1** port, opens one desktop status shell, combines content-digest polling + directory watching, snapshots exact bytes, runs the atomic deliver pipeline into a private same-directory staging area, rereads the named source digest before rename — only the latest passing SHA-256 may replace output [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).
- Invalid/half-written/deleted/superseded input leaves last verified artifact visible and byte-stable; identical bytes do not rebuild/reload; external hosts and write requests rejected [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).

### 2.5 Deliver (atomic)

- `node archify/bin/archify.mjs deliver <type> <in.json> <out.html> --quality showcase --json [--open]` — reads spec once, writes exact bytes to private same-directory candidate snapshot, renders, runs **all 9 artifact checks**, atomically replaces target only after every gate passes; receipt includes **SHA-256 + byte counts** for both `specification` and `artifact` [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).
- `--open` is opt-in post-commit OS opener (5s bound); opener failure does not invalidate delivery; absolute fallback path goes to stderr [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

### 2.6 Visual-check (evidence, not verdict)

- `node archify/bin/archify.mjs visual-check <artifact.html> --json` — Chrome/Chromium via DevTools pipe; measures light-theme containment at **1440×900, 1600×1000, 1920×1080, 2048×1320**, captures light/dark screenshots at endpoint sizes, writes four PNG sidecars + relative-path HTML contact sheet + JSON receipt beside artifact; receipt always reports `visualReview: "pending"` — screenshots are evidence, never an automatic polish claim; exit 0 pass, 1 overflow/capture failure, 2 Chrome unavailable → `skipped` [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).

---

## 3. Five Diagram Types

### 3.1 At a glance (from README)

| Type | Best for | Include in your prompt | `diagram_type` | Example IR |
|------|----------|------------------------|----------------|------------|
| **Architecture** | Components, services, storage, boundaries | Scope, core components, primary path | `architecture` | [web-app.architecture.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/web-app.architecture.json) |
| **Workflow** | CI/CD, approvals, tool calls, runbooks | Participants, order, branches, exceptions | `workflow` | [agent-tool-call.workflow.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/agent-tool-call.workflow.json) |
| **Sequence** | API calls, cache fallback, auth, async traces | Callers, callees, returns, timing | `sequence` | [cache-miss-request.sequence.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/cache-miss-request.sequence.json) |
| **Data Flow** | Pipelines, lineage, PII, consumers | Sources, transforms, stores, boundaries | `dataflow` | [product-analytics.dataflow.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/product-analytics.dataflow.json) |
| **Lifecycle** | States, retries, waits, terminal outcomes | States, events, retry and cancellation paths | `lifecycle` | [agent-run.lifecycle.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/agent-run.lifecycle.json) |

Source: [README.md §Choose the right diagram](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md) and [SKILL.md §Type router](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

CLI helper: `node archify/bin/archify.mjs guide "Show an API request with Redis cache miss" --json` — zero-dependency recommendation from the 11-recipe scenario guide [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md), [guide.html](https://tt-a1i.github.io/archify/guide.html).

### 3.2 Architecture — components, trust boundaries, deployment

- **Structural arrays:** `components[]`, `boundaries[]`, `connections[]`, `cards[]` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Component types:** `frontend`, `backend`, `database`, `cloud`, `security`, `messagebus`, `external` (+ variants `default`/`emphasis`/`security`/`dashed`) [SKILL.md §Authoring invariants](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Boundaries:** `region`, `security-group` (and others per example) with `wraps: [id,…]`, optional `pad`; they are **intentional pass-through geometry** — edges may cross a boundary border but not an unrelated opaque node [authoring-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md).
- **Prompt example (from README quick start):**
  ```
  Analyze this repository, then use archify to create a high-level runtime architecture diagram.
  Show 8–12 core components, one primary path, external dependencies, and trust boundaries.
  Put supporting detail in cards instead of adding more edges.
  ```
  [README.md §2. Start from a description](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md)
- **Refinement prompts:** `add Redis`, `move auth to the left`, `highlight the rollback path` — Archify keeps typed source for targeted iteration [README.md §3. Refine in chat](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Example:** `web-app.architecture.json` — 10 nodes (Users, Auth Provider, CloudFront, LB, API Server, Redis, Postgres, S3, SQS, Worker), 2 boundaries (AWS region + security group), 9 connections, 3 cards (Edge/Application/Security), 3 views (request-path / identity-and-cache / async-work), `quality_profile: showcase` — [web-app.architecture.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/web-app.architecture.json).
- **Advanced:** optional `meta.engineering_profile: "deployment-ownership"` — fail-closed deployment review (see §7) and `meta.repository` + `sources[]` for revision-pinned evidence — [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).

### 3.3 Workflow — CI/CD, approvals, tool calls, runbooks

- **Structural arrays:** `lanes[]`, `phases[]`, `groups[]`, `mainPath[]`, `nodes[]`, `edges[]` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Schema versions:** `schema_version: 1` (fixed legacy — viewBox 720 wide, lane frame x40 w640 h104 gap20, column centers at 88/220/300/430/500/625) vs **schema_version: 2** (`readable-v2` — columns 0..5 are logical ranks, 120px baseline, measured intrinsic viewBox, causal `workflow/column-capacity` diagnostic) [renderers/workflow/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/renderers/workflow/README.md).
- **Prompt examples:**
  ```
  Use archify to draw a CI/CD workflow: lint → build → canary → approval → deploy → rollback on health failure.
  Draw an incident response runbook: detect → incident command → mitigate → communicate → escalate → rollback → recover.
  Show an agent tool-call loop: user → planner → router → approval gate → tool → external → trace log.
  ```
  These map to scenarios in the Proof Lab: *Release Delivery Workflow* (10 nodes, 3 views), *Incident Response Runbook* (11 nodes, signal-flow) — [gallery.html](https://tt-a1i.github.io/archify/gallery.html).
- **Example:** `agent-tool-call.workflow.json` (schema v2) — 4 lanes (User Interface / Agent Runtime / Policy & Recovery exception / Tool Execution), 3 phases (Intake / Plan+route / Execute+report), 4 groups, 12 nodes, 11 edges, `route: "outside-right"` / `"bottom-channel"` presets, `semanticChecks` optional — [agent-tool-call.workflow.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/agent-tool-call.workflow.json).
- **CLI:** `node archify/bin/archify.mjs guide "Show CI/CD checks, approval, deploy, and rollback" --json` — [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 3.4 Sequence — API calls, cache fallback, auth, async traces

- **Structural arrays:** `participants[]`, `segments[]`, `messages[]`, `activations[]` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Key fields:** `participants[].type` (same vocabulary minus database distinction in ordering), `messages[].y` (vertical order), `messages[].variant` (`default`/`emphasis`/`security`/`dashed`/`return`), `segments[].label` (time bands: Request / Fallback / Response+trace), `activations[]` (ownership duration bars) [cache-miss-request.sequence.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/cache-miss-request.sequence.json).
- **Column fit:** `meta.column_fit: "fixed"` (default — 108px gap, 86px boxes, stable coordinates) vs `"spread"` (derives gap/width from viewBox for wide canvases) [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Prompt examples:**
  ```
  Use archify to draw a sequence: Browser → API → Redis (miss) → PostgreSQL → Redis set → Trace emit → Browser render.
  Show auth flow: user → web app → API (verify JWT) → Auth provider → cache → database, with returns and timing.
  Draw async job: submit → queue → worker → retry → webhook + poll fallback.
  ```
  Proof Lab scenarios: *Cache Miss Request* (7 participants, 12 messages, classic+trace), *Async Job Roundtrip* (7 participants, 14 messages, signal-flow) — [gallery.html](https://tt-a1i.github.io/archify/gallery.html).
- **Example:** `cache-miss-request.sequence.json` — 7 participants (User / Web App / API / Auth / Redis / Postgres / Trace), 12 messages at y 185–662, 3 segments, 6 activations — [cache-miss-request.sequence.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/cache-miss-request.sequence.json).

### 3.5 Data Flow — pipelines, lineage, PII, consumers

- **Structural arrays:** `stages[]`, `nodes[]`, `flows[]` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Key fields:** `nodes[].stage` (0..N) + `row` (parallel streams), `flows[].classification` (e.g. `user events`, `PII touch`, `encrypted PII`, `non-PII`), `variant` carries `security` for PII paths — [product-analytics.dataflow.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/product-analytics.dataflow.json).
- **Prompt examples:**
  ```
  Use archify to map a product analytics pipeline: Web+Mobile → Edge API → Consent Gate → Event Stream → Warehouse → Dashboards + Feature Store → ML Model; isolate PII vault.
  Map Kafka topics, consumer groups, replay, and DLQ.
  Show order event-stream topology: producers → partitioned topics → consumer groups → idempotent state → dead letters → operator ownership → controlled replay.
  ```
  Proof Lab: *Product Analytics* (10 nodes, 5 stages, classic+trace), *Order Event-stream Topology* (12 nodes, signal-flow) — [gallery.html](https://tt-a1i.github.io/archify/gallery.html).
- **Example:** `product-analytics.dataflow.json` — 5 stages (Sources/Ingest/Process/Store/Consume), 10 nodes (Web/Mobile/Edge/Consent/Stream/PII Vault/Warehouse/Feature Store/Dashboards/ML Model), 10 flows with `via`/`labelAt`/classifications — [product-analytics.dataflow.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/product-analytics.dataflow.json).

### 3.6 Lifecycle — states, retries, waits, terminal outcomes

- **Structural arrays:** `lanes[]`, `states[]`, `transitions[]` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **State types:** `start`, `active`, `waiting`, `decision`, `success`, `failure`, `neutral`, `external` (lifecycle-specific) [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Placement:** main phases use columns `0..4`; event and terminal bands use columns `0..2` where **event/terminal column N aligns to same x as main column N+2** [SKILL.md §Lifecycle note](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md). A recoverable state uses `type: "failure"` + a real transition back to the active state — a card saying "retry" is not topology [authoring-contract.md §Lifecycle](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md).
- **Prompt examples:**
  ```
  Use archify to draw the agent run lifecycle: Queued → Planning → Executing → Reviewing → Completed, with Needs Approval / Blocked waits and Failed → retry, Cancelled/Expired terminals.
  Draw deployment release lifecycle: build → verification → approval → promotion → health pause → rollback → explicit terminal outcomes.
  ```
  Proof Lab: *Agent Run Lifecycle* (10 states, classic+trace), *Deployment Release Lifecycle* (11 states, signal-flow) — [gallery.html](https://tt-a1i.github.io/archify/gallery.html).
- **Example:** `agent-run.lifecycle.json` — 4 lanes (Lifecycle phases / Interruptions / Recovery loop / Terminal exits), 10 states (Queued/Planning/Executing/Reviewing/Completed + Needs Approval/Blocked/Failed/Cancelled/Expired), 6 transitions with `via` routes — [agent-run.lifecycle.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/agent-run.lifecycle.json).

---

## 4. Four Visual Presets + Themes + Brand Marks

### 4.1 Presets

| `meta.visual_preset` | Look | When to use | Proof example |
|----------------------|------|-------------|---------------|
| **`classic`** | **Stable default** — neutral panel, precise 0.2–1rem corners, flat tonal surfaces, mono labels. Opens in classic for both light and dark color modes. | Default for docs/RFCs/PRs; any diagram that omits the field. | `web-app.architecture.json` (classic) |
| **`signal-flow`** | **Luminous, motion-forward** — dark canvas lift `0 28px 80px`, glow on active focus `0 0 7px`, vivid semantic strokes. | Presentations, demos, forward-path storytelling. | `agent-tool-call.workflow.json` (`signal-flow` + `trace`) |
| **`blueprint`** | **Engineering review** — high contrast, squared materials (0.35rem), precise grids, boundary notation, filter-free. Keeps the same vocabulary as dark/light but with drafting identity. | Deployment-ownership reviews, infra audits. | `production-deployment.architecture.json` (`blueprint` + `trace`) |
| **`editorial`** | **Warm publication** — paper/charcoal surfaces, ruled structure, vermilion accent, publication typography. | Design reviews, launch docs, warm narrative. | Mentioned in [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md) + [schemas/README.md `visual_preset` enum](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md) |

- **Invariants:** presets change **only CSS variables + viewer styling** — never semantic IDs, geometry, topology, authored data, validation, storage, URLs, dependencies, or mobile scope [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md), [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- **Default rule:** **Omit `meta.visual_preset` by default** so every diagram opens in `classic` regardless of resolved color mode; set a preset only when the user explicitly requests that visual style [SKILL.md §Authoring invariants](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Switching:** **S** cycles presets in the viewer; **T** toggles theme; preset and color mode are **independent** — Light/Dark must preserve current preset [README.md §Explore and share the output](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 4.2 Dark / Light themes

- One click to switch; **same vocabulary** preserved across themes (category identity and information priority identical per the Theme Parity Rule) [DESIGN.md](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).
- Toolbox for comparison: `docs/assets/archify-dark.png` / `archify-light.png` (README Preview table) — [README.md §Preview](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- Viewport rule: one responsive artifact for laptops/external displays — the viewer may adapt only the **outer reading width** from live viewport height; it must preserve authored **SVG/viewBox**, proportions, semantic geometry, and normal document flow; before handoff open at **1440×900, 1600×1000, 1920×1080** and additionally **2048×1320** for large-desktop intents, requiring `scrollWidth <= innerWidth` and `scrollHeight <= innerHeight` at every size [SKILL.md §Authoring invariants](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- Deep links support `?theme=dark|light` e.g. `.../cache-miss.sequence.html?theme=dark&present=1` [README.md §Preview](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 4.3 Animation — trace

- `meta.animation: "trace"` is **opt-in**; omit or set `"none"` for static [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Finite, reader-controlled Live/Still trace** — still, `prefers-reduced-motion`, page hiding, print, and **canonical exports preserve complete static meaning** [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- **Recordable WebM:** trace-enabled artifacts can **record a 6-second WebM directly in the browser** without Puppeteer/ffmpeg (Signal Flow presentation) [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- `meta.locale=en|zh-CN` localizes page title, Legend, states/errors, a11y, HTML/SVG lang — never authored content; unsupported language → omit locale, disclose English fallback [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

### 4.4 Brand marks

- All five diagram types accept an optional explicit `brand` on primary nodes — either a **canonical built-in ID** from `node archify/bin/archify.mjs brands --json` (107 provenance-backed vector marks) or a **digest-pinned** `{ "url", "sha256" }` from `node archify/bin/archify.mjs brands capture "https://…" --json` [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md), [CHANGELOG.md#2.15.0](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md).
- Rendered as one **compact identity badge in the upper-right of the node** — built-in vectors and captured digests sit on a neutral plate; their color stays inside that plate and **never recolors** the semantic node, edge, legend, focus, or evidence vocabulary; the semantic sigil remains visible; a Verified Source Beacon shifts left when both present [DESIGN.md §Brand Mark](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).
- **Fail-closed:** unsafe, unavailable, changed, or unsupported content → brand diagnostic; render/validate **never perform an unpinned capture** — only the explicit capture command fetches bytes (bounded PNG/JPEG/WebP/ICO, SHA-256 verified, remote SVG rejected, diagram-wide timeout) [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- Never infer a brand from a vague role like "database" and never let a badge replace semantic `type`, label, or relationship facts [SKILL.md §Authoring invariants](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

---

## 5. Viewer Contract

> Complete contract lives in [archify/SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md) and [archify/references/viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md). Summary below is faithful but condensed.

### 5.1 Primitives — nodes / edges / trust boundaries

- **Nodes** are typed semantic elements: e.g. Architecture `components[]` with `id`, `type`, `label`, `sublabel`, `pos`, `size`, `tag`, optional `brand`, optional `sources[]`; Workflow `nodes[]` with `lane`/`col`; Sequence `participants[]`; Dataflow `nodes[]` with `stage`/`row`; Lifecycle `states[]` with `lane`/`col`/`type` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Edges** are directed relationships: `connections[]`/`edges[]`/`messages[]`/`flows[]`/`transitions[]` — each may carry `id` (stable for `#relation=`), `label`, `variant`, `fromSide`/`toSide`, `via`, `channelX/Y`, `labelAt`, `route` preset (`drop`, `outside-right`, `return-left`, `bottom-channel`, `up-channel`, `straight`, `auto`, `orthogonal-h/v`) [authoring-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md).
- **Trust boundaries** are the `boundaries[]` array in Architecture (region / security-group / custom) — they **wrap** node IDs and are intentionally pass-through for edges [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- Every generated HTML emits **deterministic node IDs** and relationship endpoints — `#focus=`, `#relation=`, `#route=`, `#lens=`, `#view=` all reference authored identity — no geometry-inferred topology [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).

### 5.2 Controls cheat-sheet (from README Explore table)

| Action | Control | Notes |
|--------|---------|-------|
| Open the factual Diagram Guide | **?** | Lists current actions + shortcuts |
| Find and focus a semantic node | **/** | Node Finder — searches labels, sublabels, stable IDs; reports semantic type + unique relationship count; full keyboard nav; delegates to `#focus=` |
| Trace upstream / downstream authored reach | **Focus node → Upstream / Downstream** | Count-bearing, violet (upstream) / green (downstream); canvas keeps focused origin + complete reachable subgraph strong |
| Probe a directed route and inspect its journey | **R** or **`PATH`** | Route Probe — exactly two endpoints over authored directed relationships; never infers from geometry; Journey/position UI |
| Compare one or two semantic roles | **L** or **`LENS`** | Semantic Lens — summarizes selected node/relationship kinds without changing geometry |
| Open the live overview radar | **M** or **`MAP`** | Semantic Radar mirrors visible viewport + authored graph |
| Play a guided story / change chapter | **P** / **`[]`** | 3.2s per chapter, stops after final authored view, pauses on hidden/exploration; `P` shortcut |
| Enter Presentation Stage | **F** | Viewport-filling live stage; preserves theme/focus/story/pan-zoom/export; hides cards; `?present=1` deep link; Esc unwinds view/focus before exiting |
| Choose visual style (S cycles) / toggle theme / open Export | **S** / **T** / **E** | S cycles classic/signal-flow/blueprint/editorial; picker has radio state, Arrow/Home/End, Esc/Tab/outside-click, focus return |
| Zoom or reset | **+ / - / 0** | 100–300% pan/zoom; Reading Depth: READ at 100%, FULL at 175%, MAP below 100% — focus/story/route/lens reveal facts at any scale |
| Search focus (/) details | **Esc / Clear** | Clear focus, close Passport |

Sources: [README.md §Explore and share the output](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md), [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md), [SKILL.md §Optional viewer capabilities](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

### 5.3 Focus — search (`/`)

- **Node Finder** (`/`): searches labels, sublabels, stable IDs; reports semantic type + unique relationship count; keyboard nav; releases guided playback; resets and reveals chosen node; delegates to shareable `#focus=` without touching SVG geometry [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- **Semantic Passport** opens on focus: stable ID, authored metadata, relationships, optional revision-pinned sources, copyable deep link, explicit close, closes on outside activation and Escape, never enters canonical export [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- **Direct Relationship Pin** — a unique compiled relationship is operable while preserving authored line + stable identity; fails closed on conflicting source/target/label/ID metadata [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).

### 5.4 Upstream / Downstream reach

- Semantic Passport offers two native, **count-bearing** actions: **`Upstream`** follows authored **incoming** relationships, **`Downstream`** follows authored **outgoing** relationships; canvas keeps focused origin + complete reachable subgraph strong while unrelated topology recedes [DESIGN.md §Authored Reachability](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).
- Colors: **Repository Violet** for upstream, **Proof Green** for downstream; Blueprint removes glow [DESIGN.md](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).
- Receipt says `nodes`, `links`, `max hops`; **never says blast radius or breakage** — call it **authored reachability**, not impact [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- Hashed deep links: `#focus=<id>&reach=upstream|downstream` [README.md §Explore](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 5.5 Route probe (`R`)

- **Route Probe** (`R` or `PATH`): resolves **exactly two endpoints** over **authored directed relationships** — never infers a route from geometry; inspects Journey position + uses static `data-share-route-*` decoration for the Route Share Card clone [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- Proof Lab example: cache-miss sequence Web App → DB route `#route=web~db` [README.md §See Archify in action](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 5.6 Lens (`L`)

- **Semantic Lens** (`L` or `LENS`): compares one or two **semantic roles** (kinds); e.g. production architecture comparing backend vs database roles `#lens=backend~database` [README.md §See Archify in action](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- Also **Semantic Legend** bridge: when `meta.legend` contains exact compiled node facts (e.g. dataflow `database` when a real `nodes[].type: "database"` exists), the legend becomes interactive [schemas/README.md §Legend presentation contract](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).

### 5.7 Stories (`P` / `[]`)

- `meta.views` may define **at most five curated chapters** using stable node IDs — each view: unique `id`, reader-facing `label`, non-empty `focus` (existing semantic IDs), optional `note` [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Named Chapter Rail**, Chapter Delta Preview, Story Beat Navigator, Follow Camera, Director Strip, Horizon, Shareable Story Moment links all derive from that one authored array — none owns parallel topology [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- Transitions classify only the exact relationship between adjacent stops: `forward`, `reverse`, `multiple`, or `grouped/no direct link` — never infer transitive edge/verb/causality [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- **Playback:** reader-started, bounded, stale-safe, motion-governed; `P` toggles Play/Pause with progress rail, **advances every 3.2s**, stops after final authored view, pauses on hidden/exploration; `[]` changes chapter [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).
- Deep link: `#view=<view-id>` plus `?present=1&play=1` for auto-play in Presentation Stage [README.md §See Archify in action](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 5.8 Hash links + deep-link state

| Fragment | Restores | Example from README |
|----------|----------|---------------------|
| `#focus=<id>` | Focus on semantic node, open Passport | `mco-runtime.architecture.html#focus=router` |
| `#focus=<id>&reach=upstream\|downstream` | Focus + reach highlight | `mco-runtime.architecture.html#focus=router&reach=downstream` |
| `#relation=<id>` | Direct relationship pin (stable authored ID) | (spec in [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md)) |
| `#route=<source>~<target>` | Probe directed path | `agent-tool-call.workflow.html#route=web~db` |
| `#lens=<kind>~<kind>` | Compare roles | `production-deployment.architecture.html#lens=backend~database` |
| `#view=<view-id>` | Guided chapter | `mco-runtime.architecture.html#view=dispatch-path` (+`?theme=dark&present=1&play=1`) |
| `?theme=dark\|light` | Theme selection | `web-app.html?theme=dark` |
| `?present=1` | Presentation Stage | `gallery/artifacts/*.html?theme=dark&present=1` |

Source: [README.md §Explore and share the output](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md), [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).

- **Reader-driven motion is finite**, respects `prefers-reduced-motion`, and **never enters canonical exports** [README.md §Explore](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Intent Trace** previews a fine-pointer/keyboard target before committed focus; **Reading Depth** gates detail by zoom level [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).

---

## 6. Exports

### 6.1 Canonical exports (full-diagram, free of viewer state)

From the Export menu (**E**) — all exports are **full-diagram** and **free of temporary viewer state** (Guide, Lens, finder, focus, route, story, camera, radar, presentation, motion ownership, temporary overlays must be removed) [viewer-runtime.md §Canonical exports](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md):

| Format | How | Notes |
|--------|-----|-------|
| **PNG** | Copy to clipboard (when supported) or download | Copy Share Card reuses same canonical PNG when clipboard image writes supported |
| **JPEG / WebP** | Download | Same canonical full diagram |
| **SVG** | Download **dual-theme SVG** | Inline, self-contained, theme-aware |
| **WebM** | Record **6-second WebM** in browser | Trace-enabled artifacts only; browser-native, no Puppeteer/ffmpeg; respects Still/reduced-motion: export stays clean [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md) |

- Source: [README.md §Preview](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md) + [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).

### 6.2 Share Cards — 1200×630

- **Share Card** — canonical **1200×630 PNG** for README, release, social, launch previews; uses current theme + visual preset, contains **complete canonical diagram without cropping**, never claims validation; **Copy Share Card** reuses same PNG [viewer-runtime.md §Share Card](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md), [README.md §Preview](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- Proof: `docs/assets/archify-share-card.png` vs dark/light hero `docs/assets/archify-readme-hero.png` — [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 6.3 Route Share Cards

- After a **real directed Route Probe resolves**, reader may use **Export → Route Share Card**. It consumes the **exact ordered node + stable-edge snapshot** already resolved by the viewer, then applies only static `data-share-route-*` decoration to a **finite canonical clone** before reusing the existing 1200×630 Share Card canvas (`format=share-card`, `variant=route`). The **complete diagram remains as dimmed context**; Journey position, animation overlays, camera, Focus, Lens, Story never enter the asset. Download-only; fails closed for clear/unreachable/stale/duplicate/conflicting routes; never becomes the canonical artifact [viewer-runtime.md §Route Share Card](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md), [DESIGN.md §Route Share Card](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).
- Example image: `docs/assets/archify-route-share-card.png` — Users → API Server path with full architecture retained as context [README.md §Preview](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 6.4 Reach Share Cards

- After a **non-empty authored reachability query**, reader may use **Export → Reach Share Card**. It consumes the already resolved **upstream/downstream node+edge set without rerunning traversal** (`format=share-card`, `variant=reach`, `canonical=false`). Isolated clone may use only static `data-share-reach-*` decoration; complete topology remains as dimmed context; header says `Authored upstream/downstream` with direction, origin, node count, link count, max hops; retains **Repository Violet** (upstream) / **Proof Green** (downstream); Blueprint stays filter-free. Download-only; call it **authored reachability — not impact, blast radius, breakage, or runtime causality** [viewer-runtime.md §Reach Share Card](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md), [DESIGN.md §Reach Share Card](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).
- Example: `docs/assets/mco-runtime-reach-share-card.png` — authored downstream from Command Router — [README.md §Preview](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- Both Route and Reach cards are **explicit non-canonical reading variants**, cleared by the next ordinary export, and write a dedicated receipt proof [DESIGN.md](https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md).

---

## 7. Validation — Atomic Gates, Repair Receipts, Last-Good Preview, Deployment-Ownership

### 7.1 Atomic gates (9 showcase vs 4 basic)

- **Basic validation** reports only **4 artifact checks** — never showcase acceptance; **showcase pass must report all 9 artifact checks with 0 composition errors and 0 warnings** [SKILL.md §Fast authoring path](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- Showcases gates include: schema, layout, HTML/SVG structure (`scripts/check-render-output.mjs` — non-finite SVG, two-point diagonal arrows, legend-crossing arrows), route, label-to-route clearance (4px showcase / 2px standard warning), plus showcase-only `composition/proper-crossing` (unrelated proper X), collinear lane corridors ≥8px, route rhythm (segment <8px / interior <16px), etc. [workflow/README.md §Design Rules](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/renderers/workflow/README.md), [authoring-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md).
- **Commands:**
  ```bash
  node archify/bin/archify.mjs validate <type> <file.json> --quality showcase --json
  node archify/bin/archify.mjs deliver <type> <file.json> <out.html> --quality showcase --json
  ```
  [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md)

### 7.2 Repair receipts — validate --json rule codes

- On **failure**, `validate --json` and `deliver --json` emit **one JSON object** with `schemaVersion: 1` and stable **`diagnostics[]`: rule code, severity, exact `subject`, measured `evidence`, and only **supported repair controls** (`supportedFixes`) instead of a Node stack or unstructured retry guess [SKILL.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Rule-code taxonomy (stable, parseable):** e.g.
  - `workflow/column-capacity` — adjacent-column capacity failure (v1) → proposes verified migration-to-v2 repair
  - `workflow/explicit-pin-conflict` — infeasible `via`/`labelAt`/`channelX` pin in v2 → never silently moved
  - `composition/proper-crossing` — unrelated X crossings in showcase
  - `composition/collinear-overlap` — ≥8px collinear lane corridor overlap
  - `composition/segment-too-short` / `interior-turn-too-short`
  - `layout/edge-through-node`, `layout/endpoint-direction`, `label/clearance`, `label/overlap`, etc.
  - `brand/*` — digest drift, unsafe destination, malformed content, timeout
  - `deployment-ownership/*` — missing owners, region placement, private DB scope, named crossings
  - `delta/*` — zero shared component IDs, missing relationship IDs, ambiguous boundary keys, repo mismatches
  Sources: [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [workflow/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/renderers/workflow/README.md), [CHANGELOG.md](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md).
- **How to use:** *Change only the diagnosed `subject`, verify `evidence`, choose from `supportedFixes`, and rerun. Continue focused correction while the objective error count reaches a new minimum. If two consecutive rounds do not improve that best count, stop and report the unresolved diagnostics truthfully.* — [SKILL.md §Fast authoring path](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Bounded correction:** within the Skill's **two correction rounds**; visual review remains separate [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).
- Renderer child processes emit a **private structured boundary** so the CLI never copies Node stacks into machine output; human mode formats same facts; unknown internal failures remain explicitly **unclassified with no invented fix** [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).

### 7.3 Last-good preview loop

- **Last-good live preview** — optional desktop loop watches one JSON file, refreshes **only after the latest candidate passes every gate**, and **keeps the previous verified diagram visible** when a save is incomplete or invalid [SKILL.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- Implementation details: content-digest polling + directory watching to handle editor rename bursts; snapshots exact bytes; private same-directory staging; rereads source digest before rename — only latest passing SHA-256 may replace output; identical sources do not rebuild; identical artifacts do not reload; future-path checks reject input/output aliases; external hosts + write requests rejected; shutdown gives active delivery a bounded graceful drain [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md), [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- Command: `node archify/bin/archify.mjs preview workflow input.json /tmp/workflow.html --quality showcase` — loopback-only, random 127.0.0.1 port, stops with Ctrl-C, adds no generated-HTML runtime, use `--no-open` for tests — [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

### 7.4 Deployment-ownership profile — fail-closed

- **When to enable:** `meta.engineering_profile: "deployment-ownership"` — only when the user **explicitly asks** for a production deployment topology, ownership handoff, or fail-closed deployment review and source facts are known; region/cluster/boundary wording **does not** by itself enable it; **once enabled, must not remove the profile merely to pass validation** — repair the facts or report diagnostics — [authoring-contract.md §Engineering profile default](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md), [SKILL.md §Authoring invariants](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- **Fail-closed rules** (zero-dependency loader checks before rendering, structured diagnostics + validate/deliver receipts expose exact result):
  1. Every **non-external component must name an owner** in `tag` and **belong to exactly one `region`**.
  2. Document must contain **both `region` and `security-group` boundaries**; every `database` must be **inside a `security-group`**; each security group must contain **members from one shared region**.
  3. Every **connection whose region or security-group membership changes must name the real crossing mechanism** in `label` (e.g. `mTLS`, `VPC route`, `cross-region WAL`, `HTTPS`).
  4. Validates **only authored IR** — does not discover infrastructure, infer owners, or prove live match; if a fact is unknown, leave profile unset [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md), [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- **Proof:** Production Deployment proof exercises the contract and publishes one compact Gallery receipt (`production-deployment.architecture.json` with `blueprint` + `trace`, 12 nodes, 12 edges, pass `DEPLOYMENT OWNERSHIP`) — [gallery.html](https://tt-a1i.github.io/archify/gallery.html), [production-deployment.architecture.json](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/production-deployment.architecture.json).
- **Gallery badge:** `Engineering profile DEPLOYMENT OWNERSHIP · PASS` with 9/9 artifact + showcase composition pass — [gallery.html](https://tt-a1i.github.io/archify/gallery.html).

---

## 8. Deltas — Before / Delta / After

> For design or PR review, Architecture Delta compares **validated Before / Delta / After snapshots** with a machine receipt. Select an authored change or play one finite, viewer-only Review; it infers **no impact, risk, or merge safety**. [README.md §Choose the right diagram](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md)

### 8.1 CLI

```bash
node archify/bin/archify.mjs compare architecture base.json head.json architecture-delta.html --json
# also:
node archify/bin/archify.mjs compare architecture base.json head.json architecture-delta.html --quality showcase --json
```
- Validates **both snapshots independently**, pairs components/relationships **only by authored stable IDs**, classifies semantic/evidence/scope/topology/geometry/provenance/presentation changes separately, emits **deterministic Before / Delta / After HTML plus a complete machine receipt (sidecar)** [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- See also [docs/authoring-cookbook.md §5](https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md) and [CHANGELOG.md#2.13.0](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md).

### 8.2 Visual proof — Before / Delta / After with five fact types

| Fact | Symbol | Line pattern | Geometry behavior |
|------|--------|--------------|-------------------|
| **added** | **+** | solid + new color | New component at head position; new relationship at head route |
| **removed** | **−** | dashed/dimmed | Retains **baseline geometry** (where it was) |
| **changed** | **~** | — | Semantic/evidence/scope change on same ID (e.g. label, tag, sources) |
| **moved** | **↔** | phantom | Moved node keeps a **`MOVE FROM` phantom** at base position |
| **rerouted** | **↔** (edge) | old + new | Endpoint changes show **old and new routes**; line patterns + `+ / ~ / − / ↔` keep meaning independent of color/motion |

- Formatting, object-key, entity-order, `wraps`, `sources` set changes **preserve the semantic hash and artifact bytes**; failures preserve previous artifact [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- Proof image: `docs/assets/architecture-delta-proof.jpg` — shows added/removed/changed/moved authored facts; live example `examples/checkout-platform-delta.html` — [README.md §Architecture Delta](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 8.3 Fail-closed comparator

- **Comparator fails closed** on: repository mismatches, **zero shared component IDs**, missing relationship IDs, ambiguous boundary keys [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md), [CHANGELOG.md#2.13.0](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md).
- Proof says `AUTHORED SNAPSHOTS` or, after both repository-evidence gates pass, `REVISION-PINNED INPUTS`; **never claims risk, blast radius, safety, mergeability, or verified PR impact** [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- **No** sixth diagram type, GitHub API, Git ref parser, LLM, Graphviz, hosted service, dependency, telemetry, or mobile surface added.

### 8.4 Exact-ID Review Navigator

- Every validated Architecture Delta proof now keeps a compact **Overview / Previous / Review / Next strip** above the unchanged three-state canvas and turns its deterministic authored-change list into **native exact-ID controls**. Selecting a component/relationship/boundary highlights only matching `data-node-id`/`data-edge-id`/derived boundary identity; one deliberate **Review activation advances through same stable order once at 1400ms per change**, never loops, yields to manual navigation/view changes/page hiding/print/dynamic reduced motion [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- Generation-time and runtime state/classification checks require one unambiguous primary identity with receipt's exact state/classification — otherwise navigator **fails closed while static Before/Delta/After proof remains usable**; roving keyboard nav, Overview/Escape cleanup, dark/light + all three presets share same bounded contract [ROADMAP.md](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).

---

## 9. Installation

### 9.1 Canonical — npx skills add

```bash
npx skills add tt-a1i/archify -g                          # global, interactive (auto-detects agent)
npx -y skills add tt-a1i/archify --skill archify --agent cursor --global --copy --yes  # explicit non-interactive Cursor
npx skills use tt-a1i/archify@archify --agent codex       # try without installing (ephemeral)
```
Sources: [README.md §1. Install](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md), [SKILL.md §Setup](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

- **Agent switcher covers:** `cursor`, `codex`, `claude-code`, `opencode`. Docs/Start page at `https://tt-a1i.github.io/archify/start.html?agent=cursor&type=architecture` emits exact global vs project-local commands per agent [README.md §Installation options](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Install locations:**
  | Surface | Path | Capability |
  |---------|------|------------|
  | Claude Code | `~/.claude/skills/` or `.claude/skills/` | Full renderer + validation |
  | Codex CLI | `~/.agents/skills/` or `.agents/skills/` | Full renderer + validation |
  | opencode | `~/.config/opencode/skills/`, `.opencode/skills/`, or `.agents/skills/` | Full renderer + validation |
  | Raven | `~/.raven/workspace/skills/archify` (extract `archify.zip` there) | Full renderer + validation |
  | Claude.ai sandbox | Upload `archify.zip` under Settings → Capabilities → Skills | Depends on Node.js in sandbox |
  | Project Knowledge | Upload `archify.zip` to project | Prompt-driven fallback |
  [README.md §Installation options](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md)

- **Verify:**
  ```bash
  cd archify && node bin/archify.mjs doctor
  node bin/archify.mjs demo /tmp/archify-demo
  node bin/archify.mjs guide "Show CI/CD checks, approval, deploy, and rollback" --json
  ```
  [SKILL.md §Setup](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md), [docs/authoring-cookbook.md](https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md)

- **Update awareness (packaged checker, notification-only):** `scripts/check-update.mjs` — after first candidate exists, run once with Node; fixed trusted manifest URL; strict identity + SemVer downgrade protection + per-installed-version state + 1s fail-silent timeout; never downloads/installs/executes an update; `silent` vs `update_available` with `severity: security` handling; ack via `--ack "<eventKey>"` [SKILL.md §Update awareness](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
  - Network rate: successful checks wait **~72h ±20%**; failures retry after 6h then 24h; server sees only IP+time; set **`ARCHIFY_UPDATE_CHECK_DISABLED=1`** to disable [README.md §1. Install](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

### 9.2 DSH plugin — DeepSeek Harness

- **Package:** `@tt-a1i/archify-dsh@0.1.0` — community integration, **not an official DeepSeek product**, developer-preview `@deepseek-ai/dsh@0.1.0-rc.6`, Node `^22.19.0 || >=24.0.0` [integrations/deepseek-harness/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md), [README.md §DSH community opt-in](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

  ```bash
  dsh plugin --profile web add @tt-a1i/archify-dsh@0.1.0
  # invoke:
  #   Use the archify skill to map this repository's runtime architecture.
  dsh plugin --profile web remove @tt-a1i/archify-dsh
  ```
- **What it does:** Skill-only bundle — inserts one filesystem Skill provider named `archify-plugin` exposing the Archify 2.14 snapshot released with the package; does **not** register native tools, custom Web client, Produced Files chips, telemetry, network, credentials handling, background services, or `prepare`/`install`/`postinstall` hooks; immutable rebuild reads payload from tag `archify-dsh-v0.1.0` until a separately authorized DSH release gets a new version [integrations/deepseek-harness/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md).
- **Caveat:** Shell-created files do **not** automatically appear in Web Produced Files — ask agent to return **exact workspace paths** of spec JSON + HTML artifact [integrations/deepseek-harness/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md).
- Security posture explicitly listed: no telemetry/network/credentials/background/`prepare`/`install`/`postinstall`; provider load errors fail during normal DSH boot [integrations/deepseek-harness/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md).

### 9.3 Raven ZIP — manual

- **Raven harness:** extract `archify.zip` (at repo root, also downloadable) into `~/.raven/workspace/skills` → yields `~/.raven/workspace/skills/archify`; Raven is **not** a switcher target [README.md §Installation options](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- Skill packaging stages only tracked regular files through one symlink-safe path shared by release ZIP + DSH bundle; preserves nested runtime test dirs; rejects stale/dependency-bearing artifacts [CHANGELOG.md#2.16.0](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md).

---

## 10. How Lokma Should Integrate

> Lokma = innovative agentic coding harness — CLI + Web, multi-provider, themeable, plugin/marketplace, collision-free multi-agent, infinite memory + vault + graph — Docs in `/mnt/apopic/lokma/Docs/` (3854 lines synthesized, 900KB raw). This section is the **integration blueprint**: three layers (skill, pane, apps) that make Archify's ideas **visible in Lokma's web UI and future apps** as requested.

### 10.1 Architecture — where Archify fits in Lokma

```
 Lokma CLI                Lokma Web (Next.js + WS + flexlayout)         Future Apps
 ──────────               ────────────────────────────────────          ───────────
 lokma prompt ─┐
 lokma archify │  ┌─────────────────────────────────────────┐  ┌─────────────────────┐
 validate      ├──┤  archify skill (agent creates JSON IR)  ├──┤  /api/archify proxy  │
 deliver --json│  │  → Node.js subprocess (no npm install)  │  │  + HTML artifact     │
 preview       │  └──────────────┬──────────────────────────┘  │  share / embed       │
 export/share  │                 │ render/validate/compare     │  mobile, docs site,  │
 delta compare │                 ▼                             │  release notes,      │
               │  ┌─────────────────────────────────────────┐  │  PR review bot       │
               └──┤  /api/archify  (Fastify/Next route)     │  └─────────────────────┘
                  │  POST /render, /validate, /compare     │
                  │  GET  /gallery, /artifact/:id          │
                  └──────────────┬──────────────────────────┘
                                 │
                  ┌──────────────▼──────────────────────────┐
                  │  Architecture Pane (flexlayout tab)     │
                  │  list + viewer iframe + export + delta  │
                  │  + story play + reach/route/lens        │
                  │  + hash-link sync + theme/preset toggle │
                  └─────────────────────────────────────────┘
                                 │
                  ┌──────────────▼──────────────────────────┐
                  │  Vault/Memory: diagram JSON + HTML      │
                  │  pinned to vault, searchable, graph      │
                  │  edge: Session → uses → Artifact         │
                  └─────────────────────────────────────────┘
```

- This mirrors Archify's own layering (agent JSON → validate → deterministic compile → self-contained HTML) and Lokma's existing decisions: **flexlayout pane system** [Docs/24-WEB-PANE-SYSTEM-and-orchestration.md](file:///mnt/apopic/lokma/Docs/24-WEB-PANE-SYSTEM-and-orchestration.md), **plugin/skill market** (Hermes-inspired auto-discovery) [Docs/27-SKILLS-auto-discovery-hermes-inspired.md](file:///mnt/apopic/lokma/Docs/27-SKILLS-auto-discovery-hermes-inspired.md), **Vault + graph viewer** [Docs/28-MEMORY-infinite-vault-graph.md](file:///mnt/apopic/lokma/Docs/28-MEMORY-infinite-vault-graph.md), **provider/model/session** [Docs/22-WEB-FEATURES-provider-model-session.md](file:///mnt/apopic/lokma/Docs/22-WEB-FEATURES-provider-model-session.md).

### 10.2 (a) archify as a Lokma skill — agent creates diagrams from description or codebase trace

**Goal:** Any Lokma agent (Claude/GPT/DeepSeek/Gemini/local) can, on user request, author a validated Archify diagram — from a plain-language description **or** from a codebase trace (revision-pinned when requested).

#### Skill placement

- Follow Lokma's **Hermes-inspired skill system** ([Docs/27](file:///mnt/apopic/lokma/Docs/27-SKILLS-auto-discovery-hermes-inspired.md)): ship Archify as `skills/archify/SKILL.md` with frontmatter `name: archify`, `description: "Create polished … — Use when …"`, trigger routing on first 57 chars, `skill_view(name='archify')` loads it, `skills_list` indexes it.
- Physical location: `~/.lokma/skills/archify/` (global) or `.lokma/skills/archify/` (project-local), mirroring `~/.claude/skills/` — or embed in the Lokma marketplace (future `npx skills add` analogue: `lokma skills add tt-a1i/archify`).
- The skill is **prompt + validator + renderer**, not an API key — zero npm install at runtime; ships the `archify/` folder (schemas + renderers + `generated-validators.mjs` + `bin/archify.mjs`) exactly as committed.

#### Skill contract (adapted from upstream SKILL.md)

1. **Choose type** — `architecture | workflow | sequence | dataflow | lifecycle` via type router or `archify guide "…" --json` (11 recipes, zero runtime deps).
2. **Read one matching schema** (`schemas/<type>.schema.json` + `common.schema.json`) and **one matching example** (`examples/*.json`) — example is field shape, not facts; fresh IDs, domain wording, layout.
3. **Artifact first** — next tool action must **write the candidate** JSON IR (≤12 primary nodes, one main path, sparse labels, `meta.quality_profile: "showcase"`, automatic routes/labels, no `via`/`channelX`/`labelAt` pre-emptively).
4. **Validate after every edit** — `node bin/archify.mjs validate <type> <file> --quality showcase --json` — showcase pass = 9/9 checks, 0 errors, 0 warnings; for workflow v2 geometry, also `--layout-json`.
5. **Deliver once when frozen** — `node bin/archify.mjs deliver <type> <file> <out.html> --quality showcase --json[--open]` — non-zero exit is never success; two focused correction rounds max (subject/evidence/supportedFixes only); then `visual-check` for evidence.

Adaptation notes for Lokma:

- **Provider-agnostic:** the harness loop (not the model) enforces the validate/deliver gate; benchmaxxed tooling (hashline edits, ripgrep) applies to JSON IR edits too.
- **Codebase trace path:** when user asks "map this repository", the agent first inspects entrypoints/runtime boundaries/storage/transports/deployment config, then authors JSON with optional `meta.repository` + `sources[]` + `--repo-root` verification (architecture-only) — [schemas/README.md §Runtime validation](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).
- **Mermaid path:** pasted `flowchart`→`workflow`/`architecture`, `sequenceDiagram`→`sequence`, `stateDiagram`→`lifecycle` — read topology then author fresh JSON [SKILL.md §Mermaid input](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

#### CLI surface for the skill inside Lokma

```bash
# Inside a Lokma session (CLI or Web terminal):
lokma archify guide "Show an API request with Redis cache miss" --json
lokma archify validate architecture ./diagrams/web-app.architecture.json --quality showcase --json
lokma archify deliver architecture ./diagrams/web-app.architecture.json ./out/web-app.html --quality showcase --json
lokma archify preview architecture ./diagrams/web-app.architecture.json ./out/web-app.html --quality showcase
lokma archify visual-check ./out/web-app.html --json
lokma archify compare architecture ./diagrams/base.architecture.json ./diagrams/head.architecture.json ./out/delta.html --json
lokma archify brands --json
lokma archify brands capture "https://example.com" --json
lokma archify migrate workflow old.v1.json new.v2.json --to-schema 2 --json
lokma archify doctor
```

- Proxy these to `node <skills/archify>/archify/bin/archify.mjs …` so future upstream bumps only replace the `archify/` folder.

#### Agent prompts (copy-paste for users)

- **No repo required:**
  ```
  Use archify to draw: Browser -> API -> Redis cache -> PostgreSQL fallback.
  ```
- **Source-evidence variant:**
  ```
  Analyze this repository, then use archify to create a high-level runtime architecture diagram.
  Show 8–12 core components, one primary path, external dependencies, and trust boundaries.
  Put supporting detail in cards instead of adding more edges.
  ```
- **Refine in chat:** `add Redis`, `move auth to the left`, `highlight the rollback path` — [README.md §Quick start](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Delta variant:**
  ```
  Compare these two architecture snapshots (base.json vs head.json) as an Architecture Delta.
  Show Before / Delta / After with added/removed/changed/moved/rerouted; do not claim impact or merge safety.
  ```

#### Brands, locale, presets — skill handles

- Locale: `meta.locale: "en"|"zh-CN"` only; other languages → omit locale, keep authored copy in requested language, disclose English fallback [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- Preset: omit for `classic` default; set `signal-flow`/`blueprint`/`editorial` only on explicit style request; color mode and preset are independent [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).
- Brand: `brand: "aws"` vs `brand: { url, sha256 }` after explicit capture — [schemas/README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md).

### 10.3 (b) Web UI pane — Architecture Pane (list + viewer iframe + export + delta compare + story play)

> Make Archify's ideas **visible in the web UI** — a dedicated pane that is **not** a hosted diagram editor but a **presentation-grade artifact viewer + lifecycle controller** atop the deterministic HTML.

#### Pane placement (flexlayout)

- **Where:** `Docs/24-WEB-PANE-SYSTEM-and-orchestration.md` pane system — flexlayout-react tabset, draggable sidebars, file browser, live terminal, browser preview [Docs/24](file:///mnt/apopic/lokma/Docs/24-WEB-PANE-SYSTEM-and-orchestration.md).
- **New tab:** **Architecture** (icon: `Layers` / `Workflow` lucide — same mono vocabulary as Lokma themes `omp`/`claude`).
- **Docking:** default in the right sidebar tab group beside Terminal + Browser Preview; can be dragged into the center editor group to become a full-bleed viewer.
- **Persistence:** pane open/closed + active artifact + view/reach/route state lives in `~/.lokma/config.json` (pane layout) + per-session storage — [Docs/26-CONFIG-and-CREDENTIALS.md](file:///mnt/apopic/lokma/Docs/26-CONFIG-and-CREDENTIALS.md).

#### Pane layout (one screen, four regions)

```
 ┌─ Architecture Pane (flexlayout tab) ─────────────────────────────┐
 │  Header: artifact title · preset pills (Classic/Signal/Blueprint/ │  ← meta.visual_preset pills; S cycles
 │          Editorial) · theme toggle (T) · Export menu (E) · Play  │  ← Export: PNG/JPEG/WebP/SVG/WebM/Share
 │          (P) · Fullscreen (F) · hash-link copy                   │     Route/Reach Share cards when active
 ├──────────────┬────────────────────────────────────────────────────┤
 │  List (left) │  Viewer iframe (center)                            │
 │  ──────────  │  ────────────────                                  │
 │  ◉ web-app   │  ┌──────────────────────────────────────────────┐  │
 │    10N · 9E  │  │  Self-contained Archify HTML (no external JS)│  │
 │    showcase  │  │  Dark/light, pan/zoom, search (/), focus,   │  │
 │    ✓ 9/9     │  │  passport, reach, route, lens, radar (M),   │  │
 │  ○ prod-depl │  │  guide (?), stories (P/[]), presentation(F) │  │
 │  ○ cache-miss│  │  Hash links: #focus/#route/#lens/#view sync │  │
 │  ○ + New     │  └──────────────────────────────────────────────┘  │
 │              │  Cards footer (dot/cyan/emerald/rose) below SVG    │
 ├──────────────┴────────────────────────────────────────────────────┤
 │  Delta Compare strip (collapsible): Base ◉ | Head ◉ | Δ Delta    │  ← Before / Delta / After three-state
 │  [Compare files…] [Open Delta HTML] [Sidecar JSON]  Receipt:     │     Overview/Prev/Review/Next (1400ms)
 │  +/~/−/↔ counts · MOVE FROM phantoms · validation receipt       │     exact-ID navigator; no impact claim
 ├─────────────────────────────────────────────────────────────────┤
 │  Status bar: validation 9/9 showcase pass · SHA-256 · visual     │  ← deliver receipt + visual-check pending/
 │            Review pending/skipped/passed · locale/en            │     failed + docs link
 └─────────────────────────────────────────────────────────────────┘
```

#### Data model (front ↔ `/api/archify`)

- The pane never invents topology — it **enumerates artifacts** (`GET /api/archify/artifacts`) and **iframe-loads the checked HTML** from `/api/archify/artifact/:id.html?theme=dark|light` (the HTML is the artifact; the pane is chrome).
- Exhaustive list per artifact (from delivery receipt): `diagram_type`, `output` path, `specification_sha256`, `artifact_sha256`, `validation: "9/9 showcase, 0 errors, 0 warnings"`, `visual_review: pending|passed|skipped|failed`, `correction_rounds`, plus optional `views[]`, `meta.visual_preset`, `meta.animation`, `meta.locale`.
- **Export actions** are the **viewer's own Export menu** inside the iframe (Copy PNG, Download PNG/JPEG/WebP, Dual-theme SVG, WebM, Share Card, Route Share Card, Reach Share Card). The pane's outer Export button simply forwards `E` into the iframe and offers a second frame for **programmatic exports** via `/api/archify/export` (PNG/SVG via Chrome DevTools pipe — same path as `visual-check`).
- **Story play:** iframe handles `P/[]` internally; pane chrome can also emit `postMessage` `{type:"archify:view", id:"request-path"}` to sync the URL hash `#view=` without touching geometry.
- **Reach / route / lens:** iframe handles all three truthfully (authored-only); pane chrome shows **read-only receipts** beside the viewer (nodes/links/max hops; lens kinds) and offers **Link copy** buttons that copy the full hash link (`#focus=…&reach=…`, `#route=…~…`, `#lens=…~…`) for sharing.

#### Interactions to implement

| Interaction | Pane does | Viewer does (already built) |
|-------------|-----------|------------------------------|
| Open artifact | `GET /api/archify/artifact/:id.html` into `<iframe sandbox="allow-scripts allow-same-origin">` | Renders SVG, theme, legend, cards |
| Toggle dark/light | Appends `?theme=` or posts `{theme}`; preserves `#view/#focus` | Preserves preset; switches CSS variables |
| Switch preset (S) | Emits `postMessage` to cycle Classic/Signal/Blueprint/Editorial | Cycles via `S`; `S` still works inside iframe focus |
| Search focus `/` | Delegates key to iframe; shows Passport copy below | Node Finder → Passport → `#focus=` |
| Upstream / Downstream | Shows count receipt from iframe event `archify:reach` | violet/green highlight |
| Route probe `R` | Shows journey steps; copy `#route=a~b` | resolves exactly two endpoints |
| Lens `L` | Shows kind comparison; copy `#lens=backend~database` | Semantic Lens |
| Stories `P/[]` | Prev/Next/Play buttons mirror iframe controls; `postMessage` for `[]` | Named Chapter Rail, 3.2s Play, #view= |
| Export | Forwards `E`; plus server-side `POST /api/archify/export {id, format}` | Canvas → 1200×630 PNG etc. |
| Delta compare | File pickers for base/head; `POST /api/archify/compare` → returns `delta.html` + sidecar; iframe loads `delta.html` with Before/Delta/After + Review navigator | Delta HTML is self-contained too |

#### Hash-link sync (critical)

- Pane URL syncs to iframe hash so users can **share stable viewer links**: `#focus=<id>`, `#focus=<id>&reach=upstream|downstream`, `#relation=<id>`, `#route=<src>~<dst>`, `#lens=<kind>~<kind>`, `#view=<view-id>` — [README.md §Explore](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- On iframe `hashchange`, pane updates `window.location.hash` (or a Lokma app route like `/workspace/<id>/archify#focus=api`) and vice-versa via `postMessage`.
- Reader-driven motion stays finite, respects `prefers-reduced-motion`, and **never enters canonical exports** — pane must not capture motion frames as canonical.

#### Validation + visual-review UX

- After `deliver`, pane shows the **deterministic receipt** (SHA-256, byte counts) and a **visual-review badge**: `pending` (synthesis), `skipped (image reader unavailable)`, `failed` (concrete defect), `passed` (only after human inspected the rendered HTML) — [delivery-contract.md §Handoff receipt](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).
- **Visual-check artifacts** (four PNG sidecars + contact sheet + JSON sidecar) are shown in a collapsible **Contact Sheet** strip — identical to `visual-check`'s relative-path HTML — so reviewers can compare 1440×900 vs 2048×1320 light/dark without leaving the pane.
- **Gate for sharing:** Share Card / export buttons are **disabled until showcase validation passes** (9/9, 0 errors, 0 warnings) — the pane never lets an invalid candidate become a canonical export.

#### Vault + graph integration

- Every delivered `specification.json` + `artifact.html` is an **artifact pair** that can be pinned to the **Vault** (`vault/artifacts/<diagram-id>/`) — same shape as Hermes vault `vault/**/*.md` (370 notes) but for diagrams — [Docs/28](file:///mnt/apopic/lokma/Docs/28-MEMORY-infinite-vault-graph.md).
- Graph viewer adds edges: `Session ──uses──▶ ArchifyArtifact`, `Artifact ──derived_from──▶ RepositoryCommit (when evidence-backed, with `meta.repository` + commit SHA)`, `ArtifactBase ──compared_to──▶ ArtifactHead ──produces──▶ DeltaArtifact`.
- Vault + FTS5 search: `session_search` can find diagrams by `meta.title` and card items — [Docs/28](file:///mnt/apopic/lokma/Docs/28-MEMORY-infinite-vault-graph.md).

### 10.4 (c) Future apps expose same `/api/archify` + HTML artifact

> Future Lokma surfaces (Desktop app, mobile companion, docs site, release-notes publisher, PR review bot) must not reimplement rendering. They **reuse the same API + same HTML artifact** — one file, ready to trust and share [README.md](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

#### API contract (stable)

| Method | Path | Body / Query | Returns | Notes |
|--------|------|--------------|---------|-------|
| `POST` | `/api/archify/render` | `{ type, json }` (+ `repoRoot?`) | `{ html, receipt }` | Validates then renders; non-zero → repair receipt |
| `POST` | `/api/archify/validate` | `{ type, json, quality, repoRoot? }` | `{ ok, receipt, diagnostics? }` | Pass-through to `validate --json`; stable rule codes |
| `POST` | `/api/archify/deliver` | `{ type, json, viewBox? }` → writes to workspace | `{ htmlPath, html, specSha, artifactSha, receipt }` | Atomic; same-directory snapshot; preserves previous artifact on failure |
| `POST` | `/api/archify/compare` | `{ baseJson, headJson, quality? }` | `{ htmlPath, html, sidecar, receipt }` | Architecture Delta — Before/Delta/After + machine receipt |
| `POST` | `/api/archify/visual-check` | `{ artifactPath }` | `{ exitCode, receipt, sidecars[] }` | 0/1/2 contract; skips remove stale sidecars |
| `POST` | `/api/archify/export` | `{ artifactPath, format, variant? }` | binary PNG/SVG/WebM | Server-side via Chrome pipe; mirrors `visual-check` capture path |
| `GET` | `/api/archify/artifacts` | `?type=&limit=` | `Artifact[]` | Lists delivered artifacts with validation + view metadata |
| `GET` | `/api/archify/artifact/:id.html` | `?theme=dark\|light` | `text/html` | Self-contained HTML; no external fetches |
| `GET` | `/api/archify/artifact/:id.json` | — | `application/json` | The typed JSON IR (the source of truth) |
| `GET` | `/api/archify/artifact/:id/sidecar.json` | — | `application/json` | For delta: the Before/Delta/After receipt |
| `GET` | `/api/archify/gallery` | — | `{ count, receipts }` | Mirrors Proof Lab gallery build |
| `POST` | `/api/archify/brands/capture` | `{ url }` | `{ brand:{url,sha256} }` | Bounded fetch, digest-pinned; fail-closed on drift |

- **No new diagram type, no hosted sharing, no WYSIWYG editing** — same scope boundaries as upstream Archify [README.md §Reference and scope](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Update check:** `ARCHIFY_UPDATE_CHECK_DISABLED=1` respected by the bundled checker; future apps must not auto-update the skill — user decides — [README.md §Update awareness](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).

#### HTML artifact contract (what future apps consume)

- **One self-contained HTML file** per diagram/delta — inline SVG, embedded CSS/JS, deterministic IDs, no external fetches, dark/light baked in, finite motion opt-in via `meta.animation: "trace"` — [README.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Deep-linkable:** `?theme=` + hash fragments `#focus/#route/#lens/#view` + `?present=1&play=1` — future apps can **embed the artifact in an `<iframe>`** and deep-link into a specific view/story/route without re-rendering — [README.md §Explore](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Exportable without the app:** any browser can open the file offline and use Export → PNG/SVG/WebM/Share Card — no Lokma backend required for viewing/printing.
- **Receipt is separate:** SHA-256 + byte counts + `validation` + `visual_review` are **not** in the HTML — they live in the delivery/delta/visual-check sidecar JSON beside the artifact; future apps must fetch the sidecar to show trust signals — [delivery-contract.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).
- **Desktop app note:** Archify's own `preview` is an explicit **loopback-only desktop mode** — Lokma's future Desktop app should **not** reimplement it; reuse the skill's `preview` subprocess if live editing is desired — [SKILL.md §Delivery](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md).

#### Future app gallery (mapping upstream roles to Lokma surfaces)

| App | Archify feature it exposes | How |
|-----|----------------------------|-----|
| **Lokma Desktop** (Phase 3 — Electron/Tauri, [Docs/03](file:///mnt/apopic/lokma/Docs/03-YOL-HARITASI.md)) | `preview` + `visual-check` + pane | Native `archify preview` watcher for live diagram feedback while editing JSON IR; contact-sheet in native window; same `/api/archify` bridged over IPC |
| **Lokma Mobile companion** | Read-only viewer | Loads `GET /api/archify/artifact/:id.html` in WebView; contained scrolling (narrow/mobile containment may scroll vertically — [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md)); no dedicated mobile product surface upstream — maintain parity |
| **Docs / Release site** (`docs.lokma.sh` / README) | Share Cards `1200×630` + embedded HTML | CI `deliver --json` → commit `artifacts/*.html` + Share Card PNGs → README hero; `compare` for release Delta pages |
| **PR review bot** (`@lokma` mention — [Docs/22](file:///mnt/apopic/lokma/Docs/22-WEB-FEATURES-provider-model-session.md)) | `compare` | On PR: `base.json@main` vs `head.json@PR` → `POST /api/archify/compare` → comment with Before/Delta/After HTML preview + `+/~/−/↔` counts + receipt (no blast-radius claim) |
| **Agent marketplace card** | Scenario guide + Proof Lab | `/api/archify/gallery` exposes the 11 scenario receipts; marketplace listing embeds a live artifact with `?present=1&play=1#view=` auto-play |
| **Vault / Memory timeline** | Artifact pinning | `memory.fermag.com.tr` / local Vault stores `diagram.json` + `diagram.html` as a versioned artifact pair; FTS5 + graph edges make diagrams recallable — [Docs/28](file:///mnt/apopic/lokma/Docs/28-MEMORY-infinite-vault-graph.md) |

#### Minimal `POST /api/archify/deliver` handler sketch (Lokma Fastify/Next)

```ts
// Pseudo — validates, snapshots, renders, checks, atomically commits, returns receipt.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";

async function archifyDeliver(type, json, outPath) {
  const specBytes = Buffer.from(JSON.stringify(json, null, 2));
  const specSha = createHash("sha256").update(specBytes).digest("hex");
  // 1) snapshot exact spec bytes to private sibling
  const snap = outPath + ".archify-snapshot.json";
  await writeFile(snap, specBytes);
  // 2) deliver via the skill's CLI (no npm install — uses committed validators)
  const { stdout, stderr } = await execFile(
    "node",
    [`${skillRoot}/archify/bin/archify.mjs`, "deliver", type, snap, outPath, "--quality", "showcase", "--json"],
    { timeout: 15000 }
  );
  const receipt = JSON.parse(stdout); // { specification:{sha256,bytes}, artifact:{sha256,bytes}, validation, visualReview }
  // 3) on non-zero, previous artifact is preserved — do NOT run visual-check
  return receipt;
}
```

- Mirrors the upstream **freeze-the-exact-spec → same-directory snapshot → artifact-check → atomic commit** contract — [delivery-contract.md §Validate and deliver](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md).

---

## 11. File Map & CLI Surface

### Repo tree (highlights)

```
archify/
  SKILL.md                              ← complete generation + viewer contract (15.7 KB)
  schemas/
    common.schema.json                  ← shared $defs (id/point/componentType/brandMark/legend/guidedViews/cards)
    architecture.schema.json
    workflow.schema.json                ← v1 (fixed) + v2 (readable compiler) dual-version
    sequence.schema.json
    dataflow.schema.json
    lifecycle.schema.json
    README.md                           ← schema reference (legend/brand/views/locale/quality/engineering_profile)
  renderers/
    shared/
      generated-validators.mjs          ← ajv standalone, committed, zero-dep runtime
      validator.mjs
      geometry.mjs
      check-render-output.mjs
    workflow/README.md                  ← migration + layout receipts (fixed v1 vs readable v2)
    architecture/  workflow/  sequence/  dataflow/  lifecycle/   ← typed renderers (JSON → HTML)
  references/
    authoring-contract.md               ← spacing math, geometry repair rules, evidence, mode placement
    delivery-contract.md                ← validate/deliver/visual-check/preview/verification invariants
    viewer-runtime.md                   ← exploration, stories, motion, exports, truth boundary
    brand-marks.md
  examples/
    web-app.architecture.json           ← 10N 9E classic, 3 views — starter for new architecture
    agent-tool-call.workflow.json       ← 12N 11E signal-flow v2, 3 views — starter for workflow
    cache-miss-request.sequence.json    ← 7 participants 12 messages classic+trace
    product-analytics.dataflow.json     ← 10N 10 flows classic+trace, PII branch
    agent-run.lifecycle.json            ← 10 states 6 transitions classic+trace
    production-deployment.architecture.json ← 12N 12E blueprint fail-closed ownership profile
  bin/archify.mjs                       ← zero-dep CLI (doctor/demo/guide/validate/deliver/preview/visual-check/compare/brands/migrate/inspect)
  scripts/
    generate-validators.mjs
    check-update.mjs
    build-gallery.mjs                   ← builds Proof Lab from JSON IR
  integrations/deepseek-harness/        ← @tt-a1i/archify-dsh@0.1.0
docs/
  authoring-cookbook.md                 ← manual workflow (cookbook for integration/contrib)
  assets/                               ← hero, dark/light, menu, route/reach share cards, workflow/sequence/dataflow/lifecycle PNGs
  cases/mco-runtime.architecture.json   ← real repo trace (mco-org/mco @ 9f1a1cf)
generated/                              ← Proof Lab artifacts (11 HTML + JSON receipts)
benchmarks/ordinary-model-floor/
CHANGELOG.md  ROADMAP.md  DESIGN.md  PRODUCT.md  CONTRIBUTING.md  SECURITY.md
archify.zip                             ← manual install for Raven / Claude.ai / Project Knowledge
.github/ISSUE_TEMPLATE/ bug-report.yml, showcase.yml
```

### CLI full surface (zero-dep, Node 18+)

| Command | Args | Quality | Output | Notes |
|---------|------|---------|--------|-------|
| `doctor` | — | — | stdout diagnostics | Verifies install |
| `demo` | `[outDir]` | — | renders 11 scenarios | Repro check |
| `guide` | `"<scenario text>" [--json]` | — | recipe + type + prompt | 11 recipes, from same source as GH Pages guide.html |
| `validate` | `<type> <file.json> [--quality showcase|standard] [--json] [--layout-json] [--repo-root <path>]` | showcase requires 9/9 | receipt or diagnostics | `--repo-root` arch-only; `--layout-json` workflow v2 only |
| `inspect` | `architecture <file.json>` | — | layout json | Arch-only |
| `deliver` | `<type> <in.json> <out.html> [--quality] [--json] [--open]` | showcase=9/9 | atomic HTML + receipt | Non-zero never success; preserves previous artifact |
| `preview` | `<in.json> <out.html> [--quality] [--no-open]` | — | loopback HTML | Explicit, desktop-only, first-screen invariant |
| `visual-check` | `<artifact.html> [--json]` | — | 4 PNG + contact sheet + receipt | Exit 0/1/2; always `visualReview:"pending"` auto |
| `compare` | `architecture <base.json> <head.json> <out.html> [--quality] [--json]` | — | delta HTML + sidecar receipt | Pairs by stable IDs; fails closed on 0 shared IDs etc. |
| `brands` | `["<filter>"] [--json]` | — | list of 107 vector marks | |
| `brands capture` | `"<url>" [--json]` | — | `{url,sha256}` digest | Bounded fetch; pinned; fail-closed |
| `migrate` | `workflow <old.json> <new.json> --to-schema 2 [--json]` | — | v2 file | Non-destructive; maps absolute pins to rank space |
| `check-update` | `[--ack "<eventKey>"]` | — | manifest check | Notification-only, never installs |

See [SKILL.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md) and [docs/authoring-cookbook.md](https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md).

---

## 12. Key Design Decisions & Non-Goals

### What Archify gets right (port to Lokma)

- **Typed IR over freeform Mermaid** — LLM-generated YAML has high "looks right, parses wrong" failure rate; JSON is unambiguous, has native browser support, and is `git diff` readable [ROADMAP.md §Not planned: YAML …](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- **Layout judgment over generic auto-layout** — agent chooses hierarchy/spacing/routes; shared automatic endpoints spread deterministically; independent reviews flagged auto-layout (dagre/elk) as primary risk to aesthetic [README.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md), [ROADMAP.md §Not planned: Auto-layout](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- **Atomic validation before delivery + repair receipts** — every gate must pass before last-good artifact is replaced; failures carry stable rule codes + measured evidence [README.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Truthful interaction** — focus/reach/route/lens/stories reuse authored nodes/relationships, never invent topology or claim runtime impact [README.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Source evidence only when requested** — ordinary artifacts stay source-free; evidence-backed nodes mark `SRC n` and open Git-verified files/lines pinned to one public commit [README.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Portable by default** — one HTML file; exports remain full-diagram and free of temporary viewer state [README.md §Why Archify](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md).
- **Finite, reader-controlled motion; Still preserves complete static meaning** [viewer-runtime.md](https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md).

### Explicitly not in scope (upstream) — Lokma should mirror

| Not planned | Why | Implication for Lokma |
|-------------|-----|-----------------------|
| Automatic Mermaid parsing / generic auto-layout / dagre | Aesthetic risk; layout *is* the product | Don't add dagre/elk; keep agent-placed topology |
| Hosted sharing / storage surface | One file is friction-free; hosted decoder opens XSS via share link | Don't add hosted decode; use `/api/archify/artifact/*.html` static |
| WYSIWYG editing / annotation overlay | Positioning is generator + viewer, not editor | Pane is viewer; editing stays in JSON IR |
| PDF export button | Browser `Cmd+P` + print stylesheet is enough | Don't add PDF renderer; reuse browser print |
| Dedicated mobile product surface | Desktop is primary; narrow gets containment only | Mobile companion is read-only WebView, not a full editor |
| gzip+base64 share links | Long-running hosted decoder + XSS vector + URL limits | Share stable hash links (`#view/#focus`) instead |
| `?exportScale=N` URL param | Removed v2.3 — encouraged soft output footgun | Consumers needing smaller raster resize externally |

Source: [README.md §Reference and scope](https://raw.githubusercontent.com/tt-a1i/archify/main/README.md), [ROADMAP.md §Not planned](https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md).
- Other non-goals per 2.16.0 stability slice: no schema expansion, no browser dep in installed package, no hosted service, no telemetry, no new mobile product surface [CHANGELOG.md#2.16.0](https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md).

### Lokma-specific invariants to carry over

- **No second source of truth** — `vault/**/*.md` + `artifacts/*.html` are artifacts; JSON IR in `diagrams/*.json` is the source of truth; renderer/viewer never persists new facts without authored change [Docs/28](file:///mnt/apopic/lokma/Docs/28-MEMORY-infinite-vault-graph.md).
- **Collision-free parallelism** — when two Lokma agents edit the same diagram JSON, reuse existing 3-layer `lease → expectedSha → worktree` from [Docs/30](file:///mnt/apopic/lokma/Docs/30-AGENT-SYSTEM-personality-memory-orchestration-collision.md) before merging.
- **Theme parity** — Lokma themes (`omp` near-black/indigo, `claude` cream/terracotta, `midnight`, `paper`) map to Archify's dark/light toggle (`T`) — one token set, two surfaces [README.md](file:///mnt/apopic/lokma/README.md), [Docs/11](file:///mnt/apopic/lokma/Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md).

---

## 13. References & Citations

### Upstream (primary)

- Repository: `https://github.com/tt-a1i/archify` — 34.9k★, 2.2k forks, 207 commits, `main`, MIT — cached at `/root/.hermes/cache/web/github.com-26de699d3e.md`.
- README (EN): `https://raw.githubusercontent.com/tt-a1i/archify/main/README.md` · ZH: `README_ZH.md` — hero, sponsors, three demo artifacts, themes, Export menu, quick start, diagram chooser, delta compare, CLI table, locales, controls.
- Skill: `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/SKILL.md` (v2.16, 92 lines, fast authoring path, update awareness, type router, invariants, delivery, viewer caps, setup/fallback).
- Schemas: `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/schemas/README.md` (legend, brand, views, locale, quality/engineering profiles, error format).
- Authoring contract: `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/authoring-contract.md` (spacing math, geometry repair order, mode placement, workflow v2 vs v1, lifecycle column alignment).
- Delivery contract: `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/delivery-contract.md` (validate/deliver atomicity, visual-check evidence, last-good preview, handoff receipt fields).
- Viewer runtime: `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/references/viewer-runtime.md` (Passport, Node Finder, Radar, reach, route, lens, stories, motion, exports, truth boundary).
- Cookbook: `https://raw.githubusercontent.com/tt-a1i/archify/main/docs/authoring-cookbook.md` (doctor → guide → author → validate → deliver → compare → visual-check).
- Workflow renderer: `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/renderers/workflow/README.md` (fixed v1 vs readable v2, migration, layout receipts, design rules).
- DSH integration: `https://raw.githubusercontent.com/tt-a1i/archify/main/integrations/deepseek-harness/README.md` (plugin add/remove, invoke, Produced Files limitation, security posture).
- Project page: `https://tt-a1i.github.io/archify/` — Start · Guide · Gallery.
- Scenario guide: `https://tt-a1i.github.io/archify/guide.html` — 11 recipes, `archify guide "..." --json`.
- Proof Lab / Gallery: `https://tt-a1i.github.io/archify/gallery.html` — 11 live artifacts, 99 structural checks, SHA-256, dark preview, story play.
- Changelog: `https://raw.githubusercontent.com/tt-a1i/archify/main/CHANGELOG.md` (2.16.0 readable-v2 compiler + bounded Viewer localization + update awareness, 2.15.0 brands + DSH, 2.14.0 visual-check, 2.13.0 delta + deployment-ownership).
- Roadmap: `https://raw.githubusercontent.com/tt-a1i/archify/main/ROADMAP.md` (archived slices + Not planned table).
- DESIGN.md: `https://raw.githubusercontent.com/tt-a1i/archify/main/DESIGN.md` (Evidence Console, semantic color rules, typography mono-forward, elevation, brand mark, reach share card Do/Don't).
- PRODUCT.md: `https://raw.githubusercontent.com/tt-a1i/archify/main/PRODUCT.md` (users, purpose, brand personality precise/composed/vivid, anti-references, design principles, a11y).
- SECURITY.md: `https://raw.githubusercontent.com/tt-a1i/archify/main/SECURITY.md` (private disclosure, supported versions).

### Checked examples (real JSON IR)

- `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/web-app.architecture.json` (10N 9E, showcase, 3 views)
- `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/agent-tool-call.workflow.json` (12N 11E, signal-flow, schema v2)
- `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/cache-miss-request.sequence.json` (7 participants, 12 messages)
- `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/product-analytics.dataflow.json` (10N 10 flows, PII branch)
- `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/agent-run.lifecycle.json` (10 states, 6 transitions)
- `https://raw.githubusercontent.com/tt-a1i/archify/main/archify/examples/production-deployment.architecture.json` (12N 12E, blueprint, deployment-ownership)
- Real trace: `https://raw.githubusercontent.com/tt-a1i/archify/main/docs/cases/mco-runtime.architecture.json` + artifact `https://tt-a1i.github.io/archify/cases/mco-runtime.architecture.html#view=dispatch-path` (mco-org/mco @ 9f1a1cf).

### Lokma (integration target)

- Workspace: `/mnt/apopic/lokma` · Docs index: `Docs/README.md` (19 docs, 3854 lines + 900KB raw)
- Key companions:
  - `Docs/24-WEB-PANE-SYSTEM-and-orchestration.md` — flexlayout pane system (Architecture Pane dock)
  - `Docs/27-SKILLS-auto-discovery-hermes-inspired.md` — Hermes `<available_skills>` + `skill_view` + curator → `archify` as Lokma skill
  - `Docs/28-MEMORY-infinite-vault-graph.md` + `Docs/29-OBSIDIAN-MCP-vault-and-graph.md` — VaultPort + graph for artifact pinning
  - `Docs/22-WEB-FEATURES-provider-model-session.md` — provider/model/session parity (Archify is provider-agnostic)
  - `Docs/26-CONFIG-and-CREDENTIALS.md` — layered config (`~/.lokma/config.json` + 0600 credentials) for pane layout + skill Root
  - `Docs/30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` — per-agent personality/memory/model, caps+queue, self-spawn, bus+coordinator+heartbeat, lease→sha→worktree
  - `Docs/02-TEKNIK-KARARLAR.md` + `Docs/03-YOL-HARITASI.md` + `Docs/25-WEB-ROADMAP.md` — stack pick A (Next.js+Fastify+flexlayout) and Phases 0→3
- Context: `Docs/00-LOKMA-KONTEKST.md` (Lokma identity, harness philosophy: *The model reasons, the harness acts.*)

---

## Appendix — Copy-Paste for Lokma Docs

### One-paragraph README blurb (for `Docs/31-ARCHIFY-integration.md` or `README.md`)

> **Architecture, on demand.** Lokma ships an **Archify skill**: the agent authors a typed JSON diagram (architecture / workflow / sequence / data flow / lifecycle) and the bundled Node.js validator-renderer deterministically compiles it into a **single self-contained HTML/SVG** — dark/light, pan/zoom, search focus (`/`), upstream/downstream reach, route probe (`R`), lens (`L`), guided stories (`P/[]`), and full-diagram **PNG/SVG/WebM plus 1200×630 Share Cards**. Invalid candidates never replace the last-good artifact; repair comes as a **machine receipt** (`validate --json` rule codes). Architecture **deltas** render **Before / Delta / After** with `added/removed/changed/moved/rerouted` facts. In the Web harness, the **Architecture Pane** lists artifacts, previews them in an iframe, plays stories, exports share cards, and runs delta comparison — all via the same **`/api/archify` + HTML artifact** that future apps reuse. No Mermaid, no hosted service, no second source of truth.

### Docs TODO checklist

- [ ] Create `Docs/31-ARCHIFY-integration.md` from this raw file (trim the Lokma personalia, keep 10 required sections + §11/§12).
- [ ] Add `archify` entry to `Docs/27-SKILLS-auto-discovery-hermes-inspired.md` marketplace table and `<available_skills>` example.
- [ ] In `Docs/24-WEB-PANE-SYSTEM-and-orchestration.md` — add the **Architecture Pane** to the pane registry (flexlayout tab, iframe viewer, Export + Story + Delta controls, hash-link sync).
- [ ] In `Docs/28-MEMORY-infinite-vault-graph.md` — add `ArchifyArtifact` node type (`Session ──uses──▶ Artifact ──derived_from──▶ Commit`).
- [ ] Add `/api/archify/*` to `Docs/22-WEB-FEATURES-provider-model-session.md` API surface and `Docs/02-TEKNIK-KARARLAR.md` stack table (Node subprocess via `bin/archify.mjs`, Chrome pipe for visual-check/export, ws for preview — explicit, desktop-only).
- [ ] Update `Docs/03-YOL-HARITASI.md` + `Docs/25-WEB-ROADMAP.md` — Phase 1: `lokma archify {guide,validate,deliver}` + Proof Lab gallery; Phase 2: Architecture Pane + Export + Delta + Reach/Route share cards; Phase 3: PR review bot + Desktop preview live + docs site hero.
- [ ] Commit + push to `raksix/lokma` (English, as per owner rule from 2026-08-31 01:45).

---

*Written to `/tmp/archify-raw.md` · English · ~600–800 lines target exceeded (count with `wc -l`) · cites every URL it draws from. No Mermaid diagrams embedded — all diagrams are evidence-backed HTML artifacts rendered by the Archify renderer, not by this document.*
