# Design System — Open Design-Inspired Canvas for Lokma

> **Inspired by:** [`nexu-io/open-design`](https://github.com/nexu-io/open-design) — 92.9k★ · 10.7k forks · 3,477 commits · Apache-2.0
> **Raw:** `raw/38-opendesign-ham-arastirma.md` (1,325 lines) · `raw/39-opendesign-designsystem-ham-arastirma.md` (831 lines)
> **Companion:** `31-ARCHIFY-diagrams-and-viewer.md` · `11-ARASTIRMA-omp-temalar-ve-tasarim.md` · `24-WEB-PANE-SYSTEM-and-orchestration.md` · `23-PLUGIN-SYSTEM-deepseek-cordis.md`
> **Owner ask (verbatim):** *"lokmanın kendi içinde tasarım da yapılabilsin. claude design gibi olacak bu. open-design reposunu incele lokmaya da daha iyi bunun gibi bir sistem kurmak için dökümanlar yaz"*

---

## 1. What Open Design Is (30 Seconds)

Open Design is a **local-first design harness** (macOS/Win + Linux AppImage, Docker `:7456`, Vercel) where **the CLI agent becomes the design engine**:

- **Discover brief → lock direction → stream artifact → critique → deliver** — the agent loop *is* the design process
- **Filesystem of capabilities:** `skills/` (162) + `design-templates/` (115) + `design-systems/` (151) + `plugins/` (277+183) — the app is a filesystem the agent edits
- **26 CLI runtimes** (Claude Code, Codex, Cursor, OpenCode, Hermes via `od mcp install hermes` → `hermes acp --accept-hooks` `acp-json-rpc`, 8 more code-only defs)
- **6 artifact types:** **Prototype** (single-page HTML, sandbox iframe) · **Deck** (15 templates × 36 themes × 31 layouts via `html-ppt`) · **Mobile** (device preview) · **Image** (GPT Image 2.0 / Seedream 5.0 / Nano Banana 2.0) · **Document** · **HyperFrames** (HTML→MP4 via HeyGen HyperFrames)
- **BYOK proxy:** `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` (SSE, SSRF-guarded, `OD_ALLOWED_INTERNAL_HOSTS`)
- **Design systems + DESIGN.md:** brand-grade systems (`manifest.json` + `DESIGN.md` + `tokens.css` + `preview/`) + per-project `DESIGN.md` as the brand contract (7+ H2 minimum, 9-section historical baseline via VoltAgent/`awesome-design-md`)

Open Design's positioning: *"Your coding agent becomes the design engine — prototypes, landing pages, dashboards, slides, images & video — real files, HTML/PDF/PPTX/MP4 export. BYOK 20+ CLIs."*

---

## 2. How Open Design Works (Agent-Native Loop)

```
User brief ("Build a pricing page for Lokma")
  │
  ├─ Agent discovers direction (mood, references, constraints)
  ├─ Locks direction → writes DESIGN.md excerpt + picks template/system
  ├─ Streams artifact (writes HTML/CSS to file, preview updates live)
  ├─ Critique pass (5 dimensions — see §4) → tweaks manifest
  └─ Deliver (export HTML/PDF/PPTX/ZIP/MP4, share link)
```

- **CLI is the engine:** `spawn cwd` — the agent runs in the project dir, filesystem changes are the artifact
- **Streaming:** filesystem → `srcdoc` preview (or file URL) + `<question-form>` any turn (agent can ask the user mid-stream)
- **Tweaks manifest:** structured edits (`color`, `spacing`, `copy`, `layout`) applied deterministically

---

## 3. Architecture (What Lokma Steals)

| Layer | Open Design | Lokma Canvas |
|-------|-------------|--------------|
| **Daemon** | `apps/daemon` + `apps/daemon/src/runtimes/defs/*.ts` (26 defs, `registry.ts`/`types.ts`) | `lokma daemon` (Fastify `:4401` + WS) — reuses Lokma's existing daemon from `23-*` |
| **Adapter contract** | `docs/agent-adapters.md` — each CLI adapter implements `spawn`, `stream`, `question`, `tweaks` | Same — `packages/lokma-core/src/runtimes/defs/*.ts` (add `lokma` adapter) |
| **Skills** | `skills/*` verbatim `SKILL.md` (162 folders) | `~/.lokma/skills/<cat>/<name>/SKILL.md` (see `27-*`) — design skills are just skills |
| **Templates** | `design-templates/{guizang-ppt,html-ppt}` (bundled MIT, 15 decks) | `~/.lokma/design/templates/<id>/` (gitignored, `lokma design template add <url>`) |
| **Design systems** | `design-systems/` (151 packages, `manifest.json`+`DESIGN.md`+`tokens.css`) | `~/.lokma/design/systems/<id>/` + per-project `.lokma/DESIGN.md` |
| **Studio** | `Home → Plugins → Design System → Studio` (6 artifact types, conversation+files+preview) | **Design Studio pane** (see §7) — same 6 types, same 3-column layout |
| **Canvas** | Sandboxed `iframe` preview + live agent panel | Same — sandboxed `iframe srcdoc` + WS streaming |
| **Export** | HTML self-contained, PPTX via `PptxGenJS`, PDF via Puppeteer, MP4 via HyperFrames | Same — HTML/PDF/PPTX/MP4 pipeline (see §8) |

---

## 4. DESIGN.md — The Brand Contract

### 4.1 Schema (Per-Project `.lokma/DESIGN.md`)

Open Design's current rule: **7+ H2 minimum** (no fixed numbering), historically 9 sections via VoltAgent/`awesome-design-md` + `opendesigner.io/blog/design-md-9-section-schema-explained`:

| # | Section | What It Holds |
|---|---------|---------------|
| 1 | Visual Theme | Mood, references, `preview.html` / `preview-dark.html` pattern |
| 2 | Color | OKLch palette (primary/neutral/accent), token names, contrast rules |
| 3 | Typography | Type scale, Inter `opsz`, headings vs body, line-height |
| 4 | Spacing & Layout | 8px base, taste annotations, 12-col grid, breakpoints |
| 5 | Components | Recipes with **negative rules** (what NOT to do) |
| 6 | Motion | `cubic-bezier(.16,1,.3,1)`, durations, finite vs looping |
| 7 | Voice & Copy | Tone, banned words, microcopy patterns |
| 8 | Brand | Clear-space, logo, marks, watermark |
| 9 | Anti-Patterns | Kill list (AI slop signatures to avoid) |

### 4.2 Lokma's `DESIGN.md` Contract

- **Location:** `.lokma/DESIGN.md` (per project, committed) + `~/.lokma/design/systems/<id>/DESIGN.md` (global system)
- **Guard:** `lokma design lint` checks ≥7 H2, missing sections warned, not blocked (relaxed from OD's strict 9)
- **5-dimensional critique** (from `alchaincyf/huashu-design` via OD's `craft/anti-ai-slop.md` + `lint-artifact.ts`): every artifact is scored on 5 dims (visual, interaction, copy, motion, brand) before deliver — see `craft/` in OD's repo, Lokma mirrors as `lokma design critique <id>`

### 4.3 Token Layers (from `design-systems/README.md`)

```
A1 — Primitive tokens (OKLch palette, type scale, spacing)
A2 — Semantic tokens (bg, fg, border, accent — mapped from A1)
B  — Slot tokens (card, button, nav — per-component, from A2)
C  — Extensions (brand watermark, motion, voice)
```

Lokma maps `themes/*.json` (see `11-*`) → `DESIGN.md` tokens → `tokens.css` CSS vars → Web (CSS vars) + CLI (Chalk) — same tokens everywhere.

---

## 5. Design Systems & Templates

### 5.1 Systems (151 in OD, Lokma Vendors a Subset)

- **Package contract:** `manifest.json` + `DESIGN.md` + `tokens.css` (+ rich: `USAGE.md`, `components.html`, `design-tokens.json`, `tailwind-v4.css`, `preview/`, `source/`)
- **Lokma:** `~/.lokma/design/systems/<id>/` — `lokma design system add <url>` clones a system; `lokma design system use <id>` copies its `DESIGN.md` → `.lokma/DESIGN.md` + `tokens.css` → project

### 5.2 Templates

- **OD:** `design-templates/guizang-ppt` (bundled MIT) + `design-templates/html-ppt` (15 decks × 36 themes, `html-ppt/README.md`), `dating-web` prototype
- **Lokma:** `~/.lokma/design/templates/<id>/` — same contract; `lokma design template add <url>` + `lokma design new --template html-ppt --theme dark`

---

## 6. Canvas & Rendering (Sandboxed Preview)

- **Preview:** sandboxed `iframe` (`sandbox="allow-scripts allow-same-origin"`, `srcdoc` or file URL) — real CSS/fonts/components, not a screenshot
- **Live streaming:** agent writes HTML → file watcher → WS `design:artifact:update` → iframe reloads (same as OD's `srcdoc` streaming)
- **Agent panel:** streaming tool calls + `<question-form>` any turn (OD's verbatim `SKILL.md` question flow) — Lokma reuses the same `question` tool from `30-AGENT-SYSTEM`
- **Figma alternative positioning:** OD pushes *single-page artifacts with DESIGN.md brand contract* instead of Figma's infinite canvas — Lokma copies this: **pixels are code, not canvas**

---

## 7. Lokma Design Studio — Web Pane

```
┌─────────────────────────────────────────────────────────┐
│ Left: Brief + DESIGN.md + Artifact Picker               │
│  ┌─ Brief ─┐  [DESIGN.md: .lokma/DESIGN.md ▼]          │
│  │ Build a │  Type: [Prototype] [Deck] [Mobile]         │
│  │ pricing │        [Image] [Document] [HyperFrame]     │
│  │ page…   │  System: [Lokma Dark ▼]  Template: [—]    │
│  └─────────┘  [Generate]                                │
│  Recent artifacts (6 types, filterable)                  │
├─────────────────────────────────────────────────────────┤
│ Center: Sandboxed Live Preview (iframe)                  │
│  ← iframe srcdoc, streaming via WS →                     │
│  Agent panel below: tool calls + question form           │
├─────────────────────────────────────────────────────────┤
│ Right: Files + Critique + Export                         │
│  Tabs: [Files] [Critique 5D] [Export]                   │
│  Files: artifact.html + assets/                          │
│  Critique: 5-dim scores + fix hints                     │
│  Export: [HTML] [PDF] [PPTX] [ZIP] [MP4]                │
└─────────────────────────────────────────────────────────┘
```

- **Left:** brief textarea + `DESIGN.md` selector (per-project vs system) + 6-type picker + system/template dropdown + Generate
- **Center:** sandboxed `iframe`, same viewer as Archify (§31) but for design artifacts; agent streams writes → iframe hot-reloads
- **Right:** file list, 5D critique thread, export menu

Future apps (Desktop, CLI `lokma design open <id>`) read the same `~/.lokma/design/artifacts/<id>/` store + `GET /api/design/*` — no duplication.

---

## 8. Export Pipeline

| Format | How | Tool |
|--------|-----|------|
| **HTML** | Self-contained (inline CSS/JS, no CDN) | Direct file — `artifact.html` |
| **PDF** | Headless Chromium print to PDF | `puppeteer-core` + `chromium` |
| **PPTX** | HTML → slides via `PptxGenJS` (same as OD's `html-ppt`) | `pptxgenjs` + template layout map |
| **MP4** | HTML → video frames → MP4 | HyperFrames (`heygen/hyperframes`) or `puppeteer` screenshot sequence + `ffmpeg` |
| **ZIP** | Bundle `artifact.html` + `assets/` + `DESIGN.md` | `archiver` |

```
POST /api/design/:id/export?format=html|pdf|pptx|mp4|zip → file
lokma design export <id> --format pdf --out ./out.pdf
```

---

## 9. Agent as Design Engine (Any Agent Can Design)

Any Lokma agent (per-agent `model` + `SOUL.md` + `MEMORY.md` from `30-*`) can be a design agent:

- **Skill:** `design_canvas` (typed IR → `validate` → `build` → `deliver`, same validate-before-deliver guard as Archify)
- **Prompt injection:** `.lokma/DESIGN.md` is auto-injected into every design prompt (brand contract, like OD)
- **Tools:** `read_file` / `write_file` (artifact.html) + `archify` (for diagrams inside designs) + `design_canvas` (for critique/export)

```
design_canvas { action: "generate", brief: "Pricing page for Lokma, dark, 3 tiers", system: "lokma-dark", type: "prototype" }
design_canvas { action: "critique", id: "abc" }  → { scores: { visual: 8, interaction: 7, ... }, fixes: [...] }
design_canvas { action: "export", id: "abc", format: "pdf" }
```

---

## 10. Integration with Lokma Themes (OMP)

`11-ARASTIRMA-omp-temalar-ve-tasarim.md` themes (`claude` / `omp` / `midnight` / `paper`) map to `DESIGN.md` tokens:

```
themes/claude.json → DESIGN.md §2 Color (OKLch) → tokens.css --color-* → Web CSS vars + CLI Chalk
```

`DESIGN.md` is the **single source** for brand; `themes/*.json` is the **palette preset** that seeds it. `lokma theme set claude` writes both.

---

## 11. Roadmap Slot

| Phase | What |
|-------|------|
| **0 — Scaffold** | `~/.lokma/design/` dirs, `.lokma/DESIGN.md` guard, `design_canvas` tool stub |
| **1 — Studio** | Design Studio pane (brief+DESIGN.md+6 types) + `POST /api/design/generate` + iframe preview + WS streaming |
| **1.5 — Systems** | `design system add/use` + `template add` + 5D critique pass |
| **2 — Export** | HTML self-contained + PDF/PPTX/MP4 pipeline + share cards |
| **2.5 — Polish** | `DESIGN.md` brand marks, `archify` diagrams inside designs, Desktop parity |

---

## 12. References

- Open Design repo: https://github.com/nexu-io/open-design · `SKILL.md` · `docs/agent-adapters.md` · `DESIGN.md` · `apps/daemon/src/runtimes/defs/`
- Design systems: `design-systems/README.md` + `docs/design-systems.md`
- VoltAgent / awesome-design-md 9-section schema: `opendesigner.io/blog/design-md-9-section-schema-explained`
- Lokma panes: `24-WEB-PANE-SYSTEM-and-orchestration.md` · Lokma themes: `11-ARASTIRMA-omp-temalar-ve-tasarim.md`
- Lokma archify: `31-ARCHIFY-diagrams-and-viewer.md` · Lokma agents: `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md`
