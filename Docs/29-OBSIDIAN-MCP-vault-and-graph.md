# Obsidian MCP — Vault & Graph Integration (Comparison)

> **Scope:** Which Obsidian MCP (if any) Lokma should use for vault memory + graph, and why the file-based + `VaultPort` path wins for VPS/serverless.
> **Raw:** `raw/29-obsidian-mcp-ham-arastirma.md` (879 lines, 77KB, 2112 repos scanned, 8 READMEs fetched)
> **Related:** `28-MEMORY-infinite-vault-graph.md` §2–3 (vault pattern), `27-SKILLS-auto-discovery-hermes-inspired.md`

## 1. Why This Matters

The user asked for "obsidian mcp'ler var onu araştır onun gibi vault memory sistemi ve graph görüntüleyicisi" — i.e. an Obsidian-style vault that Lokma's agents can read/write/search, plus a graph view. The question is: do we get that via an **Obsidian MCP** (tool server that talks to Obsidian) or via **Lokma's own vault port**?

The 2112 repo scan gives a clear answer.

## 2. Inventory (Top 9, by ★ 2026-08-31)

| # | Repo | ★ | Lang | For what | Install |
|---|------|---|------|----------|---------|
| 1 | **MarkusPfundstein/mcp-obsidian** | 4357 | Python | Oldest, 7 tools (list/get/search/append/patch/delete) | `uvx mcp-obsidian` + REST API plugin |
| 2 | **coddingtonbear/obsidian-local-rest-api** | 2867 | TS | **Upstream** of #1 — Obsidian plugin that ships **its own MCP** at `https://127.0.0.1:27124/mcp/` | Obsidian → Community Plugins → Local REST API v5+ |
| 3 | **cyanheads/mcp-obsidian** | ~1200 | TS | Fork of #1 with graph+tags | `npx @cyanheads/mcp-obsidian` |
| 4 | **Steven/mcp-obsidian** | ~600 | TS | Vault CRUD + frontmatter | stdio |
| 5 | **mcpvault** | ~400 | Python | Multi-vault | stdio |
| 6 | **aaronsb/mcp-obsidian** | ~200 | TS | Minimal | stdio |
| 7 | **basic-memory** (`basicmachines/basic-memory`) | ~800 | Python | **Only one with real graph/entity model** (typed entities, relations) | `uvx basic-memory` |
| 8 | **mcp-obsidian-tools** | ~150 | TS | Tag-focused | stdio |
| 9 | **local-rest-api variants** | ~100 | — | HTTP-first forks | http |

All others are stdio-only forks of #1 with minor deltas. No repo ships a hosted multi-tenant vault.

## 3. What Each Exposes (Vault Operations)

| Capability | mcp-obsidian (Markus) | local-rest-api (built-in MCP) | cyanheads | basic-memory |
|------------|-----------------------|-------------------------------|-----------|--------------|
| List files | `obsidian_list_files_in_vault` / `in_dir` | `GET /vault/` + MCP `list_files` | same | `list_entities` |
| Read note | `get_file_contents` | `GET /vault/:path` | same | `read_note` |
| Search | `simple_search` (substring, no FTS) | `GET /search?q=` (FTS via plugin index) | same + tags | `search` (FTS + entity queries) |
| Write/append | `append_content` | `PUT /vault/:path` | same | `write_note` |
| Surgical patch | `patch_content` (heading/block/frontmatter) | `PATCH /vault/:path` | same | `update_entity` |
| Delete | `delete_file` | `DELETE /vault/:path` | same | `delete_entity` |
| Tags | ❌ | via `GET /tags` (v5+) | ✅ tag tools | ✅ typed tags |
| Graph | ❌ | ❌ | ✅ `graph` tool (wikilink adjacency) | ✅ **entity graph** (`relations`, typed edges) |
| Auth | `OBSIDIAN_API_KEY` env (Bearer) | TLS CA at `27124` or plain `27123` | same | `BASIC_MEMORY_API_KEY` |
| Transport | stdio only, `mcp==1.x` pin (breaks on `mcp>=2.0`) | **http** (`27124/mcp`, `27123/mcp`) | stdio | stdio |

**Live shape of mcp-obsidian tools (Python):**

```json
{ "name": "obsidian_list_files_in_vault", "inputSchema": { "type": "object", "properties": {} } }
{ "name": "obsidian_get_file_contents",  "inputSchema": { "properties": { "filepath": { "type": "string" } }, "required": ["filepath"] } }
{ "name": "obsidian_simple_search",       "inputSchema": { "properties": { "query": { "type": "string" }, "context_length": { "type": "integer" } } } }
```

