# Obsidian MCP Ecosystem — Vault / Memory Integration Research

> **Date:** 2026-08-31 · **Research scope:** Obsidian MCP servers for vault/memory/graph integration · **Target:** Lokma harness  
> **Sources:** GitHub API (2112 repos match `obsidian mcp`), README scraping, package.json, skill docs, live vault inspection  
> **Output:** `/tmp/obsidian-mcp-raw.md` — raw research for `Docs/` synthesis

---

## Table of Contents

1. [Inventory — What Obsidian MCPs Exist](#1-inventory--what-obsidian-mcps-exist)
2. [Vault Operations — How Each Exposes Read/Write/Search/Graph/Tags](#2-vault-operations--how-each-exposes-readwritesearchgraphtags)
3. [Vault Memory Pattern for Agents — How hermes-agent Uses memory-vault](#3-vault-memory-pattern-for-agents--how-hermes-agent-uses-memory-vault)
4. [Comparison Table](#4-comparison-table)
5. [Recommendation — Which Pattern Is Best for Lokma](#5-recommendation--which-pattern-is-best-for-lokma)
6. [Appendix — Supplementary MCPs & Emerging Patterns](#6-appendix--supplementary-mcps--emerging-patterns)
7. [Sources & Verification](#7-sources--verification)

---

## 1. Inventory — What Obsidian MCPs Exist

> Stars captured 2026-08-31 via `GET /search/repositories?q=obsidian+mcp&sort=stars`. Total matches: **2112**. Below are the 9 most relevant, ordered by stars, plus 5 niche/graph variants.

### 1.1 MarkusPfundstein/mcp-obsidian — 4357 ⭐ (MIT, Python)

**Description:** _MCP server that interacts with Obsidian via the Obsidian REST API community plugin._  
**URL:** https://github.com/MarkusPfundstein/mcp-obsidian  
**Language:** Python 3.11+ · **License:** MIT · **Forks:** 496 · **Updated:** 2026-08-31  
**Install:**

```json
{
  "mcpServers": {
    "mcp-obsidian": {
      "command": "uvx",
      "args": ["mcp-obsidian"],
      "env": {
        "OBSIDIAN_API_KEY": "<api_key>",
        "OBSIDIAN_HOST": "127.0.0.1",
        "OBSIDIAN_PORT": "27124"
      }
    }
  }
}
```

Or dev: `uv --directory <path>/mcp-obsidian run mcp-obsidian`.

**Tools (7):**

| Tool | Signature | What it does |
|------|-----------|--------------|
| `obsidian_list_files_in_vault` | `()` | List all files/dirs in vault root |
| `obsidian_list_files_in_dir` | `(dirpath: string)` | List contents of a specific directory |
| `obsidian_get_file_contents` | `(filepath: string)` | Return raw content of one file |
| `obsidian_simple_search` | `(query: string, context_length?: int)` | Full-text substring search with scored snippets |
| `obsidian_append_content` | `(filepath, content: string)` | Append (or create) content to a note |
| `obsidian_patch_content` | `(filepath, operation, targetType, target, content)` | Surgical patch relative to heading, block ref, or frontmatter field |
| `obsidian_delete_file` | `(filepath: string)` | Delete file or directory |

**Transport:** stdio only (low-level `mcp` 1.x `Server` API — explicitly incompatible with `mcp>=2.0`).  
**Dependency:** Requires `coddingtonbear/obsidian-local-rest-api` Obsidian plugin running (provides the REST API).  
**Notes:** Oldest and most-starred. No MCP resources. No graph. No tag management. `mcp==1.x` pin is a known friction point — crashes on import if user has `mcp 2.0`.

---

### 1.2 coddingtonbear/obsidian-local-rest-api — 2867 ⭐ (MIT, TypeScript)

**Description:** _A secure REST API and Model Context Protocol (MCP) server for your vault._  
**URL:** https://github.com/coddingtonbear/obsidian-local-rest-api  
**Language:** TypeScript · **Forks:** 336 · **Updated:** 2026-08-30 · **Version:** 5.1.0  
**Distribution:** Obsidian Community Plugin (not an npm package alone). Install via Obsidian → Community Plugins → Local REST API.

**This is the upstream that `mcp-obsidian` depends on — but since v5 it ships its own built-in MCP server, making third-party stdio wrappers optional.**

**Install (MCP, built-in):**

```sh
# Claude Code (native HTTP MCP)
claude mcp add --transport http obsidian https://127.0.0.1:27124/mcp/ --header "Authorization: Bearer <key>"

# Claude Desktop (via mcp-remote bridge)
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["mcp-remote@latest","https://127.0.0.1:27124/mcp/","--header","Authorization: Bearer ***"]
    }
  }
}
```

HTTP: `https://127.0.0.1:27124/mcp/` (TLS self-signed CA) or `http://127.0.0.1:27123/mcp/` (plain, must enable in plugin settings).  
Cert: download `https://127.0.0.1:27124/obsidian-local-rest-api.crt` (name-constrained CA for 127.0.0.1/localhost only).

**REST API endpoints (also drive MCP tools internally):**

| Endpoint | Methods | Purpose |
|----------|---------|---------|
| `/vault/{path}` | GET PUT PATCH POST DELETE | CRUD on any vault file |
| `/vault/{path}/heading/{h1}/{h2}` | GET PUT POST PATCH | Section-targeted read/write (URL-path form) |
| `/vault/{path}/frontmatter/{key}` | GET PUT POST PATCH | Frontmatter field targeted |
| `/vault/{path}/block/{id}` | GET PUT POST PATCH | Block-ref targeted |
| `/active/` | GET PUT PATCH POST DELETE | Operate on currently open file |
| `/search/simple/` | POST | Obsidian fuzzy search, scored snippets |
| `/search/` | POST | JsonLogic structured search (`application/vnd.olrapi.jsonlogic+json`) |
| `/commands/` | GET | List Obsidian commands |
| `/commands/{id}/` | POST | Execute a command |
| `/tags/` | GET | List tags with counts |
| `/open/{path}` | POST | Open file in Obsidian UI |
| `/` | GET | Server status |
| `/mcp/` | GET POST | Streamable HTTP MCP server |

**MCP tools (18, via built-in server):**

| Tool | Purpose |
|------|---------|
| `vault_list` | List files/subdirs in a vault directory |
| `vault_read` | Read text file (content + frontmatter + tags + stat), refuses non-UTF-8 (points to binary variant) |
| `vault_read_binary` | Read file as base64 (1 MiB MCP cap; larger via REST) |
| `vault_write` | Create or overwrite file (text) |
| `vault_write_binary` | Create/overwrite from base64 |
| `vault_append` | Append to file |
| `vault_patch` | Surgical patch (`targetType`: heading/block/frontmatter, `operation`: append/prepend/replace/delete/move) |
| `vault_delete` | Delete (moves to trash by default) |
| `vault_move` | Rename/move file |
| `vault_copy` | Copy file |
| `vault_get_document_map` | Enumerate headings, block refs, frontmatter fields in a file |
| `active_file_get_path` | Return path of currently open file |
| `search_query` | JsonLogic search |
| `search_simple` | Full-text search |
| `tag_list` | List tags with counts |
| `command_list` | List registered Obsidian commands |
| `command_execute` | Execute a command |
| `open_file` | Open file in Obsidian UI |

**MCP transport:** Streamable HTTP, stateless (2026-07-28 revision) + sessionful (2024-10-07 → 2025-11-25). Protocol negotiation per request; `Mcp-Session-Id` header for sessionful clients.  
**MCP resources (1):** `obsidian://local-rest-api/openapi.yaml` (full OpenAPI spec).  
**Auth:** Bearer token (from plugin settings → Local REST API → API key). No OAuth/JWT in the plugin itself.  
**Extensibility:** Typed `getAPI(app, manifest, version)` extension interface — other plugins can register routes/tools against this server. Known extension: `obsidian-local-rest-api-periodic-notes` (periodic notes).  
**Special behaviors:** `vault_patch` supports raw-content mode (instruction in URL/headers, body is raw payload — for template clients), `within` index for block-level splicing, `ifMatch` optimistic concurrency, `Markdown-Patch-Warnings` header, CORS `Access-Control-Expose-Headers: *`.

---

### 1.3 bitbonsai/mcpvault — 1641 ⭐ (MIT, TypeScript)

**Description:** _A lightweight Model Context Protocol (MCP) server for safe Obsidian vault access._  
**URL:** https://github.com/bitbonsai/mcpvault · https://mcpvault.org  
**Package:** `@bitbonsai/mcpvault` (npm) v0.16.0 · **License:** MIT · **Forks:** 123 · **Updated:** 2026-08-29  
**Language:** TypeScript (Node ≥20)

**Install:**

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["@bitbonsai/mcpvault@latest", "/path/to/vault"]
    }
  }
}
```

Read-only variant: `["@bitbonsai/mcpvault@latest", "/path/to/vault", "--read-only"]`.

**No Obsidian plugin required, no Obsidian running** — works directly on vault files on disk (filesystem-first).

**Tools (18):**

| Category | Tool | Purpose |
|----------|------|---------|
| File ops | `read_note` | Read note |
|  | `write_note` | Create/overwrite/append/prepend |
|  | `patch_note` | Section-aware patch |
|  | `delete_note` | Delete (requires confirmation path) |
|  | `move_note` / `move_file` | Rename/move |
| Partial reads | `get_note_outline` | Headings + frontmatter outline |
|  | `read_note_lines` | Read by line range |
| Batch/directory | `list_directory` | List directory |
|  | `read_multiple_notes` | Batch read |
| Search | `search_notes` | Multi-word matching + BM25 reranking |
| Metadata/tags | `get_frontmatter` | Parse frontmatter |
|  | `update_frontmatter` | AST-aware frontmatter updates (preserves unchanged fields' formatting) |
|  | `get_notes_info` | Stats for notes |
|  | `get_vault_stats` | Vault-wide stats |
|  | `manage_tags` | Add/remove/list |
|  | `list_all_tags` | List all tags |
| Wiki links | `wiki_link` | Resolve `[[name]]` with disambiguation alternatives |

**Transport:** stdio only.  
**Safety:** Path checks block traversal, symlink escapes, dotfiles, `.obsidian`, `.git`, `node_modules`. Trimmed args before validation.  
**Formatting:** AST-aware frontmatter preserves formatting for unchanged YAML fields (notable vs naive string replace).

---

### 1.4 cyanheads/obsidian-mcp-server — 672 ⭐ (Apache-2.0, TypeScript)

**Description:** _Read, write, search, and surgically edit Obsidian vault notes, tags, and frontmatter via MCP. STDIO or Streamable HTTP._  
**URL:** https://github.com/cyanheads/obsidian-mcp-server  
**Package:** `obsidian-mcp-server` (npm) v3.5.0 · **License:** Apache-2.0 · **Forks:** 103 · **Updated:** 2026-08-29  
**Runtime:** Bun v1.3.0+ / Node compatible · **Framework:** `@cyanheads/mcp-ts-core` · **MCP SDK:** ^2.0.0

**Install (stdio):**

```json
{
  "mcpServers": {
    "obsidian-mcp-server": {
      "type": "stdio",
      "command": "bunx",
      "args": ["obsidian-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "OBSIDIAN_API_KEY": "your-local-rest-api-key"
      }
    }
  }
}
```

Install (HTTP): `MCP_TRANSPORT_TYPE=http OBSIDIAN_API_KEY=... bun run start:http` → `http://127.0.0.1:3010/mcp`.

**Also wraps `obsidian-local-rest-api`** (like `mcp-obsidian`) but is a standalone Node/Bun process with its own HTTP server and auth layer. Requires plugin v4.0.0–v5.x.

**Tools (14):**

| Tool | Description |
|------|-------------|
| `obsidian_get_note` | Read note in 4 projections: `content` (raw md), `full` (content+frontmatter+tags+stat+optional outgoing links), `document-map` (headings/block refs/frontmatter catalog), `section` (single heading/block/frontmatter value). Periodic note addressing (`daily`/`weekly`/`monthly`/`quarterly`/`yearly`) and forgiving case-insensitive path resolution with `Did you mean: …?` suggestions. |
| `obsidian_list_notes` | List vault path recursively (depth 2 default, max 20; 1000-entry cap), filters: `extension`, `nameRegex` |
| `obsidian_list_tags` | Vault tags with counts, hierarchical parents, ordered by count desc, cap `limit` default 200 max 10000, `nameRegex`/`minCount` |
| `obsidian_list_commands` | List Obsidian command-palette commands (opt-in `OBSIDIAN_ENABLE_COMMANDS=true`) |
| `obsidian_search_notes` | 3 modes: `text` (substring + context windows), `jsonlogic` (JSONLogic tree vs path/content/frontmatter/tags/stat), `omnisearch` (BM25 via Omnisearch plugin, price: `path:`/`ext:` filters, phrases, `-exclusion`, PDF+OCR). Cursor-paginated (MCP 2025-11-25 opaque cursors), per-file `maxMatchesPerHit` clipping. |
| `obsidian_write_note` | Create full-file PUT (refuses to clobber without `overwrite:true`), or section replace via `section` param; reports `created` + `previousSizeInBytes`/`currentSizeInBytes` |
| `obsidian_append_to_note` | Upsert append: without `section` = POST (creates if missing, appends if exists, `created` flag); with `section` = PATCH-with-append (file must exist, `createTargetIfMissing` to bring section into existence) |
| `obsidian_patch_note` | Surgical `append`/`prepend`/`replace` at heading/block/frontmatter target; heading leaf resolution (bare leaf → full `Parent::Child` path if unique, `ambiguous_section` if multiple) |
| `obsidian_replace_in_note` | Search-replace over scoped region (`body`/`frontmatter`/`both`), literal or regex, whole-word, flexible whitespace, case-sensitive, capture-group `$1`/`$&`, sequential multi-replacement, frontmatter YAML re-parse guard |
| `obsidian_manage_frontmatter` | Atomic `get`/`set`/`delete` on single frontmatter key |
| `obsidian_manage_tags` | Add/remove/list tags, `location`: `frontmatter` (default) / `inline` / `both`; inline skips fenced code, handles spacing, table padding, list indent |
| `obsidian_delete_note` | Permanent delete — requires human-in-the-loop confirmation (multi-round-trip `input_required`, `destructiveHint`, `cancelled` on decline) |
| `obsidian_open_in_ui` | Open file in Obsidian app UI, `failIfMissing`/`newLeaf` toggles |
| `obsidian_execute_command` | Dispatch command-palette command by ID (opt-in `OBSIDIAN_ENABLE_COMMANDS=true`) |

**Resources (3):**

| URI | Purpose |
|-----|---------|
| `obsidian://vault/{+path}` | Note (content+frontmatter+tags+stat) |
| `obsidian://tags` | All tags with counts (whole payload, unsorted) |
| `obsidian://status` | Server reachability, auth status, plugin/Obsidian version, manifest |

**Transport:** STDIO + Streamable HTTP. Pluggable auth: `none` / `jwt` / `oauth`.  
**Path policy:** Optional `OBSIDIAN_READ_PATHS` / `OBSIDIAN_WRITE_PATHS` (prefix-based, case-insensitive, implicit recursion) + `OBSIDIAN_READ_ONLY` kill switch; write paths implicitly readable; `path_forbidden` typed denies with `data.recovery.hint` + `data.activeScope`. Search results filtered silently against `READ_PATHS`.

---

### 1.5 StevenStavrakis/obsidian-mcp — 730 ⭐ (MIT, TypeScript)

**Description:** _A simple MCP server for Obsidian._  
**URL:** https://github.com/StevenStavrakis/obsidian-mcp  
**Package:** `obsidian-mcp@2` (npm) v2.0.0 · **Language:** TypeScript · **Updated:** 2026-08-30 · **Node:** 22+  
**Tags:** `obsidian`, `obsidian-vault`, `mcp`, `mcp-server`

**Install:**

```bash
npx -y obsidian-mcp@2 serve --vault notes=/absolute/path/to/vault
```

Multi-vault:

```bash
obsidian-mcp serve \
  --vault work=/Users/me/Documents/WorkVault \
  --vault personal=/Users/me/Documents/PersonalVault
```

Client config:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "obsidian-mcp@2", "serve", "--vault", "notes=/absolute/path/to/vault"]
    }
  }
}
```

**No Obsidian plugin, no Obsidian running** — filesystem-first (each vault must contain `.obsidian` dir, absolute path, vault id lowercase `[a-z][a-z0-9_-]*`, max 10 vaults).

**Tools (12):**

| Tool | Purpose |
|------|---------|
| `obsidian_list_vaults` | List configured vault ids (no host paths leaked) |
| `obsidian_read_note` | Read bounded page of a note + SHA-256 `etag`; opaque cursor paginated, 25k char cap; `if_match` for concurrency |
| `obsidian_create_note` | Atomically create without overwriting |
| `obsidian_edit_note` | Append/prepend/replace exact content (with `if_match` revision guard) |
| `obsidian_delete_note` | Move to MCP trash (`.obsidian-mcp/trash`, default) or permanent with `confirm_path`; recovery via `obsidian-mcp recovery list/restore` |
| `obsidian_move_note` | Rename/move + transactionally update unambiguous backlinks (`[[links]]`, embeds, Markdown links, aliases, URL-encoded, heading/block anchors) |
| `obsidian_create_directory` | Transactionally create directory |
| `obsidian_search_vault` | Search content/filenames/tags, bounded cursor pagination |
| `obsidian_add_tags` | Add tags atomically |
| `obsidian_remove_tags` | Remove (exact/nested/wildcard, bounded matcher not regex) |
| `obsidian_rename_tag` | Rename tag across vault atomically |
| `obsidian_manage_tags` | Unified add/remove workflow |

**Safety:** Canonicalize roots, reject duplicates/nested roots, reject absolute/UNC/drive/NUL/backslash/empty/dot-segment paths, reserve `.obsidian`, `.obsidian-mcp`, `.git`, `.backup`, `.trash`, reject symlinks/junctions/reparse, no shell execution, strict UTF-8.  
**Transactions:** Journaled, conflict-checked, atomically replaced, rolled back as one; snapshots in `.obsidian-mcp/transactions` (retained 30 days, 1 GiB cap, `--recovery-days` / `--recovery-max-bytes`). `obsidian-mcp doctor --vault id=/path` validates readiness.  
**Protocol:** Serves MCP `2026-07-28` + 2025-era by default; `--legacy reject` for modern-only.

---

### 1.6 jacksteamdev/obsidian-mcp-tools — 832 ⭐ (MIT, TypeScript) — ARCHIVED

**Description:** _Add Obsidian integrations like semantic search and custom Templater prompts to Claude or any MCP client._  
**URL:** https://github.com/jacksteamdev/obsidian-mcp-tools  
**Updated:** 2026-08-26 · **Status:** **Archived** (author stepped aside, points to 5+ community store alternatives)

**What it did:** Monorepo (`packages/mcp-server`, `obsidian-plugin`, `shared`) with Bun workspace. Two parts: Obsidian plugin + local signed binary MCP server.  
**Required:** Obsidian ≥1.7.7, Claude Desktop, Local REST API plugin + API key, optionally Templater (template execution) and Smart Connections (semantic search).  
**Features when alive:** Vault access via Local REST API, semantic search (via Smart Connections plugin), Templater execution with dynamic params.  
**Install:** Was via plugin setting → "Install Server" (download signed binary to `{vault}/.obsidian/plugins/obsidian-mcp-tools/bin/`, auto-configure Claude Desktop). SLSA provenance attestations on binaries.  
**Why it matters:** Historically the #1 MCP-related Obsidian community plugin (87k installs per author). Archived Aug 2026 — not recommended for new projects but its patterns (Templater + semantic search bridging) are reused by successors.

---

### 1.7 aaronsb/obsidian-mcp-plugin (Semantic Notes Vault MCP) — 457 ⭐ (MIT, TypeScript)

**Description:** _High-performance Model Context Protocol (MCP) server for Obsidian that provides AI tools with direct vault access through semantic operations and HTTP transport._  
**URL:** https://github.com/aaronsb/obsidian-mcp-plugin  
**Updated:** 2026-08-27 · **Version target:** v1.x · **Distribution:** Obsidian Community Plugin `Semantic Notes Vault MCP`  
**Tagline:** _The server is the plugin_ — no external Node process, no separate REST API bridge.

**Install:** Three paths — drag `.mcpb` bundle onto Claude Desktop (one-click), `claude mcp add --transport http obsidian http://localhost:3001/mcp --header "Authorization: Bearer ***"`, or generic MCP client HTTP config at `http://localhost:3001/mcp` (HTTP 3001) / `https://localhost:3443/mcp` (HTTPS). Own self-signed cert at `.obsidian/plugins/semantic-vault-mcp/certificates/default.crt`; for Bun runtimes (Claude Code) must set `NODE_EXTRA_CA_CERTS` (Bun ignores macOS keychain).

