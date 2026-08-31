# Infinite Memory + Vault + Graph — Hermes-Inspired for Lokma

> **Inspired by:** Hermes Agent memory (MEMORY.md/USER.md/FTS5/session_search/compaction) + `memory.fermag.com.tr` vault (Obsidian-style) + graph visualization
> **Raw:** `raw/28-hermes-memory-ham-arastirma.md` (1390 lines, 96KB) + `raw/29-obsidian-mcp-ham-arastirma.md` (879 lines, 77KB)
> **Live refs:** `~/.hermes/memories/MEMORY.md`, `~/.hermes/memories/USER.md`, `hermes_state.py` FTS5, `memory-vault-sync.py`, `memory-vault-routes.json`, `memory-vault/vault/` (370 notes), `obsidian` skill

## 1. Hermes Memory System (What We Copy)

### 1.1 Two files, one separator

```
~/.lokma/memories/MEMORY.md   # agent notes: env, conventions, lessons, diary
~/.lokma/memories/USER.md     # user profile: identity, prefs, comms style
```

- Separator: `§\n` (U+00A7, regex `§\s*\n`) — multiline entries allowed, literal `§` in prose is not a split.
- Limits: Hermes defaults `memory_char_limit: 2200` / `user_char_limit: 1375` — too small for vault-sync use, this host runs `200000`. Lokma default: **20000/5000** (10× Hermes, budgeted for vault), overridable via `lokma config set memory.memory_char_limit 50000`.
- Storage: profile-scoped (`~/.lokma/profiles/<name>/memories/`), `get_lokma_home()` never hardcodes `~/.lokma`.
- No `read` tool — memory is **snapshot-injected into the prompt** at session start (Layer 5/6), frozen for the session (preserves prompt caching). `memory` tool only does `add`/`replace`/`remove` (substring `old_text` match, dedup, overflow error with `current_entries` echo).

### 1.2 Frozen snapshot + prompt caching

`agent/prompt_builder.py` → `system_prompt.py` layers (stable → context → volatile):

```
Layer 5 volatile: ── MEMORY (FROZEN, §-joined) ── [67% 1474/2200 chars header]
Layer 6 volatile: ── USER PROFILE (FROZEN) ──
Layer 7 stable:   Skills index <available_skills>
Layer 8 context:  Project file (.lokma.md / AGENTS.md, cwd→git-root walk)
Layer 10 stable:  Platform hint (CLI vs Telegram)
```

- Mid-session `memory` writes are visible in tool response but **not in the frozen header** until next session — intentional, avoids cache invalidation.
- `prompt_caching.cache_ttl: 5m` — `model + apiKey + prefix bytes` = cache key. `/model` switch or credential-pool rotation invalidates.

### 1.3 Infinite memory = compaction + session_search

Hermes is "infinite" not because it never forgets, but because it **compresses and searches**:

- **Two-tier compression:** gateway hygiene (85% of transcript) + agent `ContextCompressor` (50% lean/default). `in_place:true` soft-archive, WAL+FTS5 `state.db` keeps everything queryable.
- **4-phase compaction:** trigger near limit → `Compressor` picks keep/discard → anchor index → summary embedded in place of discarded turns.
- **`session_search` tool:** 3 shapes (fts over `state.db` `messages_fts` + trigram + CJK) — `query` discovery (top N, hydrated), `session_id+anchor` scroll, `session_id` full read. Syntax: FTS5 boolean. Use for "what did we do about X?" without re-asking user.
- **Honcho (optional):** 5 tools for dialectic user modeling (perspective, memory, reasoning) — external provider, not required for MVP.

Lokma copies the **shape**: frozen-memory + compaction + `session_search` over SQLite FTS5. No Honcho dependency for v1 (pluggable later).

## 2. Vault Memory Pattern (memory.fermag.com.tr)

Your `memory-vault` is already the production proof for this:

- Vault lives in `vault/**/*.md` (folders `00-inbox`, `kisisel`, `projeler`, `notlar`, `gunluk`, `kaynaklar`), served at `https://memory.fermag.com.tr`, PM2 `memory-vault :3017` + nginx SSL, filesystem source of truth.
- **Hook-driven sync:** `post_tool_call ^memory$` → `memory-vault-hook.sh` → `memory-vault-sync.py --quiet` → `routes = memory-vault-routes.json` (match on first 140 chars, TR-safe `norm()` with `ıİ` fix) → `POST /api/ingest` with `<!-- lokma-sync -->...<!-- /lokma-sync -->` merge (preserves manual content).
- **Routes:** `projeler/<proje>.md`, `kisisel/furkan.md`, etc. — first 140 chars decides file; fallback `notlar/lokma-hafiza.md`.
- **Codebase maps:** `codebase-map` skill writes `codebase/codebase-map-<proje>.md` symbol indexes for `[[wikilink]]` navigation — not in FTS, but in graph.

