# Prompt — Claude Light Web Harness (1:1 Docs, Spec-Compliant)

> **Use this prompt to generate a Claude Light–style web harness design that is 1:1 with the Lokma docs.**  
> **Model instruction:** Read the docs first, then generate. Do not invent features outside the docs.

---

## 1. Read These Docs First (single source of truth)

Before you write any code, read these files in order. They are the **only** spec — `Docs/` is tek kaynak.

1. `Docs/00-LOKMA-KONTEKST.md` — project rules (Docs single source, component/DRY/clean code, English docs & code)
2. `Docs/01-PROJE-TANIMI.md` — what Lokma is (innovative agentic harness, CLI+Web, two surfaces share `lokma-core` + `SessionStore JSONL`)
3. `Docs/02-TEKNIK-KARARLAR.md` — stack A decisions (bun workspaces, Fastify 5, Next 15, Tailwind v4, shadcn, flexlayout-react, Zustand, WS/SSE)
4. `Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md` — OMP theme system + visual language (themes/*.json → Chalk + CSS vars)
5. `Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` — CLI+Web harness layers (Ink TUI + Fastify + WS/SSE + provider abstraction `lokma-ai`)
6. `Docs/20-WEB-HARNESS-overview.md` — **Web harness overview:** single loop, pane-first, theme-aware, real-time, feature parity table (every Claude Code capability must exist in web)
7. `Docs/21-WEB-STACK-alternatives.md` — stack decision matrix (Next vs SvelteKit, Fastify vs Hono, mosaic vs flexlayout, etc.) — you chose **stack A**
8. `Docs/22-WEB-FEATURES-provider-model-session.md` — **Core web features (full spec):**
   - **Providers** (1.1–1.4): card per provider (logo/status/model count/enabled), `+ Add Provider` dialog (ID/Name/Base URL/API key/Test), edit sheet, status dots (ok/error/unconfigured), drag reorder, `GET/POST/PATCH/DELETE /api/providers`, `POST /api/providers/:id/test`, `keySet` masked
   - **Models** (2.1–2.4): catalog table `☑ | Model | Provider pill | Context | Pricing | Enabled dot`, search live filter, `Allow All / Disable All` per provider, provider badge (anthropic blue etc.), model switcher (grouped, context/pricing hint, `Ctrl+M`), fallback routing chain (drag reorder), `GET /api/models` merged 5m cache, `provider::id` dedupe
   - **Usage** (3.1–3.4): `prompt/completion/total` + `cost`, per session/model/day/provider, session badge `12.3k · $0.04`, dashboard `/usage` with KPI cards + AreaChart stacked 7/30/90d + Recent sessions table + CSV export, `GET /api/usage/*`
   - **Sessions** (4.1–4.4): lifecycle Create/List/Resume/Fork/Rename/Delete/Worktree/Checkpoint-rewind, sidebar grouped `Today/Yesterday/This week/Earlier`, row `● status dot + name + model pill + tokens + … menu`, `+ New Session` + `Ctrl+N`, chat center (bubbles, tool renderers, slash `/` + `@` file mention, streaming `text_delta`, permission prompt `Allow/Deny/Always`, `AskUserQuestion` multiple-choice, footer `tokens·cost·model·context%` bar, worktree `⎇` pill, `WS /ws/:sessionId`)
   - **Other Claude Code features checklist** (5): Permissions, Hooks, Skills, Plugins, MCP (4 transports), Git (`@lokma`, PR), Memory (`LOKMA.md`), Subagents, Checkpoints, Worktrees
9. `Docs/23-PLUGIN-SYSTEM-deepseek-cordis.md` — DeepSeek Cordis **everything-is-a-plugin** (tools, providers, panes, themes as plugins, `flexlayout-react` pane plugin)
10. `Docs/24-WEB-PANE-SYSTEM-and-orchestration.md` — **Pane system & orchestration (1:1 wireframe):**
    - **Layout model:** `flexlayout-react` JSON persisted `localStorage: lokma:layout:v1` + `~/.lokma/layout.json`, Root(row) → Border LEFT 260px (Sessions/Projects/Chats reorderable tabs) → Center flex:1 row (Chat + Code) → Border RIGHT 340px (Files/Terminal/Browser), each Tab = component (`SessionsPane`, `ProjectsPane`, `ChatPane`, `FileTreePane`, `TerminalPane`, `BrowserPane`, `CodePane`, `GitPane`, `OrchestrationPane`, `UsagePane`)
    - **Interactions:** drag tab to new zone, **drag session into session** (drop on ChatPane → options `Open side-by-side / Merge transcript / Fork`), resize splitter, collapse `Ctrl+B` / `Ctrl+Shift+B`, reorder left tabs, pop-out maximize double-click, `View → Reset Layout`, save/restore
    - **Left:** Sessions virtualized (`react-virtuoso`), Projects (name/path/count/branch), Chats toggle
    - **Right:** Files (`react-arborist`, git overlay M/A/D, click→Code, drag `@file`, `Ctrl+P`), Terminal (`xterm.js` + `xterm-addon-fit`, `terminal/data`/`terminal/exit` WS, `bash:1/2` tabs), Browser (`iframe` proxied, `browser_navigate/click/screenshot/eval`, address bar)
    - **Orchestration:** tree root→child agents (`running/done/error`, `●` pulse), fan-out `task-0..n` + `3/5` progress, `Alt+A` Agent Hub
    - **Theming:** `themes/*.json` (claude/omp/midnight/paper) → CSS vars + `lokma theme set` + `localStorage: lokma:theme`
    - **Wireframe §6:** exact target layout (Lokma ▸ project ▸ session [model ▾] 12k·$0.04) — replicate 1:1

### Also include these systems (from roadmap, if relevant to web surface):
- `Docs/26-CONFIG-and-CREDENTIALS.md` — layered config (`~/.lokma/config.json` + provider keys masked)
- `Docs/27-SKILLS-auto-discovery-hermes-inspired.md` — skill discovery (`<available_skills>` index)
- `Docs/28-MEMORY-infinite-vault-graph.md` — vault + graph
- `Docs/30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` — 6 personas (reviewer/planner/tester/researcher/builder/custodian), per-agent SOUL/MEMORY/model
- `Docs/31-ARCHIFY-diagrams-and-viewer.md` — Archify pane (if shown)
- `Docs/33-TESTING-autonomous-harness-testsprite-inspired.md` — Testing pane
- `Docs/34-DESIGN-open-design-inspired.md` — Design canvas

---

## 2. Design Language — Claude Light (like the first Variant B you liked)

**Reference file:** `https://files.fermag.com.tr/share/variant-b-claude-light.html` (you must match its vibe, but add **all missing spec features**).

**Tokens (exact):**
- Background `cream #FAF9F5`, card `#FFFFFF`, muted `#F2F0EB` / `#EDE9E2`, line `#E8E4DE`, ink `#262624`, terracotta `#C96442` (primary, only for CTAs/active), terracotta hover `#B85A3A`
- Radius `0.5rem` (`--radius: 0.5rem`), `rounded-md` / `rounded-xl`, `shadow-card` (soft), no harsh shadows
- Typography: **Inter** (UI, 400/500/600), **Instrument Serif** (serif headings, italic variant, 600), **JetBrains Mono** (code, 400/500) — via Google Fonts
- shadcn **light** mode, `new-york` style, subtle borders, generous whitespace (Stripe/Linear minimal, paper texture optional)

**Layout vibe:** Sticky top nav (brand + breadcrumb + centered model pill + actions) → 3-column shell: left 248px `#FDFCFB` + center `max-w 720px` chat + right 340px stacked cards. Do **not** invent a new palette — keep Claude Light.

---

## 3. What You Must Build (1:1 with docs, no missing features)

Generate **one standalone HTML file** that is a **throwaway preview**, no build, that proves the full web harness:

### A. Top bar (1:1 with 24 §6 + 22 §3/§4)
- `Lokma ▸ my-project ▸ Refactor auth` breadcrumb
- `[claude-sonnet-4-5 ▾] 12k · $0.04` — model switcher (grouped by provider, `context 200k`, `pricing`, fallback chain hint, `Ctrl+M`) + token/cost badge (click → popover breakdown by turn) + `⎇ branch` worktree pill + `Checkpoints 4 · Rewind`
- Right: `● Live` + `Share` + `Health` + theme toggle `claude/omp/midnight/paper`

### B. Left 260px — Sessions / Projects / Chats (24 §2)
- Tabs `Sessions / Projects / Chats` reorderable via drag (persisted), `Ctrl+B` collapse
- **Sessions pane:** search `Ctrl+K`, `+ New Session` sticky top (`Ctrl+N`), grouped `Today / Yesterday / This week / Earlier` (or `Group by project` toggle), row: `●` status (running green pulse/idle/error) + `name` + `model pill` + `tokens` + `…` menu (Rename / Fork / Delete / Export), drag handle `⋮⋮` → drop on ChatPane shows `Open side-by-side / Merge transcript / Fork`, active row highlighted, virtualized hint
- **Projects pane:** list `name (folder basename)` + `path muted` + `session count` + `git branch pill`, click filters Sessions, `+ Add project` dialog (path autocomplete), `Switch project` sets `activeProjectId`
- **Chats pane (optional):** toggle `Settings → Appearance → Show chats tab`

### C. Center — Chat + Code (22 §4.2 + 24 §1)
- **ChatPane `sessionId`:** message list (user right `bg-terracotta` / assistant left `bg-white` border, tool renderers inline), streaming `text_delta` append + `tool_start` spinner + `tool_result` diff, `Permission banner` (`Allow / Deny / Always allow` + `Shift+Tab` hint), `AskUserQuestion` multiple-choice cards, slash menu `/` (model/clear/commit), `@` file mention (inserts `@<path>` from FileTree), footer `tokens · cost · model · context %` bar (42% `84k/200k`), input `textarea` + `Send` + `Model switcher` + `Rewind` button per edit (checkpoint)
- **CodePane:** Monaco preview (read-only), hashline diff (`- const x = 1` red / `+ const x = 2` green), `Open in editor`, checkpoint `Rewind`, file drag `@file` curl hint

### D. Right 340px — Files / Terminal / Browser (24 §3)
- **Files:** `react-arborist` tree rooted at `cwd`, icons by extension (lucide), git status overlay `M green / A blue / D red / ? gray`, click → Code pane, **drag file → chat inserts `@<path>`**, right-click `Copy path / Reveal`, search `Ctrl+P` fuzzy
- **Terminal:** `xterm.js` dark `#0a0a0f` attached to `harnessLogs` stream, `xterm-addon-fit`, WS `terminal/data` + `terminal/exit`, tabs `bash:1`/`bash:2`, controls `Clear / Copy / Follow / Open in dedicated terminal`, multiple concurrent Bash
- **Browser:** `iframe` proxied preview the harness controls (`browser_navigate`, `browser_click`, `browser_screenshot`, `browser_eval`), address bar editable, `Back/Forward/Reload`, `Open in new tab`, `DevTools` later — use case: harness opens `http://localhost:3000` to verify fix

### E. Bottom / Global
- Bottom bar: `/ slash menu · @ file mention · Ctrl+K palette · Ctrl+B bars`
- Command palette `Ctrl+K` (fuzzy, `Manage Providers`, `Switch Model`, `Agent Hub Alt+A`)

### F. Orchestration (24 §4)
- `Orchestration` pane (center or right, draggable) — tree `root session → child agents` (`task`, `status: running/done/error`, `tool`, `elapsed`), click expands transcript nested, `● running` pulse / `✓ done` / `✗ error`, fan-out `Task → worktrees task-0..n` + `3/5 done` bar + `Cancel` per task, `Cancel all / Resume / View logs`

### G. Providers / Models / Usage (22 §1-§3) — show as mini sections or tabs in the preview
- **Providers:** card per provider (logo, `connected/error/not configured`, model count, enabled), `+ Add Provider` dialog (ID/Name/Base URL/API key/Test Connection `POST /api/providers/:id/test`), edit sheet, drag reorder priority, `GET /api/providers`
- **Models:** catalog table `☑ | Model | Provider pill (blue anthropic / green openai) | Context | Pricing | Enabled dot`, live filter search, `Allow All / Disable All` per provider, checkbox = enabled (only enabled in switcher), fallback routing toggle + reorder, `GET /api/models` merged 5m cache, `provider::id` dedupe
- **Usage:** KPI cards `Total tokens 7d / Total cost 7d / Avg/session / Top model`, AreaChart stacked by model 7/30/90d (recharts), Recent sessions table `session | model | tokens | cost | date` + CSV export, session header badge `12.3k · $0.04` popover

### H. Other spec checklist (22 §5) — show at least as tabs or footer checklist
- Permissions (Settings → Permissions, `auto` classifier), Hooks (table event→matcher→command), Skills (`/` palette + Settings → Skills), Plugins (marketplace), MCP (4 transports: stdio/sse/http/ws, add/test), Git (branch/diff/commit/PR log, `@lokma`), Memory (`LOKMA.md` 200 lines), Subagents (Agent tool), Checkpoints (snapshot + Rewind), Worktrees (`⎇` pill + New Session toggle) — mark each as `✓ in preview` or `tab`

### I. Theming
- `themes/*.json` tokens → CSS vars (same files CLI uses via Chalk), dropdown `Settings → Appearance → Theme` `claude/omp/midnight/paper`, `lokma theme set omp`, persisted `localStorage: lokma:theme` + `~/.lokma/config.json`

---

## 4. Output Requirements

- **One standalone HTML file** (no build): `variant-b-claude-light-spec-prompt.html` or `spec-claude-light-1to1.html`
- **Tailwind CDN** (`https://cdn.tailwindcss.com`) + `tailwind.config` extend for cream/terracotta/ink/line, fonts via Google Fonts, inline CSS vars for shadcn tokens (`--radius`, `--background`, etc.)
- **No external build**, no npm, no `bun run build` — just open in browser
- **English comments** in code (`<!-- ... -->` and `// ...`), DRY, component-like sections (header, left, center, right, orchestration) with clear `<!-- Pane: Files -->` markers
- **Header:** include exact string `Claude Light — 1:1 Docs (Spec-Compliant)` in a banner and `<title>`
- **Footer:** spec checklist row showing `20/22/24` coverage + `themes/*.json` note + `flexlayout-react` + `WS /ws/:sessionId` + `~/.lokma/projects/<hash>/sessions/<id>.jsonl` (same as CLI)
- **Interactivity (minimal mock JS):** search filter for Sessions, `+ New Session` adds row, slash menu show/hide on `/`, `@` inserts file, `Allow/Deny` dismisses banner, AskUserQuestion selects, `Ctrl+K` opens palette, drag `⋮⋮` shows drop hint, `Rewind` toast, model dropdown mock
- **File location:** `/mnt/apopic/lokma/design-examples/claude-light-1to1-spec.html` (or `variant-b-claude-light-spec-1to1.html`)
- **Do NOT commit** — throwaway preview, just write file and return path
- **Verify:** header string present (2 matches), Tailwind CDN present, no build needed, all panes from §6 wireframe present

---

## 5. Verification Checklist (must pass before you finish)

```
[ ] Docs/00,20,22,24 read (cite them in code comments)
[ ] Top bar: Lokma ▸ project ▸ session [model ▾] 12k·$0.04 + worktree pill
[ ] Left: Sessions (Today/Yesterday, search Ctrl+K, +New Ctrl+N, drag ⋮⋮) + Projects
[ ] Center: Chat (bubbles, tool diff, permission banner, AskUserQuestion, slash /, @ file, rewind, footer tokens) + Code (Monaco diff)
[ ] Right: Files (arborist, git M/A/D, drag @file, Ctrl+P) + Terminal (xterm bash:1/2) + Browser (iframe localhost:3000)
[ ] Orchestration tree + fan-out task-0..n
[ ] Providers cards + Model catalog table (provider pills, Allow All) + Fallback chain
[ ] Usage KPI + AreaChart + Recent sessions table
[ ] Checklist footer for 22 §5 (Permissions/Hooks/Skills/MCP/Git/Memory/Subagents/Checkpoints/Worktrees)
[ ] Theme tokens cream #FAF9F5 / terracotta #C96442 / ink #262624 / line #E8E4DE, Instrument Serif + Inter + JetBrains Mono
[ ] Standalone HTML, Tailwind CDN, English comments, header string present
```

Generate the file now. Return the absolute path when done.

