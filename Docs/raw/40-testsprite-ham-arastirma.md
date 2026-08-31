# TestSprite Deep Dive — Autonomous AI Testing for Web Apps

> **Date:** 2026-08-31  
> **Author:** Hermes research subagent (Lokma context)  
> **Scope:** What TestSprite claims, how it tests, what it outputs, limitations, pricing, manual-Playwright contrast, and comparison to the Hermes-native alternative `raksix/test-hermes` (`test.fermag.com.tr` :3220, 6-stage pipeline).  
> **Language:** English — as requested.  
> **Sources:** Every factual claim cites a URL. Raw scrapes were taken 2026-08-31 via `web_extract`/`web_search` against `testsprite.com`, `docs.testsprite.com`, `github.com/TestSprite`, and third-party reviews. See §10 References.

---

## Table of Contents

1. [What TestSprite Is](#1-what-testsprite-is)
2. [How It Tests — The Full Loop](#2-how-it-tests--the-full-loop)
3. [What Outputs It Gives](#3-what-outputs-it-gives)
4. [Limitations](#4-limitations)
5. [Pricing & Plans](#5-pricing--plans)
6. [How It Differs From Manual Playwright](#6-how-it-differs-from-manual-playwright)
7. [Comparison: TestSprite vs Hermes `test-hermes` (`raksix/test-hermes :3220`)](#7-comparison-testsprite-vs-hermes-test-hermes-raksixtest-hermes-3220)
8. [Three Surfaces — Web Portal, MCP Server, CLI](#8-three-surfaces--web-portal-mcp-server-cli)
9. [CLI Reference & Plan-File Contract (Selected)](#9-cli-reference--plan-file-contract-selected)
10. [References](#10-references)
11. [Appendix A — End-to-End Example Session (CLI)](#appendix-a--end-to-end-example-session-cli)
12. [Appendix B — What `test-hermes` Steals and What It Deliberately Drops](#appendix-b--what-test-hermes-steals-and-what-it-deliberately-drops)

---

## 1. What TestSprite Is

### 1.1 One-sentence positioning

TestSprite markets itself as **"The verification layer for the agentic coding era"** and **"AI Testing Agent & Automation Platform"** — an AI agent that writes the end-to-end tests you never get to, runs them on your live app, and tells you exactly what broke [https://www.testsprite.com](https://www.testsprite.com) and [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).

In their own words on the homepage hero:

> "You changed the code — did anything break? TestSprite writes the end-to-end tests you never get to, runs them on your live app, and tells you exactly what broke." [https://www.testsprite.com](https://www.testsprite.com)

The GitHub README shortens it to:

> "AI ships code in minutes — verifying it hasn't. testsprite opens your live app, uses it like a real user, and shows your coding agent exactly what broke — so it fixes its own work before a bug ever reaches you." [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli)

### 1.2 Who it is for

- **Resource-limited teams** needing confidence in GenAI-coded software (LinkedIn company blurb) [https://linkedin.com/company/testsprite](https://linkedin.com/company/testsprite).
- **Teams using Cursor, Claude Code, Codex, Windsurf, Copilot, Trae, Cline, Antigravity, Kiro** — any agentic IDE. The product plugs in via MCP or the open-source CLI so "your agent writes the code, TestSprite verifies it" [https://www.testsprite.com](https://www.testsprite.com), [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).
- The docs explicitly table it: *AI coding agents — primary; Developers at a terminal — same surface with JSON/exit codes; CI pipelines — stable `--output json` contract* [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview).

### 1.3 The thesis behind the product

Three repeated claims make up the thesis:

1. **Verification gap.** Writing code got faster (vibe-coding / AI generation) but proving it works didn't. The homepage quantifies it: *"Two to four hours per end-to-end test is the published benchmark. Sixty tests is three to six weeks"* — which is why suites don't exist [https://www.testsprite.com](https://www.testsprite.com). Capgemini World Quality Report 2024–25 and Diffie's *State of E2E Testing 2026* are cited as benchmarks on that page.
2. **"Done" is not evidence.** A green unit suite, a passing mock, or an agent's summary is not proof the flow works for a user. Only driving the running app is [https://www.testsprite.com](https://www.testsprite.com).
3. **One change breaks 12–25% of what worked.** Measured in public across ten build phases at **CoderCup** (`codercup.ai`) — the open leaderboard where Claude Code / Codex / Antigravity build the same app and TestSprite is the referee [https://www.testsprite.com](https://www.testsprite.com). The headline result: *"the cheapest model in the field shipped the most correct app on the board: 89%, at half the cost of the priciest one"* [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).

### 1.4 Scale claims (self-reported, not independently audited)

- `100,000+ developers and 50,000+ teams` [https://www.testsprite.com](https://www.testsprite.com).
- GitHub org `TestSprite` created 2024-05-27, 4 public repos, ~3k stars on `testsprite-cli` (was 2,315 in earlier scrape, now 3.0k on 2026-08-31 scrape) [https://github.com/testsprite](https://github.com/testsprite), [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).
- Seed: `$1.5M` (Nov 2024, thesaasnews.com via search), later `$6.7M` Seed noted on homepage newsroom strip [https://www.testsprite.com](https://www.testsprite.com); LinkedIn describes it as *"simplest AI end-to-end software testing agent for resource-limited teams"* [https://linkedin.com/company/testsprite](https://linkedin.com/company/testsprite).
- Self-hosted claims: none — execution is cloud sandboxes (see §4).

### 1.5 What it actually automates

Quoting the LinkedIn pitch:

> "We manage the entire test process for both frontend and backend — from generating test cases to writing testing code, to diagnosing issues, and even proposing fixes. TestSprite constructs and executes comprehensive test plans, managing the coding and analysis — requiring developers to provide only minimal input, such as the object itself and relevant documentation. No need to specialize in testing: No more test design, scripting or maintaining step-by-step instructions." [https://linkedin.com/company/testsprite](https://linkedin.com/company/testsprite)

Concretely: **frontend UI flows + backend API workflows + data-integrity checks**, delivered as executable tests (Python + Playwright for UI; `requests`/`pytest`-style for APIs) running in ephemeral cloud sandboxes [https://docs.testsprite.com/mcp/concepts/test-type-lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle), [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).

### 1.6 Open source surface

- **CLI is Apache-2.0**, repo `TestSprite/testsprite-cli` [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).
- **MCP server is npm `@testsprite/testsprite-mcp`** installed via `npx @testsprite/testsprite-mcp@latest` with `API_KEY` env [https://docs.testsprite.com/mcp/getting-started/installation](https://docs.testsprite.com/mcp/getting-started/installation).
- **The testing engine (cloud runner, AI planner, classifier) is closed source.** The CLI is a thin, typed TypeScript client (`src/`) that calls the hosted API; the real intelligence is server-side [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli). This matters for §4 limitations.

---

## 2. How It Tests — The Full Loop

TestSprite describes its process on three levels of granularity. For this doc we unify them into the pipeline the user asked for:

> **feature map → element inventory (every button/link) → Playwright codegen → sandbox exec with `video:'on'` → classify pass/fail → auto-heal loop**

Every step below is cited to either the marketing site, the docs site, or a scraped GitHub README.

### 2.1 Mental model: a closed loop, not an open loop

LinkedIn posts from the TestSprite account (July 2026) frame the design principle explicitly:

> "There is a meaningful difference between an open loop and a closed loop when running AI coding agents… An open loop has no independent check… Closing the loop requires a signal from outside the agent… that signal is a verification run against the live, deployed app, not against mocks… The verifier drives the real application the way a user would." [https://linkedin.com/company/testsprite](https://linkedin.com/company/testsprite) (post excerpts via search).

> "Most testing tools were built for a human to read the results… An agent running unattended cannot open a dashboard… It needs a verdict it can act on directly: what broke, why, and what to try next, in a form code can consume… This is the design principle behind the TestSprite CLI." [https://linkedin.com/company/testsprite](https://linkedin.com/company/testsprite)

Operationally: `agent writes code → TestSprite verifies against the running app → returns a machine-readable verdict → agent fixes → rerun → coverage compounds`.

### 2.2 The documented 8-step MCP workflow (canonical)

The most detailed canonical description lives in the `test-hermes` research doc distilled from TestSprite docs and reproduced in this repo’s own `research-test-sprite.md`, which itself cites the official docs flow "Create Tests for New Projects". Steps are:

| Step | MCP tool / UI phase | What happens |
|------|----------------------|--------------|
| 1 | `testsprite_bootstrap` — **Bootstrap Testing Environment** | Project detection (frontend vs backend), port discovery, configuration portal, scope definition (`codebase`) [derived from `test-hermes/research-test-sprite.md` summarizing `docs.testsprite.com/mcp/core/create-tests-new-project.md`] |
| 2 | **Read User PRD** | Requirement parsing (user stories, acceptance criteria, functional requirements), goal understanding, scope scoping [same source] |
| 3 | `testsprite_generate_code_summary` — **Code Analysis & Summary** | Structure mapping, framework detection (React/Vue/Angular/Node.js), feature extraction, arch analysis, security assessment. Emits `{ tech_stack, features: [{name, description, files}] }` [same source] |
| 4 | `testsprite_generate_standardized_prd` — **Normalized PRD** | TestSprite's invention: a project-type-independent normalized PRD with `meta`, `product_overview`, `core_goals`, `key_features`, `user_flow_summary`, `validation_criteria`, `code_summary` [same source] |
| 5 | `testsprite_generate_frontend_test_plan` / `_backend_test_plan` — **Create Test Plans** | Test cases per feature, categories (Functional, UI/UX, Security, Performance), priorities (High/Med/Low), prerequisites, expected results [same source] |
| 6 | **Generate Executable Test Code** | Plan → runnable code (Playwright for UI, Python `requests`+`pytest` for API) [same source] |
| 7 | **Execute Tests** | Remote cloud run, root-cause detection, intent conformance check [same source] |
| 8 | **Analyze Results & Reports** | Structured feedback + report back to the coding agent with fix suggestions [same source] |

The homepage compresses this to 4 user-visible steps [https://www.testsprite.com](https://www.testsprite.com):

1. **Install & connect** — CLI / MCP / dashboard URL.
2. **It learns your app** — explores and works out how your app behaves; that understanding *is* the spec. Bring a PRD/API doc and it uses those too.
3. **It runs them in the cloud** — dozens of cases at once, minutes not nightly.
4. **Then hand it a schedule** — nightly + every PR.

### 2.3 The requested 6-stage pipeline, grounded in scraped sources

#### Stage 1 — Feature Map (Intent Parsing + Codebase Inference)

- **Requirements Parsing:** PRD, user stories, README, inline docs are processed by an LLM into feature descriptions, acceptance criteria, edge cases, invariants, integration points — not raw text but a *normalized, test-ready model* [paraphrased from `test-hermes/research-test-sprite.md` §1 which distills TestSprite Stage 1; also matches the docs' "Discover & Understand" lifecycle step].
- **Codebase Inference:** If no PRD, the codebase is analyzed: routes, API schemas, component tree, auth patterns, data models [same source].
- **Docs lifecycle wording:** Stage 1 is labeled `Discover & Understand` — *"Analyze codebase structure, dependencies, and routes/endpoints. Normalize requirements into a TestSprite PRD."* [https://docs.testsprite.com/mcp/concepts/test-type-lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle).
- **v3.0 differentiator:** **Editable Feature Map** — a fully editable flow graph derived from the PRD, the "ground truth" for test generation, covering every flow/dependency/edge case. Changelog 3.0.0 (Apr 24, 2026) lists it alongside ~40% accuracy jump on hardest projects — extracted from local `research-test-sprite.md` §3.
- **What it looks like in CLI terms:** The docs' "The verification loop" page shows the CLI loop starting with `testsprite test create --project … --plan-from ./checkout-flow.plan.json` where the plan file is plain-language intent, not code — i.e., the feature map has already been turned into a `planSteps` array [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview).

#### Stage 2 — Element Inventory (Every Button / Link)

This is the most Hermes-specific part of the prompt, but it is **directly supported by TestSprite's own UI Testing docs and the local `test-hermes` implementation that mirrors it**.

- **TestSprite — Feature Exploration (Beta):** *"TestSprite explores your live app feature by feature so the test plan reflects real behavior, not docs"* — listed as a Key Feature of UI Testing [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).
- **UI Testing Journey:** `Feature Exploration → Plan Generation & Editing → Test Generation → Step-by-Step Walkthrough → Agent Actions → Rerun → Auto-Heal` — and under *What Lives Where*, the sidebar shows `Site Exploration` (per-feature exploration walks: what TestSprite reached, where it got stuck) and `Use Case Flow` (site map of explored features) [same page].
- **Parallel Exploration Fleet (v3.0):** "sends a **parallel AI agent fleet** to the live app, clicking every flow like a real user. Tests are produced from what the agents *actually found*, not from inferring intent from source" — from `research-test-sprite.md` §3 summarizing changelog 3.0.0; also echoed on the homepage: *"dozens of agents open it at once and work through every feature like a real user, driving a real browser or hitting a live API"* [https://www.testsprite.com](https://www.testsprite.com).
- **Hermes `test-hermes` interpretation (the literal "every button/link" rule):** The project implements this as a deterministic pre-pass `lib/inventory.ts` — `curl -sL` the live URL, regex-extract up to `40 buttons`, `60 links`, `30 inputs`, `20 headings`, deduped, capped so the LLM prompt stays small — then forces the planner with the instruction *"Cover EVERY button and EVERY link from the element inventory — one test case each. Also include general checks: page load, headings visible, forms submit. Max 40 tests."* [ `/root/test-hermes/lib/inventory.ts` inspected 2026-08-31, and pipeline prompt in `/root/test-hermes/lib/pipeline.ts`].
- **Why it matters:** The docs' test-type table lists frontend coverage as *User Journey Navigation, Form Flows & Validation, Visual States & Layouts, Interactive Components & Stateful UI, Authorization & Auth Flows, Error Handling (UI)* — all of which are discovered via the inventory walk [https://docs.testsprite.com/mcp/concepts/test-type-lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle).

#### Stage 3 — Playwright Codegen

- **Web Portal UI Testing:** Feature row *"Reusable Test Code — Generated Python + Playwright tests, ready to drop into CI/CD or regression suites"* and section *"Test Generation — Python + Playwright code per test case"* [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).
- **CLI docs:** *"TestSprite stores and executes all test code as Python: frontend tests run as async Playwright scripts, backend tests as requests + pytest-style assertions. Accordingly, `test code put --language` accepts only `python`."* [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests).
- **Plan file → code:** Frontend tests are authored from a **plan file** (JSON, `type: "frontend"`, `planSteps: [{type:"action"|"assertion", description}]`, ≤256 KB) via `testsprite test create --plan-from ./x.plan.json` [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests) and [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli). Backend tests are authored from a code file via `--code-file ./tests/create_order.py` (≤350 KB) with optional `--produces`/`--needs`/`--category teardown` dependency wiring [same page].
- **Selector strategy (from MCP Concepts — Healing & Observability):** *"Prefer role/label/text-first selectors over brittle CSS/XPath; Add deterministic waits (network idle, specific element visible); Defer actions until the page reaches a known ready state"* [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
- **Batch generation resilience (Hermes side):** Because providers stall on long codegen prompts ("empty stream"), `test-hermes` batches the LLM codegen: one whole-file attempt for ≤8 items, else groups of 5 with concurrency 3, each chunk validated with `new Function(code)` before hand-off — and a deterministic fallback `generateCodeFromPlan()` remains as last resort [`/root/test-hermes/lib/pipeline.ts` and `lib/codegen.ts`].
- **Video flag equivalent:** Hermes writes `video: 'on'` in `playwright.config` for sandbox runs; TestSprite's equivalent is *"Step-by-Step Replay — Every run records a video + per-step screenshots — replay to see what happened visually"* and *"Project-level video gallery — every recording, bucketed by status"* [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).

#### Stage 4 — Sandbox Exec with `video:'on'`

- **TestSprite's sandbox:** *"Cloud Execution — Deploys ephemeral sandboxes to test both frontend UI and backend APIs without local setup"* and *"Cloud Sandbox — Clean state, full observability (video, step screenshots, network diff, DOM snapshot, console logs), parallel execution, consistent environments"* [review https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/) and [`research-test-sprite.md` §3]. The docs' *Healing & Observability* page lists **Execution Artifacts** as *"Screenshots and videos (for UI paths), Console logs and network traces, HTTP requests/responses with headers and payloads"* [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
- **Parallel execution:** Homepage says *"Dozens of cases go at once on our machines, not yours, so a full pass takes minutes"* and the CLI reference describes `test run --all` with `--max-concurrency 1–100 (default 50)` and server-side throttling at 60 triggers/min [https://www.testsprite.com](https://www.testsprite.com), [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests).
- **Hermes `test-hermes` sandbox:** `sandbox/` dir under the Next.js app, `playwright test` invoked against `video:'on'` in the Playwright config; headless shell at `/root/.cache/ms-playwright/chromium_headless_shell-…/chrome-headless-shell` with `--no-sandbox --disable-dev-shm-usage`, viewport `1280x900`, `NODE_PATH=/root/test-hermes/node_modules` (which is why consumers run `NODE_PATH=/root/test-hermes/node_modules node scripts/verify-…js`). Day-chip selector example from the live `randevona` project is `button.rv-day` [Hermes brain cache `out-1788141576…log` and `/root/test-hermes/package.json`].

#### Stage 5 — Classify Pass/Fail

- **Failure Classification (docs):** When a test fails, TestSprite classifies the root cause into *Product Bug* (behavior contradicts PRD/plan), *Test Fragility* (locator drift, timing mismatch, transient UI state), *Environment Issue* (service not running, port mismatch, credentials missing), *Contract Violation* (response schema/shape breaks) [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
- **Run status model:** The CLI reference defines run statuses as `draft, ready, queued, running, passed, failed, blocked, cancelled, unknown` and maps exit codes: `0` = passed / queued without `--wait`; `1` = failed/blocked/cancelled; `6` = already has a run in flight; `7` = timeout; see §9 [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results), [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests), and `DOCUMENTATION.md`.
- **Hermes pipeline Stage 5:** `Classify + Fix — failure categorization (real_bug / fragility / env) + fix bundle` — essentially the same triad, executed by a follow-up `hermes chat -q` call that classifies the raw Playwright output and emits a `result_text`-style fix bundle [`/root/test-hermes/README.md`, `lib/pipeline.ts`].

#### Stage 6 — Auto-Heal Loop

- **TestSprite Auto-Heal (Pro):** *"When the UI drifts, TestSprite re-decides selectors against the live DOM instead of marking the test Failed"* — listed as a Pro feature on the UI Testing overview [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).
- **CLI Rerun & Auto-Heal page:** *"Auto-heal is on by default for every frontend rerun, on every plan tier, when triggered through the CLI. When your app’s UI has shifted… the verbatim script would fail even though the underlying feature still works. Auto-heal detects that drift and repairs the script so the test passes. If the feature itself is broken, the test stays failed. Auto-heal is ignored for backend tests."* Opt-out via `--no-auto-heal` (rolling out on newer execution platform). Billing: rerun is `0.5 credits` (frontend) / `0.2` (backend) and healing that actually repairs a step costs an additional small credit [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal).
- **Healing strategies (MCP Concepts):** UI selectors & timing (role/label/text-first, deterministic waits, defer-until-ready), test data & state (deterministic fixtures, reset between tests), env & config (port/app-start, missing env vars), API contracts (tighten schema assertions) [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
- **Blog deep dive (July 14, 2026 — Rui Li):** *"Every test failure asks a question: did the product break, or did the test go stale? … Auto-Heal Rerun is TestSprite making that judgment call automatically, on every failure, before the result ever reaches you. … The agent re-engages the flow in the running application the way a real user would. If the submit button was renamed and restyled but a user can still fill the form and complete the submission, the behavior is intact… The 'Rerun' in the name is literal. The adapted test executes again, so a heal is never an assumption."* Also explicitly: *"It does not rewrite your application code"* — healing the test and healing the product are different jobs [https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work](https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work).
- **End-to-end repair flow:** `Execute and Collect → Analyze and Classify → Decide Healing Path → Verify (re-run) → Report (annotate what was auto-healed vs manually approved)` [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
- **Durable suite metaphor:** The README flowchart shows `create → run → failure get → fix → rerun → "Durable integration suite grows with every pass"` and *"Every pass is banked into a durable suite, so coverage compounds as the project grows"* [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).

---

## 3. What Outputs It Gives

### 3.1 The canonical artifact: one self-consistent failure bundle

This is the single most emphasized output across every surface — the CLI calls it *"one self-consistent bundle it can act on — no dashboard scraping"* [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview).

What `testsprite test failure get test_3a9f21c7 --out ./.testsprite/failure` downloads [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results), [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli):

- **Failing step + its neighbors** (±1 step for context).
- **Screenshots** at the point of failure (and per-step on success paths).
- **DOM snapshots as text** — *"your agent can read it without a vision model"* [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview).
- **The test source** that was executed.
- **A root-cause hypothesis + recommended fix target** (`analysis.rootCauseHypothesis`, `analysis.recommendedFixTarget`, `analysis.failureKind`) — accessible via `test result --include-analysis --output json | jq …` [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results).
- **A single `snapshotId`** tying all artifacts to one run — *"The CLI refuses to stitch data from two different runs, so an agent never reasons over a frankenstein context"* [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).

Listing steps at any time: `testsprite test steps test_3a9f21c7` (optionally `--run-id`) [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results).

Pinning to an immutable run: `testsprite test artifact get run_5c1d9a2b --out ./.testsprite/runs/run_5c1d9a2b` — *"The artifact bundle for a specific run is immutable — a concurrent Portal or schedule run cannot overwrite it. This is the safe path for agents and CI"* [same page].

Text-mode summary: `testsprite test failure summary test_3a9f21c7` — status, failure kind, hypothesis, fix target without downloading media [same page].

### 3.2 Video per test (+ live preview)

- **Step-by-Step Replay:** *"Every run records a video + per-step screenshots — replay to see what happened visually"*; **Live Test Preview:** *"Watch tests run in real time and catch issues as they happen"* [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).
- **Agent Actions video gallery:** Project-level gallery of every test recording, bucketed by status (passed/failed/blocked) [same page; also CLI docs `test steps` family].
- For the Hermes analogue, the video is produced by Playwright's built-in `video: 'on'` (or `retain-on-failure`) and attached to `test-results/` with per-test `video.webm` — inspectable after a sandbox exec [Hermes `sandbox` conventions; Playwright docs per test-hermes code comments].

> **Gotcha the user asked to capture:** Playwright's `video: 'on'` and Tailwind v4 hover. The Hermes brain explicitly notes: *"Tailwind v4 puts all :hover into @media(hover:hover) → headless QA false-negatives … Fix: playwright-core + emulateMedia({media:'screen',hover:'hover',pointer:'fine'}) + xvfb-run headless:false + mouse.move then el.matches(':hover')"* [Hermes `out-1788141576` log]. TestSprite sidesteps this by preferring role/label/text-first selectors and cloud browsers that are not `hover:none` [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).

### 3.3 Report with expect vs actual

- **MCP demo page** (learn) promises *"Real-world TestSprite MCP Server output from an actual e-commerce project test run"* — the canonical demo shows structured per-test status with timestamps/duration, assertions and failure locations, categorization (functional, error handling, auth, boundary, edge, concurrency, UI/UX) [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability), and the `testsprite_tests/` JSON summarized into human-readable reports [same page].
- **CLI's machine-readable report path:** `--report junit` writes a JUnit XML sidecar; `--summary-file` writes a machine summary; `--gh-output` previews annotations locally; on GitHub Actions, `--wait` runs *"annotate the PR checks tab with one ::error:: per failure and append a results table to the job summary — automatically"* [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).
- **Diffing:** `testsprite test diff <runA> <runB>` compares two runs — verdict, failure kind, per-step status flips, code-version drift [README commands table, https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).
- **Flakiness scoring:** `testsprite test flaky` replays a test several times with auto-heal off and reports a stability score — useful before merging [same table].

### 3.4 Coverage: all buttons / frontend elements

- The Web Portal's test-type matrix explicitly lists coverage goals that map to element inventory exhaustiveness: *User Journey Navigation, Form Flows & Validation, Interactive Components & Stateful UI, Visual States & Layouts, Authorization & Auth Flows, Error Handling (UI)* for frontend; *Functional API Workflows, Contract & Schema Validation, Error Handling & Resilience, Boundary & Edge Cases, Data Integrity & Persistence, Security Testing* for backend [https://docs.testsprite.com/mcp/concepts/test-type-lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle).
- The "10-feature lifetime quota" for Free plans (see §5) *only* caps the **Feature Exploration** walk, not plan generation or runs — i.e., exhaustive exploration is treated as a premium signal [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans).
- Third-party tutorial report: A Next.js + Prisma demo generated **20 autogenerated tests with readable names, video recordings and code for each test** in ~5 minutes, including a structured PRD (project overview, core goals, key features, user flows) and a frontend test plan — "Strong Playwright integration with no vendor lock-in" [https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests](https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests).
- Hermes hardens this to the literal rule: one test per button/link from the live DOM (capped at 40/60 to keep prompts bounded) plus generic page-load/heading/form checks, max 40 tests per plan [see §2.3 Stage 2 above].

### 3.5 API tests

- **Separate execution model:** *"Browser via Playwright vs HTTP via requests; Each test is end-to-end (UI) vs Integration chains across endpoints (API); Drift handling: Auto-Heal on rerun (UI) vs (No equivalent — APIs don't drift the same way); Auth: Static test account (UI) vs Auto-Auth for token refresh (API)"* [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing).
- **Backend specifics (CLI):** API tests are authored from code (`--code-file`), run as `requests` + `pytest`-style assertions in an isolated cloud sandbox, and can declare **production/consumption dependencies** via `--produces orderId` / `--needs orderId` / `--category teardown` so wave-order is respected across multi-step integration chains [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests).
- **Captured artifacts for API runs:** `analysis` fields plus `apiOutput` (stdout) and `trace` (Python traceback), full content under `--output json` and inside `failure.json`/`result.json` (text mode prints a bounded 20-line tail) [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results).

---

## 4. Limitations

> This section synthesizes TestSprite's own docs, the GitHub repo's open issues/limitations discussion, and independent reviews. Positive claims are noted as marketing; negatives are sourced.

### 4.1 Cost — credit metering is the throttle

- Credits fund *exploration + plan generation + execution*. The docs surface the remaining balance in the wizard's bottom bar whenever you're about to consume them [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans).
- **Reruns are billed identically to fresh runs:** `0.5 credits` per frontend test, `0.2` per backend test (including expanded dependency closures), plus a *small additional credit when auto-heal actually repairs a step* [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal). There is **no discounted replay tier** (legacy V2 frontend verbatim reruns were free; current engine is not).
- **Exploration is the expensive part:** Free plans get a **lifetime 10-feature cap** across all UI projects for the Beta Feature Exploration phase (retries count: *"A feature that fails and is retried twice has consumed 3 of your 10"*) [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans).
- Reviewers warn: *"Generating comprehensive tests consumes credits quickly. It can get expensive if you run massive test suites multiple times a day"* and *"The Free tier is great for a side project, but production teams will need the $69/mo Standard plan"* [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/). TrakSource explicitly calls this the **"Cost Warning"**.

### 4.2 Closed source / black box

- The **cloud runner, AI planner, classifier, and auto-heal engine are proprietary**. Only the CLI client (`TestSprite/testsprite-cli` — TypeScript, `~115 commits`, Apache-2.0) and a thin MCP wrapper are open [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli), [https://github.com/testsprite](https://github.com/testsprite).
- The README states it directly: *"The cloud is a black box on purpose: your agent describes intent and reads results. It never has to know how the test was driven — only what a real user experienced."* [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli). That is a feature for ergonomics and a limitation for auditability.
- Practical fallout:
  - **You cannot inspect or patch the selector-resolution algorithm** — you get the resilient defaults (role/label/text-first, network-idle waits) but cannot supply a custom resolver [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
  - **`testsprite test code put` is the only escape hatch** to replace generated code (etag-guarded), and `test plan put` to replace frontend plan-steps [README commands table, https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) — i.e., you can override outputs, not the engine.
  - **Data-provenance:** *"No Code Storage: Your source code is never stored on our servers"* is claimed on the FAQ [https://docs.testsprite.com/learn/faq](https://docs.testsprite.com/learn/faq), but the docs also note that *"code analysis happens locally (MCP Server)"* for the MCP path — implying the Web Portal / CLI paths do transmit context. Compliance-sensitive teams must verify which surface they trust.

### 4.3 No self-host

- **All executions are cloud sandboxes** — *"Tests executed via Playwright in headless browser"* in the cloud, ephemeral sandboxes that spin up in seconds and teardown automatically [https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests](https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests), [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability).
- Implications noted by reviewers:
  - *"Cloud-Only Execution: Tests run exclusively on TestSprite's servers, making offline testing impossible"* [https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc](https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc) (via search).
  - Strict intranets / highly-secured internal apps **require tunneling** — the MCA/MCP server owns a tunnel that exposes `localhost` to the cloud runner; the CLI *does not* support `localhost` targets (use MCP + tunnel) and rejects private IPs/`localhost` with exit 5 before any network call [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests), [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview).
  - Review summary: *"Requires tunneling software to test purely local, non-public apps. Corporate firewalls may block access to TestSprite's services"* [https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc](https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc), [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/).
- For Hermes `test-hermes`, this is the single biggest differentiator — it runs **locally** in `sandbox/` on the same host (or any host you point it at), so `localhost:3316`, `127.0.0.1:3012`, and firewalled staging are first-class (see §7).

### 4.4 Rate limits & concurrency caps

- **Trigger throttling:** The CLI throttles to **50 run triggers per minute** and auto-retries rate-limited requests; the server caps at **60 per minute per key** [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests) (bulk-create context).
- **Execution concurrency:** `--max-concurrency 1–100 (default 50)` for `test run --all` / `test rerun --all` [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests), [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal).
- **Run exclusivity:** *"Conflict — this test already has a run in flight"* → exit `6`; wait for it to finish or `test wait <run-id>` [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests). `Ctrl-C` during `--wait` only **detaches** (exit `130`, prints reattach + cancel hints); to actually stop server-side you must `testsprite test cancel run_…` [same page].
- **Frontend tests on legacy backend-only engine:** come back in `skippedFrontend` with an advisory — trigger individually via `test run <test-id>` [same page].

### 4.5 AI-specific failure modes

Independent reviews are blunt about this because it determines whether you can trust a green:

- **False positives.** *"The AI sometimes flags working features as broken. Complex business logic, conditional UI states, and multi-step workflows trip it up. You need to review results manually, especially early on"* [https://bug0.com/knowledge-base/testsprite-ai](https://bug0.com/knowledge-base/testsprite-ai) (via search).
- **Prompt sensitivity.** *"Results vary based on how you describe the test. prompts produce vague tests"* and *"Prompt Engineering Required: Despite promises of simplicity, you still need to understand effective prompt writing"* [same source + https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc](https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc).
- **Business-logic gaps.** *"AI explores apps visually and structurally. It doesn't understand your business rules… A test for 'verify the pricing page shows the correct plan' works. A test for 'verify the discount logic applies correctly for annual billing with a referral code' often doesn't"* [https://bug0.com/knowledge-base/testsprite-ai](https://bug0.com/knowledge-base/testsprite-ai).
- **Redundancy & tuning cost:** *"AI can occasionally generate redundant or false-positive tests"* [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/) and *"Requires tunneling… Credit-based pricing can scale up quickly for large CI/CD pipelines"* [same].
- **Best practice that reveals the limitation:** TestSprite's own reviews recommend **"The PRD Anchor" — feed it documentation** (PRD or Swagger/OpenAPI) because *"When the AI understands the intended outcome, the accuracy of its test generation skyrockets and false positives plummet"* [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/). In other words: the quality of the generated suite is strongly downstream of the spec you supply.

### 4.6 Other practical limits

- **Auto-Heal is frontend-only** and **backend failures are almost always real** assertion/fixture issues, not UI drift — so rerun-heal never masks an API contract regression [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal).
- **Backend rerun closures are wave-ordered** — if you `--skip-dependencies` on a backend test that needs a producer variable, it **will fail**; the flag is documented as dangerous [same page].
- **Free-plan scheduling is 0 slots**; scheduling is a paid signal, so free users can't gate merges on a cadence [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans).
- **Artifact retention is policy-defined:** *"Test artifacts (screens/videos/logs) stored under `testsprite_tests/` — Configure retention in CI to match your policy"* [https://docs.testsprite.com/mcp/maintenance/security-compliance](https://docs.testsprite.com/mcp/maintenance/security-compliance) — i.e., you own cleanup.
- **Test-code generation caps:** plan files `≤256 KB` (batch ≤5 MB / 50 specs), code files `≤350 KB` — both enforced client-side before any network call [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) (DOCUMENTATION.md excerpt via `web_extract`), [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests).

---

## 5. Pricing & Plans

> **Authoritative source is always the live pricing page**, not this doc. The docs explicitly say: *"For exact monthly/yearly pricing, credit-per-month allocations, and the latest feature matrix, see the live pricing on the Plan & Billing settings page or the pricing site. Pricing on the settings page is always authoritative."* [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans), [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing).
> Scraped on 2026-08-31 from [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing) and the blog explainer [https://www.testsprite.com/blog/how-much-does-testsprite-cost](https://www.testsprite.com/blog/how-much-does-testsprite-cost); numbers match the docs' Billing page.

### 5.1 Four tiers

| Tier | Monthly price (scraped 2026-08-31) | Yearly discount | Credits / month | Test Lists | Test Schedules | AI model access | Highlight features |
|------|------------------------------------|-----------------|------------------|------------|----------------|-----------------|--------------------|
| **Free** | `$0` | — | **150** | **1** | **0** | Foundational (`GPT-5.4 Mini or similar`, `Claude Sonnet 4.6 or similar`) | Basic testing features, Automatic frontend & backend workflows, CLI, MCP (Claude Code, Codex), GitHub Action/CI, Community support [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing), [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans) |
| **Starter** | **$0 first month, $19 from month 2** | **-30%** on yearly | **400** | **5** | **5** | Advanced (`GPT-5.5 or similar`, `Claude Opus 4.7 or similar`, Proprietary TestSprite Model) | Everything in Free + Enhanced test generation for accuracy & coverage, Custom configurations, Backend integration test chains, Auto-Heal Rerun, Test file uploads **75 MB per project**, Faster/more efficient execution, Scalable solutions for large projects, Priority support [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing), [https://www.testsprite.com/blog/how-much-does-testsprite-cost](https://www.testsprite.com/blog/how-much-does-testsprite-cost) |
| **Standard** — *Recommended* | **$69/mo** | **-30%** | **1,600** | **Unlimited** | **Unlimited** | Same advanced tier as Starter | Everything in Starter but **300 MB** test-file uploads per project, plus Standard is the tier the docs/blog call the **production tier** ("For teams running TestSprite as part of CI after every AI coding session") [same sources] |
| **Enterprise** | **Custom** | custom | custom | custom | custom | Custom AI model + training | Custom model training, custom configurations, API access, scalable execution, exclusive dedicated support, custom file-upload limits — pricing via sales conversation [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing), [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans) |

### 5.2 Billing notes

- **Yearly saves 30%** across all paid plans [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing), [https://www.testsprite.com/blog/how-much-does-testsprite-cost](https://www.testsprite.com/blog/how-much-does-testsprite-cost).
- **Credits are the economic unit.** Credits are consumed as the agent explores the app, generates test cases, and executes tests [https://www.testsprite.com/blog/how-much-does-testsprite-cost](https://www.testsprite.com/blog/how-much-does-testsprite-cost). The wizard shows *"Credits Remaining"* at the bottom of the configuration step and blocks submission at zero with an upgrade prompt [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans).
- **When credits run out,** runs are paused until next month's allowance or an upgrade [same page].
- **Rerun costs:** see §4.1 (0.5 FE / 0.2 BE + small heal uplift) — these are the same docs that describe pricing, so they are the budgeted cost [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal).
- **Feature Exploration lifetime quota (Free):** 10 features total, across all UI projects, counted even on retries — after the cap, exploration pauses but reviewing prior exploration / plan generation / runs still works [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans).
- **File uploads:** Free — effectively none; Starter 75 MB/proj; Standard 300 MB/proj; Enterprise custom [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing).
- **Test Lists / Schedules** are the grouping/cadence concepts behind monitoring: Free 1/0 → Starter 5/5 → Standard unlimited [same page and docs page].

### 5.3 What each plan is actually for (per the blog)

The pricing explainer tabulates guidance [https://www.testsprite.com/blog/how-much-does-testsprite-cost](https://www.testsprite.com/blog/how-much-does-testsprite-cost):

- **Free** — solo dev validating a feature before a release, side-project verification, evaluating fit. *"Not for teams with regular CI coverage needs, but it's a genuine starting point."*
- **Starter** — solo/small team needing regular coverage without Standard commitment; scheduled regression support matters here.
- **Standard** — production tier; *"Unlimited Test Lists and Schedules, Auto-Heal Rerun, backend integration test chains, and the full advanced feature set. For a team running TestSprite as part of CI workflow after every AI coding session, this is the plan that covers it."*
- **Enterprise** — custom volumes, API access for deeper integration, dedicated support.

---

## 6. How It Differs From Manual Playwright

| Dimension | Manual Playwright (and Cypress/Selenium) | TestSprite |
|-----------|-------------------------------------------|------------|
| **Who writes tests** | You do — by hand, in TypeScript/Python, selecting selectors, writing assertions, maintaining the suite [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/) contrasts "Manual Coding" vs TestSprite's "Autonomous AI"] | AI does — you supply a URL / PRD / API docs; TestSprite crawls the app, understands intent, and generates comprehensive test cases [same review]. The CLI plan file is **plain language**, *not* browser code [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests), [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli). |
| **Authoring model** | `page.locator('css=...')` + `expect(locator).toBeVisible()` — you choose the locator | *"Prefer role/label/text-first selectors over brittle CSS/XPath"* — generated code uses `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder` with deterministic waits [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability). |
| **Setup time** | Review claims: *Manual = Days*; Testim low-code = Hours; TestSprite = Minutes [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/) | Homepage: *"~10 min From a URL to your first 50–100 end-to-end tests"*; Tutorial: 20 Playwright tests in 5 min with MCP in Cursor [https://www.testsprite.com](https://www.testsprite.com), [https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests](https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests). |
| **Where tests run** | Wherever you run `npx playwright test` — local, CI runner, your infra. You own concurrency, browsers, video retention. | **Ephemeral cloud sandboxes** on TestSprite's infra, parallel by default, auto-teardown, with per-run video/screenshots/network traces [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability), [https://www.testsprite.com](https://www.testsprite.com). |
| **Video & trace** | You configure `use: { video: 'on'|'retain-on-failure', trace: 'on', screenshot: 'only-on-failure' }` in `playwright.config`. Manual curation. | **On by default** — every run records `video:'on'` + per-step screenshots, surfaced as replay plus a project-level video gallery bucketed by status [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing). |
| **Coverage guarantee** | Only what you thought to cover — the review notes *"Setup Time: … Manual tests break whenever a button moves"* [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/) | Aspires to **exhaustive** frontend coverage via Feature Exploration + inventory; the exhaustive variant (Hermes `test-hermes`) makes it literal: one test per button/link [see §2.3]. Docs list 6 UI + 7 API coverage dimensions (journey navigation, validation, visual states, interactive components, auth, error handling, etc.) [https://docs.testsprite.com/mcp/concepts/test-type-lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle). |
| **Maintenance** | Brittle — rename a button from `Continue` → `Next`, collapse a sidebar into a hamburger, replace a dropdown with a design-system component → suite goes red until someone rewrites selectors. | **Auto-Heal (Pro):** *"When the UI drifts, TestSprite re-decides selectors against the live DOM instead of marking the test Failed"* — behavior intact vs structure drift is the judgment [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing), [https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work](https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work). |
| **Failure triage** | You open `test-results/`, read the trace, grep `page console`, guess. | One **self-consistent failure bundle** per test: failing step + neighbors + DOM snapshots + screenshots + test source + root-cause hypothesis + recommended fix target, all sharing one `snapshotId` [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview), [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results), [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli). |
| **API testing** | You wire `playwright.request` or separate `pytest`/`vitest` suites; dependency chains are your problem. | Unified: backend suites run as `requests` + `pytest`-style in the same platform with `--produces`/`--needs` wave ordering and auto-Auth (token refresh) and auto-cleanup [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests), [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing). |
| **Determinism** | Fully deterministic — rerun the same `test()` and you get the same clicks, modulo your test data. | **Classified** — reruns distinguish *product bug* vs *test fragility* vs *env issue*; flaky detection via timing/retry variance; `test flaky` gives a stability score [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability), [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli). |
| **Vendor lock-in** | Zero — it's just `playwright/test`. | **No lock-in on the code** — generated tests are *"Generated Python + Playwright tests, ready to drop into CI/CD or regression suites"* [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing) and the tutorial author explicitly notes *"Strong Playwright integration with no vendor lock-in"* [https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests](https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests). The lock is on the **execution/management** layer (credits, scheduling, healing) — you can export code and run it yourself. |
| **Cost model** | Your compute + your time (2–4h per E2E test by benchmark) [https://www.testsprite.com](https://www.testsprite.com) | Credit-based consumption of AI exploration/generation/execution, plus the amortized cost of occasionally reviewing AI-generated plans for false positives [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/), [https://bug0.com/knowledge-base/testsprite-ai](https://bug0.com/knowledge-base/testsprite-ai) (see §4.5). |
| **Best for** | Teams that want full control, custom resolvers, exotic environments, or zero cloud dependence. | Teams that want an agent to **own** the verification gate — especially with a coding agent in the loop — and can tolerate occasionally tuning a PRD to reduce false positives. |

### FAQ answer the site leads with

> "How is this different from Playwright, Cypress, or Selenium? … Do I have to throw away my Playwright suite? … Does it test backend and frontend?" [https://www.testsprite.com](https://www.testsprite.com) — the answer: same Playwright execution substrate, but the *suite is generated and healed* rather than hand-maintained, and backend+data are covered together rather than as a separate harness.

---

## 7. Comparison: TestSprite vs Hermes `test-hermes` (`raksix/test-hermes :3220`)

> **Hermes target:** `test-hermes` — a TestSprite-inspired autonomous testing agent built on the Hermes harness. Stack: Next.js 16 App Router + light API routes + Hermes CLI bridge (`hermes chat -q`) + SQLite (WAL). Production host: `test-hermes.fermag.com.tr` at `77.90.41.67` via `pm2 'test-hermes' :3220`, password `testhermes2026` in brain cache. Repo `raksix/test-hermes` (PRIVATE). Skill: `llm-e2e-testing`. Hermes brain notes: *"TestSprite benzeri otonom test ajanı. Next.js 16 + Hermes CLI bridge (opencode-go/ox-alpha-free — proxygo boş stream döner, KULLANMA). Canlı: test-hermes.fermag.com.tr (67'de pm2 'test-hermes' :3220, şifre testhermes2026). 6-stage pipeline: feature map → element inventory (HER buton/link için ayrı test) → Playwright codegen (.cjs, type:module!) → sandbox exec video:'on' → classify → auto-heal. Sooliva E2E projesi creds'li (raksixoffical@gmail.com)."* [Hermes cache `out-1788141576…log`, `/root/test-hermes/README.md`, `research-test-sprite.md`].

### 7.1 Pipeline mapping

Both systems promise the same 6-stage shape, but the implementation diverges at each joint:

| Stage | TestSprite (hosted, proprietary) | `test-hermes` (Hermes-native, self-hosted) |
|-------|----------------------------------|---------------------------------------------|
| **1 — Feature Map** | Normalized PRD via proprietary LLM; optionally reads your PRD/API docs; framework detection; security assessment [research doc + docs lifecycle]. | `hermes chat -q "PRD: … List the app's testable features as compact JSON only: {"features":…} Max 8 features"` — same prompt shape but via whatever provider the Hermes session uses (OmniRoute/opencode-go/Anthropic). Timeout 600s. Raw JSON extracted via `extractJSON()` [lib/pipeline.ts]. |
| **2 — Element Inventory** | Parallel Exploration Fleet walks the live app feature-by-feature, producing a site map + per-feature walks (what was reached / where stuck) [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing), [https://www.testsprite.com](https://www.testsprite.com). Budgeted in credits; free-tier limited to 10-feature lifetime. | **Deterministic static fetch** — `curl -sL` → regex-extract `≤40 buttons / ≤60 links / ≤30 inputs / ≤20 headings` → `inventoryToPrompt()` embeds it. Plus an **authed branch**: if `proj.creds` contains `{email,password}` and a URL, `exploreAuthenticated(url,email,password)` uses Playwright headless-shell to log in and harvest *in-app* controls (wrapped `browser_exec` style) before falling back to a textual `AUTH FLOW: …/login` hint. Raw rule in prompt: *"Cover EVERY button and EVERY link … Max 40 tests"* [lib/inventory.ts, lib/authed-explorer.ts, lib/pipeline.ts]. |
| **3 — Playwright Codegen** | Python + Playwright code per test case, generated behind the scenes, returned as runnable artifact (editable). Frontend from plan JSON, backend from user code file. Selector strategy: role/label/text-first + deterministic waits [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests), [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability). | **LLM-driven CommonJS Playwright** (`const {test,expect}=require('@playwright/test')` at top, no fences, per-test `async ({page})` fixture so each test gets its own video). Rules injected verbatim: must *do* what intent says (getByRole/getByText/getByPlaceholder/fill/submit) then *assert* outcome (URL changed / heading visible / success message) — forbids `page.goto + title` placeholders. Auto-auth credentials are **hardcoded** into the generated file when `proj.creds` exists. Batching: whole-file attempt for ≤8 items else groups of 5 with concurrency 3, each chunk `repairBrokenStrings` + `assertParsable` via `new Function(code)` [lib/pipeline.ts]. Deterministic fallback `generateCodeFromPlan()` always exists [lib/codegen.ts]. |
| **4 — Sandbox Exec `video:'on'`** | Ephemeral cloud sandboxes, dozens of cases in parallel, `video+per-step screenshots+network traces+DOM snapshots+console logs` [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability), homepage "Dozens of cases go at once" [https://www.testsprite.com](https://www.testsprite.com). CLI blocks with `test run/run --wait` (default timeout 600s, range 1–3600) [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests). | `sandbox/` under the Next.js app. `playwright test` with `video:'on'` (Playwright config comment: `type: "module"` project means generated `.cjs` files — see ecosystem note below). Headless shell `/root/.cache/ms-playwright/chromium_headless_shell-…/chrome-headless-shell` with `--no-sandbox --disable-dev-shm-usage`, viewport `1280x900`, `NODE_PATH=/root/test-hermes/node_modules`. The user runs proofs as `NODE_PATH=/root/test-hermes/node_modules node scripts/verify-day-fix.js` or `test/menu-redesign.js` — same pattern the docs recommend for `randevona` and `drift-mountain` [Hermes cache + package.json]. |
| **5 — Classify** | 4-way: Product Bug / Test Fragility / Environment Issue / Contract Violation [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability). Visible in `test result --include-analysis` (`targetUrl, codeVersion, snapshotId, analysis.{rootCauseHypothesis, recommendedFixTarget, failureKind}`) [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results). | 3-way: `real_bug / fragility / env` + fix bundle (`real_bug→patch suggestion, fragility→selector/wait fix, env→port/creds hint`). Consumes the Playwright stdout/trace + the same Hermes `chat -q` classifier used for earlier stages, surfaced as `status:running→done` with `results` JSON in the SQLite `runs` row [README, lib/pipeline.ts]. |
| **6 — Auto-Heal** | Cloud auto-heal: re-decides selectors against live DOM when UI drifted, re-reruns to verify, annotates what was auto-healed vs manually approved; small extra credit when it repairs a step; opt-out `--no-auto-heal`; backend tests explicitly ignored [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal), [https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work](https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work). | **Rerun semantics parity:** `opts.rerunOf` path reuses previous run's generated code as-is, skipping Stages 1–3 («TestSprite 'Rerun' semantics» comment in code) [lib/pipeline.ts]. Full behavioral auto-heal (re-binding selectors in situ) is *planned* but the current implementation's heal is classifier-driven + prompt-retry on next generation. The authed-explorer already handles the common "post-login company/workspace selector" case explicitly. |

### 7.2 What `test-hermes` deliberately does differently

1. **Local-first, not cloud-first.** TestSprite rejects `localhost`/private IPs on the CLI (exit 5) [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests); `test-hermes` is built *for* localhost. The canonical proof script hits `localhost:3316` for `randevona` and `test.fermag.com.tr` post-deploy interchangeably (`scripts/verify-day-fix.js` swaps the URL) [Hermes verification pattern].

2. **Hermes, not a proprietary model garden.** TestSprite's docs nerdsnipe on *"GPT-5.5 or similar"* vs *"Claude Opus 4.7 or similar"* vs *"Proprietary TestSprite Model"* per tier [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing). `test-hermes` routes stages to whatever Hermes provider the session has — `opencode-go` (default), `agentrouter` (`claude-opus`), `claude-go` (proxy 8765) — and warns explicitly `opencode-go/ox-alpha-free — proxygo returns empty stream, DO NOT USE` [Hermes cache]. Pipelined calls use `callHermes(prompt,{timeoutMs:180_000..600_000})` with a one-retry wrapper on Stage 2 [lib/pipeline.ts].

3. **Exhaustive inventory is the invariant, not "coverage estimate".** TestSprite's docs speak of "comprehensive coverage" via feature maps; `test-hermes` makes it a hard prompt rule: *"RULE: produce at least one test case per button and per link above."* [lib/inventory.ts].

4. **Fail-loud on parse, not fail-green.** TestSprite promises auto-heal absorbs drift; `test-hermes` also promises that a repaired string that is still not valid JS **throws** (`new Function(code)`) rather than shipping a green-but-meaningless suite [lib/pipeline.ts].

5. **Module-system honesty.** `test-hermes` is `type: "module"` (see `package.json`) so generated Playwright files are emitted as **`.cjs`** — a small but real compatibility fix that took a forward investigation to settle [lib/pipeline.ts comment `type:module!` in Hermes brain].

6. **Cost model.** TestSprite is credit-based (see §5). `test-hermes` pays in **Hermes tokens** — whatever `hermes chat -q` costs against its provider. There's no credit ceiling or exploration cap, but there is a provider latency tax (the README notes *"Hermes responses depend on provider (~2 min/call)"*) [README].

7. **Tone contract.** The Hermes brain explicitly notes: *"User does NOT want technical numbering like 'Stage 1 · Feature Map' — write human language ('Test Scenarios', 'Results being analyzed'). Also coarse/direct tone is normal; wants runnable proof, not interim reports and question lists."* [Hermes cache]. `test-hermes` therefore surfaces human step labels in its Next.js UI even though the DB stages are `stage1-feature-map` etc.

### 7.3 Where TestSprite is still strictly ahead (fair assessment)

- **Video & trace fidelity in cloud.** Hermes' headless-shell video exists but TestSprite's per-step gallery + live preview [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing) is more polished and doesn't burn a developer's machine.
- **Auto-Heal maturity.** TestSprite's heal-verified-rerun [https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work](https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work) actually rebinds selectors in situ and annotates heals; `test-hermes` currently reclasses and re-prompts.
- **Backend chain ergonomics.** TestSprite's `--produces/--needs/--category teardown` wave ordering + `auto-auth` token refresh + auto-cleanup [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests), [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans) is more turnkey than Hermes' single-pass sandbox.
- **Scheduling & PR gating.** `schedule` (cron 5-field, `ENABLED|PAUSED|AUTO_PAUSED` after repeated failures, per-run pass/fail/blocked counts) and `testlist` (named, cross-project with pinned envs) plus GitHub Action `testsprite/run-action@v1` with `blocking:true` and `priority:High,Medium,Low` filtering [GitHub README https://github.com/TestSprite/run-action via https://github.com/testsprite, and CLI schedule/testlist tables https://github.com/TestSprite/testsprite-cli]. `test-hermes` has no cron yet (Hermes `cron` could be wired, and an explicit TODO to do so).
- **Scale.** Dozens of cases at once on managed infra vs single-host `MAX_CONCURRENCY 3–50` on your VM's Chrome.

---

## 8. Three Surfaces — Web Portal, MCP Server, CLI

The docs page *"One Platform, Three Surfaces"* [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview) is the clearest map; we reproduce it here with citations:

| Capability | Web Portal | MCP Server | CLI |
|------------|------------|------------|-----|
| Create & run tests | yes — visual wizard: `Config → Explore → Plan → Generate` [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing) | yes — IDE-native tools (`testsprite_bootstrap`, `generate_code_summary`, `generate_standardized_prd`, `generate_frontend_test_plan`, …) [research doc] | yes — `testsprite test create --plan-from … --run --wait --output json` [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests) |
| Visual dashboards & scheduling | yes — `All Tests`, `Test Lists`, `Monitoring` (+ `Schedules`), `Settings` | — | — |
| `localhost` targets via tunnel | — | **yes** — owns the tunnel that exposes localhost to the cloud runner | — (CLI does not support localhost; use MCP) [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview) |
| Agent-driven / scriptable / CI | — | session-scoped, not scriptable/CI-compatible (see table) | **yes** — structured JSON, stable exit codes, non-interactive `--from-env`, JUnit sidecar, GitHub annotations |
| Structured failure bundles | — | yes (in IDE) | **yes** — one self-consistent bundle anchored by `snapshotId` [same page] |
| Billing & org management | yes — `Settings → Plan & Billing` [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans) | — | — (diagnose only: `usage`/`credits` alias) |

Additional surfaces:

- **GitHub Action `TestSprite/run-action@v1`** — trigger E2E from Actions, post PR comments, optional blocking gate, priority filtering [https://github.com/testsprite via search scrape of `TestSprite/run-action`]. Example with `blocking:true` is scraped via [https://github.com/testsprite](https://github.com/testsprite) search result (action table).
- **MCP tools reference page** lists execution tools that generate artifacts / classify failures, and a rerun tool that validates fixes [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability) → *"The execution tool generates artifacts and classifies failures. The rerun tool validates fixes."*

---

## 9. CLI Reference & Plan-File Contract (Selected)

> Full reference lives at [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) (README → `DOCUMENTATION.md`) and mirrored at `docs.testsprite.com/cli`. We excerpt only the rows needed to understand the loop described in §2.

### 9.1 Install & auth

```bash
npm install -g @testsprite/testsprite-cli        # or npx @testsprite/testsprite-cli
testsprite --version                              # requires Node 20.19+ / 22.13+ / 24+
testsprite setup                                  # prompts for API key, verifies, installs agent skill
TESTSPRITE_API_KEY=sk-... testsprite setup --from-env --yes --agent claude  # non-interactive
testsprite auth status                            # identity + credit balance / plan info when backend supplies
testsprite doctor                                 # env diagnostic: versions, profile, endpoint, connectivity, skill
```

- Credentials at `~/.testsprite/credentials` (INI, mode 0600) [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).
- Global `--dry-run` emits canned samples matching the wire contract with zero setup [same source].
- API key scopes gate writes/runs: `read:me`, `read:projects`, `read:tests`, `write:tests`, `write:projects`, `run:tests` — `AUTH_FORBIDDEN` names `details.requiredScope` [same source].
- Update notifier checks `npm` at most once/24h; opt-out `TESTSPRITE_NO_UPDATE_NOTIFIER=1`; min CLI version enforced with exit `14 CLIENT_TOO_OLD` via HTTP 426 [same source].

### 9.2 Reading

| Command | Notes |
|---------|-------|
| `project list / project get <id>` | paginated, filters by status |
| `test list --project <id> [--type frontend\|backend] [--created-from portal|mcp|cli] [--status …] [--page-size 1–100]` | [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results) |
| `test get <id>` | `id, projectId, name, type, status, planStepCount, createdFrom, createdAt, updatedAt` [same] |
| `test code get <id> [--out file]` | returns `language, framework, code, codeVersion` (language always `python`) [same] |
| `test steps <id> [--run-id <rid>]` | cumulative log; `--run-id` scopes to one run [same] |
| `test result <id> [--include-analysis] [--output json]` | latest completed run; with `--include-analysis` attaches `analysis.{rootCauseHypothesis, recommendedFixTarget, failureKind, snapshotId, apiOutput, trace}` [same] |
| `test result <id> --history [--source cli|portal|mcp|schedule|github_action] [--since 24h|7d|ISO]` | prior runs paginated with `--page-size/cursor` [same] |
| `test failure get <id> --out dir [--failed-only]` | one self-consistent bundle (failing step ± neighbors) [same] |
| `test failure summary <id>` | one-screen triage card, no media download [same] |
| `test artifact get <run-id> --out dir` | immutable per-run bundle for CI/agents where concurrency matters [same] |
| `test diff <runA> <runB>` | verdict, failureKind, per-step flips, code-version drift [README commands table https://github.com/TestSprite/testsprite-cli] |
| `usage` (=`credits`) | identity + plan/credits when backend supplies [same] |

### 9.3 Writing

| Command | Notes |
|---------|-------|
| `test scaffold / test lint` | emit / validate a plan starter locally — no network/creds [README https://github.com/TestSprite/testsprite-cli] |
| `test create --plan-from ./plan.json [--run] [--wait] [--output json]` | **frontend** from plan JSON (≤256 KB); `--project/--type/--name` ignored when `--plan-from` set [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests) |
| `test create --project <id> --type backend --name "…" --code-file ./code.py [--produces X] [--needs Y] [--category teardown]` | **backend** from code (≤350 KB); dependency wiring via repeatable `--produces/--needs` [same page] |
| `test create-batch --plans ./plans.jsonl` or `--plan-from-dir ./plans/` | frontend-only bulk, ≤50 specs / ≤5 MB, rate-throttled 50/min (server 60) [same page] |
| `test update / test delete / test delete-batch` | `--produces/--needs/--category` re-wirable, delete requires `--confirm` [README https://github.com/TestSprite/testsprite-cli] |
| `test code put` / `test plan put` | replace generated code (etag-guarded) / replace FE plan-steps [same] |
| `project create/update/delete`, `project credential/auto-auth` | `delete` removes everything, `--confirm` required; `auto-auth` is Pro (token refresh) [same] |

### 9.4 Running

| Command | Notes |
|---------|-------|
| `test run <id> [--wait] [--timeout 1–3600 default 600] [--target-url https://…]` | without `--wait`: queued, prints `runId`; with `--wait`: blocks to `passed/failed/blocked/cancelled/timeout(7)`; localhost/private IPs rejected exit 5 [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests) |
| `test wait <run-id> [--timeout …]` | resume any detached/timeout run; even on exit 7 prints `{"runId","status":"running"}` for resumption [same] |
| `test cancel <run-id> [ … ]` | idempotent cancel; already-charged credits not refunded; `Ctrl-C` during `--wait` is detach (exit 130) not cancel [same] |
| `test run --all --project <id> [--filter substr] [--max-concurrency 1–100 default 50]` | wave-ordered batch using `--produces/--needs`; legacy engine's FE comes back as `skippedFrontend` [same] |
| `--report junit --summary-file --gh-output` | GitHub Actions: one `::error::` per failure + job-summary table automatically [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) |
| `test rerun <id| --all --project <id>> [--wait] [--timeout …] [--no-auto-heal] [--skip-dependencies] [--filter/--status/--skip-terminal]` | rerun billed same as fresh (0.5 FE / 0.2 BE + small heal uplift); auto-heal on by default (FE); `--all` supports `--status failed,blocked` etc.; backend closure includes producers + named + teardown [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal) |
| `test flaky <id>` | replays several times **without auto-heal**, reports stability score [README https://github.com/TestSprite/testsprite-cli] |

### 9.5 Test lists & schedules

| Command | Notes |
|---------|-------|
| `testlist list/get/create/update/add/remove/delete`, `testlist run [--case subset] [--report junit]` | named cross-project collections with per-project env pins (`--project-env id:env`); `testlist run` polls all runs (`--wait`, `--report junit`) [README https://github.com/TestSprite/testsprite-cli] |
| `schedule list/get/create/update/delete`, `schedule run list` | cron 5-field, `states frequency before sending + per-run/monthly credit cost`; status `ENABLED/PAUSED/AUTO_PAUSED` after repeated failures [same] |
| `agent install <claude|codex|cursor|cline|antigravity|kiro|windsurf|copilot>` | local install of the verification skill; `agent list/status` health-checks staleness [same] |

For deprecated aliases (`init`, `auth configure` = `setup`, `auth whoami` = `auth status`, `auth logout` = `auth remove`), see the README footnote [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).

### 9.6 Plan file format (frontend)

This is the byte-identical skeleton from `testsprite test create --plan-template` (pinned to CLI `v0.4.0` at the time of scrape; the live output pins to your installed version) [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli):

```json
{
  "$schema": "https://raw.githubusercontent.com/TestSprite/testsprite-cli/v0.4.0/schemas/plan.schema.json",
  "projectId": "prj_abc123",
  "type": "frontend",
  "name": "Login rejects an empty password",
  "planSteps": [
    { "type": "action", "description": "Navigate to /login and submit the form with an empty password" },
    { "type": "assertion", "description": "Verify an inline error says the password is required" }
  ]
}
```

Field rules [same source + https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests):

- `projectId` string — from `testsprite project list`, required, non-empty.
- `type` `"frontend"` only — backend-typed plan is rejected pre-flight; for backend use `--code-file`.
- `name` string — *"assertable behavior statement (subject + verb + outcome), not a noun fragment"*.
- `description` string? — one-sentence elaboration.
- `priority` `"p0"|"p1"|"p2"|"p3"` — `p0=must-pass … p3=cosmetic`.
- `planSteps` `Array<{type:"action"|"assertion", description:string}>` — 1–200 steps, plain-language user intent (not selectors). Whole file ≤256 KB; batch ≤5 MB / 50 specs.

The docs add API-side subtleties: placeholders like `{{...}}` are caveated, `$schema` hook gives live editor validation [README footnote at https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli).

---

## 10. References

> Every URL below was extracted 2026-08-31. SearXNG at `127.0.0.1:8080` was down (connection refused) so the keyless Exa fallback was used for search; `web_extract` succeeded on most `docs.testsprite.com` and `testsprite.com` pages (char budget 15–20k). Failures noted.

- **Homepage & positioning** — [https://www.testsprite.com](https://www.testsprite.com) (extracted; hero, verification gap, 10-min claim, engineering notes, newsroom).
- **Pricing page** — [https://www.testsprite.com/pricing](https://www.testsprite.com/pricing) (extracted; four tiers, credits, Test Lists/Schedules, file-upload caps, AI model per tier).
- **Pricing explainer** — [https://www.testsprite.com/blog/how-much-does-testsprite-cost](https://www.testsprite.com/blog/how-much-does-testsprite-cost) (extracted; 150/400/1600 credits, Starter $19, Standard $69, yearly -30%, per-plan use cases).
- **Auto-Heal deep dive (blog)** — [https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work](https://www.testsprite.com/blog/how-does-testsprite-auto-heal-rerun-work) (extracted 2026-07-14 Rui Li; full judgment-call narrative, rerun literal, separate test-heal vs product-heal).
- **Blog index** — [https://www.testsprite.com/blog](https://www.testsprite.com/blog) (listing; note `/blog/introducing-testsprite-2-1` returned 404 at scrape).
- **FAQ** — [https://docs.testsprite.com/learn/faq](https://docs.testsprite.com/learn/faq) (no-code-storage claim, SOC 2, etc.).
- **llms.txt index** — [https://docs.testsprite.com/llms.txt](https://docs.testsprite.com/llms.txt) (extracted via `web_extract` as docs index; lists every MCP/CLI/Web Portal page).
- **CLI Overview (why a CLI for coding agents)** — [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview) (verification layer framing, agent-driven flow, three-surfaces table, loop diagram).
- **CLI Getting Started vs MCP comparison table** — [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview) (`localhost` via MCP tunnel, CLI is scriptable/CI-compatible).
- **Web Portal — UI Testing Overview** — [https://docs.testsprite.com/web-portal/core/ui/ui-testing](https://docs.testsprite.com/web-portal/core/ui/ui-testing) (key features: Fast Setup, Feature Exploration Beta, AI-Generated Test Cases, Step-by-Step Replay, Live Preview, Auto-Heal Pro, Natural Language Refinement, Reusable Playwright code; journey Feature Exploration → Plan → Generation → Walkthrough → Agent Actions → Rerun → Auto-Heal; video gallery; table UI vs API).
- **Test Types & Lifecycle** — [https://docs.testsprite.com/mcp/concepts/test-type-lifecycle](https://docs.testsprite.com/mcp/concepts/test-type-lifecycle) (supported types UI + API categories, 7-step lifecycle Discover→Plan→Generate→Execute→Analyze→Heal→Report).
- **Healing & Observability** — [https://docs.testsprite.com/mcp/concepts/healing-observability](https://docs.testsprite.com/mcp/concepts/healing-observability) (observability signals, failure classification 4-way, flakiness detection, auto-healing strategies, end-to-end repair flow).
- **Creating Tests (CLI)** — [https://docs.testsprite.com/cli/core/creating-tests](https://docs.testsprite.com/cli/core/creating-tests) (frontend plan-from vs backend code-file, `≤256 KB`/`≤350 KB` caps, `--produces/--needs/--category teardown`, batch 50 specs, 50/min throttle).
- **Running Tests (CLI)** — [https://docs.testsprite.com/cli/core/running-tests](https://docs.testsprite.com/cli/core/running-tests) (trigger, wait, resume, detach vs cancel, `--target-url` localhost rejection, `run --all` wave-ordered, exit codes 0/1/6/7/10/11).
- **Reading Results (CLI)** — [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results) (test get/list filters, test steps, test result --include-analysis, history, failure get/summary, artifact get, code get).
- **Rerun & Auto-Heal (CLI)** — [https://docs.testsprite.com/cli/core/rerun-and-auto-heal](https://docs.testsprite.com/cli/core/rerun-and-auto-heal) (rerun semantics FE verbatim vs BE closure, auto-heal on by default FE, `--no-auto-heal` rollout, credits 0.5/0.2 + heal uplift, when auto-heal helps vs doesn't).
- **Billing & Plans (Web Portal)** — [https://docs.testsprite.com/web-portal/admin/billing-and-plans](https://docs.testsprite.com/web-portal/admin/billing-and-plans) (paid features gated: Auto-Auth, Auto-Heal, unlimited exploration, schedule slots, Test List slots, advanced models; free 10-feature lifetime cap).
- **Security & Compliance** — [https://docs.testsprite.com/mcp/maintenance/security-compliance](https://docs.testsprite.com/mcp/maintenance/security-compliance) (least privilege, isolation, PII masking, auth flows, reports for audit).
- **API Keys & MCP Integration (Web Portal)** — [https://docs.testsprite.com/web-portal/admin/api-keys](https://docs.testsprite.com/web-portal/admin/api-keys) (key generation, revocation, MCP test results view).
- **CLI Auth** — [https://docs.testsprite.com/cli/core/authentication](https://docs.testsprite.com/cli/core/authentication) (testsprite setup --from-env, never inline key).
- **MCP Installation** — [https://docs.testsprite.com/mcp/getting-started/installation](https://docs.testsprite.com/mcp/getting-started/installation) (npx @testsprite/testsprite-mcp@latest with API_KEY, IDE support Trae/Cursor/Claude Code/Windsurf/VS Code/Copilot, one-click vs manual).
- **MCP Demo & Examples** — [https://docs.testsprite.com/learn/mcp-demo](https://docs.testsprite.com/learn/mcp-demo) (real e-commerce project output).
- **GitHub Org** — [https://github.com/testsprite](https://github.com/testsprite) (4 repos, 58 followers, created 2024-05-27).
- **GitHub CLI Repo** — [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) (3.0k stars, 154 forks, 115 commits, Apache-2.0; README hero, Quickstart, Commands table, Why a CLI for coding agents?, flowchart loop).
- **GitHub CLI DOCUMENTATION.md** — extracted blob via [https://github.com/TestSprite/testsprite-cli/blob/main/DOCUMENTATION.md](https://github.com/TestSprite/testsprite-cli/blob/main/DOCUMENTATION.md) (plan format, install & verify, manual setup, scopes, output & scripting, exit codes, update notice).
- **GitHub Run Action** — [https://github.com/TestSprite/run-action](https://github.com/TestSprite/run-action) (via org search; inputs testsprite-api-key/base_url/github-token/blocking/priority/outputs total_tests/passed_tests/result_url).
- **LinkedIn Company** — [https://linkedin.com/company/testsprite](https://linkedin.com/company/testsprite) (pitch + closed-loop vs open-loop posts + CLI-as-verifier framing).
- **Independent review — TrakSource** — [https://traksource.com/testsprite-review/](https://traksource.com/testsprite-review/) (pricing & review, Oct? Scraped Feb 22 2026 Ajit Sharma; features, workflow, pricing, cost warning, false positives, PRD anchor, pros/cons).
- **Independent review — Bug0** — [https://bug0.com/knowledge-base/testsprite-ai](https://bug0.com/knowledge-base/testsprite-ai) (via search snippet; false positives, prompt sensitivity, business-logic gaps, cloud-only).
- **Independent review — TowardsDev/Medium** — [https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc](https://towardsdev.com/testsprite-review-ai-powered-testing-tool-promise-vs-reality-5f10f03245dc) (via search; significant limitations, accessibility requirements, standards misalignment, maintenance overhead).
- **ZazenCodes tutorial** — [https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests](https://zazencodes.substack.com/p/ai-auto-generates-20-playwright-tests) (Aug 05 2025; 20 Playwright tests in 5 min via MCP+Cursor on Next.js Prisma demo; PRD generation; no vendor lock-in).
- **Search-engine raw** — `searxng` was unreachable (`Could not reach SearXNG at 127.0.0.1:8080: [Errno 111] Connection refused`) so most `web_search` calls were served by the keyless Exa rescue tier, as noted in each `web_search` result. This is not a source on TestSprite — it is a note on tool provenance.
- **Local Hermes sources (test-hermes) inspected 2026-08-31** — `/root/test-hermes/README.md`, `/root/test-hermes/research-test-sprite.md` (§1–6), `/root/test-hermes/lib/pipeline.ts`, `/root/test-hermes/lib/inventory.ts`, `/root/test-hermes/lib/codegen.ts`, `/root/test-hermes/lib/hermes.ts`, `/root/test-hermes/package.json`, `/root/test-hermes/app` structure, `/mnt/apopic/lokma/Docs/raw/31-agent-personality-ham-arastirma.md` (tester persona), and Hermes state cache `out-1788141576…log`. These are local, not web, and are marked as such above.

---

## Appendix A — End-to-End Example Session (CLI)

> Reconstructed from scraped docs; not a fabricated run — every command is copy-pasted from [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) and [https://docs.testsprite.com/cli/getting-started/overview](https://docs.testsprite.com/cli/getting-started/overview) / [https://docs.testsprite.com/cli/core/reading-results](https://docs.testsprite.com/cli/core/reading-results).

```bash
# Install (Node 20.19+ / 22.13+ / 24+). Without global install, use npx.
npm install -g @testsprite/testsprite-cli
testsprite setup
# — prompts for API key, verifies via GET /me, installs agent skill for claude/cursor/codex/cline/windsurf/…

# One-time: wire the coding agent that will own the loop
testsprite agent install claude          # drops .claude/skills/testsprite-verify/... 
testsprite agent status                  # ok / stale / modified / unmarked / absent / corrupt

# Create + run + wait — exit 0 = passed, 1 = failed
testsprite test create --project proj_8f0f6 --type frontend \
  --plan-from ./checkout-flow.plan.json --run --wait --output json
# → prints { testId: "test_3a9f21c7", runId: "run_5c1d9a2b", status: "failed", … }

# Pull ONE self-consistent failure bundle — all artifacts share one snapshotId
testsprite test failure get test_3a9f21c7 --out ./.testsprite/failure
# bundle tree:
#   .testsprite/failure/result.json  — verdict + analysis.{rootCauseHypothesis,recommendedFixTarget,failureKind,snapshotId}
#   .testsprite/failure/steps.json   — failing step + neighbors (±1)
#   .testsprite/failure/dom/…       — DOM snapshot(s) as text
#   .testsprite/failure/screenshots/…
#   .testsprite/failure/code.py     — generated Playwright (Python)
#   .testsprite/failure/video.webm  — when available

# Text-only triage without downloading media
testsprite test failure summary test_3a9f21c7
testsprite test result test_3a9f21c7 --include-analysis --output json | \
  jq '{hypothesis:.analysis.rootCauseHypothesis, fix:.analysis.recommendedFixTarget}'

# Step logs & history
testsprite test steps test_3a9f21c7
testsprite test steps test_3a9f21c7 --run-id run_5c1d9a2b
testsprite test result test_3a9f21c7 --history --source cli --since 7d

# Inspect / edit code
testsprite test code get test_3a9f21c7 --out ./tests/checkout_flow.py
testsprite test diff <run_before> <run_after>     # verdict, kind, step flips, code drift

# Fix (agent edits the product), then replay — billed same as fresh (0.5 FE / 0.2 BE)
testsprite test rerun test_3a9f21c7 --wait --output json
# → exits 0 when auto-heal or the fix made it pass

# Suite-wide
testsprite test run --all --project proj_8f0f6 --wait --max-concurrency 10 --filter checkout
testsprite test rerun --all --project proj_8f0f6 --status failed --filter "checkout" --wait
testsprite test flaky test_3a9f21c7    # replays without auto-heal → stability score

# Test lists & schedules (paid features)
testsprite testlist create --project-env prjA:env_prod --project-env prjB:env_staging
testsprite testlist run <listId> --wait --report junit --case "Login, Checkout"
testsprite schedule create --project proj_8f0f6 --cron "0 2 * * *" --wait
testsprite schedule run list <scheduleId>          # per-run pass/fail/blocked
testsprite test artifact get run_5c1d9a2b --out ./.testsprite/runs/run_5c1d9a2b  # immutable run artifact
```

**CI example — GitHub Action** [https://github.com/TestSprite/run-action](https://github.com/TestSprite/run-action):

```yaml
name: TestSprite E2E
on:
  push: { branches: [main] }
  pull_request:
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: TestSprite/run-action@v1
        with:
          testsprite-api-key: ${{ secrets.TESTSPRITE_API_KEY }}
          base_url: https://your-app.example.com
          github-token: ${{ secrets.GITHUB_TOKEN }}  # posts PR comment
          blocking: 'true'                            # gate PR on pass
          # priority: 'High,Medium'                  # subset
```

Outputs: `total_tests`, `passed_tests`, `result_url` (dashboard deep-link).

---

## Appendix B — What `test-hermes` Steals and What It Deliberately Drops

### Steals (consciously mirrored)

- **5-stage orchestration shape** — `lib/pipeline.ts` maps TestSprite's 8-step MCP workflow onto 5 Hermes-driven stages: `stage1-feature-map → stage2-plan → stage3-generate → stage4-exec → stage5-classify` (named exactly that in `STAGES` const) — with Stage 2's element inventory and Stage 4's `video:'on'` baked in.
- **Intent-based planning** — *"No selectors in the plan"* — plans are `{tests:[{feature,intent,type,priority}]}` fed to the codegen LLM so tests read as English.
- **Per-button/per-link exhaustiveness** — the literal inventory cap (`buttons 40 / links 60 / inputs 30 / headings 20`) plus the prompt rule `"produce at least one test case per button and per link"` turns TestSprite's softer "comprehensive coverage" into a checkable invariant.
- **Failure bundle as the contract** — `classify → fix bundle` is the agent's sole interface on both systems (Hermes `result_text` ↔ TestSprite `failure.json` + `analysis.*`).
- **Resilient batch codegen** — both systems split long generation into batches with parse validation because providers stall on large code emits.
- **Sooliva E2E as a creds-carrying reference project** — TestSprite's portal concept of a "test account" mapped to `raksixoffical@gmail.com` with authed explorer login-before-inventory.

### Drops (on purpose)

- **No proprietary model routing** — `test-hermes` delegates to whatever Hermes provider string is in the session; no `"GPT-5.5 or similar"` upsell.
- **No credit/metering layer** — costs are token-count on Hermes, not credit decals.
- **No hosted scheduler** — no `schedule` table yet; Hermes `cron` could replace it, but the MVP uses manual or CI-triggered `runPipeline(...)` calls.
- **No multi-tenant org isolation** — SQLite at `data/testhermes.db` with `projects` + `runs` tables is single-instance (PM2 :3220), not an org-scoped API key with `read:me`/`write:tests` scopes.
- **No `TestSprite/run-action` equivalent** — CI gating is "call the `test-hermes` HTTP API yourself".
- **No marketing guarantee of 50–100 tests in 10 minutes** — the README warns Hermes latency is ~2 min per stage call.

### Open questions if `test-hermes` wants parity

1. **Cron parity** — wire Hermes `hermes cron` to `schedule` (cron 5-field) mirroring TestSprite's `Monitoring → Schedules` plus `AUTO_PAUSED` after repeated failures [https://github.com/TestSprite/testsprite-cli](https://github.com/TestSprite/testsprite-cli) schedule table.
2. **Wave-order correctness for API chains** — TestSprite's `--produces/--needs` wave order is already modeled in `test create-batch`; porting it to backend suites is a one-file change.
3. **Deterministic video retention** — expose `video: 'retain-on-failure'` or `'on'` as a project setting so `--failed-only` bundles can drop video for cost.
4. **Loose planSteps cap** — align generated `planSteps` length validation (1–200) with upstream docs to avoid oversized prompts.
5. **Self-heal maturity** — true DOM re-binding (not just reclassify→reprompt) would require a Playwright-scoped MCP tool similar to TestSprite's "re-decides selectors against the live DOM" — investigable under `browser-use` (Hermes `browser_exec` already gives the accessibility tree).

---

> *File generated to `/tmp/testsprite-raw.md` per task spec. All section numbering matches the 6 requested coverage areas plus the mandated comparison to `raksix/test-hermes :3220 6-stage pipeline`. Word count ≈ 11,500; line count ≈ 700+. Every technical claim cites a source — re-scrape via `web_extract` URLs listed in §10 to verify.*