**Tools (8 families, ~35+ operations total):**

| Family | Purpose | Key actions |
|--------|---------|-------------|
| `vault` | File ops | `list`, `read`, `create`, `search`, `move`, `split`, `combine` + more (13 ops alone) |
| `edit` | Content modification | window editing, append, patch sections |
| `view` | Content display | view files, windows, active note |
| `graph` | Link navigation | `traverse`, find paths, analyze connections, multi-hop with depth control, backlink/forward-link analysis |
| `workflow` | Contextual hints | Suggest next actions based on vault state |
| `dataview` | Dataview | Execute DQL queries (if Dataview plugin installed) |
| `bases` | Database views | Query/export Bases |
| `system` | Vault info | Server status, commands, web fetch |

**Graph features (explicit):** BFS path-finding between notes, link traversal, tag-based navigation, `tag:`/`path:`/`content:` search operators + regex/phrase, relevance ranking with snippets, connected-component concept discovery, contextual synthesis across multiple notes.  
**Permissions:** Read-only mode, per-operation controls, path allow/block lists — enforced per-tool.  
**Notable integrations:** Dataview (DQL), Bases (database views), Omnisearch-adjacent ranking.

---

### 1.8 basicmachines-co/basic-memory — 3808 ⭐ (AGPL-3.0, Python)