**For Lokma, we generalize this to `lokma-vault`:**

```
lokma-vault/                # or reuse memory.fermag.com.tr with /lokma prefix
├── vault/
│   ├── lokma/              # Lokma-specific memories (routed from Lokma's MEMORY.md)
│   ├── kisisel/
│   ├── projeler/
│   └── gunluk/
├── config.json             # { secret, apiKey, users }
└── public/app.js           # graph view (force-graph, see §4)
```

Same `POST /api/ingest` + `Bearer` + `append_to` API. Same `<!-- lokma-sync -->` preserve-manual-content merge. Same `routes.json` routing (Lokma adds `lokma: → vault/lokma/` route).

`VaultPort` interface (so Lokma can swap backends):

```ts
interface VaultPort {
  ingest(path: string, content: string, opts?: { append_to?: string }): Promise<{ ok: true, path: string }>
  search(q: string): Promise<Note[]>        // FTS over vault
  graph(): Promise<{ nodes: Node[], links: Link[] }>
  tree(): Promise<Tree>
}
```

## 3. Obsidian MCPs — Which to Use, Which to Invent

Raw scraped 2112 `obsidian mcp` repos. Top relevant:

| Repo | ★ | Lang | Tools | Transport | Notes |
|------|---|------|-------|-----------|-------|
| `MarkusPfundstein/mcp-obsidian` | 4357 | Python | 7 (list, get, search, append, patch, delete) | stdio, **requires REST API plugin**, `mcp==1.x` pin | Oldest, most-starred, no graph/tags |
| `coddingtonbear/obsidian-local-rest-api` | 2867 | TS | REST + built-in MCP (`/mcp`) | http (`27123/27124`), self-signed CA | **Upstream** of above; since v5 ships own MCP, third-party wrapper optional |
| `cyanheads/mcp-obsidian` | ~1200 | TS | 12+ (vault, search, graph, tags) | stdio | Fork of Markus with graph+tags |
| `mcpvault` / `Steven` / `mcp-tools` / `aaronsb` / `basic-memory` | 50-800 | varied | vault CRUD, basic-memory has graph + entity model | stdio/http mix | Niche, graph where noted |

**Hermes's current choice:** `note-taking/obsidian` skill (file-based, no MCP) + `memory-vault` skill (API-based vault) — **not** `mcp-obsidian`. Reason: `mcp-obsidian` forces the Obsidian desktop plugin (REST API on `127.0.0.1:27124`) — not available on a VPS, breaks serverless. `basic-memory` is the only one with a real graph/entity model, but immature.

**Lokma's choice (recommended):**

- **Default:** file-based `obsidian` skill (reads `vault/**/*.md` directly, no plugin needed) + `VaultPort` via `POST /api/ingest` to Lokma's own vault (same as memory.fermag.com.tr). No `mcp-obsidian` dependency for MVP.
- **Optional MCP:** expose Lokma's vault as an **MCP server** (`lokma mcp serve --vault`) so Claude Code / Cursor / any MCP client can `list/search/read` Lokma's vault. This is the reverse direction from Obsidian MCPs — more useful for Lokma's browser harness than connecting to Obsidian.
- **Graph MCP:** do not ship an Obsidian MCP for v1 — ship `GET /vault/api/graph` (file → `[[wikilink]]` → graph) and let any MCP client call it.

## 4. Graph Visualization for Memory

Obsidian's graph:

- Nodes = notes (files), links = `[[wikilink]]` + `![embed]]` + frontmatter `links`.
- Render = force-directed (D3 `forceSimulation`, link distance + charge + collision).
- Features: filter by tag/folder, local graph (1-hop), timeline, 3D.

Lokma's vault already has `public/app.js` graph: fetch `/api/graph` → `{ nodes: [{ id, path, title, tags }], links: [{ source, target, type }] }` → render.

**Stack for Lokma web:**

