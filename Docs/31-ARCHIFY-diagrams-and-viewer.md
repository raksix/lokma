# Archify — Diagrams & Viewer for Lokma

> **Inspired by:** [`tt-a1i/archify`](https://github.com/tt-a1i/archify) — 34.9k★ · 2.2k forks · 207 commits · MIT · v2.16.0
> **Raw:** `raw/37-archify-ham-arastirma.md` (970 lines, 108 KB) · `archify/SKILL.md` · `integrations/deepseek-harness`
> **Companion:** `23-PLUGIN-SYSTEM-deepseek-cordis.md` · `24-WEB-PANE-SYSTEM-and-orchestration.md` · `25-WEB-ROADMAP.md`

---

## 1. What Archify Is (30-Second Version)

Archify is a **Node.js rendering and validation system** that turns a **typed JSON IR** into a **self-contained HTML/SVG** diagram — no Mermaid, no external renderer. The agent produces structured JSON, Archify deterministically compiles it.

- **5 diagram types:** Architecture · Workflow · Sequence · Data Flow · Lifecycle
- **4 visual presets:** `signal-flow` · `blueprint` · `classic` · `minimal` + `dark/light` + brand marks + finite motion (`trace` animation)
- **Install:** `npx skills add tt-a1i/archify -g` → skill lands at `~/.raven/workspace/skills/archify` (or any `$SKILLS_DIR`)
- **Runtimes:** Cursor · Claude Code · Codex CLI · OpenCode (Node `^22.19.0 || >=24`)
- **DeepSeek Harness:** `dsh plugin --profile web add @tt-a1i/archify-dsh@0.1.0`

```
Agent writes JSON IR  →  archify validate --json  →  archify build → self-contained HTML
                                     ↕ fail                     ↕ pass
                              repair receipt              share card 1200×630
```

---

## 2. How It Works

### 2.1 Author → Validate → Build → Deliver

```
1. Agent drafts IR:     { type, nodes, edges, swimlanes?, trace?, preset? }
2. Validate (atomic):   schema → layout → HTML/SVG → route → label-to-route clearance
3. Build:               deterministic HTML/SVG with embedded CSS/JS, no CDN
4. Deliver:             file + share card (PNG/WebM) + validation receipt
```

**Validation gates** run atomically; `validate --json` / `deliver --json` return stable rule codes + a repair receipt. A `last-good live preview` loop keeps the previous good HTML visible while the agent iterates.

### 2.2 Typed IR

Each diagram type has a JSON Schema. Common shape:

```json
{
  "type": "architecture",
  "preset": "signal-flow",
  "theme": "dark",
  "nodes": [{ "id": "api", "label": "Fastify API :4401", "kind": "service" }],
  "edges": [{ "from": "web", "to": "api", "label": "REST /api" }],
  "trace": ["web", "api", "db"]
}
```

- `archify/bin/archify.mjs` is the CLI entry (also `node archify/bin/archify.mjs guide "..." --json`)
- `ARCHIFY_UPDATE_CHECK_DISABLED=1` disables the 72h ±20% manifest check

### 2.3 Deltas

```bash
node archify/bin/archify.mjs compare architecture base.json head.json architecture-delta.html --json
```

Produces **Before / Delta / After** with `added · removed · changed · moved · rerouted` and a routable delta HTML.

---

## 3. Five Diagram Types

| Type | When to Use | IR Highlights |
|------|-------------|---------------|
| **Architecture** | System overview (services, DBs, queues, gateways) | nodes by `kind` (service/db/queue/gateway), zones, edges with protocol labels |
| **Workflow** | Step-by-step process, branching, parallel lanes | swimlanes, decision diamonds, parallel blocks |
| **Sequence** | Call ordering across actors (API, agent, tool) | lifelines, messages, alt/opt/loop fragments |
| **Data Flow** | How data moves + transforms (ETL, pipeline) | sources → transforms → sinks, data labels |
| **Lifecycle** | State machine (session, order, deployment) | states, transitions, guards, terminal states |

All five share presets, themes, trace animation, and the same validation pipeline.

---

## 4. Visual Presets & Themes

- **Presets:** `signal-flow` (gradient flows, modern) · `blueprint` (grid, engineering) · `classic` (clean, print-friendly) · `minimal` (editorial)
- **Themes:** `dark` / `light` — token-driven, no hardcoded colors
- **Brand marks:** corner watermark / logo slot, configurable per `DESIGN.md`
- **Motion:** finite `trace` animation (path replay), not looping — draws attention then settles

---

## 5. Viewer Contract (What You Can Do in the HTML)

The generated HTML is **self-contained** (no external JS/CSS). Interactive controls:

| Key | Action |
|-----|--------|
| `?` | Help overlay |
| `M` / `MAP` | Minimap toggle |
| `F` | Focus mode |
| `S` / `T` / `E` | Search / Trace / Expand |
| `R` / `PATH` | Trace playback |
| `L` / `LENS` | Lens filter |
| `P` / `[` `]` | Stories /_prev/next |
| `+` `-` `0` | Zoom in/out/reset |
| `/` | Search |
| `#focus=<id>` | Deep link to node |
| `#focus=<id>&reach=upstream\|downstream` | Reachability highlight |
| `#relation=<id>` | Relation focus |
| `#route=<source>~<target>` | Route highlight + share card |
| `#lens=<kind>~<kind>` | Kind filter |
| `#view=<view-id>` | Named view |

**Reach & Route cards** export as `1200×630` share images (`Route Share Card`, `Reach Share Card`).

---

## 6. How Lokma Integrates Archify

### 6.1 Principle: Agent Produces IR — Lokma Renders

Lokma does **not** re-implement Archify. It **vendors or plugins** it:

- **Option A — Skill (recommended v1):** `npx skills add tt-a1i/archify -g` → agent skill `archify` available in every session. Agent writes IR to `.lokma/archify/<id>.json`, Lokma calls `archify build`.
- **Option B — DSH plugin:** `@tt-a1i/archify-dsh` for DeepSeek Harness parity (Lokma's Cordis-light kernel can load it).

### 6.2 Storage

```
~/.lokma/archify/<id>/
  ir.json          # typed JSON IR (source of truth)
  index.html       # self-contained viewer (deliverable)
  share.png        # 1200×630 card
  share.webm       # optional trace recording
  delta.html       # if compared
  receipt.json     # validation repair receipt
```

Project-local mirror: `.lokma/archify/<id>/` (gitignored by default, `lokma archify export` copies to `Docs/diagrams/`).

### 6.3 Agent Tool

Lokma exposes `archify` as a tool the agent can call (like `read_file`):

```
archify { action: "generate", type: "architecture", prompt: "Map Lokma's web harness: Next.js → Fastify → SQLite + WS", preset: "signal-flow" }
archify { action: "validate", ir: {...} }
archify { action: "delta", baseId: "abc", headId: "def" }
archify { action: "export", id: "abc", format: "png" }
```

Guard: agent must `validate` before `deliver`; Lokma enforces `deployment-ownership profile fails closed` (no deliver if validation fails).

### 6.4 Web Pane — Diagram Studio

```
┌─────────────────────────────────────────────────┐
│ Left: Diagram List + Filter                     │
│  [All] [Architecture] [Workflow] [Sequence] …  │
│  ┌─ search ─┐  + New Diagram                  │
│  • architecture — Lokma web harness (dark)     │
│  • workflow — agent spawn lifecycle            │
│  • sequence — tool call loop                   │
├─────────────────────────────────────────────────┤
│ Center: Interactive HTML Viewer (iframe)       │
│  ← sandboxed iframe, self-contained HTML →     │
│  Controls: ? / M / F / / / R / L / zoom       │
│  Deep links: #focus=api&reach=downstream       │
├─────────────────────────────────────────────────┤
│ Right: Source + Validation + Export            │
│  Tabs: [JSON IR] [Receipt] [Export]            │
│  Export: [PNG] [SVG] [WebM] [Share Card]       │
│  Delta: [Compare…] → Before/Delta/After        │
└─────────────────────────────────────────────────┘
```

- **Left:** filter by type + search + create from prompt or from codebase trace (`archify guide "Show API request with Redis cache miss"`)
- **Center:** sandboxed `iframe srcdoc` or file URL, same viewer contract (`?` help, `R` trace, `L` lens)
- **Right:** editable JSON IR (Monaco), validation receipt table, export menu, delta toggle

### 6.5 API

```
POST   /api/archify/generate   { type, prompt, preset?, sources? } → { id, ir, htmlUrl }
POST   /api/archify/validate   { ir } → { ok, errors[], receipt }
GET    /api/archify/list       → { items: [{ id, type, preset, title, updatedAt }] }
GET    /api/archify/:id        → { ir, htmlUrl, receipt, shareUrl }
POST   /api/archify/:id/delta  { baseId } → { deltaHtmlUrl, diff: { added, removed, changed, moved, rerouted } }
GET    /api/archify/:id/export?format=png|svg|webm  → file
```

All artifacts are also plain files under `~/.lokma/archify/` — future apps (Desktop, CLI `lokma archify open <id>`) read the same store, no duplication.

### 6.6 Share Cards & Exports

- **PNG/SVG:** headless Chromium screenshot of the HTML (same as Archify's own export)
- **WebM:** trace animation recording (optional, `video` export)
- **1200×630:** OG-style share card for `route` / `reach` deep links — `GET /api/archify/:id/card?route=web~api`

---

## 7. Lokma Roadmap Slot

| Phase | What |
|-------|------|
| **0 — Scaffold** | Vendor `archify` skill, `~/.lokma/archify/` dir, `archify` tool stub |
| **1 — Generate** | `POST /api/archify/generate` + `validate` + `GET /list/:id` + pane list+viewer |
| **1.5 — Delta** | `compare` + Before/Delta/After pane + share cards |
| **2 — Polish** | Agent `guide` from codebase, `DESIGN.md` brand marks, export pipeline hardening |

---

## 8. Why Not Mermaid

| Mermaid | Archify |
|---------|---------|
| Text → SVG via browser, layout nondeterministic | Typed IR → deterministic HTML/SVG, pixel-stable |
| No validation beyond syntax | 5 atomic gates (schema/layout/route/label) + receipt |
| No native delta | First-class Before/Delta/After |
| No viewer contract | Deep links, reach/route/lens, share cards |

---

## 9. References

- Archify repo: https://github.com/tt-a1i/archify
- Archify SKILL.md: `archify/SKILL.md` + `docs/architecture.md`
- Lokma panes: `24-WEB-PANE-SYSTEM-and-orchestration.md`
- Lokma plugins: `23-PLUGIN-SYSTEM-deepseek-cordis.md`
- Lokma roadmap: `25-WEB-ROADMAP.md` · `03-YOL-HARITASI.md`