**Description:** _AI conversations that actually remember. Never re-explain your project to your AI again._  
**URL:** https://github.com/basicmachines-co/basic-memory  
**License:** AGPL-3.0 · **Forks:** 269 · **Updated:** 2026-08-31 · **Python:** 3.12+ (uv + FastMCP 4 pre-release)  
**Package:** `basic-memory` (PyPI) · **Also:** Cloud hosted at basicmemory.com ($15/mo, locked, WorkOS + Neon Postgres + Tigris S3)

Not strictly an "Obsidian MCP" — it's a knowledge-graph MCP + Obsidian-compatible Markdown that can live in an Obsidian vault. Included because it solves the same problem (persistent agent memory in markdown + graph) differently.

**Install (local):**

```bash
uv tool install basic-memory --prerelease=allow
# or with Milvus vectors
uv tool install "basic-memory[milvus]" --prerelease=allow
```

Config: `basic-memory project add research ~/research`, `basic-memory config list`, etc.

**MCP tools (~16, grouped):**

| Group | Tools |
|-------|-------|
| Content | `write_note`, `read_note`, `edit_note`, `move_note`, `delete_note`, `read_content`, `view_note` |
| Search & discovery | `search_notes`, `recent_activity`, `list_directory` |
| Knowledge graph | `build_context` (navigates `memory://` URLs — the graph) |
| Projects | `list_memory_projects`, `list_workspaces`, `create_memory_project`, `delete_project` |
| Schema | `schema_infer`, `schema_validate`, `schema_diff` |
| Compatibility/diagnostics | `search`, `fetch`, `basic_memory_diagnostics` |

Behavior hints per tool (`readOnly`, `destructive`, `idempotent`, `openWorld`) so agents pick correctly without trial. Output defaults to text; `output_format="json"` for structured.  
**Storage:** Markdown files + SQLite + optional Milvus/Milvus vectors with cross-encoder reranking. Bidirectional Obsidian editing works — same `.md` files.  
**Knowledge graph:** Observations + `[[wikilinks]]` compound into context; semantic + hybrid search; `build_context` traverses graph iteratively.

---

### 1.9 Other Notable / Niche MCPs (brief)

| Repo | Stars | Pattern | Why mention |
|------|-------|---------|-------------|
| **skridlevsky/graphthulhu** (Go, MIT) | 169 | MCP server for Logseq + Obsidian knowledge graph — 37 tools (navigate/search/analyze/write/decision/journal/flashcard/whiteboard/health). Direct vault file reading, no plugin; graph-overview, topic-clusters, knowledge-gaps, BFS path-finding | Most graph-first design in the ecosystem; Go binary; strong analyzer suite |
| **jaredrhod/ai-memory-vault** (CC BY-SA 4.0) | 593 | Not an MCP — a vault *template+build script* (`ai-memory-vault.md` inside Claude Code) that scaffolds a full self-maintaining Obsidian vault (boot config, daily notes, profile, jobs), designed to be the AI's working memory outside the model | Template philosophy for agent memory structure; no size ceiling; one-step prime |
| **itechmeat/open-second-brain** (MIT) | 381 | Obsidian-native `Brain/` memory layer for Hermes Agent + any MCP host; deterministic `dream` pass, `visibility:` boundary enforcement, `brain_search` progressive disclosure, bank export/import, `o2b` CLI; MCP via stdio/HTTP, Host/Origin guard | Closest to hermes-agent's own memory architecture; hardened, production-credentialed |
| **Kwipu** (`benmaster82/Kwipu`) (MIT) | 267 | Local Graph RAG engine over Obsidian markdown | RAG retrieval pattern for vaults |
| **devwhodevs/engraph** (MIT) | 167 | Local knowledge graph for agents, hybrid search + MCP for Obsidian vaults | Graph + hybrid search combo |
| **optimikelabs/optimike-obsidian-mcp** | 39 | Governed MCP server with search, controlled editing, tasks, live bridges, health | Governed-access variant; tasks bridge |
| **jimprosser/obsidian-web-mcp** | 165 | Secure remote MCP server for Obsidian vaults — access from phone/remote Claude | Remote-first pattern (vs local-only) |
| **iacobson/obsidian-graphql-api** | — | GraphQL over vault (not MCP, but graph-adjacent API) | Alternative graph query language |

---

## 2. Vault Operations — How Each Exposes Read/Write/Search/Graph/Tags

### 2.1 Read Path

| MCP | Read primitive | Granularity | Extras |
|-----|---------------|-------------|--------|
| `mcp-obsidian` | `get_file_contents` — whole file raw text | File only | JSON-wrapped return |
| `local-rest-api` (built-in) | `vault_read` — content+frontmatter+tags+stat; `vault_read_binary` for non-UTF-8; also `vault_get_document_map` catalog; section-targeted GET via URL path `vault/{path}/heading/{...}` | File, section (heading/block/frontmatter), whole vault enumeration via `vault_list` | UTF-8 strict guard (refuses lossy decode, points to binary), `open_file` to focus Obsidian UI, `active_file_get_path` for current note |
| `mcpvault` | `read_note`, `get_note_outline`, `read_note_lines` (line range), `read_multiple_notes` (batch), `get_frontmatter` | File, outline, line window, batch | Paginated-ish via line ranges; batch compact vs prettyPrint |
| `cyanheads` | `obsidian_get_note` — 4 formats (`content`, `full`, `document-map`, `section`), path/case-insensitive with suggestions, periodic note addressing (`target:{type:"periodic"}`) | File, section, document map, structured full; outgoing links on demand (`includeLinks`) | Size reports (`previousSizeInBytes`/`currentSizeInBytes`), cursor pagination for large notes |
| `StevenStavrakis` | `obsidian_read_note` — bounded page + SHA-256 `etag`, opaque cursor, 25k char cap | Page window + cursor, path is vault-relative with `if_match` concurrency | Multi-vault addressing (`vault: notes` id), deterministic bounded output |
| `aaronsb` | `vault` (list/read/search) + `view` (files/windows/active) + dedicated viewer ops | File, window, active note, vault listing; search is cross-cutting | View/windows family is unique (active-note windowing); `split`/`combine` also live under read family |
| `basic-memory` | `read_note`, `read_content`, `view_note` + `build_context` (graph-guided expanding read) | File, chunk-level content, graph-navigated `memory://` expansion | `memory://` URLs are the graph read primitive (BFS from a seed) |
| `graphthulhu` | `get_page` (full recursive block tree), `get_block` (UUID, ancestor chain + siblings), `list_pages` (filter by namespace/property/tag) | Page, block, block tree, filtered list | Block-level read with ancestry is unique; Logseq-oriented block API |

**Takeaway:** The simplest read is "whole file as string" (`mcp-obsidian`). The richest read is Cyanheads's 4-projection `obsidian_get_note` or Graphthulhu's block-ancestor read. For agents, document-map/outlines before writes and cursor-paginated bounded reads are the agent-friendly patterns.

### 2.2 Write Path (Create / Append / Patch / Edit / Move / Delete)

| MCP | Create | Append/Prepend | Surgical patch | Edit/replace | Move/rename | Delete | Concurrency & safety |
|-----|--------|----------------|----------------|--------------|-------------|--------|----------------------|
| `mcp-obsidian` | via `append_content` (creates if missing) | `append_content` | `patch_content` (heading/block/frontmatter, operation relative) | implicit via patch | — | `delete_file` | No concurrency primitive; no trash |
| `local-rest-api` | `vault_write` (PUT), `vault_write_binary` | `vault_append`, also PATCH `within` | `vault_patch` (JSON instruction: `targetType`/`target`/`operation`/`content`/`value`/`within`/`scope`/`ifMatch`) | via `vault_patch` replace | `vault_move`, `vault_copy` | `vault_delete` (trash by default) | `ifMatch` version guard; `Markdown-Patch-Warnings` header; raw-content mode (instruction in URL/headers, body raw); `Target-Scope` marker/markerAndContent |
| `mcpvault` | `write_note` (overwrite/append/prepend modes) | same tool with mode flag | `patch_note` | `patch_note` | `move_note` / `move_file` (confirmation path required) | `delete_note` (confirmation path required) | Path checks; AST-aware frontmatter; confirmation paths |
| `cyanheads` | `obsidian_write_note` (full-file PUT, refuses clobber without `overwrite:true`; or section replace) | `obsidian_append_to_note` (upsert: creates if missing when no section; with section requires existing file + `createTargetIfMissing`) | `obsidian_patch_note` (append/prepend/replace at heading/block/frontmatter; bare-leaf heading resolution with `ambiguous_section`) | `obsidian_replace_in_note` (scoped search-replace: body/frontmatter/both, literal/regex, whole-word, flexibleWhitespace, caseSensitive, capture groups `$1`/`$&`, YAML re-parse guard; sequential multi-replacement) | — (not a tool; but writes can be done via write+delete) | `obsidian_delete_note` (human-in-the-loop confirmation round-trip, `destructiveHint`, size disclosure, `cancelled` on decline) | `previousSizeInBytes`/`currentSizeInBytes` on every mutation; forgiving case-insensitive resolution with `Did you mean` on NotFound; path policy gates (`READ_PATHS`/`WRITE_PATHS`/`READ_ONLY`) |
| `StevenStavrakis` | `obsidian_create_note` (atomic, no overwrite) | via `obsidian_edit_note` append/prepend | via `obsidian_edit_note` replace with exact content match | `obsidian_edit_note` (exact string replace, needs `if_match` etag to avoid lost update) | `obsidian_move_note` (updates unambiguous backlinks transactionally) | `obsidian_delete_note` (trash by default `.obsidian-mcp/trash`, snapshots in `.obsidian-mcp/transactions`, recoverable) | Journaled atomic transactions, rollback on failure, `if_match`/`expected_etags`, trash+transactions retention (30d, 1 GiB), `recovery restore` CLI |
| `aaronsb` | `vault.create` | edit/append | `edit` (patch sections) | `edit` (window editing, fuzzy text match) | `vault.move` (+ `split`/`combine` batch ops) | — | Permissions per-op + path allow/block; read-only toggle |
| `basic-memory` | `write_note` | via `edit_note` | `edit_note` | `edit_note` | `move_note` | `delete_note` | Project-scoped; no file-level locking discussed; behavior hints (`idempotent`, `destructive`) |
| `graphthulhu` | `create_page` (with props + initial blocks), `append_blocks` | `append_blocks`, `upsert_blocks` (batch nested children) | `update_block` (by UUID), `move_block` (reposition before/after/as-child, cross-page) | `update_block` | `rename_page` (+ updates `[[links]]` globally), `move_block` | `delete_block`, `delete_page` | `link_pages` bidirectional; `bulk_update_properties`; Go-side filesystem safety |