## 4. Comparison Table (Decision-Oriented)

| Axis | File-based `obsidian` skill (Hermes pattern) + Lokma `VaultPort` | Obsidian MCP (any of #1–9) |
|------|---------------------------------------------------------------|----------------------------|
| **Needs Obsidian desktop running?** | No — reads `vault/**/*.md` directly | **Yes** — REST API plugin must be running on `127.0.0.1:27124` |
| **Works on VPS / serverless / Modal?** | Yes — pure filesystem + `POST /api/ingest` | No — no desktop, no plugin, no port |
| **Graph?** | Yes — `GET /api/vault/graph` (wikilink parse → `graph.json` cache) + `react-force-graph-2d` in web pane (§5 of 28-*) | Only `cyanheads` + `basic-memory` have graph; others No |
| **Search quality** | FTS over vault (Lokma's `/api/vault/search`, plus `session_search` over `state.db`) | Substring (Markus) or plugin-index FTS (local-rest-api) — comparable, but extra daemon |
| **Auth** | `VAULT_API_KEY` Bearer (VPS-friendly) | `OBSIDIAN_API_KEY` + TLS CA download (friction on headless) |
| **mcp compat** | n/a — but Lokma **exposes** vault as MCP (`lokma mcp serve --vault`) so any client can consume Lokma's vault | `mcp-obsidian` pinned to `mcp==1.x` — crashes on `mcp>=2.0` |
| **Ops** | One PM2 (`memory-vault`/`lokma-vault`), one nginx, one hook | Two processes (Obsidian + MCP) + cert handling + port `27123/27124` |
| **When to prefer** | Default — every deployment | Only when user already lives in Obsidian desktop and wants Lokma to drive *their* desktop vault |

## 5. Recommendation for Lokma

**Default: no Obsidian MCP for v1.** Use the Hermes-proven pattern:

1. **File-based `obsidian` skill** — `read/search/write` vault files directly (no plugin needed).
2. **`VaultPort` + `lokma-vault` (or shared `memory.fermag.com.tr` with `/lokma` prefix)** — `POST /api/ingest` with `<!-- lokma-sync -->` merge, `GET /api/vault/graph`, `GET /api/vault/note`.
3. **Expose vault as MCP** — `lokma mcp serve --vault` (stdio) so Claude Code / Cursor / ChatGPT can `vault_list` / `vault_search` Lokma's vault. This is more useful than *consuming* an Obsidian MCP.
4. **Graph** — web `Graph` pane (`react-force-graph-2d` 2D, optional `react-force-graph-3d` star-map toggle) — same `GET /api/vault/graph` every MCP client can call.

**Optional (user has Obsidian desktop and insists):** add a profile flag `vault.backend: "obsidian-rest"` that switches `VaultPort` to `http://127.0.0.1:27124/mcp` (the built-in MCP in `local-rest-api` v5) — no new code, just a URL.

## 6. What This Means for Docs & Roadmap

This doc + `28-MEMORY-infinite-vault-graph.md` together define Lokma's **vault memory system + graph viewer** the user asked for. Roadmap auto-appends (Phase 1):

- `VaultPort` + `lokma-vault` (or `memory.fermag.com.tr/lokma` prefix) + `POST /api/vault/ingest` + `GET /api/vault/graph` + `GET /api/vault/note`
- Web panes: `Vault` file tree + `Graph` (2D force, `react-force-graph-2d`) + `Note` preview
- MCP: `lokma mcp serve --vault` (vault as MCP) — not `mcp-obsidian` as client
- No Obsidian desktop dependency for VPS

## 7. Sources

- GitHub API `GET /search/repositories?q=obsidian+mcp` (2112 hits, 2026-08-31) + `GET /repos/:owner/:repo` for top 40
- READMEs via `raw.githubusercontent.com` for 8 MCPs → `/tmp/obsidian-mcp-research/` (156KB)
- `package.json` + `tools.py`/`mcpHandler.ts` source inspection
- Live vault: `/root/.hermes/skills/note-taking/*`, `memory-vault-routes.json`, `memory-vault/vault/` (370 notes)
- `coddingtonbear/obsidian-local-rest-api` v5.1.0 built-in MCP (`27124/mcp`) — replaces third-party wrappers

---

*Companion: `28-MEMORY-infinite-vault-graph.md` · Raw: `raw/29-obsidian-mcp-ham-arastirma.md`*
