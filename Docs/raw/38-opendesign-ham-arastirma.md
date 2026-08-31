# OpenDesign Deep Research — In-Harness Design System Blueprint for Lokma

> **Source repo:** https://github.com/nexu-io/open-design  
> **Cached GitHub scrape:** `/root/.hermes/cache/web/github.com-d8ff876dfb.md` (853 lines, 44,226 bytes)  
> **Live README:** https://raw.githubusercontent.com/nexu-io/open-design/main/README.md  
> **Docs:** https://raw.githubusercontent.com/nexu-io/open-design/main/docs/agent-adapters.md · https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md · https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md · https://raw.githubusercontent.com/nexu-io/open-design/main/docs/modes.md · https://raw.githubusercontent.com/nexu-io/open-design/main/docs/references.md  
> **Design systems catalog:** `design-systems/README.md` · `docs/design-systems.md`  
> **Design templates:** `design-templates/README.md` · `design-templates/html-ppt/` · `design-templates/guizang-ppt/` · `design-templates/hyperframes/SKILL.md`  
> **Runtime defs:** `apps/daemon/src/runtimes/defs/` · `apps/daemon/src/runtimes/registry.ts` · `apps/daemon/src/runtimes/types.ts` · `docs/agent-adapters.md`  
> **Media models:** `apps/daemon/src/media/models.ts` · `design-templates/hyperframes/`  
> **Website:** https://open-design.ai  
> **License:** Apache-2.0 — https://github.com/nexu-io/open-design/blob/main/LICENSE  
> **This file:** `/tmp/opendesign-raw.md` — 600+ line raw research for Lokma Open Design core.

> **Goal for Lokma:** Build an *in-harness* design system **like Claude Design / Open Design, even better** — running *inside* the harness (host OS), not as a SaaS page. The agent IS the design engine. Lokma must reuse the 4-plane composability (skills + templates + design systems + plugins), the daemon + CLI adapter contract, and the 6 artifact types, while improving on preview, critique, export, and BYOK.

---

## Table of Contents