| Layer | Choice | Why |
|-------|--------|-----|
| Build graph | Parse `[[wikilink]]` + frontmatter on write + on `POST /api/ingest` → `vault/graph.json` (cached, invalidate on mtime) | No DB scan on every view |
| API | `GET /api/vault/graph?folder=lokma&depth=2` → `{ nodes, links }` (filter by folder/tags, depth-limited) | Same as memory.fermag.com.tr `/api/graph` |
| Render (2D default) | `react-force-graph-2d` (canvas, 10k nodes) | Proven, faster than D3 SVG |
| Render (3D star-map) | `react-force-graph-3d` toggle (like Hermes `/journey` Star Map) | Optional, for marketing/extra |
| Interaction | Click node → `GET /api/vault/note?path=` → pane; drag → fix; search → highlight; filter by `projeler/lokma` | Same as Obsidian local graph |

No Obsidian desktop required — Lokma's graph is **web-native**.

## 5. How Lokma Implements Infinite Memory + Vault + Graph

### 5.1 Two stores, one flow

```
User prompt ──► Lokma agent ( ~/.lokma/memories/MEMORY.md frozen + <available_skills> + session_search )
                    │ memory tool (add/replace/remove)
                    ▼
              ┌─ MEMORY.md (local, §-delimited, 20K cap + compaction)
              ├─ vault sync hook (post_tool_call ^memory$) → VaultPort.ingest() → lokma-vault / memory.fermag.com.tr
              └─ state.db FTS5 (session_search, compaction archive)

Vault ingress also via: CLI `lokma memory add` / Web `POST /api/memory` / `POST /api/vault/ingest` (manual)
```

- **Local infinite:** `state.db` FTS5 + `session_search` + compaction keeps every session queryable even when `MEMORY.md` is capped.
- **Remote infinite:** vault keeps the **curated** long-term memory (routed, deduped, `[[linked]]`, graphed) — not raw sessions.

### 5.2 Memory tool (same as Hermes)

```ts
memory(action="add",     target="memory"|"user", content="...")           // append, dedup exact
memory(action="replace", target="memory"|"user", old_text="uniq", content="new") // substring match, 0|2+ → error
memory(action="remove",  target="memory"|"user", old_text="uniq")
```

Error on overflow: `{ success:false, error:"Memory at 19K/20K, consolidate: replace/remove stale entries", current_entries:[...], usage:"19K/20K" }` — echo live entries so agent can self-repair in the same turn.

### 5.3 Vault sync (lean, same hook)

```
Hook: post_tool_call pattern ^memory$ → scripts/vault-hook.sh → scripts/vault-sync.py --quiet
Routes: config = memory-vault-routes.json (first 140 chars norm() incl. İ/i fix)
Merge: <!-- lokma-sync --> ... <!-- /lokma-sync --> (preserves manual edits)
API: POST https://<vault-host>/api/ingest  Authorization: Bearer <VAULT_API_KEY>
```

Config (`~/.lokma/config.json`):

```json
{ "vault": { "host": "https://memory.fermag.com.tr", "apiKeyEnv": "VAULT_API_KEY", "routes": "memory-vault-routes.json" } }
```

### 5.4 Graph pane (web)

- Route: `GET /api/vault/graph` (proxied to `VaultPort.graph()`)
- Pane: left `Memory Vault` tree (folders) + center `Graph` (2D force, `react-force-graph-2d`) + right `Note preview` (Monaco markdown)
- Shared: `[[wikilink]]` clicks navigate graph + pane; `#tag` filter; `depth` slider (1-3 hops); `folder=lokma` default.
- Same `flexlayout-react` TabSet as other panes — draggable to any zone.

### 5.5 Roadmap hooks (auto-appended)

This doc auto-appends these items to `03-YOL-HARITASI.md` / `25-WEB-ROADMAP.md` (Phase 1 → 2, ~4 engineer-days):

- `memory` tool + `MEMORY.md/USER.md` + `LOKMA_SKILLS_DIR` + `.usage.json` parity
- `session_search` over FTS5 (`state.db`) + compaction gateway (85% + 50% tiers)
- `VaultPort` + `POST /api/vault/ingest` + `GET /api/vault/graph` + `GET /api/vault/note`
- `vault-sync.py` + `routes.json` + `<!-- lokma-sync -->` merge
- Web: `POST /api/memory` (masked), `Graph` pane (`react-force-graph-2d`), `Vault` file tree pane

---

*Raw: `raw/28-hermes-memory-ham-arastirma.md` (96KB) + `raw/29-obsidian-mcp-ham-arastirma.md` (77KB) · Next: `29-OBSIDIAN-MCP` deep comparison (already in §3) + `30-AGENT-SYSTEM` (pending 4 subagents)*