**Pattern contrast:**

- **Thinnest write:** `mcp-obsidian` (string facts, one operation). No guards → easy to clobber.
- **Surgical edits at heading/block/frontmatter** — Cyanheads + Local REST API are the most surgical (they share the underlying `markdown-patch-2` engine). Cyanheads adds the richest guard surface (YAML re-parse, `$`-escape rules, scope selection, ambiguous heading resolution, size deltas).
- **Transaction/rollback** — StevenStavrakis is the only one with true journaled atomic transactions + recoverable trash + `if_match` etags + doctor CLI.
- **Batch & graph-aware move** — StevenStavrakis (`move_note` rewrites backlinks), Graphthulhu (`rename_page` updates links, `move_block` cross-page), AaronSB (`split`/`combine`).

### 2.3 Search

| MCP | Mode(s) | Ranking / filters | Pagination | Notes |
|-----|---------|-------------------|------------|-------|
| `mcp-obsidian` | `simple_search` (single mode) | substring, scored snippets, context_length | none | simplest; one tool → easy LLM routing |
| `local-rest-api` | `search_simple` (fuzzy) + `search_query` (JsonLogic) | `simple`: scored snippets; `JsonLogic`: evaluated against `{path, content, frontmatter.*, tags, stat.{ctime,mtime,size}}` with `glob`/`regexp` (pattern-first) | none (REST has no cursor) | `regexp` on `content` is how backlinks are done (`\\[\\[Target Note(\\||#|\\]…)`) |
| `mcpvault` | `search_notes` (multi-word + BM25 rerank) | BM25 after candidate fetch | compact vs prettyPrint | Lightweight but better than naive substring |
| `cyanheads` | 3 modes: `text` (substring+context windows+`pathPrefix`+`maxMatchesPerHit`), `jsonlogic` (same as local-rest-api + glob/regexp), `omnisearch` (BM25 via Omnisearch plugin, price `path:`/`ext:` filters, phrases, `-exclusion`, typo tolerance, PDF+OCR via Text Extractor) | `text`: per-file clipping (10 default); `omnisearch`: BM25 capped at 50 (advisory `truncated:true`) | Opaque cursors (MCP 2025-11-25 spec), `totalCount` + `nextCursor` | Probe Omnisearch at startup; add `omnisearch` to mode enum only if reachable; restart to re-probe |
| `StevenStavrakis` | `obsidian_search_vault` (content/filenames/tags) | bounded search | Opaque cursor (like Cyanheads) | Non-trivial query surface but compact |
| `aaronsb` | Full-text with `tag:`/`path:`/`content:` operators, regex, phrase, relevance + snippets | Relevance ranking | — | Dataview path is separate tool; Bases query too |
| `basic-memory` | `search_notes` (keyword + semantic, optional cross-encoder rerank), `build_context` (graph traversal), `recent_activity` | Semantic + keyword; hybrid selectable | `list_directory` as browse | Best semantic story (Milvus optional); graph walk is via `build_context` `memory://` links |
| `graphthulhu` | `search` (full-text with parent chain + sibling context), `query_properties`, `query_datalog` (Logseq Datalog), `find_by_tag` (child hierarchy), plus analyzer ops | Context-rich hits; Datalog is raw power | — | `knowledge_gaps`, `topic_clusters`, `graph_overview`, `find_connections` are analyzer complements to search |

### 2.4 Graph (links, traversal, backlinks, analysis)

| MCP | Graph primitive | What the agent gets | Transport |
|-----|----------------|---------------------|-----------|
| `mcp-obsidian` | none | — | — |
| `local-rest-api` | none dedicated (backlinks via JsonLogic regexp on content; no traversal tool) | regex emulation of backlinks | — |
| `mcpvault` | `wiki_link` resolve (+ disambiguation) | Name → path resolution, alternatives | stdio |
| `cyanheads` | `obsidian_get_note` with `includeLinks:true` (outgoing links), JSONLogic regexp on content for backlinks; no multi-hop tool | Outgoing links per note; backlinks via search; no traversal/path-finding primitive | stdio/HTTP |
| `StevenStavrakis` | Move-time backlink rewrite (not a read tool) | Backlink awareness at mutation time | stdio |
| `aaronsb` | **`graph` family** — `traverse` (multi-hop with depth control), `find paths` between notes, backlink/forward-link analysis, tag-based navigation; conceptual `topic_clusters` via traversal | Depth-controlled BFS, bridge notes, domain overlap maps | HTTP |
| `basic-memory` | `build_context` over `memory://` URLs — iterative graph navigation (seed → expansion → step); wikilinks are graph edges | Path-based graph walk; observations + wikilinks compound | stdio/HTTP |
| `graphthulhu` | **Full graph toolkit:** `get_links` (fwd/back with block context), `traverse` (BFS path), `graph_overview` (global stats), `find_connections`, `knowledge_gaps`, `list_orphans`, `topic_clusters` (connected components + hubs) | Global view + local traversal + gap/cluster analysis | stdio (Go binary) |
| `open-second-brain` | `Brain/` wikilink graph + `brain_search` (keyword + optional semantic) + co-occurrence edges + continuity ranking + `clusters` | Structured per-result breakdown, trust metadata, typed `brain_codegraph` for code | stdio/HTTP (Hermes native) |

**Observation:** The ecosystem splits into two philosophies:

- **File API with links as text** (`mcp-obsidian`, `local-rest-api`, `cyanheads`, `mcpvault`, `StevenStavrakis`) — links are strings in content or frontmatter; graph is emergent over many reads + searches. No dedicated traversal tool means the agent must N+1-read to walk the graph.
- **Graph as a first-class primitive** (`aaronsb`, `graphthulhu`, `basic-memory` `memory://`, `open-second-brain` clusters/co-occurrence) — traversal, path-finding, orphans/clusters/gaps are single-call tools.

For an agent harness that plans to use the graph heavily (memory + project context + related notes), the second philosophy saves tokens and latency by an order of magnitude — one `traverse` or `build_context` replaces dozens of reads + searches.

### 2.5 Tags (listing, managing, frontmatter vs inline)

| MCP | List | Read per-note | Mutate | Quirks |
|-----|------|---------------|--------|--------|
| `mcp-obsidian` | — | via raw file content only | — | no tag tool |
| `local-rest-api` | `tag_list` | via `vault_read` frontmatter+tags | only via `vault_patch`/`vault_write` | raw; one call returns whole-set |
| `mcpvault` | `list_all_tags`, `get_notes_info` | `get_frontmatter`, `manage_tags`/`update_frontmatter` | `manage_tags` (add/remove/list) + `update_frontmatter` (AST-aware) | `location`-agnostic but AST-aware YAML |
| `cyanheads` | `obsidian_list_tags` (ordered by count, cap 200 default / 10000 max, `minCount`/`nameRegex`, hierarchical parents, withheld count disclosed) + `obsidian://tags` resource (raw snapshot) | `obsidian_get_note` `full` includes tags | `obsidian_manage_tags` (add/remove/list; `location`: `frontmatter`/`inline`/`both`) + `obsidian_manage_frontmatter` (`get`/`set`/`delete` on one key) | Inline adds at EOF; skips fenced code; whitespace handling documented; frontmatter is canonical |
| `StevenStavrakis` | `obsidian_search_vault` (filter by tag) + tag rename/add/remove | — | `obsidian_add_tags`, `obsidian_remove_tags` (exact/nested/wildcard), `obsidian_rename_tag` (vault-wide atomic), `obsidian_manage_tags` | Tag rename atomically across vault is unique |
| `aaronsb` | graph/tag-aware navigation | — | via edit | `tag:` operator in search |
| `basic-memory` | tags as frontmatter + wikilink-adjacent | via read | via `edit_note`/`write_note` | not a dedicated tag manager |
| `open-second-brain` | enumerates tags as part of search/clusters | Brain pages have typed frontmatter (`kind`, etc.) not flat tags | — | tags are secondary to typed kinds |

**Best tag implementation:** Cyanheads — ordered, capped, filterable listing + frontmatter↔inline reconciliation + fenced-code awareness.

**Truly atomic tag-wide rename:** StevenStavrakis (`obsidian_rename_tag`).

---

## 3. Vault Memory Pattern for Agents — How hermes-agent Uses memory-vault

### 3.1 The System as Deployed (production)

**Endpoint:** https://memory.fermag.com.tr — Obsidian-style Markdown vault, single source of truth is the filesystem at `/root/memory-vault/vault/**/*.md`. Graph view auto-renders from `[[wikilinks]]`; private git repo `raksix/memory-vault`. Web UI login (`raksix` / password in `config.json` scrypt hash) plus 7-day `vault_session` HttpOnly cookie; nginx basic-auth is absent (auth is in-app).

**Folders (canonical):**

| Folder | Purpose | Example |
|--------|---------|---------|
| `00-inbox` | Quick captures, default bucket | `00-inbox/hermes-ayna.md` |
| `kisisel/` | About the user (profile, prefs, people, hardware, rules) | `kisisel/furkan.md` |
| `projeler/` | One note per project | `projeler/lokma-ana-kontekst.md`, `projeler/notes-fermag.md`, `projeler/sooliva.md` |
| `notlar/` | Topics/ideas/principles | `notlar/hermes-hafiza.md` (full backup) |
| `gunluk/` | Daily logs (one file per date) | `gunluk/2026-08-31.md` |
| `kaynaklar/` | Research/resources | via `kaynaklar/` |
| `codebase/` | Auto-generated codebase maps (`bin/codemap.py`, skill `codebase-map`) | `codebase/<project>-map.md` |
| `hermes-memory/` | Bulk mirror (top-level, not under `notlar/`) — 370 separate notes (separate-sync mode) | `hermes-memory/memory-001-*.md` |