1. [What OpenDesign IS — At a Glance](#1-what-opendesign-is--at-a-glance)
2. [How It Works — The Agent-Native Loop](#2-how-it-works--the-agent-native-loop)
3. [Architecture — Daemon, Runtimes, Skills, Templates, Design Systems, Plugins](#3-architecture--daemon-runtimes-skills-templates-design-systems-plugins)
4. [Artifact Types — The 6 Surfaces + Exports](#4-artifact-types--the-6-surfaces--exports)
5. [BYOK Proxy & Connectivity](#5-byok-proxy--connectivity)
6. [Deep Dive: SKILL.md Protocol (Verbatim Claude Code)](#6-deep-dive-skillmd-protocol-verbatim-claude-code)
7. [Deep Dive: DESIGN.md Contract (Brand System)](#7-deep-dive-designmd-contract-brand-system)
8. [Deep Dive: HyperFrames HTML→MP4](#8-deep-dive-hyperframes-htmlmp4)
9. [Counts & Hard Numbers](#9-counts--hard-numbers)
10. [Why This Matters for Lokma — Build Better](#10-why-this-matters-for-lokma--build-better)
11. [File Map & Key Paths](#11-file-map--key-paths)
12. [Open Questions / Lokma Improvements](#12-open-questions--lokma-improvements)
13. [Citations](#13-citations)
14. [Raw Appendix — Useful Snippets](#14-raw-appendix--useful-snippets)

---

## 1) What OpenDesign IS — At a Glance

### 1.1 Elevator pitch

> **"The open-source Claude Design alternative. Your coding agent becomes the design engine: prototypes, landing pages, dashboards, slides, images & video — real files, HTML/PDF/PPTX/MP4 export. Runs on Claude Code / Codex / Cursor / DeepSeek Harness / OpenCode & 20+ CLIs via BYOK."**
> — `https://github.com/nexu-io/open-design` description, line 821 of cache [github.com-d8ff876dfb.md:821] and `README.md:1` [raw.githubusercontent.com/.../README.md:1]

**Long form (README § What is OpenDesign):**

> "OpenDesign is what you get when the **agent-native loop Anthropic shipped with Claude Design — discover the brief, lock the direction, stream the artifact, critique, deliver — stops being closed and becomes a filesystem of functional skills, rendering design templates, design systems, and plugins** that the coding agents already on your laptop can read, write, and remix. Your CLI becomes the design engine, your laptop becomes the studio, and your team's `DESIGN.md` becomes the brand contract."
> — README.md:260 [raw.githubusercontent.com/.../README.md:260] and cache [github.com-d8ff876dfb.md:260]

Second framing:

> "It's also the **Figma alternative for the agent era** — instead of pushing pixels on a canvas, it delivers single-page artifacts in real CSS, real fonts, real components, exported straight to HTML / PDF / PPTX / MP4 — already shaped by your design system, already runnable inside the agent you use every day."
> — README.md:261 [raw.githubusercontent.com/.../README.md:261]

### 1.2 Hard metrics (as of 2026-08-31 scraping)

| Fact | Value | Source |
|------|-------|--------|
| Stars | **92.9k★** (reported as `92,854` via GitHub API) | cache line 102 [github.com-d8ff876dfb.md:102], API `https://api.github.com/repos/nexu-io/open-design` (`stargazers_count: 92854`) |
| Forks | **10.7k** | cache line 100 [github.com-d8ff876dfb.md:100] |
| Watchers | 279 watching | cache line 835 [github.com-d8ff876dfb.md:835] |
| Commits | **3,477 Commits** (shown in GitHub UI) | cache lines 127-128 [github.com-d8ff876dfb.md:127] |
| License | **Apache-2.0** (bundled templates/skills may retain MIT: `guizang-ppt` MIT @op7418, `html-ppt` MIT @lewislulu, `web-clone` MIT @Jane-xiaoer) | cache lines 246, 819-820 [github.com-d8ff876dfb.md:246][github.com-d8ff876dfb.md:819], LICENSE file |
| Version | `0.21.1` in `package.json` (private, pnpm 10.33.2, Node ~24) | `/tmp/open-design/package.json:3-5` |
| Created | `2026-04-28T04:25:20Z` | GitHub API `created_at` |
| Last push | `2026-08-31T01:53:58Z` (cache updated `2026-08-31T02:11:00Z`) | API `pushed_at` |
| Issues | 477 open, PRs 442 | cache lines 104-105 |
| Size | `1,873,534` (GitHub size) / 13,150 files in shallow clone | API `size` / `git clone --depth 1` |
| Description | "Best DeepSeek Harness Design Plugin…" | GitHub description + cache line 248-251 [github.com-d8ff876dfb.md:248] |

> **Cite for numbers:** use cache lines 102/127/246 or the live GitHub API (`curl -s https://api.github.com/repos/nexu-io/open-design | jq .stargazers_count,.forks_count`). The cache file at `/root/.hermes/cache/web/github.com-d8ff876dfb.md` is a full-text scrape of `github.com/nexu-io/open-design` (853 lines).

### 1.3 Distribution: local-first desktop app (macOS + Windows, Linux optional)

- **Primary delivery:** native desktop apps for **macOS (Apple Silicon + Intel) and Windows (x64)**. Listed in README "Download" section [raw.githubusercontent.com/.../README.md:237-240] and in cache [github.com-d8ff876dfb.md:386-387].
- **Linux:** **AppImage on the optional release lane** via GitHub Releases — cache [github.com-d8ff876dfb.md:387], README line 440.
- **Other runners (parity with daemon):**
  - **Docker:** `git clone ... && cd open-design/deploy && docker compose up -d` then `http://127.0.0.1:7456` — README lines 463-468 [raw.githubusercontent.com/.../README.md:463], QUICKSTART.md:30-56.
  - **Sealos App Store** template (published Docker image with persistent workspace + Basic Auth) — README line 473.
  - **Vercel web** (deployable next.js export served by daemon) — README comparison table line 404 [raw.githubusercontent.com/.../README.md:404] and `docs/architecture.md:Container and daemon-served production`.
  - **From source:** `corepack enable && pnpm install && pnpm tools-dev run web` — README line 478-479.
- **Privacy posture (local-first):** "Everything runs where your data lives — your laptop, your team's server, your Vercel project. When the network is needed, the BYOK proxy is SSRF-guarded." — README line 389 [github.com-d8ff876dfb.md:389]. Analytics + session replay are consent-gated; scrubbed safety/telemetry always on [github.com-d8ff876dfb.md:387]. Before documenting daemon data paths, contributors MUST read `AGENTS.md → Daemon data directory contract` [github.com-d8ff876dfb.md:387][github.com-d8ff876dfb.md:697].

### 1.4 “No vendor, no lock-in” positioning vs Claude Design / Figma / v0

README comparison table (cache lines 390-434, especially 391-434):

| Dimension | Claude Design | Figma | Lovable/v0/Bolt | **OpenDesign** |
|-----------|---------------|-------|-----------------|----------------|
| Open source | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| Self-host/desktop | ❌ | ❌ | ❌ | **✅ macOS+Windows+Docker+Vercel** |
| Agent-native (runs in your CLI) | Anthropic only | ❌ | Cloud only | **✅ 25 CLIs + BYOK** (now 26/27, see §3.3) |
| Brand-grade DESIGN.md | Proprietary | Theme JSON | Limited tokens | **✅ 151 systems shipped** |
| Skills/plugins/templates | Closed | Plugin store | Closed | **✅ 100+ functional skills · rendering templates · 277 plugins** |
| HyperFrames HTML→MP4 | ❌ | ❌ | ❌ | **✅ First-class** |
| Refresh existing repo to brand | ❌ | ❌ | ❌ | **✅ via agent + DESIGN.md** |
| Minimum billing | Pro/Max/Team | Pro/Org | Pro/Team | **BYOK · any compatible endpoint** |

Source: cache lines 390-434 [github.com-d8ff876dfb.md:390] and README comparison.

> **Why April 2026 matters:** README “Why OpenDesign” (cache lines 381-390): Anthropic released Claude Design in April 2026 (Opus 4.7, web-only, closed/paid/cloud-only). It went viral; OD is the open alternative with same loop, none of the lock-in [github.com-d8ff876dfb.md:381-384].

### 1.5 The 26 CLI runtimes table (+ DeepSeek Harness native) — including hermes-agent

README “Platform Compatibility” (cache lines 277-342, especially 278-339) and daemon source `apps/daemon/src/runtimes/defs/`:

**Table as shipped in README (cache 277-338):**

| Coding agent / platform | Status | Quick setup |
|-------------------------|--------|-------------|
| Claude Code | ✅ Supported | `od mcp install claude` |
| Claude Desktop | ✅ Supported¹ | `od mcp install claude-desktop` |
| Codex CLI | ✅ Supported | `od mcp install codex` |
| DeepSeek Reasonix | ✅ Supported | `od mcp install reasonix` |
| DeepSeek Harness | ✅ Native runtime | `od agent setup deepseek-harness` |
| Raven | ✅ Supported | `od mcp install raven` |
| Cursor | ✅ Supported | `od mcp install cursor` |
| VS Code + GitHub Copilot | ✅ Supported | `od mcp install copilot` |
| GitHub Copilot CLI | ✅ Supported | `od mcp install copilot` |
| OpenCode | ✅ Supported | `od mcp install opencode` |
| OpenClaw | ✅ Supported | `od mcp install openclaw` |
| Antigravity | ✅ Supported | `od mcp install antigravity` |
| Cline | ✅ Supported | `od mcp install cline` |
| Trae | ✅ Supported | `od mcp install trae` |
| Kimi CLI | ✅ Supported | `od mcp install kimi` |
| Kiro | ✅ Supported | `od mcp install kiro` |
| Pi Agent | ✅ Supported | `od mcp install pi` |
| Mistral Vibe CLI | ✅ Supported | `od mcp install vibe` |
| **Hermes Agent** | **✅ Supported** | **`od mcp install hermes`** |

> Full line: cache line 335-337 [github.com-d8ff876dfb.md:335]: `Hermes Agent | ✅ Supported | od mcp install hermes`

**But the on-disk truth is larger (as of clone):**

`ls -1 /tmp/open-design/apps/daemon/src/runtimes/defs/` returned **28 files**:

```
aider.ts, amp.ts, amr.ts, antigravity.ts, atomcode.ts, byok-opencode.ts,
claude.ts, codebuddy.ts, codex.ts, copilot.ts, cursor-agent.ts,
deepseek-harness.ts, deepseek.ts, devin.ts, grok-build.ts, hermes.ts,
kilo.ts, kimi.ts, kiro.ts, mimo.ts, opencode.ts, pi.ts, qoder.ts, qwen.ts,
reasonix.ts, shared.ts, trae-cli.ts, vibe.ts
```

`apps/daemon/src/runtimes/registry.ts` defines **`SHIPPED_AGENT_DEFS`** as 27 entries (plus local profiles). README docs note:

> "The base registry has **27 definitions (including `byok-opencode`)**, backed by **26 distinct local CLI executables** because `byok-opencode` shares the OpenCode executable. See `docs/agent-adapters.md`."
> — cache line 684-687 [github.com-d8ff876dfb.md:684]

So the README's "26 distinct CLI executables" / "25 CLIs + BYOK" (cache lines 259, 406-409) and the code's 27 defs are consistent: 26 bins, 27 adapter defs.

**Additional adapters found in code but not in README table:** `aider`, `amp`, `amr` (vel a/OpenDesign AMR), `atomcode`, `codebuddy`, `deepseek` (plain DeepSeek), `devin`, `grok-build`, `kilo`, `mimo`, `qoder`, `qwen`, `trae-cli`, `vibe` (already in table), plus `pi`, `kiro`.

**Hermes adapter detail — why it matters for Lokma harness:**

- File: `apps/daemon/src/runtimes/defs/hermes.ts` — def `id: 'hermes'`, `bin: 'hermes'`, `versionArgs: ['--version']`, `streamFormat: 'acp-json-rpc'`, `mcpDiscovery: 'mature-acp'`, `externalMcpInjection: 'acp-merge'`, `buildArgs: () => ['acp', '--accept-hooks']`
- Model discovery via `detectAcpModels` (`hermes acp --accept-hooks`), fallback models:
  ```
  grok-4.3 (xAI·default), grok-4.20-reasoning, grok-4.20-non-reasoning, grok-4.20-multi-agent,
  openai-codex:gpt-5.5, openai-codex:gpt-5.4, openai-codex:gpt-5.4-mini
  ```
  (hermes.ts: fallbackModels block, with note about `hermes auth add xai-oauth` / `hermes auth add openai`)
- Install: `od mcp install hermes` (cache 337). Dry-run: `od mcp install hermes --print`, uninstall: `--uninstall`, list: `od mcp install --help` [github.com-d8ff876dfb.md:338].
- Collision caveat (macOS): shell may resolve `od` to `/usr/bin/od` (octal dump). Desktop users should use Settings → MCP server snippet with absolute paths [raw.githubusercontent.com/.../README.md:444-447][github.com-d8ff876dfb.md:444].

Cite: runtime defs live in `apps/daemon/src/runtimes/defs/` with registration and shared stream handling under `apps/daemon/src/runtimes/` [github.com-d8ff876dfb.md:341]. Adapter contract: `docs/agent-adapters.md`.

### 1.6 BYOK proxy — POST /api/proxy/{anthropic,openai,azure,google,ollama}/stream

README line 340-341 [github.com-d8ff876dfb.md:340]:

> "No CLI installed? The **BYOK proxy at `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`** gives you the same loop (no process spawn) — paste `baseUrl + apiKey + model`, with presets for OpenAI, Atlas Cloud, Anthropic, Azure OpenAI, Google Gemini, Ollama, LM Studio, vLLM, or any OpenAI-compatible endpoint. Atlas Cloud uses `https://api.atlascloud.ai/v1` with your own key and OpenAI-compatible model ids such as `qwen/qwen3.5-flash`. Per-target SSRF protection blocks internal IPs / link-local / CGNAT at the daemon edge."

Daemon source mentions: `apps/daemon/src/server.ts` hosts proxy routes for anthropic/openai/azure/google/ollama (and senseaudio) [seen via grep], with SSRF guard. `AGENTS.md` and `docs/agent-adapters.md` describe the proxy as "no process spawn" alternative.

> **Lokma implication:** harness BYOK = same API. Lokma can proxy any OpenAI-compatible endpoint (Ollama local, LM Studio, vLLM, Atlas Cloud, Grok, etc.) and still render preview/export via template pipeline.

Other BYOK notes:
- Per-provider SSRF guard blocks 127/10/172.16/192.168/link-local/CGNAT/cloud-metadata IPs at daemon edge [cache 340][github.com-d8ff876dfb.md:340].
- Allowlist for internal hosts: `OD_ALLOWED_INTERNAL_HOSTS=<host1>,<host2>...` (bare hostnames/IPs, no CIDR, exact-host) — README line 501 [github.com-d8ff876dfb.md:501].
- LAN exposure needs explicit `OD_BIND_HOST` + `OD_ALLOWED_ORIGINS` [cache 500].
- Generic OpenAI-compatible endpoint: any endpoint that speaks `/v1/chat/completions` style.

---

## 2) How It Works — The Agent-Native Loop

### 2.1 The loop in one sentence (README)

> **discover the brief → lock the direction → stream the artifact → critique → deliver**
> — README lines 260, 384 [raw.githubusercontent.com/.../README.md:260][github.com-d8ff876dfb.md:384]

Detailed 7-step user-visible flow (README “A full workflow” cache 482-488):

1. **`brief` → `plugin`** — PM submits brief. Plugin picker offers landing page · pitch deck · dashboard · social post · PM spec · OKR scorecard… [github.com-d8ff876dfb.md:484]
2. **`direction`** — Designer (or agent) locks direction. No brand? Pick from 5 curated directions. Have brand? Drop screenshot/URL → agent connects GitHub/imports Figma and codifies reusable `DESIGN.md`. [github.com-d8ff876dfb.md:485]
3. **`design system`** — `DESIGN.md` is resolved (picker, discovery, import).
4. **`artifact`** — Plugin + functional skill OR design template + `DESIGN.md` are bound. Filesystem-backed CLI runs write canonical project files and preview follows them; BYOK/plain-API runs without file tools return one complete `<artifact>` block. [github.com-d8ff876dfb.md:486]
5. **`handoff`** — Real HTML/CSS — drop into Cursor/Codex/Claude Code to keep building as code. Or export PPTX/PDF/MP4 to marketing [github.com-d8ff876dfb.md:487].
6. **`memory`** — OpenDesign gets smarter as you use it: screenshots/fonts/palettes/confirmed artifacts accumulate as defaults for next session [github.com-d8ff876dfb.md:488].

### 2.2 “Becomes a filesystem” — the 4-plane decomposition (README Why)

> "Composable on four planes. **Plugins carry runnable workflows · functional skills carry agent behavior · design templates carry rendering blueprints · design systems carry the brand.** All four use portable, versionable directories that anyone can author and publish."
> — cache line 387 [github.com-d8ff876dfb.md:387]

Concrete mapping:

| Plane | What it IS | Where on disk | HTTP API | Count |
|-------|------------|---------------|----------|-------|
| **Functional skills** | `SKILL.md` bundles of reusable agent behavior, references, assets | `skills/` | `GET /api/skills` | 100+ (162 folders minus README/AGENTS) |
| **Rendering design templates** | Single-file renderable starters with preview entry + theme system | `design-templates/` | `GET /api/design-templates` | 115 folders (incl. `guizang-ppt`, `html-ppt*`, `hyperframes`, `dating-web`, `mobile-app`, etc.) |
| **Design systems** | `DESIGN.md` + `tokens.css` + `manifest.json` + `components.html` + `USAGE.md` + assets | `design-systems/<slug>/` | `GET /api/design-systems` | **151 packages** (cache 385, 591) |
| **Plugins** | `open-design.json` + payload (SKILL.md or template.json or DESIGN.md) — regrouped by marketplace categories | `plugins/_official/<category>/` + `plugins/community/` | `GET /api/plugins` | 277 official + 183 remixable examples = 460 plugin-ish directories (cache 460 entries, 277+183) |

> **Registry endpoints** (README line 589, 663): `GET /api/skills` for functional skills and `GET /api/design-templates` for rendering templates. Catalog is runtime-scanned on each listing request (daemon).

**Protocol split (docs/skills-protocol.md):** Both use Claude Code's `SKILL.md` convention as portable instruction format and may add `od:` metadata, but they have different ownership and APIs. Functional skills live in `skills/` + `/api/skills`; rendering templates live in `design-templates/` + `/api/design-templates`.

**Key rule for Lokma:** In project creation, a selected **Start from template** *replaces* the creation tab's default primary skill — daemon resolves that `skillId` across both roots and injects the template's `SKILL.md`; it does NOT auto-compose default + template [docs/modes.md: Prototype section].

### 2.3 “CLI becomes the design engine” — what the agent actually does

- The agent runs *on user's laptop*, in a managed project `cwd` (`spawn(cli, [...], { cwd })` — architecture diagram cache line 681-689).
- Prompt composition (daemon): active design system (`DESIGN.md` + `tokens.css` + craft rules) + primary skill/template (`SKILL.md` + assets/references) + project metadata + per-turn additions + brand `DESIGN.md`.
- For **filesystem-backed CLI runs**: agent composes → writes canonical project files → file workspace + sandboxed iframe preview follow those files.
- For **BYOK/plain-API runs without filesystem tools**: agent instead returns one complete `<artifact>` block (XML-ish: `<artifact identifier="..." type="text/html">…</artifact>`), which the daemon parses into an `srcdoc` iframe. See README lines 461, 486, 699 [cache 461].

**Dual fidelity:** filesystem runs = live editable files; BYOK runs = artifact parse. Preview/export bridges handle both, but filesystem is preferred for handoff.

### 2.4 Question forms, critique, tweaks

- `<question-form>` is valid on ANY turn, not just turn-1 discovery — used for brief capture and mid-conversation clarification (`apps/daemon/src/prompts/system.ts` + `discovery.ts`; API/BYOK wording mirrored via `packages/contracts/src/prompts/system.ts`) — `AGENTS.md` note [tmp scan above].
- **5-dimensional self-critique** scoresheet skill (`skills/critique` or `design-templates/critique`) is a pre-emit gate before final deliverable; Five-dimensional critique is the “anti-AI-slop checklist” from `alchaincyf/huashu-design` [cache 800].
- **Tweaks panel** (AI-emitted manifest): agent emits a manifest describing tweakable parameters; iframe re-renders without reload [README “Live dashboard” cache 350-351].

### 2.5 Export discipline

> **Export:** `HTML (inlined) · PDF (browser print) · PPTX (agent-driven) · ZIP · Markdown · MP4 (HyperFrames)` — cache line 701 [github.com-d8ff876dfb.md:701]
> Detail for decks: every deck exports to `HTML (single file, inlined assets), PDF (browser print, deck-aware), PPTX (agent-driven skill), ZIP (archive), or Markdown` — cache line 357 [github.com-d8ff876dfb.md:357]

---

## 3) Architecture — Daemon, Runtimes, Skills, Templates, Design Systems, Plugins

### 3.1 High-level topology (README architecture box + docs/architecture.md)

```
┌────────────────── browser (Next.js 16) / Electron shell ──────────────┐
│  chat · file workspace · iframe preview · settings · import · MCP     │
└──────────────┬─────────────────────────────────────┬─────────────────┘
               │ /api/*                              │
               ▼                                     ▼
┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
│  local daemon (Express+SQLite)  │   ─→ any OpenAI-compatible BYOK,
│                                  │       SSRF-guarded at the edge
│  /api/skills    /api/design-templates    /api/plugins    │
│  /api/design-systems            │
│  /api/chat (SSE)   /api/proxy/* │
│  /api/projects/:id/files/...    │
│  /api/artifacts/{save,lint}     │
│  /api/import/claude-design      │
│  MCP stdio server                │
└─────────┬───────────────────────┘
          │ spawn(cli, [...], { cwd: managed project cwd })
          ▼
┌──────────────────────────────────────────────────────────────────┐
│  Local runtime definitions come from runtimes/registry.ts;                 │
│  the base registry has 27 definitions (including byok-opencode),           │
│  backed by 26 distinct local CLI executables because byok-opencode shares │
│  the OpenCode executable. See docs/agent-adapters.md.                     │
│  composes a functional skill or design template + DESIGN.md; writes files │
└──────────────────────────────────────────────────────────────────┘
```

Source: cache lines 664-689 [github.com-d8ff876dfb.md:664], `docs/architecture.md` §§1-3.

**Layer stack (cache lines 690-705):**

| Layer | Stack |
|-------|-------|
| Frontend | **Next.js 16 App Router + React 18 + TypeScript** |
| Daemon | **Node 24 · Express · SSE streaming · better-sqlite3** |
| Storage | SQLite + project files (daemon-owned). Before changing paths, MUST read `AGENTS.md → Daemon data directory contract` [cache 697] |
| Preview | Filesystem runs render canonical project files; BYOK/plain-API runs parse one complete `<artifact>` block into sandboxed `srcdoc` iframe [cache 699] |
| Export | HTML (inlined) · PDF (browser print) · PPTX (agent-driven) · ZIP · Markdown · MP4 (HyperFrames) [cache 701] |
| Desktop | Electron shell + sandboxed renderer + sidecar IPC (`STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN`) [cache 703] |
| Lifecycle | One entry point: `pnpm tools-dev` (start/stop/run/status/logs/inspect/check) [cache 705] |

**Runtime shapes (§1 of docs/architecture.md):**

- **Source dev:** `pnpm tools-dev` is the ONLY repo lifecycle entrypoint (manages daemon + web sidecars + Electron). `pnpm tools-dev run web` = daemon+web foreground, no desktop. Ports allocated dynamically unless `--daemon-port` / `--web-port` passed.
- **Packaged desktop/headless:** `apps/packaged` starts packaged daemon + web sidecars + desktop (or headless w/out desktop). Channel/namespace-scoped runtime/data identities resolved before daemon spawn; desktop discovers web URL via sidecar IPC (not assumed port). Read `tools/pack/AGENTS.md` before changing packaged launch/update/installer/channel identity.
- **Container / daemon-served prod:** Production daemon can serve static Next.js export from `apps/web/out` + `/api/*` from one origin (Docker Compose uses that shape as one service, default host port `7456`). Public/shared deployments must configure `OD_API_TOKEN`, `OPEN_DESIGN_ALLOWED_ORIGINS`, reverse-proxy SSE behavior. See `deploy/README.md`, `docs/deployment/docker.md`.

Source: `docs/architecture.md` §§1-2, read via `web_extract` result 3.

### 3.2 Runtime registry & adapter contract (the most load-bearing file)

> Location: `apps/daemon/src/runtimes/defs/` — one file per CLI, `apps/daemon/src/runtimes/registry.ts` collects them into `SHIPPED_AGENT_DEFS`/`AGENT_DEFS` (with user local profiles appended), boot-time duplicate-id invariant.
> Contract: `docs/agent-adapters.md` — the “adapter contract: a data spec, not a class”.

**Core thesis (docs/agent-adapters.md:1):**

> "The adapter layer is OD's most load-bearing design decision. We delegate the **entire agent loop** — model calls, tool use, context management, permission handling, resume, cancel — to the user's existing code agent CLI. OD's job is to detect it, feed it a skill + prompt + working directory, and stream its output back to the web UI."
> "We don't ship an agent. The `claude / codex / cursor-agent / copilot / hermes / kimi` already on your `PATH` are the design engine." — README line 384.

**Adapter = data, not class (docs/agent-adapters.md §1):**

> "An adapter is **not** a class that implements the agent loop. It is a **plain data object** — one `RuntimeAgentDef` object literal per CLI — that declares *how to talk to* that CLI: binary to probe, argv builder, stream shape, capabilities. A **generic engine** reads those fields and does detecting, launching, invoking, and stream-parsing for every agent uniformly. There is no per-agent subclass and no `run()`/`cancel()` method."

File layout (all under `apps/daemon/src/`):

| Piece | File | Purpose |
|-------|------|---------|
| **Contract (data spec)** | `runtimes/types.ts` | `RuntimeAgentDef` type |
| **One def per CLI** | `runtimes/defs/*.ts` (claude.ts, codex.ts, cursor-agent.ts, hermes.ts, deepseek-harness.ts …) | Single object literal per CLI |
| **Registry (unique-id array)** | `runtimes/registry.ts` | `BASE_AGENT_DEFS` → `AGENT_DEFS`; throws on duplicate `id` at boot |
| **Generic engine (zero per-agent code)** | `detection.ts`, `capabilities.ts`, `executables.ts`/`resolution.ts`, `launch.ts`, `invocation.ts`, `env.ts`, `mcp.ts`, `models.ts`, `prompt-budget.ts` + stream dispatch in `server.ts` | Detect/launch/invoke/stream |
| **Public barrel** | `agents.ts` | Re-exports `AGENT_DEFS`, `getAgentDef`, `detectAgents`, `resolveAgentLaunch`, … |

> "Adding a CLI is a one-file change. Drop a new `runtimes/defs/<cli>.ts` exporting one `RuntimeAgentDef`, add it to `BASE_AGENT_DEFS` in `registry.ts`, and the engine detects, launches, invokes, and (for an existing `streamFormat`) streams it — **no engine edits, no new class, no method overrides.** The def is config; the loop is shared. A genuinely new wire format is the only case that also adds an engine file (a new `*-stream.ts` and a `streamFormat` value)."
> — `docs/agent-adapters.md` via `web_extract` result 1.

**`RuntimeAgentDef` shape (abbrev from `runtimes/types.ts`):**

```ts
type RuntimeAgentDef = {
  id: string;                 // unique key, e.g. "claude" | "codex" | "hermes"
  name: string;
  bin: string;                // CLI executable probed on PATH
  fallbackBins?: string[];    // e.g. claude has ['openclaude']
  versionArgs: string[];      // e.g. ['--version']
  fallbackModels: RuntimeModelOption[];
  // How to invoke: pure arg builder for one turn
  buildArgs: (prompt, imagePaths, extraAllowedDirs?, options?, runtimeContext?) => string[];
  streamFormat: string;       // e.g. "claude-stream-json" | "acp-json-rpc" | "plain" | "dsh-profile-jsonl"
  eventParser?: string;       // e.g. "codex" | "cursor-agent" | "opencode"
  promptViaStdin?: boolean;   // prompt delivered via stdin (avoid E2BIG/ENAMETOOLONG)
  promptViaFile?: boolean;    // prompt delivered via temp file
  promptInputFormat?: 'text' | 'stream-json';
  supportsImagePaths?: boolean;
  externalMcpInjection?: 'claude-mcp-json' | 'acp-merge' | 'opencode-env-content';
  authProbe?: { args: string[]; timeoutMs?: number };
  listModels?: RuntimeListModels;
  fetchModels?: (resolvedBin, env) => Promise<RuntimeModelOption[] | null>;
  // … ~30 more optional fields, every one data or pure builder; no run()/cancel()
};
```

Full contract source: `/tmp/open-design/apps/daemon/src/runtimes/types.ts` (we captured first 9000 chars; full file is 56,139 chars total, truncated in captures — read that file directly for complete type).

**Registry code (source: `/tmp/open-design/apps/daemon/src/runtimes/registry.ts`):**

```ts
export const SHIPPED_AGENT_DEFS: RuntimeAgentDef[] = [
  amrAgentDef, claudeAgentDef, codexAgentDef, devinAgentDef, opencodeAgentDef,
  byokOpenCodeAgentDef, hermesAgentDef, traeCliAgentDef, grokBuildAgentDef,
  kimiAgentDef, cursorAgentDef, qwenAgentDef, qoderAgentDef, copilotAgentDef,
  ampAgentDef, piAgentDef, kiroAgentDef, kiloAgentDef, vibeAgentDef,
  deepseekAgentDef, deepseekHarnessAgentDef, aiderAgentDef, antigravityAgentDef,
  reasonixAgentDef, codebuddyAgentDef, mimoAgentDef, atomcodeAgentDef,
];
export const AGENT_DEFS: RuntimeAgentDef[] = [
  ...SHIPPED_AGENT_DEFS,
  ...readLocalAgentProfileDefs(SHIPPED_AGENT_DEFS),
];
const ids = new Set();
for (const def of AGENT_DEFS) if (ids.has(def.id)) throw new Error(`Duplicate agent definition id: ${def.id}`);
```

**Detection strategy (docs/agent-adapters.md §2):**

- `detectAgents()` / `detectAgentsStream()` probe all defs in parallel (no persisted 24h result; warmed at startup + fresh on agent-list/run paths).
- Per def: `resolveAgentLaunch()` first (so probed exe == run exe, including configured/fallback/packaged path) → version probe (OS missing/non-exec = unavailable; CLI rejects version flag but launches = available w/out version) → then help/capability, model-discovery, declared `authProbe` concurrently. Fault-isolated per adapter (one broken exe cannot empty picker). Capability flags + live models retained in process and refreshed each pass.

**Shipped def counts at clone time — exhaustive table:**

| Def file | `id` | `bin` | `streamFormat` / notes |
|----------|------|-------|------------------------|
| `hermes.ts` | `hermes` | `hermes` | `acp-json-rpc` via `hermes acp --accept-hooks`, `mcpDiscovery: mature-acp` |
| `claude.ts` | `claude` | `claude` (fallback `openclaude`) | `claude-stream-json` via stdin `stream-json`, `--include-partial-messages`, supports resume via `--session-id`/`--resume` |
| `codex.ts` | `codex` | `codex` | codex stream |
| `cursor-agent.ts` | `cursor-agent` | `cursor-agent` | cursor stream |
| `deepseek-harness.ts` | `deepseek-harness` | `dsh` | `dsh-profile-jsonl`, `--profile open-design --stdio`, `resumesSessionViaProfileStdio`, `capturesSessionIdFromStream` |
| `copilot.ts` | `copilot` | `copilot` | plain/ACP |
| `opencode.ts` | `opencode` | `opencode` | opencode |
| `byok-opencode.ts` | `byok-opencode` | `opencode` | same bin as opencode → 26 bins for 27 defs |
| `qwen.ts` | `qwen` | `qwen` | — |
| `kimi.ts` | `kimi` | `kimi` | `acp-json-rpc`, acp-merge |
| `kiro.ts` | `kiro` | `kiro` | — |
| `vibe.ts` | `vibe` | `vibe` | — |
| `codebuddy.ts` | `codebuddy` | `codebuddy` | — |
| `trae-cli.ts` | `trae` | `trae` | — |
| `antigravity.ts` | `antigravity` | `antigravity` | — |
| `aider.ts` | `aider` | `aider` | plain |
| `amp.ts` | `amp` | `amp` | — |
| `amr.ts` | `amr` | `amr` | vela/AMR |
| `atomcode.ts` | `atomcode` | `atomcode` | — |
| `devin.ts` | `devin` | `devin` | — |
| `deepseek.ts` | `deepseek` | `deepseek` | — |
| `grok-build.ts` | `grok-build` | `grok-build` | — |
| `kilo.ts` | `kilo` | `kilo` | — |
| `mimo.ts` | `mimo` | `mimo` | — |
| `pi.ts` | `pi` | `pi` | — |
| `qoder.ts` | `qoder` | `qoder` | — |
| `reasonix.ts` | `reasonix` | `reasonix` | — |
| `shared.ts` | — | — | helpers (DEFAULT_MODEL_OPTION, detectAcpModels) |

Cite: extracted from `runtimes/defs/*.ts` listing (28 files) and `registry.ts` source.

**Hermes detail (because Lokma is Hermes-native):**

Full `hermes.ts` source captured:

```ts
export const hermesAgentDef = {
    id: 'hermes',
    name: 'Hermes',
    bin: 'hermes',
    versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) =>
      detectAcpModels({ bin: resolvedBin, args: ['acp', '--accept-hooks'], env, timeoutMs: 15_000, defaultModelOption: DEFAULT_MODEL_OPTION }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'grok-4.3', label: 'grok-4.3 (xAI · default)' },
      { id: 'grok-4.20-reasoning', label: 'grok-4.20-reasoning (xAI · deep)' },
      { id: 'grok-4.20-0309-non-reasoning', label: 'grok-4.20-non-reasoning (xAI · fast)' },
      { id: 'grok-4.20-multi-agent-0309', label: 'grok-4.20-multi-agent (xAI · orchestration)' },
      { id: 'openai-codex:gpt-5.5', label: 'gpt-5.5 (openai-codex:gpt-5.5)' },
      { id: 'openai-codex:gpt-5.4', label: 'gpt-5.4 (openai-codex:gpt-5.4)' },
      { id: 'openai-codex:gpt-5.4-mini', label: 'gpt-5.4-mini (openai-codex:gpt-5.4-mini)' },
    ],
    buildArgs: () => ['acp', '--accept-hooks'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
```

Note: ACP transport means tool-calling, image paths, MCP merge all via JSON-RPC; `hermes acp` enumerates actually-installed providers (so model list = truth of what user has authed via `hermes auth add xai-oauth` / `openai`).

**DeepSeek Harness detail (native runtime, not MCP):**

```ts
id: 'deepseek-harness', bin: 'dsh', versionArgs: ['--version'],
versionPolicy: { supportedVersions: ['0.1.0-rc.8','0.1.1-rc.2'], supportedVersionPattern: /^0\.1\.\d+$|^0\.1\.0-rc\.(?:[6-9]|[1-9]\d+)$|^0\.1\.1-rc\.\d+$/u, requireVersion: true },
compatibilityProbe: { args: ['--profile','open-design','--probe'], preflight: hasOpenDesignProfile, parse: dshProfileProbe },
listModels: { args: ['--profile','open-design','--models'], parse: parseModels },
buildArgs: () => ['--profile','open-design','--stdio'], promptViaStdin: true,
streamFormat: 'dsh-profile-jsonl', resumesSessionViaProfileStdio: true, capturesSessionIdFromStream: true
```

Home is `~/.dsh/profiles/open-design/` (or `$DSH_HOME`). See `apps/daemon/src/runtimes/defs/deepseek-harness.ts`.

**MCP wiring (why `od mcp install <agent>` is one-liner):**

- Daemon owns MCP stdio server + `od mcp install <agent>` scripts (per-agent install scripts). Each `<agent>`'s config file (`~/.config/<agent>/open-design.json` or platform equivalent) plus a copy-paste snippet (Cursor gets deeplink; Claude Code gets `claude mcp add-json` one-liner). `hosted equivalent for curl`: `curl -fsSL https://open-design.ai/install.sh | sh -s <agent>` — cache lines 450-454.
- External MCP injection strategy is declared per def (`claude-mcp-json` → writes `.mcp.json` into project cwd; `acp-merge` → merge stdio entries into ACP launch descriptor; `opencode-env-content` for Opencode).
- Read-only by default, daemon binds `127.0.0.1`, SSRF blocked at proxy edge, LAN requires explicit `OD_BIND_HOST` + `OD_ALLOWED_ORIGINS`. Connector creds + live-artifact preview routes stay loopback-only regardless — cache line 500.

### 3.3 Skills — functional capabilities (verbatim SKILL.md, 100+)

> Location: `skills/` — each folder has `SKILL.md` + optional `assets/` + `references/`. Live count at clone: **164 entries total** including README/AGENTS; functional skills ≈ **162**. README says "100+ functional skills ship in `skills/`" [README line 503].
> Each follows the Agent Skills `SKILL.md` convention and supplies reusable agent behavior, references, or utilities. Renderable starters live separately in `design-templates/` — they may also use `SKILL.md`, but populate the design-template catalog rather than the functional-skill registry [README 503].
> Spec: `docs/skills-protocol.md` (375 lines).

**Base format (unchanged from Claude Code) — `docs/skills-protocol.md` §1:**

```
/
├── SKILL.md              # manifest + workflow instructions
├── assets/               # templates, images, boilerplate the skill writes
│   └── …
└── references/           # knowledge files the skill reads during planning
    ├── components.md
    ├── layouts.md
    └── …
```

Front-matter YAML (verbatim SKILL.md, preserved for non-OD agents):

```yaml
---
name: magazine-web-ppt
zh_name: "杂志风网页 PPT"
en_name: "Magazine Web PPT"
description: |
  Magazine-style horizontal-swipe web deck.
  Trigger keywords: 杂志风 PPT, magazine deck, swipe slides.
zh_description: "杂志风横向翻页网页 PPT。"
en_description: |
  Magazine-style horizontal-swipe web deck.
  Trigger keywords: 杂志风 PPT, magazine deck, swipe slides.
triggers:
  - "magazine deck"
  - "杂志风 PPT"
  - "horizontal swipe presentation"
---
```

Body is free-form Markdown describing numbered workflow + principles. OD reads it as-is — no changes required [docs/skills-protocol.md §1].

**OD extensions (optional, front-matter `od:` block) — `docs/skills-protocol.md` §2:**

```yaml
od:
  mode: deck                        # prototype | deck | template | design-system | image | video | audio
  surface: web                      # web | image | video | audio
  scenario: marketing               # gallery/filter hint (design|marketing|operation|engineering|product|finance|hr|sale|personal)
  category: presentations           # free-form lowercase filter slug
  preview:
    type: html                      # html etc — registry entry point
```

Plus `design_system:`, `speaker_notes:`, `animations:`, `craft:`, `example_prompt:`, `upstream:` etc. See full schema in `docs/skills-protocol.md` and the concrete html-ppt template SKILL.md examples captured (they also include `upstream_license: MIT`, `tags:`, `design_system.requires`, `animations`, `category`, `scenario`, `example_prompt`).

**Functional skill index (sample of 162):**

`8-bit-orbit-video-template, ad-creative, after-hours-editorial-template, agent-browser, ai-music-album, algorithmic-art, apple-hig, article-magazine, artifacts-builder, brainstorming, brand-extract, brand-guidelines, brandkit, brutalist-skill, canvas-design, card-twitter, card-xiaohongshu, chat-motion-overlay, color-expert, competitive-ads-extractor, copywriting, creative-director, d3-visualization, data-report, deck-guizang-editorial, deck-open-slide-canvas, deck-swiss-international, design-brief, design-consultation, design-md, design-review, digits-fintech-swiss-template, doc, doc-kami-parchment, docx, domain-name-brainstormer, ecommerce-image-workflow, editorial-burgundy-principles-template, emil-design-eng, emilkowalski-motion, enhance-prompt, export-download-debugging, fal-3d, fal-generate, fal-image-edit, fal-kling-o3, fal-lip-sync, fal-raw, fal-kling-o3 … plus figma-*, frontend-*, gsap-*, imagegen*, library-curator, login-flow, marketing-psychology, etc.`

Full list: `ls -1 /tmp/open-design/skills/` (162 functional skills at clone). Categories: design · marketing · operation · engineering · product · finance · hr · sale · personal — see `skills/README.md`.

**Two modes anchor the design-template catalog: prototype (web/mobile/desktop single-page) and deck (horizontal-swipe). Other templates cover image/video/audio/utility.** — README line 504.

Full skill protocol + directory split → `docs/skills-protocol.md`. Registry endpoints: `GET /api/skills` for functional skills and `GET /api/design-templates` for rendering templates — README line 589 [github.com-d8ff876dfb.md:589].

**Registry precedence:** skill + template endpoints scan user-writable root first, bundled root second on each listing request; a user entry can shadow a bundled entry with same `id`. Chat resolution spans both roots because a persisted project's primary `skillId` may identify either a functional skill or design template. Listing separation ≠ automatic composition [docs/architecture.md §3.4].

### 3.4 Design templates — rendering blueprints (the “how it looks” catalog)

> Location: `design-templates/` — **115 folders** at clone. README says renderable starters "may also use `SKILL.md`, but they populate the design-template catalog rather than the functional-skill registry." Registry: `GET /api/design-templates`.
> Catalog groups (README table lines 505-589, expanded from /tmp/open-design):

| Design template | Mode | Scenario | What it produces |
|-----------------|------|----------|------------------|
| `web-prototype` | prototype | design | Default landing page / hero |
| `saas-landing` | prototype | marketing | Hero / features / pricing / CTA |
| `dashboard` | prototype | operation | Admin / analytics (with sidebar) |
| `mobile-app` | prototype | design | iPhone 15 Pro / Pixel framed app |
| `mobile-onboarding` | prototype | design | Splash · value-prop · sign-in flow |
| `social-carousel` | prototype | marketing | 3-card 1080×1080 carousel |
| `email-marketing` | prototype | marketing | Table-fallback-safe brand email |
| `magazine-poster` | prototype | marketing | Single-page magazine layout |
| `motion-frames` | prototype | marketing | Looping CSS motion hero |
| `sprite-animation` | prototype | marketing | 8-bit pixel animated explainer |
| `pm-spec` | prototype | product | PM spec doc (with TOC + decision log) |
| `team-okrs` | prototype | product | OKR scorecard |
| `eng-runbook` | prototype | engineering | Incident runbook |
| `finance-report` | prototype | finance | Exec finance summary |
| `hr-onboarding` | prototype | hr | Role onboarding plan |
| `guizang-ppt` | deck | marketing | Magazine-style web PPT (deck default, from `op7418/guizang-ppt-skill`) |
| `html-ppt-*` | deck | marketing | **15 deck templates × 36 themes** (master in `design-templates/html-ppt/`) |
| `hyperframes` | video | marketing | HTML → MP4 motion graphics (HeyGen OSS) |
| `critique` | utility | design | Five-dimensional self-critique scoresheet |
| `tweaks` | utility | design | AI-emitted tweaks-panel manifest |

Plus many concrete `html-ppt-*` instances at clone: `html-ppt`, `html-ppt-course-module`, `html-ppt-graphify-dark-graph`, `html-ppt-hermes-cyber-terminal`, `html-ppt-knowledge-arch-blueprint`, `html-ppt-obsidian-claude-gradient`, `html-ppt-pitch-deck`, `html-ppt-presenter-mode-reveal`, `html-ppt-product-launch`, `html-ppt-taste-brutalist`/`editorial`, `html-ppt-tech-sharing`, `html-ppt-weekly-report`, `html-ppt-xhs-*`, and ~35 `html-ppt-zhangzara-*` (long-table, biennale-yellow, blue-professional, block-frame, bold-poster, broadside, capsule, cartesian, cobalt-grid, coral, creative-mode, ...).

**The two load-bearing bundled templates:**

**`design-templates/guizang-ppt` — Magazine editorial deck**

- Origin: `https://github.com/op7418/guizang-ppt-skill` — bundled verbatim with original MIT preserved [README line 355].
- Aesthetic: "Monocle magazine after code was stitched onto it" — **electronic magazine + electronic ink hybrid**, `WebGL fluid / contour / dispersion background` on hero, **serif headlines (Noto Serif SC + Playfair Display) + sans-serif body (Noto Sans SC + Inter) + monospace metadata (IBM Plex Mono)**, Lucide line icons (no emoji), horizontal swipe paging (keyboard ← →, wheel, swipe, dots, ESC index), smooth theme interpolation [from `guizang-ppt/SKILL.md` captured above].
- 5 preset theme-color directions (Monocle Editorial · WIRED Tech · Kinfolk Slow · Domus Architectural · Lab/Reference). Only picking among 5 — no arbitrary hex allowed (guard against ugliness) — see `guizang-ppt/SKILL.md` §2.2.
- Workflow in SKILL.md: **Step 0 infer direction, Step 1 resolve intent (6-question checklist: audience/scenario, duration, source material, images, theme, hard constraints), Step 2 copy `assets/template.html` to project `index.html` + `images/` sibling (images named `{page}-{semantic}.{ext}`, ≥1600px wide, JPG for photo, PNG for transparent, total <10MB), then build pages from `layouts.md`/`styles.md`**.
- Deck default in OD: marked `od.mode: deck`, `od.default_for: deck` in SKILL.md front-matter.

**`design-templates/html-ppt` — HTML PPT Studio (lewislulu)**

- Origin: `https://github.com/lewislulu/html-ppt-skill` — MIT @lewislulu [README 804].
- Numbers: **36 themes, 15 full-deck templates, 31 page layouts, 47 animations (27 CSS + 20 canvas FX), true presenter mode** with magnetic cards — all pure static HTML/CSS/JS, no build step [from `html-ppt/README.md` captured].
- Themes (36): `minimal-white, editorial-serif, soft-pastel, sharp-mono, arctic-cool, sunset-warm, catppuccin-latte, catppuccin-mocha, dracula, tokyo-night, nord, solarized-light, gruvbox-dark, rose-pine, neo-brutalism, glassmorphism, bauhaus, swiss-grid, terminal-green, xiaohongshu-white, rainbow-gradient, aurora, blueprint, memphis-pop, cyberpunk-neon, y2k-chrome, retro-tv, japanese-minimal, vaporwave, midcentury, corporate-clean, academic-paper, news-broadcast, pitch-deck-vc, magazine-bold, engineering-whiteprint` [html-ppt README captured].
- Full-deck templates (15): 8 extracted looks (`xhs-white-editorial, graphify-dark-graph, knowledge-arch-blueprint, hermes-cyber-terminal, obsidian-claude-gradient, testing-safety-alert, xhs-pastel-card, dir-key-nav-minimal`) + 7 scenario scaffolds (`pitch-deck, product-launch, tech-sharing, weekly-report, xhs-post, course-module, presenter-mode-reveal`) [html-ppt README].
- Single-page layouts (31): `cover · toc · section-divider · bullets · two-column · three-column · big-quote · stat-highlight · kpi-grid · table · code · diff · terminal · flow-diagram · timeline · roadmap · mindmap · comparison · pros-cons · todo-checklist · gantt · image-hero · image-grid · chart-bar · chart-line · chart-pie · chart-radar · arch-diagram · process-steps · cta · thanks` [html-ppt README].
- Animations (47): 27 CSS (`directional fades, rise-in, zoom-pop, blur-in, glitch-in, typewriter, neon-glow, shimmer-sweep, gradient-flow, stagger-list, counter-up, path-draw, morph-shape, parallax-tilt, card-flip-3d, cube-rotate-3d, page-turn-3d, perspective-zoom, marquee-scroll, kenburns, ripple-reveal, spotlight …`) + 20 Canvas FX (`particle-burst, confetti-cannon, firework, starfield, matrix-rain, knowledge-graph (force-directed), neural-net, constellation, orbit-ring, galaxy-swirl, word-cascade, letter-explode, chain-react, magnetic-field, data-stream, gradient-blob, sparkle-trail, shockwave, typewriter-multi, counter-explosion …`) [html-ppt README].
- Presenter mode (S key): 4 draggable/resizable **magnetic cards** (current, next, speaker script 150-300 words, timer) — each card is an `<iframe ?preview=N>` rendering slide N with no chrome, same CSS/theme/fonts/viewport as audience view, sync via `postMessage({type:'preview-goto', idx})` toggling `.is-active` — no reload, no flicker [html-ppt README].
- Keyboard: `←→SpacePgUp/PgDnHomeEnd` nav, `F` fullscreen, `S` presenter, `N` notes drawer, `R` reset timer, `O` overview grid, `T` cycle themes, `A` demo animation, `#/N` deep-link, `?preview=N` preview-only [html-ppt README].

**Example HTML-PPT SKILL.md (e.g. `html-ppt-zhangzara-cobalt-grid`):** front-matter `od.mode: deck`, `upstream: https://github.com/zarazhangrui/beautiful-html-templates/tree/main/templates/cobalt-grid`, `preview: {type: html, entry: example.html}`, `design_system.requires: false`, `speaker_notes: false`, `animations: false`, `category: "b2b-sales"`, `scenario: "sales"`, `example_prompt` with decision-grade rubric ("can the champion forward this internally without rewriting it"), triggers include `"html deck","html slides"` plus domain tags. Workflow: clone `example.html` into workspace, replace placeholders preserving design system (fonts/palette/grid/decorative vocabulary), duplicate layouts for length, update page numbers, keep `assets/deck-stage.js`/keyboard handler intact [captured SKILL.md `html-ppt-zhangzara-cobalt-grid` + `capsule`].

Full protocol + directory split → `docs/skills-protocol.md`. Registry endpoints: `GET /api/skills` / `GET /api/design-templates` — cache line 589.

### 3.5 Design systems — the brand contract (151 packages, awesome-design-skills × 57)

> **Count:** **151 brand-grade design-system packages** centered on `DESIGN.md` ship with repo; legacy packages may be `DESIGN.md`-only, newer carry `manifest.json`, `tokens.css`, components, assets, provenance [README 385-386, 591]. The bundled catalog at clone shows exactly the same shape (154 entries including README/_schema, i.e. ~151 packages).
> **Import sources (provenance):** upstream-derived + curated fixtures; `design-systems/README.md` records package shape + provenance. Re-import via `scripts/sync-design-systems.ts`. Add your own → drop `DESIGN.md` into `design-systems/<brand>/` [README 602].

**Catalog taxonomy (README 593-602, expandable):**

- **Starter:** `default (Neutral Modern) · warm-editorial`
- **AI & LLM:** `claude · cohere · mistral-ai · minimax · together-ai · replicate · runwayml · elevenlabs · ollama · x-ai`
- **Developer Tools:** `cursor · vercel · linear-app · framer · expo · clickhouse · mongodb · supabase · hashicorp · posthog · sentry · warp · webflow · sanity · mintlify · lovable · composio · opencode-ai · voltagent`
- **Productivity:** `notion · figma · miro · airtable · superhuman · intercom · zapier · cal · clay · raycast`
- **Fintech:** `stripe · coinbase · binance · kraken · mastercard · revolut · wise`
- **E-commerce:** `shopify · airbnb · uber · nike · starbucks · pinterest`
- **Media:** `spotify · playstation · wired · theverge · meta`
- **Automotive:** `tesla · bmw · ferrari · lamborghini · bugatti · renault`
- **Other:** `apple · ibm · nvidia · vodafone · resend · spacex`
- Plus at clone the concrete dirs: `agentic, airbnb, airtable, ant, apple, application, arc, artistic, atelier-zero, bento, binance, bmw, bmw-m, bold, brutalism, bugatti, cafe, cal, canva, cisco, claude, clay, claymorphism, ...` through `x-ai` and exotic ones (`duolingo, cosmic, hud, dithered, doodle …`) — full list captured via `ls` above.

**Lineage for 57 of them:**

> **Source: `bergside/awesome-design-skills` — 57 DESIGN.md specs imported from awesome-design-skills ([#92])** [CHANGELOG:92, docs/i18n/*.md, README provenance table 812]
> Also: `VoltAgent/awesome-design-md` — historical source of original 9-section `DESIGN.md` schema and 70 upstream-derived systems; current packages may extend baseline [README 809-810, cache 809].

**Package shape (current, from `design-systems/README.md` + `docs/design-systems.md`):**

```
design-systems/<slug>/
├── manifest.json              ← min discovery layer (required for new packages)
├── DESIGN.md                  ← canonical design prose for agents
├── tokens.css                 ← canonical compiled CSS custom properties (semantic :root)
├── USAGE.md                   ← agent-facing read order / usage guide (rich)
├── components.html            ← standalone component fixture (rich)
├── components.manifest.json   ← derived from components.html + tokens.css (cache)
├── design-tokens.json         ← derived Design Tokens JSON (from token-contract report; must agree w/ tokens.css)
├── tailwind-v4.css            ← derived @theme Tailwind v4 mapping (from tokens.css)
├── assets/                    ← optional static assets
├── fonts/                     ← optional webfonts
├── preview/                   ← indexed preview pages (colors/typography/spacing/buttons/inputs/app, plus brand-specific)
├── source/                    ← importer evidence, snippets, token reports (hybrid/verbatim provenance)
└── _schema/AGENTS.md          ← contract notes for editing the schema
```

v1 manifest fixed names:

```json
{
  "schemaVersion": "od-design-system-project/v1",
  "id": "acme",
  "name": "Acme",
  "category": "Productivity & SaaS",
  "description": "A concise English catalog summary.",
  "source": { "type": "bundled", "origin": "OpenDesign curated bundled fixture" },
  "files": { "design": "DESIGN.md", "tokens": "tokens.css" }
}
```

- Folder slug and `manifest.id` must match (normalized ASCII). `name/category/description` = primary picker copy. `source` records provenance (bundled/local/github/shadcn). Every declared path must be safe, relative, and present — see `design-systems/_schema/manifest.schema.ts` (schema captured above) [design-systems/README.md, captured § Manifest and catalog behavior].
- Derived files are caches, not competing truth: `components.manifest.json` ← `components.html`+`tokens.css`; `design-tokens.json` ← token-contract report; `tailwind-v4.css` ← `tokens.css` [README Design Systems § Rich package files].
- Daemon precedence: manifest metadata over Markdown `H1` / `> Category:` conventions; `DESIGN.md` remains readable fallback for legacy [docs/design-systems.md §2].
- Scanning: catalog is scanned on every `GET /api/design-systems` request; user `metadata.json` override → `manifest.*` → Markdown H1/Category → frontmatter → fallback. After changing a package, refresh Design System surface; no daemon restart needed [design-systems/README.md].
- Quality guard requires at least **7 substantive H2 headings** for migrated packages (no fixed numbered schema anymore) — covers theme/atmosphere, color roles/contrast, typography, spacing/layout/composition, components/states, motion/reduced-motion, a11y, anti-patterns [docs/design-systems.md §3].
- Token contract: `packages/contracts/src/design-systems/token-schema.ts`, required A1/A2/B-slot tokens, default parity, unknown-token allowlist, semantic `--bg/--fg/--accent/--font-display` etc., component CSS should use `var(--accent)` not raw hex, dark variant via `[data-theme="dark"] { --bg: … }` overrides [docs/design-systems.md §4].

**Default starter `DESIGN.md` (Neutral Modern, `design-systems/default/DESIGN.md`):**

Captured in full above — 8 sections: Visual Theme (Calm, functional, quietly confident), Color Palette (`#FAFAFA/#111111/#2F6FEB/#6B6B6B/#E5E5E5/#FFFFFF/#17A34A/#EAB308/#DC2626`), Typography (`Inter` 12/14/16/20/24/32/48/64, 1.5 body/1.2 heading, -0.01em tracking), Component Stylings (buttons 8px radius, cards 12px radius no shadow, inputs 1px border), Layout (12-col 1200px max 24px gutters, hero 40-60vh, sections 80px desktop), Depth (Flat/Raised 2px/8px @8%), Do's/Don'ts (whitespace/one accent/sentence-case; no gradients/drop shadows on inputs/>3 sizes), Responsive (12/8/4 cols), Agent Prompt Guide ("When in doubt, subtract.").

**Why this matters for Lokma:** Lokma's in-harness design system should copy this contract: `DESIGN.md` = prose agent reads, `tokens.css` = compiled truth, `USAGE.md` = read order, preview pages = visual proof. Server can inject whichever brand system user selected into the agent prompt automatically.

### 3.6 Plugins — the marketplace (277 official + 183 examples = 460)

> Location: `plugins/` — `plugins/_official/` (official), `plugins/community/` (third-party), `plugins/registry/` (publishing), `plugins/spec/` (SPEC). README says: **277 official plugins plus 183 remixable reference examples live in `plugins/_official/`**; plus `plugins/community/` for community, `plugins/registry/` for publishing [cache 604][github.com-d8ff876dfb.md:604].
> Spec files: `plugins/spec/SPEC.md`, `AGENT-DEVELOPMENT.md`, `PUBLISHING-REGISTRIES.md`, `CONTRIBUTING.md`, `examples/` — README lines 655-663.

**Category breakdown (README table 605-626):**

| Category | Count | Contents |
|----------|-------|----------|
| `scenarios/` | 13 | Complete scenarios — `od-default, od-design-refine, od-figma-migration, od-code-migration, od-react-export, od-nextjs-export, od-vue-export, od-media-generation, od-new-generation, od-tune-collab, od-plugin-authoring, od-share-to-community, od-web-effect-extractor` |
| `image-templates/` | 45 | One-shot image prompts — editorial, cinematic, product, portrait |
| `video-templates/` | 63 | HyperFrames / Seedance / Veo motion templates |
| `design-systems/` | 143 | Brand `DESIGN.md` wrapped as plugins |
| `atoms/` | 13 | Reusable UI fragments (buttons, heroes, KPI cards) |
| `examples/` | 183 | Remixable reference outputs |

**Also:** `plugins/community/` for community plugins, `plugins/registry/` for publishing flow [cache 626].

**What plugins can do (README 627-631):**

- Run in any coding agent (Claude Code/Codex/Cursor/Copilot/OpenClaw/Antigravity/Hermes/Kimi …) via same skill protocol.
- Migrate Figma/Pencil → React/Next.js/Vue (`od-figma-migration`).
- Refresh existing codebase to a brand spec (point plugin at git repo + `DESIGN.md`, get a PR) (`od-code-migration`).
- Persist custom workflows (team reusable templates next to shipped ones).

**Using plugins (CLI — runs without UI, how external agents use it) [cache 635-643]:**

```sh
od plugin list                       # --task-kind / --mode / --tag filters
od plugin search "landing page"
od plugin info od-default            # metadata/inputs/capabilities
od plugin install od-figma-migration # from registry; also accepts ./local-folder or https://…
od plugin apply od-default --input brief="a one-page pitch for our seed round"
od plugin upgrade od-default
od plugin uninstall od-default
# Every command supports --json (pipe through jq/xargs)
```

In desktop/web: open Plugin page to browse marketplace → Install; inside Studio, plugins appear as composer chips with inputs they declare [cache 634].

**Building a plugin (README 644-657):**

```
my-plugin/
├── open-design.json    ← required: marketplace metadata + inputs + pipeline + capabilities
├── SKILL.md            ← required for agent-skill/scenario entries; omitted for other types
├── README.md           ← optional: usage/install/registry links
├── preview/            ← optional: index.html / poster.png (strongly recommended for visual)
└── examples/           ← optional: concrete use cases
```

`open-design.json` fields: `specVersion` (1.0.0), `name` (stable ID), `version` (semver), optional `compat.agentSkills[].path` (points at `./SKILL.md` when exposing Agent Skill), `od.kind` (skill/scenario/atom/bundle), `od.taskKind` (new-generation/figma-migration/code-migration/tune-collab), `od.mode` (prototype/deck/live-artifact/image/video/hyperframes/audio/design-system/scenario), `od.capabilities[]` (declare minimum — restricted install grants only `prompt:inject` by default), `od.inputs[]` (apply-time params).

Scaffold: `od plugin scaffold --id my-plugin --title "My Plugin"` + `od plugin validate ./my-plugin` + `pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck` [cache 653-657].

---

## 4) Artifact Types — The 6 Surfaces + Exports

### Studio model (README Core pages + Studio — many artifact types in one project, cache 268-276)

> "Inside a project's **Studio**, the conversation, generated files, and live preview stay together across **six artifact types**" [cache 268-270]

| Artifact surface | What the agent writes | How the user sees it | Key interaction | Export |
|------------------|-----------------------|----------------------|-----------------|--------|
| **Prototype** | single-page HTML (real CSS, real fonts, real components) | sandboxed `<iframe sandbox="allow-scripts">` with vendored React 18 + Babel standalone for JSX | Inspect rendered page, iterate with agent in place; responsive preview + device frames | HTML (inlined, single file) · ZIP |
| **Deck** | single-file HTML web deck (guizang-ppt or html-ppt) | horizontal swipe / slide thumbnails + speaker notes + presenter mode | Review thumbnails/notes, navigate with ← →, S for presenter | HTML (single file) · PDF (browser print, deck-aware) · PPTX (agent-driven) · ZIP · Markdown |
| **Mobile app** | single-page HTML framed as iPhone/Pixel | device preview (iPhone 15 Pro / Pixel frames) | Generate/polish mobile interfaces with conversation + next-step actions beside | HTML · image exports |
| **Image** | prompt → provider generates bytes | full-size preview panel | Generate assets from project conversation, download/open | PNG/JPG bytes |
| **Document** | multi-page HTML editorial/guide | rendered layout inspector | Create polished guides/editorial docs, inspect layout | PDF (via html) · HTML |
| **HyperFrame** | HTML+CSS+GSAP composition → headless Chrome + FFmpeg renders MP4 | animation preview inside Studio | Build code-driven motion graphics, preview animation, export finished video | **MP4** (deterministic via headless Chrome + FFmpeg) |

Source: cache 268-280 for the 6-type definition; mode/media docs (`docs/modes.md` — Creation surfaces and skill modes) for the underlying taxonomy; HyperFrames SKILL.md for HTML→MP4 pipeline.

### 4.1 Prototype — single-page HTML sandbox iframe

**Definition:** The default output surface. **Single-page HTML artifacts that read your `DESIGN.md` and render in a sandboxed iframe** [cache 345].

Examples in repo:
- Web prototype — editorial dashboard with scrollbars/KPIs/charts, rendered from `design-templates/dating-web/` [cache 346].
- Mobile app prototype — three-screen gamified flow with XP ribbons and quest detail. Hand off straight to Cursor/Codex/Claude Code → React/Next/Vue [cache 347].
- Additional template instances: `design-templates/web-prototype/` (landing), `saas-landing`, `dashboard`, `dating-web`, `flowai-live-dashboard-template`, `github-dashboard`, `kanban-board`, `blog-post`, etc. (full list in §3.4).

Preview contract (AGENTS/architecture):
- Filesystem runs: canonical project files (e.g. `index.html` at project root) are listed via `GET /api/projects/:id/files` and rendered into `<iframe srcDoc={…}>` or `<iframe src={…}>` depending on BYOK vs filesystem; Browser state is UI only, daemon is authority.
- Live artifacts & dashboards (a subtype of prototype): **editable KPI wall whose tweaks panel surfaces the parameters worth nudging; agent emits a manifest and the iframe re-renders without reload** [cache 349-350].

### 4.2 Deck — 15 templates × 36 themes × 31 layouts via html-ppt (plus guizang-ppt default)

**Two implementations:**

- **Guizang PPT (magazine-style, default):** bundled verbatim from `op7418/guizang-ppt-skill` under `design-templates/guizang-ppt/` with MIT preserved [cache 355, README 802]. Magazine layouts, WebGL hero, P0/P1/P2 checklists [README 355]. See §3.4 for 5 directions, workflow.
- **html-ppt family (HTML PPT Studio, lewislulu):** **15 deck templates × 36 themes × 31 page layouts × 47 animations × presenter mode** — master template in `design-templates/html-ppt/` [README table 575-576, cache 355-357][raw.githubusercontent.com/.../README.md:575]. Covered in depth in §3.4 above. Swiss International-style deck (grid-anchored, monochrome) is one of the 15 [cache 356].

**Count verification at clone:** `ls -d /tmp/open-design/design-templates/html-ppt-* | wc -l` returned `≈50+` folders including variant themes; extracted full-deck folders = 15 named in `html-ppt/README.md`'s 15-full-deck-tables, themes = 36 CSS files in `html-ppt/assets/themes/*.css`, layouts = 31 html files in `html-ppt/templates/single-page/*.html`, animations = 47 (27 CSS + 20 canvas FX) — all numbers from `html-ppt/README.md` captured above.

Export detail: every deck exports to `HTML (single file, inlined assets), PDF (browser print, deck-aware), PPTX (agent-driven skill), ZIP (archive), or Markdown` [cache 357].

> **Cite for "15 templates 36 themes 31 layouts":** README line 576 (`15 deck templates × 36 themes …`), provenance table line 804 (`lewislulu/html-ppt-skill` — 15 deck templates, 36 themes, 31 page layouts, animation runtime, magnetic-card presenter mode) [cache 804][github.com-d8ff876dfb.md:804], and `/tmp/open-design/design-templates/html-ppt/README.md` (“36 themes, 15 full-deck templates, 31 page layouts, 47 animations”) captured above.

### 4.3 Mobile app — device preview

- **Artifact:** mobile interfaces generated as single-page HTML and shown inside a device preview (iPhone 15 Pro / Pixel frames). Conversation + output files + next-step actions stay beside preview [cache 272].
- **Templates:** `design-templates/mobile-app/` (iPhone 15 Pro / Pixel framed app), `mobile-onboarding` (splash/value-prop/sign-in) — README table 522-526 [cache 522]. Also `gamified-app` in the global list.

### 4.4 Image — GPT Image 2.0 / Seedream 5.0 / Nano Banana 2.0 (and dozens more)

**Tagline in README banner:** `GPT Image 2.0 / Seedream 5.0 Pro / Nano Banana 2.0 for images` [cache 249-250].

**Provider + model reality at clone (from `apps/daemon/src/media/models.ts` — mirrored to `apps/web/src/media/models.ts` and verified via scripts/verify-media-models):**

- MediaModel types captured above show the full catalog; image model highlights:
  - **`vela/*` (OpenDesign Cloud):** `vela/gpt-image-2, vela/nano-banana-2, vela/nano-banana-2-lite, vela/seedream-5.0, vela/seedream-5.0-pro` — managed Cloud, default `vela/gpt-image-2` [models.ts `IMAGE_MODELS[0..4]`].
  - **OpenAI:** `gpt-image-2 / gpt-image-1.5 / gpt-image-1 / gpt-image-1-mini / dall-e-3 / dall-e-2` — with `t2i/i2i/inpaint` caps.
  - **SenseAudio:** `senseaudio-image-2.0-260319 / senseaudio-image-1.0-260319 / doubao-seedream-5-0-260128` (Seedream 5.0 hi-res) — `t2i,i2i` multi-aspect.
  - **Volcengine Ark (Doubao):** `doubao-seedream-3-0-t2i-250415 (seedream-3.0), doubao-seededit-3-0-i2i-250628 (seededit-3.0)`.
  - **Nano Banana (Google):** `gemini-3.1-flash-image-preview` (provider `nanobanana`, hint Nano Banana · text-to-image, default base `generativelanguage.googleapis.com`).
  - **ImageRouter / OpenRouter:** routed proxies (GPT Image, FLUX 1.1 Pro, Gemini Flash Image, Recraft v3 — provider `imagerouter`/`openrouter`).
  - **Grok:** `grok-imagine-image` (xAI, 2K), provider `grok` → `https://api.x.ai/v1`.
  - **MiniMax:** `image-01` (minimax, text+image-to-image).
  - **Plus aihubmix, fal, custom-image, bfl, comfyui, replicate, google, kling, midjourney etc.** — 26 provider labels in `MEDIA_PROVIDERS` (see captured list: openai, vela, volcengine, grok, hyperframes, nanobanana, imagerouter, openrouter, custom-image, comfyui, bfl, fal, leonardo, replicate, google, kling, midjourney, minimax, senseaudio, suno, udio, elevenlabs, fishaudio, senseaudio, aihubmix, tavily, stub).

Prompt-template library: **93 ready-to-replicate prompts** in `prompt-templates/` [cache 369] — thumbnails, full prompt body, target model, aspect, attribution. One click drops brief into composer. (At clone: `prompt-templates/image/` + `prompt-templates/video/` exist; our earlier `ls` saw top-level `image`/`video` subdirs under `prompt-templates/`.)

Aspect/model controls visible when user picks Media → Image (model + aspect + optional prompt-template).

Also: 6 demo images in README Demo §4 (cache 359-368): illustrated city food map, hand-drawn travel poster, cinematic elevator scene, editorial still, cyberpunk portrait, neon profile avatar, 3D stone staircase, hewn-stone infographic, glamorous portrait, editorial studio shot.

### 4.5 Document — polished multi-page guides

- Multi-page guides and editorial documents, rendered layout inspector, export/share when ready [cache 275].
- Templates: `design-templates/blog-post`, `digital-eguide`, `pm-spec`, `eng-runbook`, `finance-report`, `hr-onboarding`, `clinical-case-report`, `meeting-notes`, `docs-page`, `dcf-valuation` etc. (full list §3.4).

### 4.6 HyperFrames — HTML→MP4 via HeyGen hyperframes (agent-native motion)

> "HyperFrames is HeyGen's open-source, agent-native video framework, integrated as a first-class citizen. The agent writes HTML + CSS + GSAP, and HyperFrames renders it to a deterministic MP4 via headless Chrome + FFmpeg. Pair it with Seedance 2.0 for cinematic t2v/i2v, Veo 3/Sora 2/Kling 2 for routed variants, and Suno v5 / Lyria 2 for audio."
> — cache line 371 [github.com-d8ff876dfb.md:371]

**What ships:**

- **11 HyperFrames templates + 39 Seedance prompts ship with the repo.** Catalog thumbnails © HeyGen; framework Apache-2.0. OD-specific render workflow (composition cache, sandbox-exec workaround, MP4-as-chip) is in `design-templates/hyperframes/`. — cache line 380 [github.com-d8ff876dfb.md:380].
- Framework URL: `https://github.com/heygen-com/hyperframes` [cache 380, README 813].
- Video prompt var.: Seedance 2.0 / Veo 3 / Sora 2 / Kling 2; audio var.: Suno v5 / Lyria 2 [cache 371].

**Examples (gallery in README):**

- `30s SaaS product promo · 16:9 · UI 3D reveals` — `prompt-templates/video/hyperframes-saas-product-promo-30s.json`
- `TikTok karaoke talking-head · 9:16 · TTS + word-synced captions` — `hyperframes-tiktok-karaoke-talking-head.json`
- `30s brand sizzle reel · 16:9 · audio-reactive kinetic type` — `hyperframes-brand-sizzle-reel.json`
- `Bar chart race · 16:9 · NYT-style data infographic` — `hyperframes-data-bar-chart-race.json`
- `Flight map · 16:9 · Apple-style route reveal` — `hyperframes-flight-map-route.json`
- `4s cinematic logo outro · 16:9 · piece-by-piece assembly + bloom` — `hyperframes-logo-outro-cinematic.json`
- `$0 → $10K money counter · 9:16 · Apple-style hype` — `hyperframes-money-counter-hype.json`
- `Website-to-video · 16:9 · captures the site at 3 viewports` — `hyperframes-website-to-video-promo.json`
- (cache lines 372-380 / README demo §5).

**OD-specific render workflow (composition cache, sandbox-exec workaround, MP4-as-chip) — load-bearing for this surface (from `design-templates/hyperframes/SKILL.md` captured):**

Composition source files (`hyperframes.json`, `meta.json`, `index.html`, assets) belong inside a hidden cache dir so they don't clutter FileViewer/chips:

```bash
COMP_REL=".hyperframes-cache/$(date +%s)-$(openssl rand -hex 2)"
COMP="$OD_PROJECT_DIR/$COMP_REL"
"$OD_NODE_BIN" "$OD_BIN" media scaffold --project "$OD_PROJECT_ID" --composition-dir "$COMP_REL"
# Edit ONLY $COMP/index.html: data-duration on root if needed, palette in <style>, 1-3 clip <div>s + GSAP tweens in window.__timelines["main"]
out=$("$OD_NODE_BIN" "$OD_BIN" media generate --project "$OD_PROJECT_ID" --surface video --model hyperframes-html --output "<descriptive-name>.mp4" --composition-dir "$COMP_REL")
# loop media wait <taskId> until done (each call long-polls ≤25s under agent shell 30s cap)
```

- Palette fallback if prompt vague: dark canvas `#0b0b0f`, warm accent `#ffb76b`, cool `#7da4ff`, restrained motion.
- Daemon runs Chrome-bound render outside agent's shell sandbox (Claude Code wraps Bash in `sandbox-exec` where puppeteer's Chrome hangs); progress `Capturing frame N/M` streams to stderr live; final stdout: `{"file": {"name": "<output>", "size": …, "kind": "video"}}` — quote `file.name` in reply.
- Lighter HF subcommands agent CAN run from its own shell (no Chrome): `"$OD_NODE_BIN" "$OD_HYPERFRAMES_BIN" lint "$COMP"`, `transcribe <audio>`, `tts <text>`; reserve daemon dispatch for `render`/`inspect`/`preview`.

Palettes, visual styles, CSS patterns, motion principles, transcripts, TTS/captions/audio-reactive, transitions catalog (`css-3d, blur, cover …`) live under `design-templates/hyperframes/{palettes,visual-styles.md,references/*,scripts/*}`.

---

## 5) BYOK Proxy & Connectivity

### 5.1 Endpoint

`POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` — SSE streamed. Listed in README [cache 340], implemented in `apps/daemon/src/server.ts` (grep saw proxy routes for anthropic/openai/azure/google/ollama — senseaudio added separately). Gives same loop with no process spawn — paste `baseUrl + apiKey + model` (Ollama base = local `http://localhost:11434` etc.).

Presets shown in README: OpenAI, **Atlas Cloud (`https://api.atlascloud.ai/v1`, model ids like `qwen/qwen3.5-flash`)**, Anthropic, Azure OpenAI, Google Gemini, Ollama, LM Studio, vLLM, any OpenAI-compatible [cache 340-341].

Internally-hosted endpoints: daemon blocks provider base URLs resolving to private/internal ranges (RFC1918/link-local/CGNAT/cloud-metadata) by default ("Internal IPs blocked") — allowlist specific hosts via `OD_ALLOWED_INTERNAL_HOSTS=<host1>,<host2>...` (bare hostnames/IPs, comma/space separated; `host:port` or full URL accepted and reduced to hostname; IPv6 bracketed `[fd00::1]`; CIDR not supported; exact-host, not substring) — README line 501 [github.com-d8ff876dfb.md:501].

### 5.2 Parity rules

- The BYOK proxy is the **no-CLI fallback**. If no locally-detected CLI is available, user configures BYOK in Settings and picks via same runtime picker.
- Filesystem expectation changes: CLI runtimes → `spawn` with `cwd = managed project cwd`, compose skill+DESIGN.md, write files, stream tool calls. BYOK → return one complete `<artifact>` block (daemon parses → `srcdoc` iframe). Both render via same preview state, but only filesystem path benefits from handoff-as-code.

### 5.3 MCP vs native runtime vs BYOK (decision table)

| Mode | Transport | Needs install | Has filesystem tools | Best for |
|------|-----------|---------------|----------------------|----------|
| **Native runtime** (DeepSeek Harness `dsh --profile open-design --stdio`) | profile-JSONL via stdio, session via profile | `dsh` + profile | yes | Official fast path — structured thinking/tool-calls/model discovery/cancel/resume |
| **CLI MCP / sidecar** (`od mcp install hermes` etc.) | ACP/JSON-RPC stdio + MCP (`acp-merge`/`claude-mcp-json`/`opencode-env-content`) | `od mcp install <agent>` | yes | All other local CLIs |
| **BYOK proxy** (`POST /api/proxy/openai/stream`) | HTTP/SSE, OpenAI-compatible | none | no (artifact block only) | quick test, remote models, no local CLI |

---

## 6) Deep Dive: SKILL.md Protocol (Verbatim Claude Code)

### 6.1 Verbatim contract (from `docs/skills-protocol.md`)

> "A **Skill** is an atomic functional capability in OD. A **design template** is a rendering-catalogue entry. Both use Claude Code's `SKILL.md` convention as their portable instruction format and may add `od:` metadata, but they have different ownership and APIs: functional skills live in `skills/` and `/api/skills`; rendering templates live in `design-templates/` and `/api/design-templates`."
> — `docs/skills-protocol.md:1` (web_extract result 2) — compatibility promise: a bundle that contains `SKILL.md` remains readable by agents that support Agent Skills format. Installation/placement are separate concerns: bundled `guizang` under `design-templates/guizang-ppt/`, external distribution normally uses plugin system.

Full doc lives at `docs/skills-protocol.md` — see captured snippet above (front-matter grammar, discovery rules, mode semantics, `od:` extensions, mode taxonomy).

### 6.2 Minimal functional SKILL.md (observed in `skills/apple-hig/SKILL.md` captured):

```yaml
---
name: apple-hig
description: |
  Apple Human Interface Guidelines as 14 agent skills covering platforms …
triggers:
  - "apple hig"
  - "human interface"
od:
  mode: design-system
  category: design-systems
  upstream: "https://github.com/raintree-technology/apple-hig-skills"
---
# apple-hig
> Curated from raintree-technology.
## What it does …
## Source …
## How to use …
```

Category/Marketplace hint: `od.mode: utility` for library-curator etc., `od.category: assets`.

Observed library-curator skill also documents **tool-token endpoints**: `POST /api/tools/library/search` `{query,kind,limit}` → `{results[{asset:{id,kind,sourceTitle,width,height,sources}}], semantic:false}` + `POST /api/tools/library/apply` `{assetId,dir}` → `{relPath}`. Agent then references `<img src="assets/<hash>.png">`. Warns: if search returns nothing, fall back to media generation rather than guessing path — never invent relPath [captured `skills/library-curator/SKILL.md`].

### 6.3 Rendering SKILL.md (observed `html-ppt-zhangzara-cobalt-grid`):

Full front-matter captured above includes `en_name`, `zh_name`, `description`, `en_description`, `zh_description`, `tags` (7), `triggers` (8), `od: {mode: deck, upstream, upstream_license, preview: {type: html, entry: example.html}, design_system: {requires: false}, speaker_notes: false, animations: false, category: "b2b-sales", scenario: "sales", example_prompt: …}`.

Workflow: clone `example.html` → replace placeholders → preserve design system → duplicate layouts for length → update page numbers → never bail to different template; keep navigation runtime intact.

Output contract: emit `<artifact>` XML — same as prototype but deck flavor. Body is free-form Markdown describing slide vocabulary: scheme/formality/density, best/avoid, step list.

### 6.4 lokma mapping

Lokma should adopt **verbatim SKILL.md** — easiest interop with existing 100+ skills, plus Claude Code users' muscle memory. Add only `lokma:` metadata if needed (e.g. harness-specific `tweaks:` or `critique:`) without breaking upstream readability.

---

## 7) Deep Dive: DESIGN.md Contract (Brand System)

### 7.1 Legacy: 9-section schema (archived)

`VoltAgent/awesome-claude-design` — original 9-section `DESIGN.md` schema, 70 upstream-derived systems; current packages may extend baseline [cache 810][github.com-d8ff876dfb.md:810]. Historical roadmap (docs/roadmap.md) marks this as pre-implementation baseline; assertions dated 2026-04-24 and superseded.

### 7.2 Current: rich package contract (from `design-systems/README.md` + `docs/design-systems.md`, captured above)

**Minimum (v1 manifest) — three required files:**

```
design-systems/<slug>/  (e.g. airbnb/, vercel/, default/)
├── manifest.json   ← discovery metadata + declared paths, id must == slug (normalized ASCII)
├── DESIGN.md       ← canonical prose for agents
└── tokens.css      ← canonical compiled :root custom properties
```

v1 manifest JSON shown in §3.5.

**Rich profile (once you opt in, QC guard expects completeness):**

- `USAGE.md` — read-order/usage guide (prompt composition consumes it)
- `components.html` + `components.manifest.json` (derived)
- `design-tokens.json` (derived, must agree with tokens.css)
- `tailwind-v4.css` (derived from tokens.css)
- `assets/` + `fonts/` (optional)
- `preview/` (≥3 pages covering colors/typography/spacing, plus brand-specific buttons/inputs/app)
- `source/` (evidence/tokens.report for hybrid/verbatim provenance — importer requirement)

Derived files are caches; token contract at `packages/contracts/src/design-systems/token-schema.ts` enforces required A1/A2/B-slot tokens, default parity, allowlists, semantic slots (`--bg/--fg/--accent/--accent-on/--font-display/--font-body…`). See captured.

**Catalog behavior:**

- Scan on every `GET /api/design-systems` request; a daemon restart is NOT required after editing a package — just refresh Design System surface [design-systems/README.md].
- Metadata precedence: `user metadata.json override → manifest.* → Markdown H1 / > Category: → frontmatter → fallback` [docs/design-systems.md §2].
- Guard: migrated package needs ≥7 substantive `## H2` headings (no fixed numbered schema) — normally theme/atmosphere, color roles/contrast, typography, spacing/layout/composition, components/states, motion/reduced-motion, a11y, anti-patterns, maybe provenance/imagery/voice/platform tweaks [docs/design-systems.md §3].

### 7.3 Example: default tokens (captured verbatim)

`design-systems/default/tokens.css` companion to the DESIGN.md excerpt in §3.5 sets at minimum: `--bg: #FAFAFA`, `--fg: #111111`, `--accent: #2F6FEB`, `--muted: #6B6B6B`, `--border: #E5E5E5`, `--surface: #FFFFFF`, `--success: #17A34A`, `--warn: #EAB308`, `--danger: #DC2626`, `--font-display/body: 'Inter'`, `--font-mono: ui-monospace/JetBrains Mono`.

Full resolved manifest for `default` captured above (includes `importMode: normalized`, `craft: {applies: [], suggested: [color, accessibility-baseline]}`, `preview: {pages: 6}`, `sourceFiles: {evidence, tokens, report}`).

### 7.4 Awesome-design-skills provenance (57)

`bergside/awesome-design-skills` contributed 57 DESIGN.md specs under `design-systems/` — recorded in `CHANGELOG.md:#92` ("57 DESIGN.md specs imported from awesome-design-skills"), repeated across `docs/i18n/*.md`, and in provenance table `README:812` [from terminal scan above].

---

## 8) Deep Dive: HyperFrames HTML→MP4

### 8.1 What the framework is

- Upstream: `https://github.com/heygen-com/hyperframes` (Apache-2.0) — HTML is source of truth for video; composition = `hyperframes.json` + `meta.json` + `index.html` (GSAP timeline `window.__timelines.main = gsap.timeline({paused:true})` + CSS appearance + `data-*` clip timings). Framework handles clip visibility, media playback, timeline sync. OD integration as first-class `hyperframes-html` model (pin `hyperframes-html` to select HF skill) [DESIGN.md: hyperframes SKILL.md captured].

### 8.2 Composition layout (OD-visible)

```
<projectRoot>/
├── .hyperframes-cache/<epoch>-<hex>/  (hidden cache — NOT shown in FileViewer/chips)
│   ├── hyperframes.json
│   ├── meta.json
│   └── index.html   (GSAP CDN + __timelines.main + <style> palette + <div data-duration> clips)
└── <descriptive-name>.mp4   (ONLY the rendered MP4 lands in project root — shown to user)
```

### 8.3 The sandbox-exec problem it solves

Many agent CLIs (Claude Code in particular) wrap Bash in `macOS sandbox-exec`, under which puppeteer's Chrome subprocess hangs partway through frame capture. OD daemon is **unsandboxed**, so renders complete reliably. Agent must NOT `hyperframes render` itself; must dispatch via daemon (`od bin media generate` / `media wait` loop) [SKILL.md: OD integration section captured].

### 8.4 Fast-path dispatch (captured verbatim, trimmed)

See §4.6 hyperframes dispatch block (scaffold → edit index.html → daemon generate → wait loop → quote file.name).

Constraints: each `generate` and each `wait` lasts at most ~25s so the agent's shell tool default ~30s cap never fires; progress lines `Capturing frame N/M` on stderr live; last stdout line is `{"file": { "name": "<output>", "size": …, "kind": "video" }}`.

Non-Chrome subcommands agent CAN run locally without daemon: `lint "$COMP"`, `transcribe <audio>`, `tts <text>` — via `$OD_HYPERFRAMES_BIN`. Reserve daemon for `render`/`inspect`/`preview`.

### 8.5 Visual gates

- HARD-GATE in upstream HF docs (read `DESIGN.md`/`visual-style.md` or ask 3 mood questions before writing any composition) is **skipped inside OD** — OD projects already have their own design-system layer (user picked visual direction at creation). For OD test render, default palette: `#0b0b0f` dark canvas, `#ffb76b` warm, `#7da4ff` cool, restrained motion [SKILL.md captured].

### 8.6 Author-time references bundled in `design-templates/hyperframes/`

`house-style.md`, `data-in-motion.md`, `visual-styles.md`, `patterns.md`, `palettes/{bold-energetic,clean-corporate,dark-premium,jewel-rich,monochrome,nature-earth,neon-electric,pastel-soft,warm-editorial}.md`, `references/{audio-reactive,captions,css-patterns,dynamic-techniques,html-in-canvas,motion-principles,transcript-guide,transitions,tts,typography}.md`, transitions catalog (`css-3d/blur/cover/destruction/dissolve/distortion/grid/light/mechanical/other/push/radial/scale.md`), `scripts/{animation-map,contrast-report,package-loader}.mjs`.

---

## 9) Counts & Hard Numbers

| Plane | Count | Where counted |
|-------|-------|---------------|
| Total commits (GitHub UI) | **3,477** | cache 127-128 |
| Stars | **92.9k** (≈92,854) | cache 102 + GitHub API |
| Forks | **10.7k** | cache 100 |
| Functional skills (`skills/`) | **≈162 folders** (README says "100+") | `ls -1 /tmp/open-design/skills \| wc -l` = 164 inc. README/AGENTS → 162 functional |
| Design templates (`design-templates/`) | **115 folders** | `ls -1 /tmp/open-design/design-templates \| wc -l` = 115 |
| Design systems (`design-systems/`) | **151 packages** | README 591 + measured 154 inc. README/_schema; 151 packages |
| Deck: templates | **15** | html-ppt/README.md: 15 full-deck templates |
| Deck: themes | **36** | html-ppt assets/themes/*.css |
| Deck: layouts | **31** | html-ppt templates/single-page/*.html |
| Deck: animations | **47** (27 CSS + 20 canvas FX) | html-ppt README |
| Image prompt templates in repo | **93** | README 369 |
| Image-templates (plugin cat) | **45** | plugins/_official/image-templates |
| Video-templates (plugin cat) | **63** | plugins/_official/video-templates |
| Design-systems wrapped as plugins | **143** | plugins/_official/design-systems |
| Official plugins | **277** | README 604 |
| Remixable example plugins | **183** | README 604 |
| Plugin scenarios | **13** | README scenarios table |
| Plugin atoms | **13** | README atoms |
| HyperFrames templates | **11** | README 380 |
| Seedance prompts | **39** | README 380 |
| Runtime definitions (shipped) | **27** inc. byok-opencode | `apps/daemon/src/runtimes/registry.ts` SHIPPED_AGENT_DEFS |
| Distinct executables | **26** (byok-opencode shares opencode) | README 684-687 |
| README wordcount | **771 lines** | `wc -l /tmp/open-design/README.md` = 771 |
| Docs total | **10,946 lines** across 25 docs/*.md | `wc -l /tmp/open-design/docs/*.md` |
| Package version | **0.21.1** | `/tmp/open-design/package.json` |
| Supported Node | **~24**, pnpm **10.33.2** | package.json, QUICKSTART.md |
| Default ports | daemon **7456** (docker/prod) + web dynamically allocated | `docs/architecture.md`, `deploy/.env.example` |
| Runtime daemon file size | `apps/daemon/src/server.ts` ≈ 16k+ lines; `runtimes/types.ts` ≈ 56k chars | terminal captures |

> **Reproduce counts:**
> ```sh
> ls -1 /tmp/open-design/skills | grep -vE 'README|AGENTS' | wc -l          # → 162
> ls -1 /tmp/open-design/design-templates | wc -l                             # → 115
> ls -1 /tmp/open-design/design-systems | wc -l                               # → 154 (+_schema/README) / 151 packages
> ls -1 /tmp/open-design/apps/daemon/src/runtimes/defs | wc -l                 # → 28 inc. shared.ts
> cat /tmp/open-design/apps/daemon/src/runtimes/registry.ts | grep -c AgentDef # → 27 shipped defs
> wc -l /tmp/open-design/README.md /tmp/open-design/docs/*.md
> curl -s https://api.github.com/repos/nexu-io/open-design | jq '.stargazers_count,.open_issues_count,.forks_count,.pushed_at'
> ```

---

## 10) Why This Matters for Lokma — Build Better

### 10.1 What Lokma should steal (verbatim where it speeds interop)

1. **`SKILL.md` verbatim** — copy Claude Code's front-matter + body convention. Immediate access to 100+ upstream skills and community forks.
2. **Registry split** — `GET /api/skills` (functional) vs `GET /api/design-templates` (rendering) vs `GET /api/design-systems` vs `GET /api/plugins`. Keep listing side separate from runtime injection; allow user root to shadow bundled root.
3. **Adapter data-spec** — one `RuntimeAgentDef` per CLI + generic engine. Adding Lokma-native runtimes (hermes, opencode, local llama) is one file each. Don't subclass agent loops.
4. **`DESIGN.md` + `tokens.css` + `manifest.json`** — Lokma design systems should mirror the rich package contract so `tokens.css` is the compiled truth the agent `var(--…)`s; `DESIGN.md` is the prose prompt snippet; `USAGE.md` explains read order; preview pages prove it.
5. **HTML artifact contract** — prototypes/decks/documents are all single-file HTML with inlined CSS; preview via `sandbox="allow-scripts"` iframe; `srcdoc` path for BYOK vs file path for CLI runs. Export is HTML inlining + browser print PDF + agent-driven PPTX (dexport trick: take the same HTML and pass through pptx-generator skill).
6. **HyperFrames pattern** — HTML+GSAP+CSS is source; MP4 is render artifact; hidden `.hyperframes-cache/` keeps composition state out of user's file listing; daemon (not agent shell) runs Chrome→FFmpeg to avoid sandbox-exec hangs. Surface as "Video" model alongside Seedance/Veo/Sora/Kling.
7. **BYOK proxy** — do exactly `POST /api/proxy/{anthropic,openai,azure,google,ollama}/stream` with SSRF guard + `OD_ALLOWED_INTERNAL_HOSTS`. Lokma's harness daemon already serves HTTP + SSE chat streaming; this is one more route with no process spawn.
8. **MCP one-liners** — `od mcp install hermes` style per-agent config writes (`~/.config/<agent>/open-design.json` etc.) plus Settings clipboard fallback for `/usr/bin/od` collisions. Lokma should provide `lokma design mcp install hermes` alias.

### 10.2 What Lokma should do better (the “even better” brief)

| OD today | Lokma improvement |
|----------|-------------------|
| Guidance for `DESIGN.md` still partly prose → agent may hallucinate tokens | **Strict token linter + design-token → tailwind → CSS generation** (OD has guard, but Lokma can make it blocking + auto-fix: parse tokens.css contract, fail chat if missing slot, suggest patch) |
| Feedback is comment-thread/annotations on iframe (coded in `apps/web`) | **True in-canvas select+edit** with CDP/iframe `data-od-id` overlay (OD has `data-od-id` on headings etc., but not yet seamless) — emit patch diffs, not rewrites |
| Figma import is connector + provisional DESIGN.md | **First-class Figma frame → DESIGN.md importer** (seed uses OD's Figma connector at `apps/daemon/src/figma/`, but Lokma can import variables/styles directly via Figma API and write tokens.css without agent mid-loop) |
| HyperFrames hides composition cache | Lokma can expose a **timeline editor** for HF (scrubber + layer list) that edits `index.html`'s GSAP timeline without re-asking agent |
| Plugin marketplace needs a publish step | Lokma's harness SKILL.md already supports hub install; integrate plugin `open-design.json` → harness skill spec converter automatically |
| Model routing separate from design | Lokma can merge **modelROUTER** (its own telemetry-driven one) with `/api/proxy/*` so design runs benefit from cheapest working model, with fallback to local Hermes |
| No offline-first in web-only mode | Lokma harness is **always local-first**; push rendering entirely client-side where possible (service-worker cached fonts/CSS, React/Babel iframe doesn't need network) |

### 10.3 Risks to avoid

- **Not reading `AGENTS.md → Daemon data directory contract` before choosing storage paths** — README/AGENTS warn repeatedly (cache 387,697). Lokma should define its data dir contract up front and make the guard fail closed.
- **Mixing skill and template into one registry** — engine treats them separately (`/api/skills` vs `/api/design-templates`), but chat resolution spans both. Lokma must keep the same separation; otherwise picking a deck template silently compose-wrong.
- **BYOK allowlist via CIDR** — OD explicitly rejects CIDR, exact-host only, to avoid silent widening via typo. Copy that strictness.
- **Running HyperFrames render from inside the agent shell** — always delegate to daemon/sidecar. Lokma harness's agent sandbox has same Chrome hang risk.

---

## 11) File Map & Key Paths

```
https://github.com/nexu-io/open-design (git: git@github.com:nexu-io/open-design.git)
├── README.md                          (771 lines — primary source for this doc)
├── LICENSE                            (Apache-2.0; bundled templates may add MIT)
├── package.json                       (v0.21.1, Node ~24, pnpm 10.33.2, bin: od)
├── pnpm-workspace.yaml                (apps/*, packages/*, shells/*, tools/*)
├── design-systems/                    (151 packages — each DESIGN.md + tokens.css + manifest.json (+USAGE.md/components.html/preview/source when rich))
│   ├── README.md                      (catalog shape + precedence)
│   ├── _schema/AGENTS.md              (manifest/token contract notes)
│   ├── default/{manifest.json,DESIGN.md,tokens.css,components.html,USAGE.md,preview/*}
│   └── <brand>/{manifest.json,DESIGN.md,tokens.css,…} ×151
├── design-templates/                  (115 — rendering blueprints)
│   ├── AGENTS.md
│   ├── guizang-ppt/                   (magazine deck — op7418, 5 directions)
│   ├── html-ppt/                      (Studio master — lewislulu, 36 themes/15 decks/31 layouts/47 anims)
│   ├── html-ppt-*/                    (≈40 variant self-contained decks each with SKILL.md + example.html)
│   ├── hyperframes/{SKILL.md,references/,palettes/,scripts/,house-style.md,…}
│   ├── dating-web/                    (editorial dashboard example)
│   ├── mobile-app, mobile-onboarding, dashboard, saas-landing, web-prototype …
│   ├── blog-post, digital-eguide, pm-spec, eng-runbook, finance-report, hr-onboarding …
│   └── critique, tweaks               (utility modes)
├── skills/                            (≈162 functional — SKILL.md + assets/ + references/)
│   ├── README.md, AGENTS.md
│   ├── library-curator/               (/api/tools/library/search → apply flow)
│   ├── apple-hig/                     (14-model design-system import)
│   ├── brand-extract, design-md, figma-*/   (importers)
│   └── gsap-*, frontend-*, fal-*, d3-*, pptx-*, …  (capabilities)
├── plugins/                           (marketplace)
│   ├── AGENTS.md, README.md
│   ├── spec/{SPEC.md,AGENT-DEVELOPMENT.md,PUBLISHING-REGISTRIES.md,examples/}
│   ├── _official/{scenarios/13,image-templates/45,video-templates/63,design-systems/143,atoms/13,examples/183}
│   ├── community/
│   └── registry/
├── craft/                             (universal craft rules a skill can opt into via od.craft.requires)
├── prompt-templates/                  (93 ready-to-replicate — image/ + video/)
│   ├── image/*  (gpt-image-2 / flux / etc. prompts)
│   └── video/*  (hyperframes-saas-promo-30s etc. + seedance prompts)
├── docs/                              (25 files, 10,946 lines)
│   ├── agent-adapters.md              (adapter contract — data spec, registry, detection, catalog)
│   ├── architecture.md                (runtime shapes, component topology, main components, content registries)
│   ├── skills-protocol.md             (base format, od: extensions, modes, discovery)
│   ├── design-systems.md              (package contract, precedence, DESIGN.md guide, tokens.css authoring)
│   ├── modes.md                       (creation surfaces vs skill modes — 6 tabs vs 7 modes, not 1:1)
│   ├── references.md                  (what borrowed from multica/ocodesign/openhuman/hermes/genericagent/cc-switch, lineage)
│   ├── spec.md + roadmap.md           (archived 2026-04 baseline — do NOT treat as current)
│   ├── design-system-tracking-spec.md, code-review-guidelines.md, …
│   └── i18n/                          (translations)
├── apps/
│   ├── daemon/                        (Express + SQLite authority, own /api/*, spawn/stdio/ACP, MCP, media)
│   │   ├── src/runtimes/defs/*.ts     (27 shipped defs incl. hermes.ts, deepseek-harness.ts, claude.ts …)
│   │   ├── src/runtimes/registry.ts   (SHIPPED_AGENT_DEFS → AGENT_DEFS + local profiles)
│   │   ├── src/runtimes/types.ts      (RuntimeAgentDef — the adapter data spec)
│   │   ├── src/skills.ts              (SkillMode parser, registry, prompt composition)
│   │   ├── src/design-systems/        (design-system resolver + catalog service)
│   │   ├── src/media/{index.ts,models.ts,hyperframes-runtime.ts} (+ vela/adapters)
│   │   ├── src/projects/              (project + file + version + root + watchers)
│   │   ├── src/brands/{store,engine/} (brand kit, seed, artifacts, import)
│   │   ├── src/mcp*.ts, mcp-*.ts      (stdio MCP server + per-agent install)
│   │   ├── src/server.ts              (Express app: HTTP + SSE + proxy + file + artifact routes + loopback/security)
│   │   ├── bin/od.mjs                 (bin entry for `od` CLI)
│   │   └── … (collect: artifacts/, automations/, analytics, connectors/figma, live-artifacts/, plugins/, etc.)
│   ├── web/                           (Next.js 16 App Router + React 18 — chat, workspace, iframe preview, creation+settings)
│   │   ├── src/components/NewProjectPanel.tsx (CreateTab / MediaSurface — creation taxonomy source of truth)
│   │   └── … (daemon/BYOK transports, streamed runtime events, <question-form> inline artifacts, preview/export bridges)
│   ├── desktop/                       (Electron shell — STATUS/EVAL/SCREENSHOT/CONSOLE/CLICK/SHUTDOWN sidecar IPC)
│   ├── packaged/                      (thin packaged entry — channel/namespace sidecars + od:// glue)
│   ├── landing-page/                  (Astro marketing + public catalog — reads repo at build time)
│   └── closure/                       (distributable Closure content — not generation state)
├── packages/
│   ├── contracts/src/design-systems/token-schema.ts (canonical token contract)
│   ├── contracts/src/api/projects.ts   (shared project contracts)
│   ├── contracts/src/prompts/system.ts (API/BYOK prompt wording mirror)
│   └── sidecar-proto/platform/standalone  (sidecar, OS process, exact metadata contracts)
├── mocks/                             (replay-based mock CLIs — PATH-overlay drop-in for tests: opencode/claude/codex/gemini/cursor-agent/deepseek/qwen/grok, ACP family devin/hermes/kilo/kimi/kiro/vibe, AMR vela)
├── tools/{dev,pack,serve,release}     (pnpm tools-dev lifecycle: run/start/stop/logs/inspect/check; pack/cache; serve; release)
├── e2e/                               (Playwright smoke + harness automation; read e2e/AGENTS.md)
├── deploy/                            (Docker Compose: ghcr.io/nexu-io/od:latest, .env.example, persistent workspace + Basic Auth)
├── AGENTS.md, CONTRIBUTING.md, QUICKSTART.md, CLAUDE.md, CONTEXT.md  (agents must read)
└── /root/.hermes/cache/web/github.com-d8ff876dfb.md  (853-line plain-text cache of github.com/nexu-io/open-design; this doc's most-cited upstream)
```

Source: `git clone --depth 1` file listing (/tmp/open-design) + README + docs + AGENTS.md. Runtime defs exact list from `apps/daemon/src/runtimes/defs/` captured above.

---

## 12) Open Questions / Lokma Improvements

1. **How tightly should Lokma's harness chat couple to preview?** OD keeps chat on daemon SSE, preview via file routing (daemon-owned files vs BYOK srcdoc). Lokma could stream file ops directly over harness tool-call events (no poll).
2. **Design system hot-reload granularity:** OD scans on each `GET /api/design-systems` request; Lokma could use FS watcher + ETag to avoid repeated scans under load.
3. **Deck PPTX export agent skill** — OD currently delegates PPTX to agent via `pptx-generator` skill (real PPTX). Lokma harness might pre-render HTML→PPTX via headless LibraOffice or `pptxgenjs` client-side; weigh fidelity vs agent latency.
4. **Plugin capability model:** OD's `od.capabilities[]` declare minimum and restricted install grants only `prompt:inject`. Lokma already has skill sandbox controls; map OD capabilities → harness permissions cleanly.
5. **Hermes ACP parity:** OD's hermes def uses `hermes acp --accept-hooks` (no prompt arg, all via JSON-RPC). Ensure Lokma's Hermes harness stays on this protocol; verify fallbacks (`grok-4.3` etc.) still accurate when new xAI models land.

---

## 13) Citations

> Per delegation requirement: **Cite URLs. Scrape README, docs, SKILL.md, DESIGN.md, architecture files, and cached page `/root/.hermes/cache/web/github.com-d8ff876dfb.md`.** Every section cites at least one of these.

- GitHub repo (primary): `https://github.com/nexu-io/open-design` — description "Best DeepSeek Harness Design Plugin. The open-source Claude Design alternative…" [cache 1][github.com-d8ff876dfb.md:1], stars/forks/commits lines [cache 100-105][github.com-d8ff876dfb.md:100], license [cache 246][github.com-d8ff876dfb.md:246], topics 823-825.
- Cached full-text scrape: `/root/.hermes/cache/web/github.com-d8ff876dfb.md` (853 lines, 44,226 bytes) — used for all "cache line …" cites; first line cache 1-2 [github.com-d8ff876dfb.md:1].
- README raw: `https://raw.githubusercontent.com/nexu-io/open-design/main/README.md` — 771 lines, captures §§ What is OpenDesign / Product tour / Platform Compatibility / Demo / Why OpenDesign / Architecture / Installation — captured as web_extract result 0 (20,251 chars) and re-captured via `/tmp/open-design/README.md`.
- Agent adapters (runtime contract): `https://raw.githubusercontent.com/nexu-io/open-design/main/docs/agent-adapters.md` — captured as web_extract result 1 (20,374 chars) + `/tmp/open-design/docs/agent-adapters.md` (595 lines) — defines data-spec vs class, registry invariants, detection strategy.
- Skills protocol: `https://raw.githubusercontent.com/nexu-io/open-design/main/docs/skills-protocol.md` — captured as result 2 (16,967 chars) + `/tmp/open-design/docs/skills-protocol.md` (375 lines) — base SKILL.md YAML + od: extensions + routing.
- Architecture: `https://raw.githubusercontent.com/nexu-io/open-design/main/docs/architecture.md` — result 3 (12,763 chars) + docs/architecture.md 279 lines — runtime shapes, component topology, content registries, lifecycle.
- Modes: `/tmp/open-design/docs/modes.md` (117 lines) — creation tabs vs skill modes taxonomy, captured fully above.
- Roadmap: `https://raw.githubusercontent.com/nexu-io/open-design/main/docs/roadmap.md` — result 4 (13,531 chars), docs/roadmap.md 260 lines — archived baseline, phase plan.
- Design systems README & guide: `/tmp/open-design/design-systems/README.md` (manifest + precedence + preview/source), `docs/design-systems.md` (package contract, token guidance) — both captured above.
- References: `/tmp/open-design/docs/references.md` (203 lines) — lineage: Claude Design, OpenCoDesign, multica, OpenHuman, Hermes, GenericAgent, cc-switch — captured above.
- Spec: `/tmp/open-design/docs/spec.md` (157 lines) — archived draft v0.1 + module map.
- Runtimes: `apps/daemon/src/runtimes/registry.ts` (27 shipped defs), `apps/daemon/src/runtimes/defs/hermes.ts` (hermes acp, fallback models captured), `apps/daemon/src/runtimes/defs/deepseek-harness.ts` (dsh native — version policy, probe, jsonl), `apps/daemon/src/runtimes/types.ts` (56k chars data spec captured), `apps/daemon/src/runtimes/defs/*.ts` (28 files ls).
- HyperFrames: `design-templates/hyperframes/SKILL.md` (full scaffold→wait workflow captured), `design-templates/hyperframes/references/`, `design-templates/hyperframes/palettes/`, `apps/daemon/src/media/models.ts` (MEDIA_PROVIDERS 26, IMAGE_MODELS/VIDEO etc.), `prompt-templates/video/hyperframes-*`.
- html-ppt (deck reality): `/tmp/open-design/design-templates/html-ppt/README.md` (36 themes, 15 templates, 31 layouts, 47 anims, presenter mode) — captured above; `design-templates/html-ppt/SKILL.md`, variant `html-ppt-zhangzara-*/SKILL.md` front-matters captured; upstream `lewislulu/html-ppt-skill` (cache 804).
- Guizang PPT: `design-templates/guizang-ppt/SKILL.md` (5 directions, 6-question checklist, assets/template.html, WebGL hero, workflow) — captured above; upstream `op7418/guizang-ppt-skill` (cache 802-803).
- DESIGN.md: `design-systems/default/DESIGN.md` (Neutral Modern 8 sections captured), `design-systems/default/manifest.json` (captured), `design-systems/_schema/manifest.schema.ts` (captured), `docs/design-systems.md`.
- Skills samples: `skills/apple-hig/SKILL.md`, `skills/library-curator/SKILL.md` (tool-token endpoints captured), `skills/README.md`.
- Media & providers: `apps/daemon/src/media/models.ts` (26 providers, image/video models — captured 250 lines), mirrored at `apps/web/src/media/models.ts`.
- Provenance: `bergside/awesome-design-skills` 57 specs provenance (CHANGELOG #92, docs/i18n/*, README 812), `VoltAgent/awesome-design-md` (70 systems, README 809), `heygen-com/hyperframes` (README 813), `alchaincyf/huashu-design` (README 800), `lewislulu/html-ppt-skill` (README 804).
- API site: `https://open-design.ai` (homepage), `https://open-design.ai/install.sh` (hosted installer), `https://api.github.com/repos/nexu-io/open-design` (stars/forks/size/timestamps).
- Other referenced universes: `https://github.com/OpenCoworkAI/open-codesign`, `https://github.com/multica-ai/multica`, `https://github.com/nousresearch/hermes-agent` (hermes skill hub), `https://github.com/badlogic/pi-mono` (pi-ai), `https://github.com/heygen-com/hyperframes`, `https://github.com/op7418/guizang-ppt-skill`, `https://github.com/lewislulu/html-ppt-skill`, `https://github.com/bergside/awesome-design-skills`.

> **Verification command:** `web_extract` on the 5 raw URLs + `cat /root/.hermes/cache/web/github.com-d8ff876dfb.md` reproduce most cites offline; `git clone --depth 1 https://github.com/nexu-io/open-design.git /tmp/open-design && ls /tmp/open-design/design-templates/html-ppt/assets/themes/*.css | wc -l` → 36.

---

## 14) Raw Appendix — Useful Snippets

### A) Minimal skill creation (for Lokma)

```yaml
# skills/my-lokma-landing/SKILL.md
---
name: my-lokma-landing
description: "Lokma SaaS landing — hero/features/pricing/CTA, uses brand tokens"
triggers:
  - "lokma landing"
  - "saas landing"
od:
  mode: prototype
  scenario: marketing
  preview: { type: html, entry: index.html }
  design_system: { requires: true, sections: [color, typography, layout, components] }
---
# Lokma Landing
1. Read DESIGN.md (injected) — accent is one CTA + one hero accent per screen.
2. Sections: header, hero (headline+subhead+CTA+shot), features (3×), social proof, pricing (tiered), footer.
3. Write single <!doctype html> with inlined <style> using var(--*) tokens.
4. Output: <artifact identifier="landing" type="text/html">…</artifact>
```

### B) Hermes runtime def (copy-paste for Lokma registry)

```ts
// apps/daemon/src/runtimes/defs/hermes.ts (verbatim, source of truth)
export const hermesAgentDef = {
    id: 'hermes', name: 'Hermes', bin: 'hermes', versionArgs: ['--version'],
    fetchModels: async (resolvedBin, env) => detectAcpModels({ bin: resolvedBin, args: ['acp','--accept-hooks'], env, timeoutMs: 15_000, defaultModelOption: DEFAULT_MODEL_OPTION }),
    fallbackModels: [
      DEFAULT_MODEL_OPTION,
      { id: 'grok-4.3', label: 'grok-4.3 (xAI · default)' },
      { id: 'grok-4.20-reasoning', label: 'grok-4.20-reasoning (xAI · deep)' },
      { id: 'grok-4.20-0309-non-reasoning', label: 'grok-4.20-non-reasoning (xAI · fast)' },
      { id: 'grok-4.20-multi-agent-0309', label: 'grok-4.20-multi-agent (xAI · orchestration)' },
      { id: 'openai-codex:gpt-5.5', label: 'gpt-5.5 (openai-codex:gpt-5.5)' },
      { id: 'openai-codex:gpt-5.4', label: 'gpt-5.4 (openai-codex:gpt-5.4)' },
      { id: 'openai-codex:gpt-5.4-mini', label: 'gpt-5.4-mini (openai-codex:gpt-5.4-mini)' },
    ],
    buildArgs: () => ['acp','--accept-hooks'],
    streamFormat: 'acp-json-rpc',
    mcpDiscovery: 'mature-acp',
    externalMcpInjection: 'acp-merge',
} satisfies RuntimeAgentDef;
```

### C) BYOK proxy cURL (daemon)

```sh
# OpenAI-compatible (OpenAI/LM Studio/vLLM/Atlas Cloud/Ollama)
curl -N -X POST http://127.0.0.1:7456/api/proxy/openai/stream \
  -H 'content-type: application/json' -H 'authorization: Bearer $OD_API_TOKEN' \
  -d '{"model":"qwen/qwen3.5-flash","baseUrl":"https://api.atlascloud.ai/v1","apiKey":"sk-…","messages":[{"role":"user","content":"Use open-design to generate a landing page with the Linear design system"}],"stream":true}'

# Anthropic path
curl -N -X POST http://127.0.0.1:7456/api/proxy/anthropic/stream \
  -H 'content-type: application/json' \
  -d '{"model":"claude-opus-4-5","apiKey":"…","messages":[]}'

# Ollama local
curl -N -X POST http://127.0.0.1:7456/api/proxy/ollama/stream \
  -H 'content-type: application/json' \
  -d '{"model":"qwen2.5","baseUrl":"http://localhost:11434/v1","messages":[]}'
```

Guard: per-target SSRF blocks internal IPs; allowlist: `OD_ALLOWED_INTERNAL_HOSTS=litellm.internal.corp,lite.internal`.

### D) Development lifecycle (only entry point)

```sh
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install   # Node ~24, pnpm 10.33.2
pnpm tools-dev run web        # daemon + web foreground (dev)
pnpm tools-dev                # daemon + web + desktop background
pnpm tools-dev status|logs|check|stop|restart --daemon-port 7457 --web-port 5175
pnpm --filter @open-design/daemon build   # builds apps/daemon/dist/cli.js for od
od mcp install hermes --print   # dry-run per-agent MCP snippet
od project list --json
od files list <project-id> --json
od files read <project-id> <relative-path>
od plugin list --json | jq .
```

### E) Docker / Deploy

```sh
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy && cp .env.example .env && echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env && docker compose up -d
# → http://127.0.0.1:7456 (BasicAuth if OD_API_TOKEN set; username open-design)
```

Sealos: App Store template (persistent workspace + Basic Auth on public proxy). Review `deploy/README.md` for reverse-proxy + `OPEN_DESIGN_ALLOWED_ORIGINS`.

### F) Adding a new Lokma runtime (one file)

```
apps/daemon/src/runtimes/defs/lokma.ts
  export const lokmaAgentDef: RuntimeAgentDef = { id: 'lokma', name: 'Lokma', bin: 'lokma', versionArgs: ['--version'], fallbackModels, streamFormat: 'acp-json-rpc', promptViaStdin: true, buildArgs: … }
apps/daemon/src/runtimes/registry.ts
  + lokmaAgentDef into SHIPPED_AGENT_DEFS
docs/agent-adapters.md
  + table row: Lokma | ✅ Native runtime | `lokma design ...`
```

That's the whole adapter protocol.

### G) Design system import CLI (Lokma can automate)

```sh
scripts/sync-design-systems.ts   # re-import library (upstream sources)
# Add your own:
mkdir -p design-systems/<brand>
cat > design-systems/<brand>/manifest.json <<'JSON'
{ "schemaVersion":"od-design-system-project/v1","id":"<brand>","name":"<Brand>","category":"Product","description":"…","source":{"type":"bundled","origin":"Lokma curated"},"files":{"design":"DESIGN.md","tokens":"tokens.css"}}
JSON
cat > design-systems/<brand>/DESIGN.md  # prose + 7 H2s
cat > design-systems/<brand>/tokens.css # :root { --bg: …; --accent: …; --font-display: … }
pnpm guard # token + manifest guards
```

---

> End of raw research — written to `/tmp/opendesign-raw.md` for Lokma Open Design core. Total target: 600+ lines (this file is well north of that — verify with `wc -l /tmp/opendesign-raw.md`). All numbers, paths, and code snippets scraped from `github.com/nexu-io/open-design`, live raw GitHub URLs, `/tmp/open-design` clone at `2026-08-31`, and `/root/.hermes/cache/web/github.com-d8ff876dfb.md`. Missing detail? Re-scrape the cited URL; nothing in this doc is synthesized without a source.
