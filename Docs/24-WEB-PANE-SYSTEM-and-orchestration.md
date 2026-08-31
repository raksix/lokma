# Pane System & Agent Orchestration (Web)

> **Goal:** An IDE-grade, fully draggable web surface where every piece is a pane you can move, resize, collapse, or drag into another session.
> **Principle:** The pane layout is a plugin (`@lokma/plugin-pane`), the orchestration view is a plugin, the file browser is a plugin — all rendered by `flexlayout-react` (or alternative from `21-*`).

## 1. Pane System — What the User Asked For

Spec (from your message):

- Advanced pane system
- Left + right sidebars (left: chats / sessions / projects, reorderable; right: file browser, live harness terminal logs, browser preview)
- Drag session into session (drop a session tab onto another session's pane)
- Full flexibility

### 1.1 Layout Model

`flexlayout-react` model (JSON, persisted to `localStorage` + optional `~/.lokma/layout.json`):

```
Root (row)
├── Border LEFT (collapsible, 260px)
│   ├── TabSet "Sessions"  (sessions list)
│   ├── TabSet "Projects"  (project picker)
│   └── TabSet "Chats"     (recent threads, if separate from sessions)
├── Center (row, flex: 1)
│   ├── TabSet A  (Chat — active session, e.g. "Refactor auth")
│   └── TabSet B  (Code — file preview, diff, search results)
└── Border RIGHT (collapsible, 340px)
    ├── TabSet "Files"     (file tree)
    ├── TabSet "Terminal"  (live PTY logs)
    └── TabSet "Browser"   (harness browser preview)
```

Each `Tab` is a component:

| Tab id | Component | What it shows |
|--------|-----------|---------------|
| `sessions` | `<SessionsPane>` | Session list, search, `+ New`, drag handle |
| `projects` | `<ProjectsPane>` | Project list, `+ Add project` (cwd picker), switch |
| `chat` | `<ChatPane sessionId>` | Streaming chat for one session, slash palette, model switcher |
| `file-tree` | `<FileTreePane>` | Project file tree, open → Code pane, drag file → chat (`@file`) |
| `terminal` | `<TerminalPane>` | `xterm.js` attached to `harnessLogs` stream for the session |
| `browser` | `<BrowserPane>` | `iframe` or proxied preview the harness controls (see §3) |
| `code` | `<CodePane>` | Monaco editor (read/preview), diff viewer (`hashline` style) |
| `git` | `<GitPane>` | Branch, diff, commit log, `@lokma` config |
| `orchestration` | `<OrchestrationPane>` | All running agents, subagent tree, logs — see §4 |
| `usage` | `<UsagePane>` | Charts from `22-*` |

### 1.2 Interactions

| Interaction | How |
|-------------|-----|
| **Drag tab to new zone** | Grab tab header, drop on any `TabSet` drop zone or border. `flexlayout-react` handles it. |
| **Drag session into session** | Drag a row from `<SessionsPane>` (draggable) and drop on a `<ChatPane>` tab — events: `pane/drop` with `{ source: { type: "session", id }, target: { paneId, sessionId } }`. Behavior: options — `Open side-by-side` / `Merge transcript` / `Fork into this session`. Default: open side-by-side as split. |
| **Resize pane** | Drag splitter, or `View → Reset Layout`. |
| **Collapse sidebar** | Click border collapse arrow, or `Ctrl+B` (left) / `Ctrl+Shift+B` (right). |
| **Reorder left** | Drag `Sessions` / `Projects` / `Chats` tabs within the left border to reorder. Persisted. |
| **Pop-out / maximize** | Double-click tab header to maximize, `Esc` to restore. |
| **Save/restore** | `localStorage: lokma:layout:v1` + `lokma --dump-layout` CLI. `View → Reset Layout` restores default. |

### 1.3 State

```ts
// Zustand store: usePaneStore
type PaneState = {
  model: IJsonModel // flexlayout-react model (serializable)
  activeSessionId: string | null
  openTabs: { id: string, sessionId?: string }[]
}
// Persist: localStorage + optional server sync (cloud mode)
```

---

## 2. Left Sidebar — Sessions / Projects / Chats

### 2.1 Sessions

- Same as `22-*` §4.2, but as a pane:
  - Virtualized list (`react-virtuoso`), grouped by `Today / Yesterday / This week / Earlier` or `By project` (toggle).
  - Row: `●` status, `name`, `model` pill, `tokens`, `…` menu.
  - Search: `Ctrl+K` focuses the filter input.
  - Drag handle: `⋮⋮` on hover — drag row to any `ChatPane` drop zone.
  - `+ New Session` sticky top button.

### 2.2 Projects

- List of `projects` (each = a `cwd` / repo root the harness has seen).
- Row: `name` (folder basename), `path` (muted), `session count`, `git branch` pill if git repo.
- Click → filters `Sessions` to that project, or `Switch project` (sets `activeProjectId`, chat's `cwd` context).
- `+ Add project` → dialog: path input (autocomplete from recent `cwd`s), `Open folder` (Electron later, for now text input).

### 2.3 Chats (optional split)

- If you want chats separate from sessions: recent threads (lightweight, no harness session yet) — quick prompts, history.
- Toggle: `Settings → Appearance → Show chats tab` (default off, sessions are enough for MVP).

---

## 3. Right Sidebar — File Browser / Live Logs / Browser

### 3.1 File Browser

- `react-arborist` virtualized tree, rooted at the active session's `cwd` (or `projectId`).
- Features:
  - Expand/collapse, icons by extension (lucide), git status overlay (M/A/D/? colors).
  - Click file → opens in `Code` pane (Monaco, read-only preview by default, `Open in editor` to make writable).
  - Drag file → drop on chat input → inserts `@<path>` mention (harness includes file in context).
  - Right-click → `Copy path` / `Copy relative` / `Reveal in Finder` (desktop later) / `Open terminal here`.
  - Search: `Ctrl+P` quick-open (fuzzy, like VS Code `Cmd+P`).

API:

```
GET  /api/files?cwd=/path&path=.            → { entries: { name, type, gitStatus }[] }
GET  /api/files/read?cwd=/path&path=src/a.ts → { content, lang, truncated }
```

### 3.2 Live Harness Terminal Logs

- `xterm.js` + `xterm-addon-fit` attached to the harness's PTY/log stream for that session.
- The harness runs `Bash` tool calls in a PTY (same as CLI). Web subscribes to `session/log` WS events and appends to the terminal.
- Controls: `Clear` / `Copy` / `Follow` toggle (auto-scroll) / `Open in dedicated terminal` (splits center).
- Multiple terminals: each concurrent tool Bash gets its own tab in this pane group (labeled `bash:1`, `bash:2`).

WS event:

```ts
// server → client on /ws/:sessionId
{ type: "terminal/data", data: "\u001b[32m$ npm test\n..." }
{ type: "terminal/exit", code: 0 }
```

### 3.3 Browser Preview (Harness-Driven)

- An `iframe` (or proxied `chrome` via `playwright` behind `/api/browser`) that the harness can open and control — like Claude Code's Chrome extension.
- Tools: `browser_navigate`, `browser_click`, `browser_screenshot`, `browser_eval` — exposed as harness tools, visible in this pane.
- UI: address bar (editable), `Back`/`Forward`/`Reload`, `Open in new tab`, `DevTools` toggle (later).
- Use cases: harness opens `http://localhost:3000` to verify a fix, takes a screenshot, asserts DOM — user watches live in the right pane.

API:

```
POST /api/browser/open   → { url } → { tabId, url }
GET  /api/browser/tabs   → { tabs: { id, url, title }[] }
WS   /ws/:sessionId — tool events drive browser actions
```

---

## 4. Agent Orchestration

### 4.1 What it is

When the harness spawns subagents (`Agent` tool) or runs parallel tasks, the orchestration pane shows the live tree.

### 4.2 UI

**Location:** `Orchestration` pane (center or right, user places it) + `Command Palette → Agent Hub` (`Alt+A` like OMP)

- **Tree:** root session → child agents (each with `task`, `status: running/done/error`, `tool`, `elapsed`).
  - Click agent → expands transcript for that subagent (same message format as chat, but nested).
  - `● running` green pulse, `✓ done`, `✗ error` red.
- **Task fan-out:**
  - `Task` (like OMP) → fans into isolated worktrees, shows `task-0`, `task-1` branches.
  - Progress: `3/5 done` bar, `Cancel` button per task.
- **Controls:** `Cancel all` / `Resume` / `View logs` (per agent).

### 4.3 Data

```ts
type AgentNode = {
  id: string
  parentId: string | null // sessionId or agentId
  task: string
  status: "running" | "done" | "error"
  tool?: string
  startedAt: string
  endedAt?: string
  transcript: Message[]
}
```

Events: `agent/start`, `agent/delta`, `agent/end` over WS (`/ws/:sessionId`). Same as CLI's `Agent` tool, just rendered.

---

## 5. Theming (OMP-Style)

- `themes/*.json` (same files CLI uses) — tokens → CSS vars.
- Example `omp.json`: `{ "colors": { "background": "#0a0a0f", "sidebar": "#0f0f12", "accent": "#6366f1", "border": "#26262b" }, "radius": "0.5rem" }`.
- `lokma theme set omp` or `Settings → Appearance → Theme` dropdown — updates `document.documentElement.style` + persists to `localStorage: lokma:theme` + `~/.lokma/config.json`.
- Four MVP themes: `claude` (cream/terracotta) · `omp` (near-black + indigo) · `midnight` (black) · `paper` (light warm).

---

## 6. Full Layout Example (Wireframe)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Lokma  ▸  my-project  ▸  Refactor auth  [claude-sonnet-4-5 ▾]  12k · $0.04 │
├──────────────┬──────────────────────────────────────┬─────────────────┤
│ LEFT (260)   │ CENTER                               │ RIGHT (340)     │
│ ┌──────────┐ │ ┌─────────────┐ ┌─────────────────┐  │ ┌─────────────┐ │
│ │ Sessions │ │ │ Chat        │ │ Code / Diff     │  │ │ Files       │ │
│ │ ● Refact │ │ │ You: fix …  │ │ src/auth.ts    │  │ │ ▾ src/      │ │
│ │ ○ Add th │ │ │ Lokma: …    │ │ - const x = 1  │  │ │   auth.ts   │ │
│ │ ○ Tests  │ │ │ 🔧 Read …   │ │ + const x = 2  │  │ │   auth.test │ │
│ │          │ │ │ [diff]      │ │                 │  │ │ ▸ tests/    │ │
│ │ Projects │ │ │ You: /clear │ │                 │  │ │             │ │
│ │ ▸ my-proj│ │ │             │ │                 │  │ │ Terminal    │ │
│ │   blog   │ │ │ [input ▸]   │ │                 │  │ │ $ npm test  │ │
│ │          │ │ │ /model  /…  │ │                 │  │ │ ✓ 12 tests  │ │
│ └──────────┘ │ └─────────────┘ └─────────────────┘  │ │             │ │
│              │ ┌─────────────────────────────────┐  │ │ Browser     │ │
│              │ │ Orchestration (3 agents)        │  │ │ [localhost: │ │
│              │ │ ● agent-1: find files  1.2s     │  │ │  3000    ]  │ │
│              │ │ ✓ agent-2: read auth   0.8s     │  │ │ ┌─────────┐ │ │
│              │ │ ● agent-3: edit tests  2.1s     │  │ │ │ preview │ │ │
│              │ └─────────────────────────────────┘  │ │ └─────────┘ │ │
├──────────────┴──────────────────────────────────────┴─────────────────┤
│  /  slash menu  •  @  file mention  •  Ctrl+K  palette  •  Ctrl+B bars │
└──────────────────────────────────────────────────────────────────────┘
```

This is the target. MVP can ship with fewer panes (Sessions + Chat + Files + Terminal) and add Browser + Orchestration in Phase 2.

---

*Next: `25-WEB-ROADMAP.md` — phased build plan.*