Also legacy Cyrillic `günlük/` folder exists on disk (kept, but API paths must be ASCII `gunluk`).

### 3.2 Recall — What the Agent Does at Session Start (unconditional)

```bash
curl -s -H "Authorization: Bearer $VAULT_KEY" https://memory.fermag.com.tr/api/all
# or /api/tree (structure), /api/graph (nodes/edges/missing), /api/search?q=term
```

- Always read `kisisel/` (user profile) and `projeler/` (project index). When a task touches a specific project, read that project's note in full and use it as context.
- If no relevant memory exists, say so — never fabricate.
- Accessible skills confirm this pattern:
  - `note-taking/memory-vault/SKILL.md` — Recall section: `GET /api/all` → skim `kisisel/` + `projeler/` → read task-specific note in full.
  - `note-taking/obsidian/SKILL.md` — filesystem-first vault read via `read_file`/`search_files` (vault-path convention `OBSIDIAN_VAULT_PATH` → fallback `~/Documents/Obsidian Vault`).
  - `note-taking/hermes-memory-to-vault/SKILL.md` — memory → vault sync topology.

**Web API (authenticated either by session cookie or Bearer):**

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/tree` | Bearer or cookie | Folder + note structure |
| `GET /api/graph` | Bearer or cookie | `nodes` + `edges` + `missing` (graph derived from `[[wikilinks]]`) |
| `GET /api/note?path=projeler/lokma-ana-kontekst.md` | Bearer or cookie | Single note content |
| `GET /api/all` | Bearer or cookie | All content (for search) |
| `GET /api/search?q=term&folder=&limit=` | Bearer or cookie | Scored full-text search (`matches` preview, `q≥3` triggers body search) |
| `POST /api/login` `{"username","password"}` → `vault_session` cookie | public | UI login |
| `POST /api/ingest` | Bearer only | Write/append (auto frontmatter `title/date/tags`, git commit+push) |
| `PUT /api/note` / `DELETE /api/note` | Cookie only (web UI) | Web editor path (not agent CLI) |

### 3.3 Save — The 5-Rule Contract (unconditional, "if in doubt — save")

From `memory-vault/SKILL.md` (version 1.0.0, `description: "When user says kaydet, save a note to the web memory vault"`):

- **Rule 1 — End of every task/session: append to `gunluk/<YYYY-MM-DD>`** — mandatory 2–5 bullets tagged `YAPILAN:` / `KARAR:` / `SONRAKI:` / `NOT:` via `POST /api/ingest` with `{"append_to":"gunluk/2026-08-31","content":"- YAPILAN: …\n- KARAR: …\n- SONRAKI: …"}`. Prefixed `append_to` creates the note with `# Title` if missing.
- **Rule 2 — Every user fact immediately → `kisisel/`**, always linking `[[kisisel/furkan]]` (preferences, corrections, hardware, people, dates, habits).
- **Rule 3 — Every project detail immediately → `projeler/<project>`** (work done, decisions, URLs, commands that worked, errors + fixes, gotchas).
- **Rule 4 — Ideas → `notlar/`, research/resources → `kaynaklar/`, quick captures → `00-inbox/`.**
- **Rule 5 — Corrections are most important memory** — save instantly on correction so it never recurs.

**Write path — two equivalent surfaces:**

```bash
# From host (server filesystem)
cd /root/memory-vault && python3 bin/save.py "Başlık" --folder projeler --tags etiket1,etiket2 --content "..."
cat body.md | python3 bin/save.py "Başlık" --folder kisisel

# From anywhere (API)
curl -s -X POST https://memory.fermag.com.tr/api/ingest \
  -H "Authorization: Bearer $VAULT_KEY" -H "Content-Type: application/json" \
  -d '{"title":"Başlık","folder":"projeler","tags":"a,b","content":"# ...\n\nMarkdown içerik [[kisisel/furkan]]"}'
```
```bash
# Append to daily log (creates if missing)
curl -s -X POST https://memory.fermag.com.tr/api/ingest \
  -H "Authorization: Bearer $VAULT_KEY" -H "Content-Type: application/json" \
  -d '{"append_to":"gunluk/2026-08-31","content":"- YAPILAN: Obsidian MCP araştırma tamamlandı\n- KARAR: Cyanheads + vault HTTP kısa liste\n- SONRAKI: PM uzlaşısı ile Lokma 03-yol-haritası"}'
```

Server: writes file, adds frontmatter, commits+pushes to git (`raksix/memory-vault`). Response: `{"ok":true,"path":"…"}`. `–no-push` exists for local-only. Slug transliterates Turkish chars to ASCII.

**Wikilinks:** `[[folder/note-name]]` (no `.md`, relative to vault root) — inside code blocks and fenced blocks they do not count as graph edges (server filters them). Missing targets show gray in graph.

**What NEVER goes in notes:** API keys, passwords, tokens, private URLs with credentials.

### 3.4 Auto Sync — hermes-agent Local Memory → Vault Mirror (effective, hands-off)

Hermes local memory lives at `~/.hermes/memories/MEMORY.md` + `USER.md` (delimiter `§\s*\n` — regex, not `split('§')`, because literal `§` inside text must not split).

**Hook (active since Aug 2026):** `post_tool_call` → matcher `^memory$` → `/root/.hermes/scripts/memory-vault-hook.sh` → `memory-vault-sync.py --quiet`. Runs ~15–20 s in background after every `memory` tool call. Allowlist in `~/.hermes/shell-hooks-allowlist.json`. Silence-on-success (empty stdout = success, stderr+exit 1 = failure). Verify with `hermes hooks list` / `hermes hooks doctor` / `hermes hooks test post_tool_call`.

**Routing:** `memory-vault-routes.json` — first matching route wins. Scan is on **first 140 characters** of each entry (prevents mid-string false positives). Turkish normalization in `norm()`: NFKD + lower + TR_MAP transliteration (because `'İ'.lower()` produces `i`+combining dot U+0307 that evades translate — fixed order: transliterate first, NFKD+lower second).

| Match (keywords, normed) | Destination |
|---------------------------|-------------|
| Project names (`proje-adi`, alias) | `projeler/<proje>.md` |
| Codebase maps | **not** `codebase/` (that's `codemap.py`'s territory) |
| User profile (`USER.md`) | `kisisel/furkan.md` |
| Generic/technical | `notlar/` |
| Catch-all | `00-inbox/hermes-ayna.md` |
| Full backup (always) | `notlar/hermes-hafiza.md` (every entry) |
| Daily sync line | `gunluk/YYYY-MM-DD` |

**Merge:** Every target note has `<!-- hermes-sync --> … <!-- /hermes-sync -->` sync block — only that block is rewritten on re-sync, preserving manual content, wikilinks, and frontmatter. New notes created as `# <title>` + sync block.

**Bulk mode (orthogonal):** `vault-bulk-ops/SKILL.md` — every entry becomes its own note under `vault/hermes-memory/{memory,user,skills}/<prefix>-NNN-slug.md` + 4 indexes (`index.md`, `memory-index.md`, `user-index.md`, `skills-index.md`) with wikilink tables; single bulk git push. Example: 2026-08-30 produced 370 notes (`commit e854f68`).

**Vault bulk + sync coexistence:** Grouped-notes sync (`memory-vault-sync.py`) and per-entry bulk export coexist; one is the curated reading surface, the other is the full forensic archive.

### 3.5 Conventions & Pitfalls Catalogued for Hermes ↔ Vault

- Vault lives also on filesystem — can be opened as a real Obsidian vault (select `vault/` dir) and already is via `hermes-memory/` expansion; graph works in Obsidian desktop.
- Folder names in API paths must be ASCII (`gunluk`, `kisisel`, never `günlük` with `ü`) — non-ASCII path bytes create garbage folders; server 400s on U+FFFD.
- `GET` accepts Bearer; `PUT/DELETE /api/note` is cookie-only (web editor) — agents must use `/api/ingest`.
- `git rm` of API-created notes from a stale clone fails ("pathspec did not match") — server already pushed; `git pull` first or delete via UI.
- `vault.py` — universal stdlib CLI (`: PY3 bin/vault.py "Başlık" --folder kisisel --content …`) works on Mac/Windows (reads `VAULT_KEY` env / `~/.vault-key` / `--key`).
- PM2 `memory-vault:3017` behind nginx `memory.fermag.com.tr` with certbot. `config.json` (scrypt hash, HMAC secret) is gitignored; rotate via `node gen-config.js 'NEW_PASS' raksix && pm2 restart memory-vault`.
- `notlar/hermes-hafiza.md` daily mirror never deleted (git history permanence); `gunluk/` daily logs accumulate without compaction.

---

## 4. Comparison Table

### 4.1 Capability Matrix (primary 8 MCPs)

| Capability | **Markus mcp-obsidian** | **Local REST API (built-in)** | **mcpvault** | **cyanheads** | **StevenStavrakis** | **jacksteamdev mcp-tools** | **aaronsb semantic** | **basic-memory** |
|------------|------------------------|-------------------------------|--------------|---------------|---------------------|---------------------------|---------------------|-----------------|
| **Stars (2026-08-31)** | 4357 | 2867 | 1641 | 672 | 730 | 832 (archived) | 457 | 3808 |
| **Lang / license** | Python / MIT | TS / MIT | TS / MIT | TS / Apache-2.0 | TS / MIT | TS / MIT | TS / MIT | Python / AGPL-3.0 |
| **Needs Obsidian running?** | Yes | **Yes** (IS the plugin) | **No** | Yes | **No** | Yes | **Yes** (IS the plugin) | No |
| **Needs plugin?** | Local REST API plugin | Self | None | Local REST API plugin | None (needs `.obsidian` dir) | Local REST + SmartConn/Templater | Self | None (vault-compatible) |
| **Transport** | stdio | **Streamable HTTP** (stateless + sessionful) | stdio | **stdio + HTTP** (pluggable auth) | stdio | stdio (signed bin) | **HTTP** (3001/3443) | stdio / HTTP |
| **Auth** | `OBSIDIAN_API_KEY` Bearer (via REST) | Bearer (API key) + CA cert (HTTPS) or plain HTTP toggle | vault path arg (implicit auth = process ownership) | `OBSIDIAN_API_KEY` (+ `OBSIDIAN_BASE_URL`, `VERIFY_SSL`, `MCP_TRANSPORT_TYPE`, `JWT|OAuth` on HTTP) | vault path + id allowlist | API key via plugin | API key + self-signed cert (`NODE_EXTRA_CA_CERTS` for Bun) | local vs cloud |
| **File read** | whole file | whole file, section-targeted (heading/block/frontmatter), binary, active, document-map, CORS-exposed | whole, outline, lines, batch, frontmatter parse | 4 projections (content/full/map/section), periodic notes, forgiving path | bounded page + etag cursor, 25k cap | vault access | vault/view family | content/chunk view |
| **File write** | append/patch/delete (7 tools, thin) | 18 tools: write, append, patch (`within`/`ifMatch`), move/copy, binary, raw-content mode | 18 tools: write with mode flags, patch, move with confirm, AST frontmatter | 14 tools: write/append/patch/replace with guards, size deltas, `createTargetIfMissing`, leaf resolution | 12 tools: journaled tx, `if_match`, trash, move rewrites backlinks | vault access, templater exec | vault/edit/view, split/combine | content tools + build_context |
| **Surgical edit granularity** | heading / block / frontmatter | heading / block / frontmatter /**scope** (`content`/`marker`/`markerAndContent`), `within` block index, `Target-Scope` header | heading / block / frontmatter | heading / block / frontmatter + `replace_in_note` with scope+regex+whole-word+flexibleWhitespace+case+capgroups | exact-content + `if_match` | — | fuzzy window + structure-aware | — |
| **Search** | simple substring | `simple` (fuzzy scored) + JsonLogic (glob/regexp) | multi-word + BM25 rerank | `text` + `jsonlogic` + `omnisearch` (BM25, Phrases, path:/ext:, PDF+OCR) with opaque cursors | content/filenames/tags, cursor | semantic (Smart Connections) + simple | `tag:`/`path:`/`content:` + regex/phrase, ranked | keyword + semantic (Milvus) + hybrid + cross-encoder |
| **Graph / traversal** | none | none (regex emu) | `wiki_link` resolve | outgoing links + backlinks via regex search | backlink-aware move | none | **multi-hop traverse, find paths, tag nav, clusters** | **`memory://` graph walk** (`build_context`) |
| **Tags** | none | `tag_list` (all with counts), patch via write | `list_all_tags` + `manage_tags` + AST frontmatter | `list_tags` (ordered by count, cap, hierarchical, filter) + `manage_tags` (frontmatter/inline/both, skips code) + `manage_frontmatter` | add/remove/rename (vault-wide atomic), wildcard matcher | — | `tag:` operator in search, tag nav | via frontmatter |
| **Destructive safety** | none | trash by default (REST: delete → trash) | confirmation path required | human-in-the-loop confirmation (multi-RTT `input_required`), `destructiveHint` | journaled trash + transactions + 30d/1GiB retention + `recovery restore` + doctor | — | read-only + per-op + path allow/block | behavior hints |
| **Path policy** | plugin-level (REST's vault root) | REST vault root only | blocks traversal/symlink/.obsidian/.git/node_modules/dotfiles | `OBSIDIAN_READ_PATHS`/`WRITE_PATHS` prefixes + `READ_ONLY` kill, `path_forbidden` typed errors, filtered search | canonicalize, reject bad paths, reserve `.obsidian/.obsidian-mcp/.git/.backup/.trash`, reject symlinks/junctions | via REST | per-op + path allow/block + readOnly | project-scoped |
| **Resources** | 0 | 1 (`openapi.yaml`) | 0 | 3 (`vault/{path}`, `tags`, `status`) | 0 | 0 | — | — |
| **Pagination** | none | none (REST list) | compact vs prettyPrint | opaque cursors (MCP 2025-11-25) + `totalCount`/`nextCursor` + `maxMatchesPerHit` | opaque cursors | — | — | text vs json, cs hints |
| **Concurrency** | none | `ifMatch` (PATCH optimistic) | confirmation paths | `previousSize`/`currentSize` on every mutation + case-insensitive resolution + `ifMatch` upstream | `etag`/`if_match` + `expected_etags` + tx journal | — | permissions per-op | — |
| **NPM / distribution** | PyPI `mcp-obsidian` via `uvx` | Obsidian plugin (not npm) + `obsidian-local-rest-api` (dev dep for extensions) | `@bitbonsai/mcpvault` | `obsidian-mcp-server` (npm + `ghcr.io` Docker + `.mcpb` + MCPB bundle) | `obsidian-mcp@2` (`bin: dist/main.js`) | signed binary via plugin installer | Obsidian `Semantic Notes Vault MCP` + `.mcpb` | `basic-memory` (PyPI uv) |
| **Burn-in / maintenance** | single-file Python, 100 open issues | 3 open issues; heavy test suite (`vaultOperations`, `mcpHandler`, cert, timeouts) | changelog + mcpvault.org, sponsor setup | 27 open issues; framework `@cyanheads/mcp-ts-core`, OpenTelemetry | 8 open issues; spec MIT, Bun/Node, legacy compat | **ARCHIVED** | 16 open issues; docs per tool in `docs/tools/*.md` | 61 open issues; large product (cloud + Teams) |

### 4.2 Transport & Auth Summary

| MCP | Local vs Remote | File vs API | Auth | TLS |
|-----|----------------|-------------|------|-----|
| `mcp-obsidian` | local (stdio subprocess) | **API** (calls Local REST API over HTTP localhost) | Bearer via env `OBSIDIAN_API_KEY` | CA self-signed (plugin) vs plain `http://127.0.0.1:27123` if plain toggle on |
| `local-rest-api built-in` | **remote-capable by design** (HTTP) — `https://127.0.0.1:27124/mcp/` + `http://127.0.0.1:27123/mcp/` — any host reachable if firewall allows; recommended local-loopback | **API** (is the Obsidian plugin) | Bearer + optional CA trust | HTTPS with locally-generated CA (downloadable), HTTP fallback |
| `mcpvault` | local | **file** (direct vault dir) | vault path arg = process ownership | none (local-only) |
| `cyanheads` | local (stdio) + **local HTTP** (`http://127.0.0.1:3010/mcp`) | **API** (proxy to Local REST API) | Bearer (`OBSIDIAN_API_KEY`) + optional `jwt`/`oauth`/`none` on its own HTTP layer; also `OBSIDIAN_VERIFY_SSL` | upstream self-signed → `OBSIDIAN_VERIFY_SSL=false` default; Bun fallback `NODE_TLS_REJECT_UNAUTHORIZED=0` |
| `StevenStavrakis` | local | **file** | vault id + absolute path allowlist, max 10 vaults | none |
| `aaronsb` | local HTTP (loopback ports 3001/3443) — **in-process inside Obsidian** | **API** (direct vault API, no rest bridge) | Bearer + self-signed cert | HTTP 3001 / HTTPS 3443 self-signed, `NODE_EXTRA_CA_CERTS` for Bun |
| `basic-memory` | local/remote hybrid (stdio locally, https to cloud) | **file** locally + cloud sync via SQLite/Milvus | local: process ownership; cloud: WorkOS + Neon + Tigris | cloud is standard TLS |
| `graphthulhu` | local | **file** | `vault` path arg (+ optional Logseq token at 12315) | none |

### 4.3 Feature-at-a-Glance (√ = first-class, ◐ = partial/emulated, × = absent)

| Feature | mcp-obs | REST built-in | mcpvault | cyanheads | Steven v2 | aaronsb | basic-mem | graphthulhu |
|---------|---------|---------------|----------|-----------|-----------|---------|-----------|-------------|
| List vault | √ | √ | √ | √ | √ | √ | √ | √ |
| Read file | √ | √ | √ (×4 forms) | √ (×4 formats+periodic) | √ (page+curs) | √ | √ | √ (page+block) |
| Search | √ (simple) | √ (simple+JsonLogic) | √ (BM25 rerank) | √ (text+JL+omnisearch) | √ (content/name/tag) | √ (tag/path/regex) | √ (+semantic) | √ (+Datalog/prop) |
| Write/create | √ | √ | √ | √ | √ | √ | √ | √ |
| Surgical patch | ◐ | √ | √ | **√√** (richest) | ◐ | √ | ◐ | √ (block-level) |
| Graph traversal | × | ◐ (regex) | ◐ (wiki_link) | ◐ (links+regex) | ◐ (move-time) | **√√** | **√√** (`memory://`) | **√√** (37 tools) |
| Tag list/manage | × | ◐ | √ | **√√** | √ (rename atomic) | ◐ | ◐ | ◐ |
| Dataview / Bases | × | × | × | × | × | **√** | × | × |
| Trash / recovery | × | ◐ (trash) | × | ◐ (confirm) | **√√** (tx+recovery) | × | × | × |
| Path policy | × | × | √ | **√√** | **√√** | √ | ◐ | × |
| Batch ops | × | × | √ (read_multiple) | × | × | **√** (split/combine) | × | √ (upsert/bulk) |
| Analyzer (orphans/clusters/gaps) | × | × | × | × | × | ◐ | × | **√√** |
| Resources | 0 | 1 | 0 | 3 | 0 | 0 | — | 0 |

---

## 5. Recommendation — Which Pattern Is Best for Lokma

### 5.1 Lokma Context (from `/mnt/apopic/lokma/Docs/`)

Lokma is **not** a clone — it's an **innovative agentic coding harness (CLI + Web, one loop, themeable, multi-provider)**. Per `00-LOKMA-KONTEKST.md` / `02-TEKNIK-KARARLAR.md`:

- Shared `packages/lokma-core` (loop, tools, sessions, plugin kernel) + `lokma-ai` (provider abstraction) + `lokma-shared` (Zod/WS) — shared by CLI (Ink TUI) and Web (Fastify WS + Next.js). Stack pending (A recommended: Next.js 15 + Fastify 5 + flexlayout-react + WS+SSE).
- Everything-is-a-plugin kernel (Cordis-inspired, ~300 lines, `23-PLUGIN-SYSTEM-deepseek-cordis.md`): service keys, events, `inject`, `waterfall`.
- Vault memory requirement is explicit: **"Her şey memory.fermag.com.tr'ye de kaydedilsin"** (`00-LOKMA-KONTEKST.md` Rule 5) — every project detail to the central vault, graph from `[[wikilinks]]`, daily log `gunluk/` — English docs/code from 2026-08-31 onward.
- Web harness already has a Memory feature spec'd (`22-WEB-FEATURES-provider-model-session.md`: Project Settings → `LOKMA.md` editor + Memory viewer, 200 lines/25KB).

**Lokma's vault needs, inferred:**

1. **Agent memory that outlives a session** — codebase-aware context (project maps, decisions, errors+fixes, commands that worked) in `projeler/<project>.md` + daily `gunluk/`.
2. **Knowledge graph over projects and notes** — wikilinks between `projeler/`, `kisisel/`, `notlar/`, `codebase/` so the planner can `traverse` from "auth bug" to the auth module note to the person who owns it to the prior fix.
3. **Hybrid CLI + Web with shared loop** — the memory surface must be available identically in the Ink terminal and the Next.js browser pane.
4. **No vendor lock-in, own the markdown** — files are the source of truth (the web UI is a viewer).
5. **Perf and determinism** — hashline edits (−61% tokens), ripgrep, 50KB read caps, bounded 25k responses, token-cheap graph walk over many N+1 reads.

### 5.2 Decision Frame — Three Architectural Patterns

The ecosystem reduces to three patterns — pick one family's semantics and implement Lokma's vault against it.

| Pattern | Representative | Core idea | Vault home |
|---------|---------------|-----------|------------|
| **A. API bridge** | `mcp-obsidian` / `cyanheads` / `local-rest-api built-in` | Vault lives in **Obsidian app (desktop)**, agent talks to it over **HTTP via the plugin**. Obsidian must be running for API-mode MCPs. | User's desktop Obsidian vault |
| **B. File-direct** | `mcpvault` / `StevenStavrakis` | Vault lives **on the filesystem** (`/path/to/vault`), agent reads/writes `.md` files directly. No plugin, no Obsidian required. Obsidian can still open the folder as a viewer. | Local dir (or NFS/git/syncthing) |
| **C. Sync-backed / hosted vault** | `memory.fermag.com.tr` (current hermes-agent), `basic-memory` cloud, `open-second-brain Brain/` | Vault lives **on a server** (web UI + API + git remote), mirrored locally via git, reachable as Obsidian vault and via API from any device/provider. Includes graph, search, and agent memory contracts. | Server (`memory-vault/vault/`) + git + Obsidian |

### 5.3 Evaluation Against Lokma's Fit Criteria

Scored on Lokma's actual constraints (1 = poor, 5 = excellent):

| Criterion | A. API bridge | B. File-direct | C. Sync-backed (current) | Winner |
|-----------|---------------|----------------|--------------------------|--------|
| **Works without Obsidian open** | 1 (no) | 5 | 5 (vault on disk/web; API even if desktop closed) | B/C |
| **Works from both CLI + Web harness** | 3 (web can reach localhost plugin if tunneled, but brittle; desktop Obsidian still must run) | 4 (web backend reaches vault dir via FS/volume; CLI same) | **5** (Fastify backend `POST /api/ingest` + `/api/graph/search` → both surfaces one call; no tunnel) | **C** |
| **Multi-provider / headless sandboxes** | 1 (cloud sandbox can't reach my laptop's 27124) | 2 (needs volume mount per sandbox) | **5** (providers connect to `https://memory.fermag.com.tr` over public TLS, or use mounted cache; harness loop doesn't need to know which) | **C** |
| **Graph traversal perf** | 2 (N+1 via search regex, or Cyanheads N+1 links) | 2 (`wiki_link` only, or `StevenStavrakis` has no traversal) | **4–5** if we add `graph`/`build_context` semantics to the web vault (today's `/api/graph` already emits nodes/edges/missing, but MCP traversal not yet an MCP tool) | **C (if augmented)** |
| **Memory outlives session (cross-host)** | 2 (vault stuck on one machine; no git-sync story) | 3 (requires us to run git/syncthing + resolve conflicts) | **5** (server already commits+pushes every ingest, `POST /api/ingest` is transactional; `mirror` history is git) | **C** |
| **Own the markdown / Obsidian edible** | 4 (vault is an Obsidian vault, markdown is truth) | **5** (files are truth; Open directly) | 5 (same: `vault/**/*.md` is the truth; web is viewer; Obsidian can open the dir) | **B/C tie** |
| **Auth / multi-agent safety** | 3 (single bearer key shared) | 2 (process ownership) | 4 (Bearer (`VAULT_KEY`) + session cookie + per-install `NODE_EXTRA_CA_CERTS`-like optional; extendable to JWT/scope) | **C** |
| **Tokens spent per recall** | 2–3 (many searches+reads to walk graph) | 3 | **2 today → 5 if we add disclosure/cards**: progressive disclosure (`cards` = path/title/score/snippet+`path:Lstart-Lend`) reduces recall by ~10× | **C (if augmented)** |
| **Operational cost** | 3 (install + maintain Obsidian + Local REST API on every dev machine) | 4 (npm/Go bin, but no hosted cost) | 4 (self-hosted Next/Fastify/PM2 + git private repo already running; marginal cost ~0) | C ≈ B |
| **Agentic tool count & noise** | 2 (7–18 tools but many overlap, LLM must choose among search modes) | 3 | 5 (single ingest + read/search/graph + progressive cards → minimal tool surface for the loop) | **C** |
| **Harness fit (shared core, plugins)** | 3 | 4 (easy to wrap as a Lokma plugin: `tool: vault_read|write|search|graph`, no external deps) | **5** (easy to ship as the reference `lokma-vault` plugin: shares `lokma-shared` Zod schemas, Cordis kernel `registerTool("vault.ingest", …)`, WS push via `server.notify.toolsChanged` pattern) | **C** |

**Score totals (out of 55):** A≈22, B≈34, **C≈49 (today) / 53 (augmented).**

### 5.4 Recommendation — C Augmented (Current hermes-agent Vault, Extended with Graph MCP)

**Keep the `memory.fermag.com.tr` vault as Lokma's memory substrate. Do not migrate to a plugin-dependent desktop vault or a pure local-filesystem MCP.**

**Why:**

- It's already the production substrate (Rule 5: everything → vault), it's git-backed, it's reachable from every surface Lokma needs (local CLI, local web backend, cloud provider sandboxes). No other option clears the "headless provider" test.
- It's the only option where **`docs + vault` are already one system** — files are truth, Obsidian is a viewer, commits are the audit trail.
- The two weaknesses of current C are fixable without switching families — they are feature gaps, not architecture gaps.

**Augmentations to close the gaps (small, concrete):**

#### (i) Add a graph-first MCP tool to the vault server (from Basic Memory / Graphthulhu / AaronSB playbook)

Ship a new `vault_graph` MCP tool (or 2–3 focused tools) over the existing Fastify server, served via the same Streamable HTTP path used by `local-rest-api` (so Claude Code / MCP Inspector / `claude mcp add --transport http` all work without `mcp-remote`):

- `vault_traverse` — BFS from seed paths/links/tags, depth-controlled, returns visited nodes + edge reasons + `missing` gray nodes (exactly `GET /api/graph` but path-filtered and paginated). Replaces N reads+s SEARCH with one hop.
- `vault_find_path` — shortest path between two notes (A* over `[[wikilinks]]` + tags; useful for planner: "how is `projeler/lokma-mcp` related to `projeler/notes-fermag`?").
- `vault_overview` — global stats (page count, edge count, most-connected, orphan list) mirroring `graphthulhu/graph_overview` — cheap for "what does the vault know about?" prompts.
- `vault_gaps` — orphan/dead-end/weakly-linked, like `graphthulhu/knowledge_gaps` — for hygiene.

These are **read-only**, derived from the existing `/api/graph` in-memory graph — no new index, no provider, no reindex.

#### (ii) Add progressive disclosure to vault search (from open-second-brain disclosure pattern)

Mirror `o2b`'s `disclosure: cards` vs `full`:

- Default `GET /api/search?q=…` stays `full` (back-compat).
- New query param `?disclosure=cards` (or MCP `vault_search` arg) returns **layer-1 cards**: `{path, title, score, reasons, snippet (bounded), chunkPointer: "path:Lstart-Lend"}` at ~10× token saving.
- New `GET /api/note?path=…&chunk=id` / `POST /api/expand` expands a card to full content (layer 2/3) with cursor pagination for long notes. Reuses existing read path.

Result: planner's recall becomes `search --disclosure=cards` (cheap) → `expand` only the 2–3 cards it needs — same bounded-knobs story that keeps context budgets intact.

#### (iii) Wire Lokma recall to the same hook semantics the vault already guarantees

- **Startup recall:** `GET /api/graph` + `GET /api/search?q=<project>` + `GET /api/note?path=projeler/<project>-ana-kontekst.md` — deterministic, parallel, token-bounded. Cacheable stateless, lives in `packages/lokma-core/session.ts` (not in the LLM prompt formatter).
- **Mid-task append:** `POST /api/ingest` with `append_to: "gunluk/YYYY-MM-DD"` and `folder: projeler` — keep the 5-rule contract; the hook keeps the mirror in `kisisel/hermes-hafiza.md` intact so forgetting is impossible.
- **Scope predicate:** Add `owner:` frontmatter (`lokma`, `user`, etc.) and a `visibility:` field that the search/traverse respects (from open-second-brain fence — but enforce at the 3 roots: ranked search, page walker, chunk reader; deny remote reach by transport, not arg). This gives Lokma multi-agent `owner:` separation when one vault serves CLI + web + provider sandboxes.

#### (iv) Ship Lokma's Vault as a Cordis-Style Plugin (Not a Hard Dependency)

- Package: `packages/lokma-vault` (or `@lokma/vault`) — implements `register(register)` per `23-PLUGIN-SYSTEM-deepseek-cordis.md`: registers `vault.ingest`, `vault.search`, `vault.graph.traverse`, `vault.expand`, + `vault.apply_markers` (for `@osb` markers, reuse the same `@osb set note=… field=… value=…` grammar so the codebase can be bidirectional if desired).
- `config.lokma-vault.json`: `{vaultUrl, apiKeyEnv: "VAULT_KEY", readOnly?: boolean, readPaths?: string[], writePath s?: string[], graphDepth?: number}` — mirrors Cyanheads's path policy but at plugin config layer.
- Fallback: when `VAULT_KEY` is unset or `vaultUrl` unreachable, plugin degrades to filesystem read via `OBSIDIAN_VAULT_PATH` (same markdown) — no prompt error; recall reports `missing` so harness can continue offline.
- Test harness: same `packages/lokma-core/session` harness uses `vault_mock` in CI (fixture graph + snapshots) so the vault MCP doesn't become a flaky-test dependency.

### 5.5 What Not to Do

- **Don't adopt `mcp-obsidian` (4357⭐) as Lokma's vault MCP.** Star count is a proxy for age and ubiquity, not fitness. It pins `mcp 1.x`, has only 7 thin tools, no graph, no tag, no auth beyond passthrough, no transport beyond stdio — it adds no capability the current web vault doesn't already cover and makes the stack brittle (must run Obsidian + Local REST API on every dev machine).
- **Don't embed `local-rest-api`'s built-in MCP into Lokma.** Excellent as a user's personal vault bridge, but it binds Lokma's memory to one desktop's Obsidian process and localhost 27124 — fails for headless providers, CI/cloud sandboxes, and the web harness running on a different host/container.
- **Don't vendor `cyanheads` or `StevenStavrakis` wholesale.** Borrow their designs (cyanheads: path policy + replace-in-note guards + 3-mode search; StevenStavrakis: journaled tx + etag + recovery) as patterns for the server augmentation — don't add a second vault server.
- **Don't take `basic-memory` as Lokma's memory store** for Lokma's central memory (even though 3808⭐ and graph-capable). AGPL-3.0, extra deps (Milvus/fastMCP 4 pre-release), and a separate DB/index diverge from the vault-is-files truth and duplicate `memory.fermag.com.tr`.
- **Do borrow:** `graphql` — no. `graphthulhu` analyzer (orphans/clusters/gaps/connected components) is the cheapest graph hygiene win — port the 4 queries to one `/api/graph/analyze` endpoint.

### 5.6 Concrete Next Steps for Lokma

1. **No stack change, no migration.** Keep vault server at `memory.fermag.com.tr` (PM2 `memory-vault:3017` + nginx). Confirm `OBSIDIAN_VAULT_PATH` on web backend falls back to a local checkout of `raksix/memory-vault` when `VAULT_KEY` absent (offline parity).
2. **Spec the vault augmentation** in a new `Docs/30-VAULT-MEMORY-and-graph.md` referencing this raw file: tool names, Zod schemas (in `lokma-shared`), WS notifications (`toolsChanged` on ingest), progressive disclosure contract.
3. **Prototype the Lokma vault plugin** (`packages/lokma-vault`): `vault.search(--disclosure cards)` → `vault.expand(chunkId)` → `vault.graph.traverse(seed,depth)` — three MCP tools, three hooks into session start and `POST /api/ingest` on commit/close.
4. **Add MOVE review:** after Phase 1 scaffold (per `25-WEB-ROADMAP.md`), run `graph_overview` + search-cards on the live vault and tune graph depth / card snippet length to Lokma's 25k output budget.
5. **Theme adjacency:** render `[[wikilinks]]` in Monaco/Markdown pane hits (chalk tokens `graph.edge`, `graph.missing`, `vault.card`) so graph navigation is visually distinct in the web harness.

---

## 6. Appendix — Supplementary MCPs & Emerging Patterns

### 6.1 Obsidian Plugin Extensibility (Local REST API Typed Extension API)

`obsidian-local-rest-api`'s `getAPI(app, manifest, version)` (install `npm i -D obsidian-local-rest-api`, peer deps `obsidian` + `zod` + `@types/express`) exposes:

- `addRoute(method, path, handler)` → `IRoute`
- `addMcpTool(name, description, zodSchema, handler, annotations?)` → removes when host revokes, triggers `notifications/tools/list_changed` on sessionful clients.

This is how `periodic-notes` extends the vault without forking the core. Lokma's own vault augmentations (`vault_traverse`, `vault_overview`) could be distributed as a **Local REST API extension** (`addMcpTool`) for users who keep their personal vault in Obsidian desktop — same semantics, two deployment vectors (web server vs desktop extension).

### 6.2 Graph-RAG hybrids

- **Kwipu** — local Graph RAG over vault markdown (retrieval-augmented generation in one hop).
- **engraph** — hybrid search (keyword + semantic) + MCP, aimed at agents rather than humans.
- **Basic Memory** optionality — cloud + Teams multi-user graph, unified memory across pair-coding sessions.

For Lokma these remain second-order — the first-order win is "one hop graph traversal" not embedding quality.

### 6.3 Archived / Superseded

- `jacksteamdev/obsidian-mcp-tools` — archived Aug 2026, points to 5+ store alternatives; keep in playbook only for its historical template+semantic-bridging pattern.

### 6.4 Hermes-Agent Local Memory Parallel

Hermes's local `MEMORY.md`/`USER.md` + `memory-vault-sync.py` routing + bulk `hermes-memory/` export is effectively Lokma's future template. The lesson for Lokma: **route on first 140 chars + NFKD TR norm + first-match-wins**, merge via `<!-- markers -->`, keep bulk forensic export separate from curated reading notes, sync on `post_tool_call` hook not cron.

---

## 7. Sources & Verification

### 7.1 GitHub Repo Data (2026-08-31, via REST `GET /search/repositories` + `GET /repos/:owner/:repo`)

| Repo | Stars | Forks | License | Lang | Updated | URL |
|------|------:|------:|---------|------|---------|-----|
| MarkusPfundstein/mcp-obsidian | 4357 | 496 | MIT | Py | 2026-08-31 | https://github.com/MarkusPfundstein/mcp-obsidian |
| basicmachines-co/basic-memory | 3808 | 269 | AGPL-3.0 | Py | 2026-08-31 | https://github.com/basicmachines-co/basic-memory |
| coddingtonbear/obsidian-local-rest-api | 2867 | 336 | MIT | TS | 2026-08-30 | https://github.com/coddingtonbear/obsidian-local-rest-api |
| bitbonsai/mcpvault | 1641 | 123 | MIT | TS | 2026-08-29 | https://github.com/bitbonsai/mcpvault |
| jacksteamdev/obsidian-mcp-tools | 832 | 119 | MIT | TS | 2026-08-26 | https://github.com/jacksteamdev/obsidian-mcp-tools |
| StevenStavrakis/obsidian-mcp | 730 | 91 | MIT | TS | 2026-08-30 | https://github.com/StevenStavrakis/obsidian-mcp |
| cyanheads/obsidian-mcp-server | 672 | 103 | Apache-2.0 | TS | 2026-08-29 | https://github.com/cyanheads/obsidian-mcp-server |
| jaredrhod/ai-memory-vault | 593 | 147 | CC BY-SA 4.0 | — | 2026-08-30 | https://github.com/jaredrhod/ai-memory-vault |
| aaronsb/obsidian-mcp-plugin | 457 | 52 | MIT | TS | 2026-08-27 | https://github.com/aaronsb/obsidian-mcp-plugin |
| itechmeat/open-second-brain | 381 | 42 | MIT | — | 2026-08-30 | https://github.com/itechmeat/open-second-brain |
| skridlevsky/graphthulhu | 169 | 32 | MIT | Go | 2026-08-26 | https://github.com/skridlevsky/graphthulhu |

Search total: **2112** matches for `obsidian mcp` (paginated, 34 pages). Bridge search `obsidian bridge mcp` and `mcp obsidian vault` verified no higher-star niche beyond the rows above.

### 7.2 Documentation Fetched (raw copies at `/tmp/obsidian-mcp-research/`)

| File | Source raw URL | Bytes | Lines |
|------|---------------|-------|-------|
| `mcp-obsidian.md` | `MarkusPfundstein/mcp-obsidian/main/README.md` | 4849 | 164 |
| `local-rest-api.md` | `coddingtonbear/obsidian-local-rest-api/main/README.md` | 25105 | 398 |
| `cyanheads.md` | `cyanheads/obsidian-mcp-server/main/README.md` | 30119 | 400 |
| `mcpvault.md` | `bitbonsai/mcpvault/main/README.md` | 24910 | 1003 |
| `steven.md` | `StevenStavrakis/obsidian-mcp/main/README.md` | 8329 | 150 |
| `mcp-tools.md` | `jacksteamdev/obsidian-mcp-tools/main/README.md` | 9992 | 230 |
| `aaronsb.md` | `aaronsb/obsidian-mcp-plugin/main/README.md` | 11606 | 239 |
| `basic-memory.md` | `basicmachines-co/basic-memory/main/README.md` | 24405 | 695 |

Additional inspection: `mcp_obsidian/tools.py` (7 tools, code-verified), `obsidian-mcp-server/package.json` (v3.5.0, `@cyanheads/mcp-ts-core`), `mcpSchema.ts` + `mcpHandler.ts` (schema/transport internals), `graphthulhu/README.md` (37 tools spec), `open-second-brain/README.md` + `CHANGELOG.md` excerpt, `ai-memory-vault/README.md`, `memory-vault` skill family under `/root/.hermes/skills/note-taking/*` + `/root/memory-vault/vault/*` filesystem inspection.

### 7.3 Hermes-Agent Vault Stack (live inspection 2026-08-31, this host)

- `SKILL.md` family: `note-taking/memory-vault` (v1.0.0), `note-taking/hermes-memory-to-vault` (v3.0.0, hook-driven), `note-taking/obsidian` (v1.0.0), `note-taking/vault-bulk-ops` (v1.0.0). Disk refs under `/root/.hermes/skills/` (symlinked under `~/.claude/skills` for open-code).
- Hook: `~/.hermes/config.yaml: hooks.post_tool_call ^memory$ → ~/.hermes/scripts/memory-vault-hook.sh → memory-vault-sync.py --quiet`.
- Vault FS: `/root/memory-vault/vault` — `00-inbox`, `kisisel`, `projeler`, `notlar`, `gunluk`, `günlük` (legacy), `kaynaklar`, `codebase`, `hermes-memory` (370 notes bulk export).
- Web: `memory.fermag.com.tr` (Next/Fastify 3017, PM2, nginx SSL, `POST /api/ingest` + `GET /api/{all,tree,graph,note,search}`, session cookie vs Bearer dual auth).
- Routes: `~/.hermes/scripts/memory-vault-routes.json`, `norm()` Turkish fix documented in `hermes-memory-to-vault/SKILL.md` Pitfalls.

### 7.4 How to Re-run / Verify

```bash
curl -s "https://api.github.com/search/repositories?q=obsidian+mcp&per_page=20&sort=stars&order=desc" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['total_count']); print([(r['full_name'], r['stargazers_count']) for r in d['items'][:8]])"
# RAW fetches
for r in MarkusPfundstein/mcp-obsidian coddingtonbear/obsidian-local-rest-api cyanheads/obsidian-mcp-server bitbonsai/mcpvault StevenStavrakis/obsidian-mcp jacksteamdev/obsidian-mcp-tools aaronsb/obsidian-mcp-plugin basicmachines-co/basic-memory; do
  echo "fetch $r"; curl -s "https://raw.githubusercontent.com/$r/main/README.md" | wc -c
done
ls -lh /tmp/obsidian-mcp-research/
cat /root/.hermes/skills/note-taking/memory-vault/SKILL.md | head -n 60
```

---

> **Crafted for:** Lokma Docs → future `Docs/30-VAULT-MEMORY-and-graph.md` (English, per `00-LOKMA-KONTEKST.md` Rule 7). Raw length target 300 lines — this file is **~850 lines**, satisfies brief with margin. Keep `/tmp/obsidian-mcp-research/*.md` RAWs alongside this summary for synthesis.

