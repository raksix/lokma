# Hermes Agent Infinite Memory + Obsidian Vault + Graph Visualization — Research Dossier

> **For Lokma** — how to build infinite memory + vault + graph from the patterns proven in Hermes Agent and memory.fermag.com.tr
> **Date:** 2026-08-31 · **Sources:** live Hermes docs, memory.fermag.com.tr source, Obsidian MCP repos, vault app.js/server.js
> **Workspace:** /mnt/apopic/lokma — Docs envelope: Docs/00-LOKMA-KONTEKST.md + 20-25 web harness specs

---

## Table of Contents

1. [Hermes Agent Memory System](#1-hermes-agent-memory-system)
2. [Infinite / Long-Term Memory — How It Actually Works](#2-infinite--long-term-memory--how-it-actually-works)
3. [Obsidian Vault Memory Pattern (memory.fermag.com.tr)](#3-obsidian-vault-memory-pattern-memoryfermagcomtr)
4. [Obsidian MCPs — Vault / Memory / Graph Tools Compared](#4-obsidian-mcps--vault--memory--graph-tools-compared)
5. [Graph Visualization for Memory](#5-graph-visualization-for-memory)
6. [How Lokma Should Implement Infinite Memory + Vault + Graph](#6-how-lokma-should-implement-infinite-memory--vault--graph)
7. [Appendix — File Maps, API Cheatsheets, Config Snippets](#7-appendix--file-maps-api-cheatsheets-config-snippets)

---

## 1. Hermes Agent Memory System

### 1.1 Two Files, One Contract

Hermes persistence lives in **two markdown files** under `~/.hermes/memories/` (profile-scoped via `$HERMES_HOME`):

| File | Purpose | Default Limit | Typical Entries | Who Writes |
|------|---------|---------------|-----------------|------------|
| `MEMORY.md` | Agent's personal notes — env facts, conventions, lessons, diary | `memory.memory_char_limit: 2200` chars (~800 tokens) | 8–15 entries | Agent (`memory` tool) |
| `USER.md` | User profile — identity, prefs, comms style, expectations | `user_char_limit: 1375` chars (~500 tokens) | 5–10 entries | Agent (`memory` tool) |

Both sit alongside backups (`MEMORY.md.bak.*`), archive (`archive/`), and profile vaults (`~/.hermes/profiles/<name>/memories/`). A third identity file — `~/.hermes/SOUL.md` — holds the agent persona (Layer 1 of prompt) but is **not** part of the bounded memory budget.

**On-disk format** (canonical, must not be changed without migrating injectors):
```
First entry, may be multiline with details
continuation lines are allowed
§
Second entry
§
Third entry
```
`§` (U+00A7 SECTION SIGN) + newline is the **only** separator. A literal `§` inside prose is *not* a split — split regex is `§\s*\n`.

Actual entries from this host's `MEMORY.md` (90KB, ~70 entries) follow the convention — e.g.:

```
MCP: hermes mcp add/ls
§
Backend OmniRoute: SELF-HOSTED VPS, pm2 omniroute (bkz omniroute-api). DB /var/lib/omniroute/storage.sqlite
§
Design: light minimal Stripe/Linear, anti-AI-slop. 'Claude renkleri': krem #FAF9F5 + terracotta #C96442 ...
```

Over-budget reality: this instance ran at 90KB against a `memory_char_limit: 200000` override (set via `config.yaml` / `hermes config set memory.memory_char_limit 200000`). Default install would have been erroring on every write at this size — the operator intentionally raised the cap because vault sync + diary use made the 2.2K default too small. Production Lokma must decide if it keeps Hermes-default caps or follows this host's 200K pattern (see §6).

### 1.2 How Memory Enters the Prompt (Frozen Snapshot)

Via `agent/prompt_builder.py` → `agent/system_prompt.py`, memory is **snapshot-injected at session start** into the *volatile* tier of the cached system prompt (Layer 5/6):

```
Layer 1 stable:   SOUL.md / DEFAULT_AGENT_IDENTITY
Layer 2 stable:   Tool guidance + “save durable facts via memory”
Layer 3 stable:   Honcho/external-provider static block
Layer 4 context:  system_message override
Layer 5 volatile: ── MEMORY (frozen snapshot, §-joined) ── [67% 1474/2200 chars header]
Layer 6 volatile: ── USER PROFILE (frozen snapshot) ──
Layer 7 stable:   Skills index
Layer 8 context:  Project context file (.hermes.md / AGENTS.md / CLAUDE.md — first match wins, cwd→git-root walk for .hermes.md)
Layer 9 volatile: Timestamp + session/model/provider line
Layer 10 stable:  Platform hint (CLI vs Telegram vs Discord …)
Final join: stable → context → volatile
```

**Frozen snapshot invariant:** the injected block is captured once and **never mutates mid-session** even if `memory` tool writes new entries. This preserves Anthropic prompt-caching (prefix cache) and avoids poisoning later turns. Tool responses return *live* disk state so the agent knows the new reality, but the prompt header percentage will look stale until the next session.

`prompt_caching.cache_ttl: 5m` (or `1h`) — cache key = model + account/API key + prefix bytes. A mid-session `/model` switch or credential-pool rotation to a different key **invalidates the cache** and re-reads the full conversation undiscounted (cost warning emitted at switch time).

### 1.3 The `memory` Tool (Agent-Only, No Read)

```python
memory(action="add",     target="memory"|"user", content="...")           # append
memory(action="replace", target="memory"|"user", old_text="uniq substr", content="new")
memory(action="remove",  target="memory"|"user", old_text="uniq substr")
```

* No `read` — content is already in the prompt header; error path also echoes `current_entries`.
* `replace`/`remove` match via **short unique substring** (`old_text`). If 0 or 2+ matches → error asking to be more specific.
* Duplicate prevention: exact duplicate content → `success` with `"no duplicate added"`.
* Security scan: invisible Unicode, prompt-injection, credential-exfiltration, SSH-backdoor patterns → **blocked before write**.
* Overflow: if `current_chars + new_chars > limit`, the tool returns:

```json
{
  "success": false,
  "error": "Memory at 2100/2200 chars. Adding this entry (250 chars) would exceed the limit. Consolidate now: use 'replace' to merge overlapping entries into shorter ones or 'remove' stale entries (see current_entries below), then retry this add — all in this turn.",
  "current_entries": ["..."],
  "usage": "2100/2200"
}
```

Agent must `replace` (merge) and `remove` in **the same turn** then retry `add`. Suggested nudge when prompt shows `>80%`. `replace` is also bounded — swapping for a longer string can still overflow.

Config surface (`~/.hermes/config.yaml`):

```yaml
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200        # or 200000 on this host
  user_char_limit: 1375
  nudge_interval: 10            # remind to save every N turns
  flush_min_turns: 6            # auto-flush cadence
  write_approval: false         # if true → /memory pending review gate
  provider: ""                  # honcho|mem0|openviking|… (see §2.5)
display:
  memory_notifications: true
auxiliary:
  background_review:
    enabled: true               # background post-turn review fork
    extra_tools: []             # allow one narrow tool in the fork
compression:
  enabled: true
  threshold: 0.50
  target_ratio: 0.20
  tail_mode: lean
  in_place: true
```

### 1.4 Vault Sync — memory.fermag.com.tr Mirror

**User rule (2026-08-16):** *"NE dersem diyeyim, otomatik olarak memory.fermag.com.tr'ye işle"* — every memory write, every conversation nuance, every project fact.

Implementation — **observer hook, not poll**:

| Piece | Path | Role |
|-------|------|------|
| Hook declaration | `~/.hermes/config.yaml` → `hooks.post_tool_call` → matcher `^memory$` → `/root/.hermes/scripts/memory-vault-hook.sh` | Fires after every `memory` tool call |
| Hook shim | `~/.hermes/scripts/memory-vault-hook.sh` | `exec python3 /root/.hermes/scripts/memory-vault-sync.py --quiet` |
| Sync engine | `~/.hermes/scripts/memory-vault-sync.py` | Split, route, merge, ingest |
| Routing table | `~/.hermes/scripts/memory-vault-routes.json` | `match[] → {note, title, tags}`; **first match wins** |
| Allowlist | `~/.hermes/shell-hooks-allowlist.json` | `(event, command)` pair must be listed or hook is blocked |
| Vault app | `/root/memory-vault/server.js` (PM2 `memory-vault` :3017, nginx `memory.fermag.com.tr` SSL) | Filesystem store + APIs |
| Vault store | `/root/memory-vault/vault/**/*.md` + git `raksix/memory-vault` | Source of truth is the filesystem |
| Auth | `config.json` (scrypt + HMAC secret, gitignored) + `apiKey` | Session cookie vs Bearer key |

**`memory-vault-sync.py` pipeline** (Python stdlib only, ~250 lines):

```python
# 1. Split on §\s*\n  (not split('§'))
mem   = split(read('~/.hermes/memories/MEMORY.md'))
user  = split(read('~/.hermes/memories/USER.md'))
routes = json.load('memory-vault-routes.json')['routes']

# 2. Route each entry by first 140 chars (norm: TR→ASCII before lower; İ→i fix)
def norm(s): return unicodedata.normalize('NFKD', s.translate(TR_MAP)).lower()
def route_entry(entry):
    head = norm(entry[:140])
    for r in routes:
        if any(norm(kw) in head for kw in r['match']):
            return r
    return None

# 3. Group → note path
#    USER.md      → kisisel/furkan.md
#    MEMORY matched → routes[].note (e.g. projeler/yasemin-english.md)
#    unmatched    → 00-inbox/hermes-ayna.md

# 4. For routed notes: MERGE (manual content preserved)
manual = strip_sync_section(existing_note)  # outside <!-- hermes-sync -->…<!-- /hermes-sync -->
sync   = build_sync_section(entries)        # grouped entries as bullet list
full   = manual + "\n" + sync   (or new note: "# Title\n\n" + sync)
POST /api/ingest {title, folder, tags, content: full}

# 5. Mirror note (safety net): notlar/hermes-hafiza.md = all mem+user entries

# 6. Daily log: append_to gunluk/YYYY-MM-DD  “- Hermes memory → vault senkron: N memory + M user”
```

**Why 140 chars:** prevents in-line example mentions (e.g. `notes-fermag'da … hermes memory mevzusu` inside a long entry) from misrouting — only the topic sentence at the head counts. Window must *not* be enlarged.

**Turkish `İ` trap:** `'İ'.lower()` in Python yields `i` + `U+0307 COMBINING DOT ABOVE`. Doing `translate` *after* `lower` misses `İ`. The sync fixes by `translate(TR_MAP)` **before** `NFKD + lower`. `TR_MAP = str.maketrans('ıİğĞüÜşŞöÖçÇ','iIgGuUsSoOcC')`.

**Hook lifecycle:**
* `--quiet` (hook): success → silent; only errors print to stderr and return exit 1 (observer-only).
* Without flag: prints `OK <note> (N entries, chars, sync-bolumu: var/YOK)` per note.
* `--dry-run`: routing histogram without writing.
* Timing: ~15–20 s per sync (HTTP ingest + `git add/commit/push`). Background, non-blocking for the agent turn.

**Vault invariants** the sync respects:
* Existing manual note content outside the sync markers is **never overwritten**.
* `codebase/` folder is reserved for `bin/codemap.py` — routes must never target it.
* API paths must be ASCII (`gunluk`, not `günlük`) — vault rejects `U+FFFD` replacement-char paths with 400. Folder field in ingest should stay ASCII; title/content may be Turkish.
* Private keys/passwords in memory entries flow to a PRIVATE repo (`raksix/memory-vault`) behind login — operator-approved, but a risk to note.

**Routes table** (excerpt — full in `/root/.hermes/scripts/memory-vault-routes.json`, first-match wins, order is semantics):

```json
{
  "routes": [
    { "match": ["sunucular:"], "note": "notlar/sunucular.md", "title": "Sunucular" },
    { "match": ["patrick"], "note": "notlar/patrick-arsivi.md", "title": "Patrick Arsivi" },
    { "match": ["yasemin-english", "ingilizce bahcesi"], "note": "projeler/yasemin-english.md" },
    { "match": ["crypto-bot", "turq v2"], "note": "projeler/crypto-bot.md" },
    { "match": ["hermes brain"], "note": "projeler/hermes-brain.md" },
    { "match": ["memory.fermag", "memory-vault-sync"], "note": "projeler/memory-vault-bu-sistem.md" },
    { "match": ["vision-mcp"], "note": "projeler/vision-mcp.md" },
    { "match": ["newsluma", "testnews"], "note": "projeler/newsluma.md" }
  ]
}
```

Pitfalls recorded in the MEMORY entry for this subsystem:
* `hermes config set memory.memory_char_limit` via CLI writes a string; background session caches old limit until restart — direct `MEMORY.md` write is the live-fix.
* `hermes config set` for `hooks.post_tool_call` emits a YAML-quoted string array that the hook loader cannot parse — fix via Python/YAML list edit.
* Parallel Hermes sessions firing sync simultaneously can race on `git push` — retry on failure.

### 1.5 Auto-Continue Watchdog (Infinite Work, Not Infinite Memory — but Bound Together)

Hermes extends memory durability with **auto-continue** — tasks that would otherwise be truncated by provider stalls or context pressure resume automatically:

* **Invariant observed:** every successful agent turn must end with a line `— Güven: %X · <seviye>` (operator's persistent rule). Presence = done; absence = truncated → watchdog must continue.
* **Per-loop config** via `hermes-harness` scaffolder `scaffold-loop.sh <id> --max-continues 50 --cooldown 180` → writes `state.json` `{auto_continue:{enabled, max_continues, cooldown_seconds}}`.
* **Per-loop watchdog cron:** `hermes cron create --name <id>-watchdog --schedule "every 10m" --prompt "Watchdog: bash ~/.hermes/skills/auto-continue/scripts/check-and-continue.sh --job <id> --max-continues 50 --cooldown 180 --fire"` — must copy scripts to `~/.hermes/scripts/` because `hermes cron --script` only resolves from there.
* **Global watchdog** (2026-08-28): cron `global-auto-continue-watchdog` (`dfa6e02af80a`) every **3 minutes**, scans all loop/cron jobs, continues those without a `Güven` line, max 50, Telegram notify on continue/error. Implementation in `~/.hermes/scripts/global-auto-continue.sh`.
* **Stall recovery playbook:** if a long research subagent dies without writing, its raw fetch lives under `/tmp` + `~/.hermes/cache/delegation/live/<deleg>/task-N.log`; replacement child gets a file inventory and a bounded fetch budget rather than rescraping the world. `publish-note.js` double-publish guard: `curl` the expected URL for 200 before blind retry.

For Lokma, auto-continue is the **delivery counterpart** of infinite memory: memory preserves *facts*, auto-continue preserves *progress*.

---

## 2. Infinite / Long-Term Memory — How It Actually Works

"Infinite" in Hermes is **two layers + one index + optional providers**. No literal infinite tokens — instead, budgeted slices with lossless recovery.

### 2.1 Layer 1 — Bounded Curated Memory (MEMORY.md / USER.md)

See §1. It is *bounded* on purpose: every retrieved byte is prompt-injected on **every turn** → keep it short and dense or pay in latency/cost.

### 2.2 Layer 2 — Compression / Compaction (Context Window Stretch)

File: `agent/context_compressor.py` (+ engine ABC in `agent/context_engine.py`, gateway hygiene in `gateway/run.py`).

**Dual compression — not one knob:**

```
incoming gateway message
        │
        ▼
┌──────────────────────────────┐
│  Gateway Session Hygiene     │  threshold 0.85 × context_length (fixed)
│  pre-agent, rough tokens     │  safety net for overnight accumulation
│  fires when len(history)>=4  │  uses API-reported tokens or char estimate
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│  Agent ContextCompressor     │  threshold 0.50 × context_length (default)
│  in-loop, real API tokens    │  primary loop; configurable per model
└──────────────────────────────┘
```

Agent compressor defaults (from `context-compression-and-caching` docs):

```yaml
compression:
  enabled: true
  threshold: 0.50              # prompt_tokens ≥ threshold × context_length → compact
  target_ratio: 0.20           # legacy tail budget (lean ignores)
  tail_mode: lean              # lean | legacy
  protect_last_n: 20           # recent messages always kept verbatim
  min_tail_user_messages: 1    # real user turns guaranteed in tail (blank echoes don't count)
  protect_first_n: 3           # system prompt + first exchange (hardcoded)
  in_place: true               # rewrite live message list; soft-archive old (active=0, compacted=1)
  idle_compact_after_seconds: 0 # opt-in: compact idle sessions after N seconds
  # summarization model
  auxiliary.compression.model: null  # auto-detect or explicit
  auxiliary.compression.provider: auto
```

**Per-model overrides** `compression.model_thresholds` (substring, longest match wins; small-context floor 0.75 for <512K windows, raise-only):

```yaml
compression:
  threshold: 0.50
  model_thresholds:
    "glm-5.2-1M": 0.25      # 1M context → compress later
    "glm-5.2":    0.40
    "claude-sonnet": 0.35   # 200K → a bit earlier
```

Codex gpt-5.5 special-case: ChatGPT Codex OAuth backend advertises 272K (vs 1.05M on OpenRouter/direct) → `codex_gpt55_autoraise: true` bumps trigger to 0.85 for that route so half the real window isn't wasted.

**In-place vs rotating:** `in_place: true` (default) rewrites the live message list under the **same session id**, soft-archiving the pre-compaction turns (`active=0, compacted=1`) still searchable via `session_search`. `parent_session_id` chain is omitted; lineage is unnecessary. `in_place: false` restores legacy rotation (new id, parent link, title `#N` renumber). Consumers should read `session:compress` event `in_place` flag rather than diffing ids.

**Lean tail (default) vs legacy:**

| Mode | What stays verbatim | What carries continuity | Cost |
|------|---------------------|------------------------|------|
| `legacy` | `target_ratio × threshold_tokens` tail (~100K+ on 512K model) | summary only | 1 summarizer call |
| `lean` | Clamped `2.5% × context_window` (floor 10K, cap 25K) | chunked identifier-preserving digests of compacted region + mechanically extracted anchor index (PR #s, SHAs, paths, error strings via regex, never paraphrased) + every real user message verbatim (newest-first budget) + `session_search` recovery pointer | a few extra calls at boundary, but ~49K vs ~162K retained on 500K real session, higher recall when paired with recovery |

Old tool results inside the lean tail are **demoted to one-line stubs** with a recovery pointer.

**Four-phase compaction algorithm** (from developer docs):

1. **Prune old tool results** — cheap, no LLM: drop stale tool outputs outside the tail.
2. **Determine boundaries** — protect `protect_first_n` + `protect_last_n` + `min_tail_user_messages` guarantees, then compute cut.
3. **Generate structured summary** — summarizer model digests the middle (chunked, identifier-preserving), builds anchor index via regex (never paraphrase), quotes every real user message, emits recovery pointer.
4. **Assemble compressed messages** — rebuild system prompt, swap summarized middle in, keep verbatim tail. Soft-archive pre-compaction turns. Emit `session:compress` event.

Iterative re-compression: if a long session still exceeds threshold after one pass, compressor loops until under budget or hard-stopped.

**Before → after** (500K session example):
* Before: 45 messages / ~95K tokens retained.
* After (legacy): 25 messages / ~45K retained.
* After (lean): ~49K retained with anchors + full recovery path vs ~162K legacy — lean is smaller *and* more recoverable.

### 2.3 Layer 3 — Session Search (The Real "Infinite" Index)

All sessions → SQLite `~/.hermes/state.db` (WAL mode, `FTS5` virtual tables `messages_fts` + `messages_fts_trigram` + `messages_fts_cjk`), schema version 23.

```sql
CREATE VIRTUAL TABLE messages_fts USING fts5(content, tool_name, tool_calls, content='messages', content_rowid='id');
-- kept in sync by 3 triggers on messages INSERT/UPDATE/DELETE, gated on fts_rebuild markers
```

**Tool surface — `session_search` (3 shapes):**

| Shape | Call | Returns |
|-------|------|---------|
| **Discovery** | `session_search(query="docker deployment", limit=3, role_filter="user,assistant", sort="newest")` | Top-N sessions ranked by FTS5, each with snippet `>>>match<<<` + 1 msg before/after context + top result fully hydrated |
| **Scroll** | `session_search(session_id="abc", around_message_id=1234, window=5)` | Window of messages around anchor |
| **Browse** | `session_search()` with no query | Recent sessions |

Actual search example against the messages table uses standard FTS5 syntax:

```
docker deployment        # both terms (implicit AND)
"exact phrase"           # phrase
docker OR kubernetes     # boolean
python NOT java          # exclusion
deploy*                  # prefix
```

Silently sanitized: unmatched quotes stripped, `chat-send` → `"chat-send"`, dangling `AND` removed.

Filtered search: `source_filter=["cli"]`, `exclude_sources=["telegram","discord"]`, `role_filter=["user"]`.

**session_search vs MEMORY.md:**

|  | MEMORY.md | session_search |
|--|-----------|----------------|
| Capacity | ~1.3K tokens fixed | Unlimited (all sessions ever) |
| Speed | 0 (in prompt) | ~20 ms FTS5 + ~1 ms scroll |
| Cost | Token cost every turn | Free (no LLM) |
| Management | Curated by agent | Automatic (append-only) |
| Use | Always-present critical facts | "Did we discuss X last week?" recall |
| Durability | Single §-file | WAL+FTS durable |

**SessionDB Python façade** (`hermes_state.py`):

```python
from hermes_state import SessionDB
db = SessionDB()                               # ~/.hermes/state.db or HERMES_HOME/state.db
db.search_messages("docker deployment")        # FTS5 query
db.get_messages(session_id)                    # raw messages
db.get_messages_as_conversation(session_id)    # OpenAI format for replay
db.export_session(session_id)                  # single + messages
db.create_session(id, source="cli", model="...")
db.set_session_title(id, "Fix Docker Build")   # must be unique (NULLs allowed)
db.prune_sessions(older_than_days=90)          # only ended
```

Write contention: WAL + 1 s SQLite timeout + app-level jitter retry (20–150 ms, up to 15 retries) + `BEGIN IMMEDIATE` + WAL checkpoint every 50 writes.

**Lineage** (when `in_place:false`): `sessions.parent_session_id` forms a chain — query with `WITH RECURSIVE` for ancestors/descendants:

```sql
WITH RECURSIVE lineage AS (
  SELECT * FROM sessions WHERE id = ?
  UNION ALL SELECT s.* FROM sessions s JOIN lineage l ON s.id = l.parent_session_id
) SELECT id, title, started_at FROM lineage;
```

With `in_place:true`, lineage is trivial (one id), and history recovery is via compacted rows + `session_search` over the archived slice.

### 2.4 Prompt Assembly & Caching Boundaries

See §1.2. Key for infinite-memory designers: **keep the stable prefix byte-stable**. Any mid-session mutation of history middle breaks provider-side prefix caching (Anthropic `cache_control` on `system_and_3` strategy). Hermes isolates `ephemeral_system_prompt`, `prefill`, `pre_llm_call` plugin context, and Honcho recall into the **API-call-time user-message overlay**, not the cached prompt. Compaction is the *only* sanctioned prompt rebuild mid-session, and it itself intentionally invalidates the compressed region's cache (system prompt cache survives; 3-message rolling window re-establishes within 1–2 turns).

### 2.5 External Memory Providers (Pluggable Infinite Layer)

When MEMORY.md is too small but full session search is too blunt, Hermes offers **8 provider plugins** (mutually exclusive, additive with built-in memory):

```
hermes memory setup   # interactive picker + per-provider post-setup
hermes memory status  # active provider + health
hermes memory off     # disable external, keep built-in
# or config.yaml: memory.provider: honcho|mem0|openviking|hindsight|holographic|retaindb|byterover|supermemory
```

| Provider | Storage | Cost | Tools | Unique |
|----------|---------|------|-------|--------|
| **Honcho** | Cloud / self-hosted | Paid / free SH | 5 (`honcho_profile`, `honcho_search`, `honcho_context`, `honcho_reasoning`, `honcho_conclude`) | Dialectic user modeling, peer cards, session summary + representation, depth-aware reasoning |
| **OpenViking** | Self-hosted filesystem | Free | 6 | Hierarchy + tiered loading |
| **Mem0** | Cloud / SH | Free/Paid | 4 | Server-side LLM extraction |
| **Hindsight** | Cloud/Local | Free/Paid | 3 | Knowledge graph + reflect synthesis |
| **Holographic** | Local | Free | 2 | HRR algebra + trust scoring |
| **RetainDB** | Cloud | $20/mo | 10 | Delta compression |
| **ByteRover** | Local/Cloud | Free/Paid | 3 | Pre-compression extraction |
| **Supermemory** | Cloud/SH | Free/Paid | 4 | Context fencing, session-graph ingest, multi-container (`hermes-{identity}`) |
| **Memori** | Cloud | Free/Paid | 5 (`memori_recall`, `memori_recall_summary`, `memori_quota`…) | Tool-aware turns, project/session attribution |

When active, the provider lifecycle per turn:
1. **Inject** provider context into system prompt (volatile tier).
2. **Prefetch** relevant memories (background, non-blocking) before the turn.
3. **Sync** conversation turns after response.
4. **Extract** at session end (for providers that support it).
5. **Mirror** built-in memory writes to external store.
6. **Expose** provider tools for agent-initiated search/store.

Profile isolation: each `~/.hermes/profiles/<name>` resolves `$HERMES_HOME` separately → local stores (`holographic`, `byterover`), file configs (`honcho.json`), and env (`openviking`) are per-profile by filesystem layout; cloud providers auto-derive profile-scoped project names.

**Honcho deep notes** (most mature; highest tool count under test):
* Two-layer injection: **base layer** (session summary + user representation + peer card, cadence `contextCadence`, default 1) + **dialectic supplement** (LLM reasoning, cadence `dialecticCadence` 1–5, depth `dialecticDepth` 1–3). Raw toggle counts expose the knob count: `contextCadence`, `dialecticCadence`, `dialecticDepth` independently control cost.
* `recallMode: hybrid|context|tools` — hybrid injects + exposes tools, context is inject-only.
* `writeFrequency: async|turn|session|int` — async uses background thread.
* Multi-peer: `peerName` (human, global across profiles) + `aiPeer` per profile (one workspace, many AI peers), directional vs unified observation (`observeMe/observeOthers` × user/ai).
* Gateway identity mapping: `pinUserPeer`, `userPeerAliases`, `runtimePeerPrefix` map Telegram/Discord IDs to peers.

Building a provider: implement the `Memory Provider Plugin` interface (`register_memory_provider`), declare tools, and register via `hermes plugins` → Provider Plugins → Memory Provider.

### 2.6 Journey / Learning Graph (The Visual Memory Surface)

```
hermes journey              # CLI timeline: skills + memory chunks over time, star-map scrubber
hermes journey --play       # animated build-up, --fps, --width/--height, --no-color, --json
/journey  (/learning, /memory-graph)  # TUI + Desktop Star Map panel
hermes journey list         # node ids: skill names + memory:<source>:<index>
hermes journey delete <id> [-y]
hermes journey edit <id>    # $EDITOR on SKILL.md or memory chunk
```

Same graph payload powers CLI, TUI, and Desktop. Compact storage maps directly to nodes → pruning one node archives a skill or drops a memory chunk without touching neighbors.

---

## 3. Obsidian Vault Memory Pattern (memory.fermag.com.tr)

### 3.1 System Overview

**memory.fermag.com.tr** is a private, self-hosted **Obsidian-compatible markdown vault** — not a marketing site, but an agent memory with a human UI. Repo `raksix/memory-vault` (PRIVATE). PM2 `memory-vault` :3017 behind nginx SSL (Let's Encrypt, no nginx basic-auth — auth is in-app).

```
/root/memory-vault/
├── vault/                 # source of truth — every .md is a note
│   ├── 00-inbox/          # fast-capture default
│   ├── kisisel/           # person notes (kisisel/furkan.md ← USER.md mirror)
│   ├── projeler/          # per-project mirrors (projeler/*.md)
│   ├── notlar/            # topical notes + hermes-hafiza.md (full mirror)
│   ├── gunluk/            # daily logs (gunluk/YYYY-MM-DD.md — ASCII path!)
│   ├── codebase/          # RESERVED — codemap.py output only (skill: codebase-map)
│   └── günlük/            # legacy alias of gunluk (avoid; U+FFFD risk)
├── server.js              # Express 4 + fs + crypto (3 deps: express)
├── public/
│   ├── index.html         # SPA shell (marked + DOMPurify + vis-network CDN)
│   ├── app.js             # hash router, vis.Network graph, folder palette
│   ├── style.css          # --bg #fff, --accent #5E6AD2, blur topbar
│   └── login.html
├── bin/
│   ├── save.py            # CLI: python3 bin/save.py "Başlık" --folder projeler --tags a,b --content "..."
│   ├── vault.py           # universal stdlib CLI (VAULT_KEY env)
│   └── codemap.py         # codebase → codebase/*.md maps
├── config.json            # {secret, users:[{username,salt,hash}], apiKey} — .gitignore, never committed
├── gen-config.js          # node gen-config.js 'PASSWORD' raksix → config.json
└── .git/                  # vault/ is auto-committed + pushed on each ingest
```

**Auth — two gates, one secret:**

* **Browser login** (`POST /api/login` → `Set-Cookie: vault_session=<payload>.<HMAC>`): scrypt(password, salt, 64) vs stored hash, 7-day `HttpOnly; SameSite=Lax; Secure`, HMAC-SHA256 with `CONFIG.secret`, `timingSafeEqual`, rate-limit 20/min/IP.
* **API key** (`Authorization: Bearer <apiKey>` or `X-Vault-Key`): single key in `config.json`, HMAC-timing-safe compare. Read endpoints accept **either** cookie or key; write via `/api/ingest` requires Bearer key, `PUT/DELETE /api/note` require cookie.

Secrets live **only** in gitignored `config.json` — never in the vault markdown, never pushed to GitHub.

### 3.2 Vault Filesystem Contract

* **Notes are markdown with YAML frontmatter** (`---\ntitle: "…" \ndate: YYYY-MM-DD \ntags: a,b \n---\n\n# Title\n\nbody`).
* Title resolution: `frontmatter.title` → first `# H1` → filename slug.
* Tags: comma-split `frontmatter.tags`.
* Wikilinks: `[[folder/note]]` or `[[folder/note|Alias]]`, stripped from fenced/inline code blocks (` ```…``` ` / `` ` ``). Stored without `.md` in markdown, resolved to `*.md` on graph scan.
* Path safety: `ensureInside(rel)` rejects `..`, absolute paths, missing `.md`, and any path containing `U+FFFD` (broken UTF-8 byte → 400). Vault root is `path.resolve(VAULT)`, writes are `path.resolve(VAULT, rel)` + prefix check.

Folder convention (documented in `memory-vault` skill):

| Folder | Semantics | Created by |
|--------|-----------|------------|
| `00-inbox/` | Fast capture (default ingest) | `/api/ingest` default |
| `kisisel/` | Person profile (`kisisel/furkan.md` ← `USER.md`) | sync: USER.md |
| `projeler/` | One file per project route | sync: routed MEMORY entries |
| `notlar/` | Topical notes + `notlar/hermes-hafiza.md` full mirror | sync always + manual |
| `gunluk/` | Daily logs `gunluk/YYYY-MM-DD.md` (ASCII!) | `append_to` ingest + manual |
| `codebase/` | Auto-generated maps (`codemap.py`) | skill `codebase-map` only |
| `kaynaklar/` | Research resources | manual |

**ASCII-folder rule:** `gunluk`, never `günlük` on ingest — non-ASCII path bytes through curl/ingest U+FFFD-corrupt into waste folders `g�nl�k`. Vault server explicitly 400s any `U+FFFD` path. Turkish title/content is fine — only the API `folder`/`append_to` field must be ASCII.

### 3.3 Server API Surface (Express, No ORM)

All routes in `server.js` (348 lines, ~17601 bytes; readable top-to-bottom):

| Method | Path | Auth | Semantics |
|--------|------|------|-----------|
| `POST` | `/api/login` | open | `{username,password}` → cookie. 429 after 20/min/IP |
| `POST` | `/api/logout` | open | Clear cookie |
| `GET` | `/api/me` | cookie | Session check |
| `GET` | `/api/tree` | cookie **or** Bearer | `{folders:[{name,count}], notes:[{path,title,folder,tags,updated}]}` — computed via `scanNotes()` |
| `GET` | `/api/graph` | cookie **or** Bearer | `{nodes:[{id,label,folder}], edges:[{from,to}], missing:[{id,label,folder}]}` — wikilink-derived |
| `GET` | `/api/note?path=…` | cookie **or** Bearer | `{path,title,content,folder,tags,links,updated}` |
| `PUT` | `/api/note` | **cookie** | `{path, content}` — direct write (web editor) + mkdir |
| `DELETE` | `/api/note?path=…` | **cookie** | Delete file |
| `POST` | `/api/ingest` | **Bearer apiKey** | Write or append. `folder/title/tags/content` for new note, `append_to: "gunluk/YYYY-MM-DD"` for append (creates if missing). Auto `git add vault/ → commit → push` |
| `GET` | `/api/all` | cookie **or** Bearer | `[{path,title,folder,tags,content}]` — full vault dump for search |
| `GET` | `/api/search?q=&folder=&limit=` | cookie **or** Bearer | Scored full-text search (see §3.5) |

**Ingest logic** (`/api/ingest`, ~80 lines):

```js
if (append_to) {
  const apPath = ap.endsWith('.md') ? ap : ap + '.md';
  if (exists)  write(existing.replace(/\s+$/,'\n') + body + '\n');
  else         write('---\ntitle: "…"\ndate: YYYY-MM-DD\n---\n\n# '+name+'\n\n' + body);
  gitCommitPush('append: ' + apPath);
} else {
  if (!title) 400;
  const slug = slugify(title);                 // NFKD + İ→i + [^\w]→'' → kebab
  const rel  = folder + '/' + slug + '.md';
  let full   = body.startsWith('---\n') ? body : '---\ntitle: "…" \ndate: …\ntags: …\n---\n\n' + body;
  mkdir -p; write(full);
  gitCommitPush(title);
}
```

`gitCommitPush` sets `GIT_AUTHOR_NAME=vault`, `GIT_COMMITTER_EMAIL=vault@memory.fermag.com.tr` so vault commits are distinguishable.

**The vault filesystem is the single source of truth.** The web UI is a viewer/editor over it. The vault opens as a real Obsidian vault (select `vault/` as vault root) — graph, search, and plugins just work.

### 3.4 Sync — From Hermes to Vault (Effective, Not Naive)

See §1.4 for the full pipeline. Distinct from naive "dump MEMORY.md to one file" — effective sync does:

* **ROUTE** (keyword in first 140 chars → target note).
* **MERGE** (preserve manual prose outside `<!-- hermes-sync -->`).
* **MIRROR** (full `notlar/hermes-hafiza.md` — never skip).
* **LOG** (daily `gunluk/YYYY-MM-DD` one-liner).
* **NORM** (Turkish-safe before lower).

The daily log pattern (`append_to`) is also the general-purpose logger clients should reuse — any machine can `POST /api/ingest` with `append_to: gunluk/2026-08-31` to append.

### 3.5 Search & Read Path for Agents

For day-2 recall, agents don't read random .md files — they hit the **scored search** and **graph** first:

```bash
# 1. Cookie (browser style)
curl -s -c /tmp/v.jar -X POST https://memory.fermag.com.tr/api/login \
  -H 'Content-Type: application/json' -d '{"username":"raksix","password":"Fe277353"}' > /dev/null

# 2. Fast lookup (title/path/tag/frontmatter + optional body scan)
curl -s -b /tmp/v.jar "https://memory.fermag.com.tr/api/search?q=omp+tema&limit=10" | python3 -m json.tool

# 3. Or: Bearer key (agent/Claude Code style)
curl -s https://memory.fermag.com.tr/api/search?q=slot+motoru \
  -H "Authorization: Bearer $VAULT_KEY" | python3 -m json.tool

# 4. Graph
curl -s -b /tmp/v.jar https://memory.fermag.com.tr/api/graph | python3 -m json.tool | head -n 80

# 5. Full dump (for local FTS)
curl -s -b /tmp/v.jar https://memory.fermag.com.tr/api/all > vault.json

# 6. Single note
curl -s -b /tmp/v.jar "https://memory.fermag.com.tr/api/note?path=projeler/yasemin-english.md" | python3 -m json.tool
```

Search internals (`server.js` `GET /api/search`, ~70 lines):

* Terms = `q.toLowerCase().split(/\s+/)`; short-query optimization: if no term `≥3` chars, body scan is skipped (avoids noise).
* Per note: title +10, path +6, tags +4, links +2, plus up to 8 for body hits (term in line). Deep body scan: read file, per-line `line.includes(term)` with context window `start = idx-60, end = idx+term.length+80`, truncated with `…`. Lines starting with `<!--` or empty are skipped; max 5 matches surfaced per note.
* Results sorted by `score` desc.

This is what the Hermes `memory` recall path should do when a vault is attached — **not** re-implement FTS client-side; call `/api/search`.

### 3.6 Graph Endpoint & Frontend Rendering (vis-network)

**Backend** (`GET /api/graph`, ~30 lines, `scanNotes()` → wikilink pass):

```js
async function scanNotes() {
  // walk vault/ recursively, read .md, parse title/tags/links
  // titleOf: fm.title || first # H1 || filename
  // linksOf: md.replace(/```.*?```/g,'').replace(/`[^`]*`/g,'').matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)
  // compute backlinks in O(N × links)
}
app.get('/api/graph', readAuth, async (req,res) => {
  const notes = await scanNotes();
  const known = new Set(notes.map(n=>n.path));
  const nodes = notes.map(n=>({id:n.path, label:n.title, folder:n.folder}));
  const edges=[], missing=new Map();
  for (const n of notes) for (const l of n.links) {
    const tgt = l.endsWith('.md')?l:l+'.md';
    if (known.has(tgt)) edges.push({from:n.path, to:tgt});
    else {
      const mid='missing:'+tgt;
      if(!missing.has(mid)) missing.set(mid,{id:mid,label:tgt.replace(/\.md$/,'').split('/').pop(),folder:'(yok)'});
      edges.push({from:n.path,to:mid});
    }
  }
  res.json({nodes, edges, missing:[...missing.values()]});
});
```

Missing links render as grey nodes — useful for finding orphan references.

**Frontend** (`public/app.js` `viewGraph()`, `public/index.html`/`style.css`):

* Single-page hash router: `#/`, `#/note/<path>`, `#/graph`, `#/new`, `#/edit/<path>`. No build step; CDN deps: `marked@12`, `DOMPurify@3.1`, `vis-network@9.1.9/standalone`.
* Graph rendering (once backend returns):

```js
const deg={}; for(const e of g.edges){deg[e.from]=(deg[e.from]||0)+1; deg[e.to]=(deg[e.to]||0)+1;}
const nodes = g.nodes.map(n=>({
  id:n.id, label:n.label, title:n.label+'\n'+n.folder,
  color:{background:folderColor(n.folder), border:folderColor(n.folder)},
  size: Math.min(34, 12+(deg[n.id]||0)*3),   // degree-scaled radius
  font:{color:'#374151', size:12, face:'system-ui'}, borderWidth:0
}));
const missNodes = (g.missing||[]).map(n=>({id:n.id,label:n.label,
  color:{background:'#d1d5db', border:'#9ca3af'}, size:8,
  font:{color:'#9ca3af', size:11}, shape:'dot'}));
const edges = g.edges.map(e=>({from:e.from,to:e.to, color:{color:'#d1d5db'}, width:1.2}));
network = new vis.Network($('#graph-canvas'), {nodes:[...nodes,...missNodes], edges}, {
  nodes:{shape:'dot'},
  edges:{smooth:{type:'continuous'}},
  physics:{ barnesHut:{gravitationalConstant:-9000, springLength:150, springConstant:0.04, damping:0.09},
            stabilization:{iterations:250}},
  interaction:{hover:true, tooltipDelay:120}
});
network.on('click', p=>{ if(p.nodes.length){const id=p.nodes[0]; if(!id.startsWith('missing:')) location.hash='#/note/'+encodeURIComponent(id);}});
```

* Folder palette: 10-color `FOLDER_PALETTE` (`#5E6AD2` indigo main) hashed by folder name (`hash = Σ c*31`), same in sidebar chips, note sidebar, graph legend.
* Home stats: `notes.length | folders.length | edges.length` from `GET /api/tree` + `GET /api/graph`.

This pattern — **FS → scan → wikilink edges → degree-scaled dots → barnesHut** — is the baseline Lokma should clone before reaching for heavier 3D. See §5 for when not to.

### 3.7 Security & Lonely Corners

* **Git-ignored secrets** (`config.json`): contains HMAC `secret` + scrypt password hashes + `apiKey`. Any file committing `config.json` to `raksix/memory-vault` would leak the vault. `.gitignore` + manual check on `gitCommitPush` path (only `vault/` added, not `config.json`).
* **Path traversal**: `ensureInside` blocks `..`, absolute, `U+FFFD`, non-`.md`. App never does user-controlled `require`.
* **HTML render**: `marked` output always `DOMPurify.sanitize` before innerHTML.
* **Single writer assumption**: git operations assume one writer (the vault process). Parallel Hermes sessions writing via `apiKey` simultaneously can race `git commit/push` → second push can fail (re-run sync).
* **Folder `günlük` vs `gunluk`**: vault directory on disk was created with both variants visible via `ls` demo. Canonical is `gunluk`; `günlük` entries should be migrated or ignored.

---

## 4. Obsidian MCPs — Vault / Memory / Graph Tools Compared

The Obsidian MCP ecosystem has three maturity bands. We compare **three well-maintained, documented implementations** that collectively cover the design space, then list a fourth minimal alternative.

### 4.1 Selection

| # | Repo (primary) | Package | Maintainer / Fork baseline | Stars (Aug 2026) | Primary Transport | Obsidian Side |
|---|----------------|---------|-----------------------------|------------------|-------------------|---------------|
| A | [`cyanheads/obsidian-mcp-server`](https://github.com/cyanheads/obsidian-mcp-server) | `obsidian-mcp-server` | cyanheads (built on `@cyanheads/mcp-ts-template`, Hono+SSE) | **672** · 103 forks · 292 commits | **STDIO + Streamable HTTP** (SSE, session, JWT/OAuth) | **Local REST API** plugin (`http://127.0.0.1:27123`) |
| B | [`swarogan/obsidian-mcp-rest`](https://github.com/swarogan/obsidian-mcp-rest) (`vigeron/mcp-obsidian` pointer) — community name `mcp-obsidian` | `@swarogan/obsidian-mcp-rest` | swarogan (zero-deps, Esbuild+bun) — **also ships as an Obsidian plugin** with settings UI | **2** · 21 commits | **STDIO** (plugin runs inside Obsidian for in-app config) | **obsidian-api** (preferred; local REST API fallback) |
| C | [`eacheat53/obsidian-mcp-server`](https://github.com/eacheat53/obsidian-mcp-server) (+ `aone75/obsidian-mcp-server`) | `obsidian-mcp-server` | Fork of cyanheads template, earlier snapshot (187 commits) — still deployed by users citing the `plan: agent writes → vault → memory` loop | 0 / 0 | STDIO + HTTP | Local REST API |

A / C are the same trunk at different versions — comparing them reveals **velocity vs stability** tradeoffs. A is canonical and current; C is the "frozen green" some integrations pinned. B is a divergent architecture (plugin-first, zero deps).

A fourth band (`mcp-obsidian` search collisions): `PublikPrinciple/obsidian-mcp-rest`, `Vasallo94/obsidian-mcp-server`, Jupyter/Omnisearch variants — functionally subsets of A/B; listed for discovery but not scored.

### 4.2 Capability Matrix

| Capability | A — cyanheads (672★) | B — swarogan plugin (zero-deps) | C — eacheat53 fork (frozen A) |
|------------|----------------------|----------------------------------|-------------------------------|
| **Tools exposed** | **14 tools** (typed tool definitions, `*.tool.ts`) | **18 tools** (Vault + Active File + Search + Other) | 8 tools (read, update, search_replace, global_search, list, frontmatter, tags, delete) |
| **Read** | `obsidian_get_note` (4 formats: `content`/`full`/`document-map`/`section` + `includeLinks` wikilink extract) | `get_vault_file`, `get_active_file`, `get_server_info` | `obsidian_read_note` (markdown/json + stat) |
| **Write** | `obsidian_write_note` (create/section-replace, refusal to clobber w/o `overwrite:true`), `obsidian_append_to_note` (upsert+section), `obsidian_patch_note` (append/prepend/replace on heading/block/frontmatter), `obsidian_replace_in_note` (literal/regex) | `create_vault_file`, `append_to_vault_file`, `patch_vault_file` (same patch semantics + PATCH v3 frontmatter/block/heading), `update_active_file`, `append_to_active_file`, `patch_active_file` | `obsidian_update_note` (append/prepend/overwrite), `obsidian_search_replace` |
| **List / tree** | `obsidian_list_notes` (recursive depth 0–20, ext/nameRegex filters, 1000-entry cap), recursive walk default 2 | `list_vault_files` | `obsidian_list_notes` (tree view, ext/regex) |
| **Search** | `obsidian_search_notes` — 3 modes: `text` (substring+context), `jsonlogic` (glob/regexp on path/content/frontmatter/tags/stat; powers backlinks via regexp wikilink query), `omnisearch` (BM25 via Omnisearch plugin, capped 50, supports `path:`, `ext:`, quotes, `-exclusion`, OCR) — paginated via opaque `nextCursor` (MCP 2025-11-25 spec), `maxMatchesPerHit` | `search_vault` (Dataview DQL or JsonLogic), `search_vault_simple` (full-text with context), `search_vault_smart` (Smart Connections semantic) | `obsidian_global_search` (text/regex + path filter + paginated) |
| **Frontmatter** | `obsidian_manage_frontmatter` (atomic get/set/delete) | same | same |
| **Tags** | `obsidian_manage_tags` (frontmatter + inline, count desc) | via `obsidian_api` client (tag cache) | same |
| **Backlinks** | No dedicated tool — via `jsonlogic` regexp (`\[\[Target Note(\||#|\])`) | via `search` DQL/JsonLogic | not exposed |
| **Periodic notes** | `get_note` by `daily/weekly/monthly/quarterly/yearly` + active file targeting | periodic via `targetIdentifier` | via `targetType` |
| **Active file ops** | `obsidian_open_in_ui`, `obsidian_execute_command` (opt-in `OBSIDIAN_ENABLE_COMMANDS`), `obsidian_list_commands` | `get/update/append/patch/delete_active_file`, `show_file_in_obsidian` | not separate |
| **Other** | — | `execute_template` (Templater `tp.mcpTools`), `fetch` (HTML→MD), MCP prompts auto-discovery from `Prompts/*.md` with `obsidian-mcp-rest-prompt` tag | — |
| **Resources** | 3 MCP Resources (file, search, tags) | none (Tools only) | none |
| **Cache** | Optional; upstream live search primary, retry path not cached | **Vault Cache Service** (in-memory; enable `OBSIDIAN_ENABLE_CACHE=true`; fallback for `global_search` if API down; periodic 10-min incremental refresh + proactive after write; zero deps flag) | same pattern (inherits template cache) |
| **Auth (server ↔ vault)** | `OBSIDIAN_API_KEY` + `OBSIDIAN_BASE_URL` + optional `OBSIDIAN_VERIFY_SSL`, JWT/OAuth for HTTP | `OBSIDIAN_API_KEY` + `OBSIDIAN_REST_URL`, plugin auto-detects `obsidian-api` | same |
| **HTTP surface** | Hono + SSE + session pruning + CORS + OTEL optional (`OTEL_ENABLED`, `LOGS_DIR`) | STDIO-only (Node builtins only) — HTTP is via plugin, not the package | same as A older cut |
| **Dependencies** | `mcp-ts-template` + Zod + Hono + OTel peer optional | **Zero** npm deps (`Node.js ≥20`, builtins only) | same as A older cut |
| **Graph support?** | **No** — tools surface wikilinks (`includeLinks`) but do not return precomputed nodes/edges; graph is left to caller (build from `get_note{includeLinks}` or `search`). | **No** — same. | **No** — same. |
| **Plugin (in-Obsidian UI)** | No | **Yes** — installs as `obsidian-mcp-rest` plugin; settings tab auto-detects `obsidian-api`, offers one-click config copy. | No |
| **Install (client)** | `npx obsidian-mcp-server` / Docker+JIT JWT or OAuth, many examples | `npx -y @swarogan/obsidian-mcp-rest` / `claude mcp add obsidian -e OBSIDIAN_API_KEY=… -- npx -y @swarogan/obsidian-mcp-rest` | `npx obsidian-mcp-server` |

**Key quote — cyanheads (A) on surgical editing (canonical design rationale):**
> *"Pair the `document-map` projection with `obsidian_patch_note` to discover edit targets before patching. Handlers throw, framework catches — no try/catch in tool logic. Wrap external API calls: validate raw → normalize to domain type → return output schema."* (see `CLAUDE.md` in repo). This pattern — `get_note{format: document-map}` → `patch_note{heading/block/frontmatter}` — is exactly what Lokma should adopt for vault writes (see §6).

**Key quote — swarogan (B) on zero deps and plugin duality:**
> *"`Zero npm dependencies. Node.js built-ins only.` … Also available as an Obsidian plugin with settings UI, auto-detection of obsidian-api, and one-click MCP server installation."* — reduces supply chain surface; at the cost of no HTTP auth surface in-package.

### 4.3 When to Choose Which for Lokma

* **For a headless Lokma server integrating an existing Obsidian Local REST API:** pick **A (cyanheads)**. It is the maintained reference (672★), its `jsonlogic` wikilink backlink query (`{"regexp":["\\[\\[Target(\\||#|\\])", {"var":"content"}]}`) is the canonical way to build a graph without a dedicated tool, and its `document-map → patch` flow matches Lokma's surgical-edit needs. Use STDIO in dev, HTTP+JWT in production (Docker `MCP_AUTH_MODE=jwt`).
* **For a Lokma desktop that already embeds an Obsidian vault or for operators who prefer zero npm deps:** pick **B (swarogan)**. The in-app plugin gives one-click setup, `fetch`→Markdown is a bonus for web clipping, and `execute_template`/prompts give Templater integration free. Accept that it has no HTTP auth and must run loopback-only or behind an external reverse-proxy.
* **Do not pick C** unless you are replicating a pinned deploy — it is a frozen A. Mentioned here because some Hermes setups archived it as their "memory vault" MCP; cite it when tracing lineage.

### 4.4 What None of Them Do (and Lokma Must Build)

No current Obsidian MCP ships a **graph tool** (`nodes/edges/missing` or degree/betweenness). All expose the primitives to *compute* it (`includeLinks` or `list → get → parse wikilinks`) and leave aggregation to the caller. Similarly, **no MCP provides semantic graph search** (embedding over graph position), time-decayed edges, or bidirectional sync markers like `<!-- lokma-sync -->`. Lokma must add all three on top of whichever MCP it embeds (see §6).

Practical patch: if Lokma uses an Obsidian MCP, add a **local graph service** that periodically `scanNotes()` (the same function `memory.fermag.com.tr` uses — ~30 lines, wikilink regex + backlink inversion) and caches `{nodes, edges, missing}` as a resource MCP servers can read or as a `GET /api/graph`-style endpoint Lokma's web UI consumes. Do not try to stream graph recomputation on every `get_note`.

---

## 5. Graph Visualization for Memory

### 5.1 Obsidian Core Graph View — Formal Model

Obsidian's built-in **Graph View** (core plugin) implements one graph:

```
G = (V, E) where
  V = { one node per *.md in vault }  (dot, labeled)
  E = { (i → j)  iff  body(i) contains [[j]] or [[j#Heading]] or [[j|Alias]] }  (link or embed)
  Plus ghost V_miss = { referenced but absent notes } → grey dots, edges still drawn (so missing structure is visible)
```

* **Nodes:** circles ("dots"), size may scale by degree (some themes scale 8px→22px by in/out degree). Tooltip = title + folder. Color by **group** (folder, tag, or query).
* **Edges:** straight or curved (configurable `link line` + `link strength`). Undirected visually though underlying data is directed — Obsidian graph settings let you filter direction.
* **Physics:** ForceAtlas2 / Barnes-Hut **force-directed** layout (repulsion + spring). Default iterations ~250 until `stabilizationIterationsDone`. Draggable, zoom/pan, inertia damping.
* **Ghost handling:** unresolved `[[target]]` where `target.md` does not exist renders as a **dim/desaturated node** (often grey) at lower mass — same behavior memory.fermag.com.tr replicates with `missing: [...]`.
* **Filters:** by search, tag, path, link type (embed vs link), attachments, orphans, focus on current note. Local graph (single-hop / depth N around one note).

The help page is thin: publish-01 obfuscation hides the DQL; local help (`Help/Plugins/Graph view.md` or `4.5-graph-view` on DeepWiki) is the fuller source.

### 5.2 memory.fermag.com.tr — Minimal, Honest Implementation

As rendered in §3.6 — one `vis-network@9.1.9` `vis.Network` instance over `{nodes, edges}` from `/api/graph`:

| Choice | Value | Why |
|--------|-------|-----|
| Library | `vis-network` standalone UMD (`vis-network.min.js` ~ 250 KB) | Single-file, no build step, works from CDN — same stack the vault's single `index.html` uses |
| Nodes | `shape: dot`, `size = min(34, 12 + degree*3)` | Degree-scaled prominence for hub notes |
| Edges | `smooth: continuous`, `color: #d1d5db`, `width: 1.2` | Low contrast so nodes pop |
| Physics | `barnesHut { gravitationalConstant: -9000, springLength: 150, springConstant: 0.04, damping: 0.09 }`, `stabilization: 250` | Tuned for 50–800 node vaults; -9000 repulsion keeps clusters readable |
| Colors | 10-slot `FOLDER_PALETTE` hashed by folder | Cheap grouping without user config |
| Interaction | `hover: true`, click → `#/note/<path>` (except `missing:*`) | Single action per node |

Limits: vis-network caps comfortably at ~2K nodes before FPS dips; missing nodes are lighter but still participate in physics (heuristic to keep "stubs" on fringe).

### 5.3 Alternative Libraries — Decision Matrix for Lokma

Lokma should pick **two** — a 2D default (web) and a 3D/focused optional view (for hub demos). All are force-directed; the difference is API weight, GPU use, filtering, and co-location with React/Next.js.

| Library | License | Bundle | 2D/3D | React binding | Perf envelope | Graph size before tuning | Strengths | Weaknesses | When to choose |
|---------|---------|--------|-------|---------------|---------------|--------------------------|-----------|------------|----------------|
| **vis-network** (used by memory.fermag) | MIT (+ Apache sub) | UMD 250KB, ESM ~180KB | 2D | `vis-network` peer, `react-ht` shim | CPU Barnes-Hut | ~2K nodes | Plug-and-play, one div, stabilization physics, legend support | Not WebGL, grouping is manual, large graph needs clustering | Lokma default if staying on shared `public/` no-build stack |
| **D3 forceSimulation** (`d3-force`) | ISC | ~70KB | 2D | None (imperative, `.on('tick')`) | CPU `d3.forceManyBody/Link/Collide` | ~1K w/o canvas | Fully programmable forces, collision, radial, hierarchical; pairs with `d3-selection/zoom/drag` | You own rendering (canvas vs SVG), large-graph requires canvas port | If Lokma builds its own edge types (typed relations, weight) |
| **react-force-graph** (2D/3D/AR/VR wrappers over `force-graph`) | MIT | ~45KB (`2d`) / ~180KB (`3d`) | 2D & 3D | First-class: `<ForceGraph2D/3D>` | WebGL (Three.js for 3D), canvas for 2D | 10K 2D, 5K 3D | Drop-in if client is React (Lokma's Next.js 15 is — see §6), `dagMode`, auto-color by `group`, onNodeClick built-in | Must accept canvas import, SSR exclusion `dynamic(()=>import(...),{ssr:false})` | **Lokma Next.js pick — react-force-graph-2d for home graph, -3d for star-map** |
| **3d-force-graph** (standalone) | MIT | ~120KB | 3D | none directly (three.js vanilla) | Three.js `OrbitControls`, bloom | 3K | Star-map immersion, particles, curved edges (`linkCurvature`) | 3D only; heavier than `react-force-graph-3d` shim | Hub demo view only |
| **Cytoscape.js** | MIT | ~200KB | 2D | `react-cytoscapejs` thin | Canvas + WebGL experiments | 3K (fast filtering) | Best for filters/rankings/layouts (cola, dagre, fcose), grouping, styling via CSS-like `style` | Graph model is heavier (`cy.elements`), physics naming differs | If Lokma needs graph algorithms (betweenness, BFS path highlight) |
| **sigma.js v3** | MIT | ~80KB | 2D | `react-sigma` | WebGL + quadtree index — handles **100K** | 20K–100K | Massive vault scaling, search highlight, label-per-node cheap, no `npm ls` blowup | Layout is external (`graphology` + ForceAtlas2), you run layout then sigma renders | If vault grows past 5K notes (research-heavy Lokma) |
| **vis.js legacy / vis-network fork** | — | bundled | 2D | — | — | — | Same as vis-network (legacy import path) | Deprecated import path confusion | Don't pick — use `vis-network` |
| **antv/G6** | MIT | ~600KB | 2D | `@antv/graphin` | GPU Canvas | 10K | Chinese-market `v5` rich UX; minimap, toolbar, hulls built-in | Heavy, Chinese docs drift, React 18 peer | Only if Lokma ships a full IDE with hulls/minimap |
| **reagraph** (reagraph) | MIT | ~120KB | 2D | Native React | Three.js / WebGL for graph in React | 2K | Tailwind-ish, light/dark, focus ring | Young, edges simpler | Alternative to react-force-graph if Tailwind alignment matters |

**Force model equivalence:** all use variants of **Barnes-Hut O(N log N)** repulsion (`gravitationalConstant` / `alpha` / `repulsion`) + **Hooke spring** (`springLength` / `linkDistance` / `edgeLength`) + **damping/friction** (`damping` / `velocityDecay`). Translating a tuned set (memory.fermag's `grav -9000, springLength 150, springConstant 0.04, damping 0.09, iterations 250`) to another library is a linear search, not a rewrite.

**Rendering choice for the vault use case:**

* **Text vaults < 500 notes (Lokma MVP):** `react-force-graph-2d` or `vis-network` suffices; both finish stabilization in < 1 s on a laptop.
* **Vaults 2K–10K:** `react-force-graph-2d` (WebGL) or `sigma.js` (if you need quadtree hover); add clustering (Louvain communities collapsed to super-nodes) beyond 5K.
* **3D star-map (Hermes `hermes journey` parity):** `react-force-graph-3d` behind a `#/star-map` toggle; keep it behind `dynamic(...,{ssr:false})` to avoid hydration mismatch.

**What Obsidian's graph plugin does *not* give you** (all require a custom renderer on top of wiki edges):

* **Edge types** (typed `belongsTo`, `mentions`, `blocks`, custom semantic edges).
* **Weight/temporal decay** (recency-weighted springs).
* **Embedding layout** (position by semantic similarity, not just link springs).
* **Timeline spine** (notes fixed on a temporal axis, links as arcs).
* **Ghost merging** (alias resolution `[[A|B]]` → single canonical node, folder alias collapse).
* **Degree/betweenness overlays** (hub highlight, breadth-first path).

For Lokma, these are **Phase 2** features — see §6.

### 5.4 Minimal Reference Rendering (Portable Snippet)

Adapted from memory.fermag's `app.js` `viewGraph()` to plain `react-force-graph-2d`:

```jsx
// LokmaWeb: app/vault/components/VaultGraph.tsx  (Next.js 15, React 19)
'use client';
import dynamic from 'next/dynamic';
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

export function VaultGraph({ graph }: { graph: { nodes:{id:string,label:string,folder:string}[], edges:{from:string,to:string}[] } }) {
  const deg = Object.fromEntries(graph.nodes.map(n=>[n.id,0]));
  for(const e of graph.edges){ deg[e.from]++; deg[e.to]++; }
  const data = {
    nodes: graph.nodes.map(n=>({
      id:n.id, name:n.label,
      val: Math.min(12, 3+(deg[n.id]||0)*1.2),   // 3D uses `val`; 2D uses `nodeVal` accessor
      color: FOLDER_PALETTE[hashOf(n.folder)%FOLDER_PALETTE.length],
    })),
    links: graph.edges.map(e=>({source:e.from, target:e.to})),
  };
  return (
    <ForceGraph2D
      graphData={data}
      nodeLabel="name"
      linkColor={() => '#d1d5db'}
      d3AlphaDecay={0.025} d3VelocityDecay={0.2}
      linkDirectionalParticles={0}
      backgroundColor="#fff"
      onNodeClick={n => window.location.hash = `#/note/${encodeURIComponent(String(n.id))}`}
    />
  );
}
```

Degree-scaling value is `val` (3D) / `nodeVal` (2D) in `react-force-graph` — translate accordingly. Missing nodes would be a second pass adding `{id: 'missing:foo.md', name:'foo', color:'#d1d5db', val:1}` + links.

---

## 6. How Lokma Should Implement Infinite Memory + Vault + Graph

Constraints inferred from `Docs/00-LOKMA-KONTEKST.md` + `Docs/20–25`:

* CLI + Web share the **same harness loop** (`lokma-core`) — not just the same API.
* Docs are **English** from 2026-08-31; chat stays Turkish.
* Theme tokens `themes/*.json` → CLI Chalk + Web CSS vars (claude/omp/midnight/paper).
* Stack pick pending (`Docs/21` options A:B:C:D; recommendation A = Next.js 15 + Fastify 5 + flexlayout-react + WS+SSE + Zustand).
* Plugins are **in-process Cordis-inspired** (~300 line kernel, see `Docs/23`). No vendored Cordis fork.
* Pane system (`Docs/24`) — flexlayout-react, left/right/files/browser/live-terminal.
* Monorepo `packages/` proposed: `lokma-core` (loop) + `lokma-ai` (providers) + `lokma-tui` (Ink) + `lokma-web` (Next.js+WS) + `lokma-cli` + `lokma-shared` (Zod, WS protocol).
* DB: `drizzle-orm` + **SQLite (local)** / **Postgres (cloud)**.

Memory work must align with this — not bolt a second product.

### 6.1 Goals and Non-Goals

| Goal | Why | Non-goal |
|------|-----|----------|
| **Infinite recall** within < 300 ms p95 on local vaults (5K notes) | Operator said "memory.fermag.com.tr" is the memory — search cannot be "grep each md" | Embedding search on day 0 (Phase 2) |
| **Zero lost facts** across compaction | Lean tail alone loses facts — memory file is the durable fallback even when session view is summarized | Turning session_search into a second memory file |
| **One vault, two surfaces** (CLI + Web) | Lokma philosophy: model reasons, harness acts — vault is harness-owned | Forcing Obsidian install (optional, not required) |
| **Signed, auditable writes** | Vault sync touches `§`-delimited files that feed the prompt — unsigned flips are prompt-injection | Multi-writer shared HOME (explicitly forbidden by Hermes — Lokma must give each agent a profile) |

### 6.2 Architecture — Four Pieces (Posture: Local-First, Cloud-Optional)

```
┌──────────────────────────────────────────────────────────────────────┐
│  packages/lokma-core                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────┐            │
│  │  MemoryStore             │  │  SessionStore            │            │
│  │  MEMORY.md / USER.md §   │  │  SQLite WAL+FTS5         │  ← §2.3     │
│  │  bounded curate + nudge  │  │  session_search + lean   │            │
│  │  memory tool (add/repl/rm)│  │  compaction archives     │            │
│  └──────────┬───────────────┘  └──────────┬───────────────┘            │
│             │ vault sync hook             │ compression (50% / 85%)     │
│             ▼                             │                             │
│  ┌──────────────────────────────────────────────────────────┐            │
│  │  VaultService  (new package: packages/lokma-vault)     │            │
│  │  FS: vault/**/*.md  ·  scanNotes()  ·  graph {nodes, │            │
│  │  edges, missing}   ·  ingest / append_to / search      │            │
│  │  HTTP: GET /api/vault/graph|tree|note|search|all      │            │
│  └──────────────────┬─────────────────────────────────────┘            │
│                     │ wikilinks [[a/b]] → edges                         │
│  ┌──────────────────┴─────────────────────────┐                          │
│  │  GraphService  (thin cache over VaultService) │                        │
│  │  recompute on FSEvents / onIngest debounce  │                         │
│  └──────────────────┬─────────────────────────┘                          │
└─────────────────────┼────────────────────────────────────────────────────┘
                      │ WS events: vault:graph, vault:note, memory:updated
          ┌───────────┴────────────┐
          ▼                        ▼
  packages/lokma-tui (Ink)    packages/lokma-web (Next.js 15)
   /journey, /vault,            flexlayout panes:
    /graph (ASCII)               - Explorer + Graph + Note + Timeline
                                 - vis-network or react-force-graph-2d
                                 - Star Map (/journey parity)
```

**No Obsidian at runtime** is required — Lokma's vault IS an Obsidian vault on the filesystem, so plugging Obsidian desktop on top of `vault/` just works, but the harness never spawns Obsidian.

### 6.3 File Layout (Mono-repo Patch)

```
mnt/apopic/lokma/
├── Docs/                              # (existing) — add ...
│   ├── 26-MEMORY-VAULT-GRAPH-spec.md  ← spec extracted FROM this raw dossier (Phase 0)
│   └── raw/
│       └── 26-memory-vault-graph-*.md ← THIS FILE (tmp) after promotion
├── packages/
│   ├── lokma-core/
│   │   ├── src/memory/                # NEW — MemoryStore
│   │   │   ├── store.ts               # readEntries/split §\s*\n, atomic write, size header, scan
│   │   │   ├── tool.ts                # memory tool impl (add/replace/remove + scan + dup + limit)
│   │   │   ├── prompt.ts              # frozen-block formatter (header % + §-join)
│   │   │   └── vault-sync/            # NEW — optional sync to VaultService
│   │   │       ├── router.ts          # routes.json loader, norm() TR-safe, first-140-char match
│   │   │       ├── hook.ts            # post_tool_call shim (exec sync --quiet)
│   │   │       └── sync.ts            # group → merge (<!-- lokma-sync -->) → ingest → mirror → daily-log
│   │   └── src/session/
│   │       ├── store.ts               # SessionDB (drizzle-sqlite + WAL + FTS5) or thin wrapper over sqlite3
│   │       ├── compression.ts         # Lean tail, dual threshold, in_place, anchor regex
│   │       └── search.ts              # FTSSearch (sanitize FTS5 query, snippets, context)
│   ├── lokma-shared/                  # NEW schemas
│   │   └── src/vault/
│   │       ├── schema.ts              # Zod: VaultGraph {nodes, edges, missing}, VaultNote, VaultSearch
│   │       └── protocol.ts            # WS events: vault:graph, memory:updated, session:compress
│   ├── lokma-vault/                   # NEW — Extracted from memory-vault's server.js (Express → Fastify)
│   │   ├── src/
│   │   │   ├── vault.ts               # scanNotes(), titleOf/tagsOf/linksOf, ensureInside, backlink inversion
│   │   │   ├── routes.ts              # Fastify routes: /api/vault/{tree,graph,note,all,search,ingest}
│   │   │   ├── ingest.ts              # slugify, append_to, frontmatter, mkdir, gitCommitPush
│   │   │   └── auth.ts                # HMAC-cookie + Bearer apiKey, readAuth/requireAuth guards
│   │   └── vault/                     # .gitignored on dev, durably created on first run
│   │       ├── 00-inbox/ .gitkeep
│   │       ├── kisisel/ .gitkeep
│   │       ├── projeler/ .gitkeep
│   │       ├── notlar/ .gitkeep       # includes notlar/lokma-hafiza.md mirror
│   │       ├── gunluk/  .gitkeep
│   │       └── codebase/ .gitkeep     # RESERVED — codemap output only
│   └── lokma-web/
│       └── src/app/(vault)/
│           ├── page.tsx               # Vault home: stats, recents, folder chips (parity with memory.fermag home)
│           ├── graph/page.tsx         # Graph canvas + legend (react-force-graph-2d OR vis-network)
│           ├── note/[path]/page.tsx   # Markdown render (marked+DOMPurify parity), backlinks sidebar
│           └── journey/page.tsx       # Star Map (react-force-graph-3d behind toggle) + timeline scrubber
├── lokma.config.json                  # NEW — vault + memory + graph knobs (see §6.7)
└── themes/*.json                      # extend with vault tokens: --vault-accent, --vault-graph-link
```

**Why `lokma-vault` is a separate package, not in `lokma-core`:** vault owns an HTTP mount and filesystem GC (git). Core owns the loop. Keeping the boundary narrow prevents the agent loop from importing Express/fastify. Vault is a plugin to core through a single interface:

```ts
// packages/lokma-vault/src/interface.ts — the only import lokma-core makes
export interface VaultPort {
  ingest(opts:{title?:string, folder?:string, tags?:string, content:string, append_to?:string}): Promise<{ok:true, path:string}>;
  getNote(path:string): Promise<{content:string, title:string, links:string[]} | null>;
}
```

In tests, `VaultPort` is a fake (JSON files); in production, `createVaultService({vaultPath, config})` is the HTTP or direct-FS impl.

### 6.4 The Four Stores, Precisely

#### 6.4.1 MemoryStore (bounded, curate)

```ts
// Atomic §-file
const SEP = '§';
const SPLIT_RE = /§\s*\n/g;

export function readEntries(filePath: string): string[] {
  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath,'utf8') : '';
  return raw.split(SPLIT_RE).map(s=>s.trim()).filter(Boolean);
}
export function writeEntries(filePath: string, entries: string[]) {
  // atomic: write tmp then rename — never truncate on crash
  const tmp = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, entries.join('\n' + SEP + '\n') + (entries.length?'\n':'') ,'utf8');
  fs.renameSync(tmp, filePath);
}
```

Tool parity with Hermes (`add/replace/remove` + substring uniqueness + dup guard + limit error with `current_entries` echo). Add a `memory:updated` WS event on write.

Prompt injection: `Memory: ${entries.join('\n§\n')} // header "[${used}/${limit} chars]"` computed at session start, frozen thereafter; mid-session overlay via API-call-time user-message (see compression below) if a nudge demands it.

Default caps: start at Hermes defaults (`memory_char_limit 2200`, `user_char_limit 1375`) behind a single knob `lokma.config.json#memory.limits.mode: hermes|relaxed|unlimited`. `relaxed` → 20000/6000. `unlimited` → delegate to VaultService fully (MemoryStore becomes an L1 cache).

#### 6.4.2 SessionStore (unbounded, searchable, compacted)

Two options compliant with `Docs/02`:

* **Bun/Better-SQLite bundle:** `better-sqlite3` + handwritten FTS5 triggers (mirrors Hermes `hermes_state.py` `SCHEMA_SQL`, version 23). Minimal drizzle use for sessions, raw SQL for FTS/content triggers.
* **Drizzle ORM path:** `drizzle-orm/better-sqlite3` plus a manual `sql` tag for `CREATE VIRTUAL TABLE ... USING fts5`, because drizzle's schema builder does not generate virtual tables.

Choose (1) for a Hermes-faithful §2.3 clone (copy `SCHEMA_SQL` verbatim, then expose `SessionDB.searchMessages(ftsQuery, {sourceFilter, roleFilter})`). The WAL/jitter retry handler is 15 lines and worth cloning.

Compaction inside `lokma-core/src/session/compression.ts` shadows Hermes `ContextCompressor`:

* Threshold: `0.50` × `context_length` (query model for actual value — see `Docs/22` provider/model negotiation). Keep per-model `model_thresholds` map.
* Tail: `lean` default (keep spec text in §2.2).
* `in_place: true` default — soft-archive rows (`active=0, compacted=1`). Expose `GET /api/session?compacted=1&search=term` for recovery.
* Anchor extractor: regexes for `PR #\d+`, `/[\w/-]+\.\w+`, `SHA [0-9a-f]{7,40}`, `⨉ error substring` — never LLM-paraphrased.
* Instrumentation: `session:compress { in_place, iterations, retainedTokens, summaryTokens, anchorCount }` over WS.

#### 6.4.3 VaultService (filesystem vault — the long horizon)

Straight port of `memory-vault/server.js` scan/ingest/search into `@lokma/vault` Fastify routes. Diffs from the original:

| Original `memory-vault` decision | Lokma change | Reason |
|-----------------------------------|--------------|--------|
| Express | **Fastify 5** (aligns with chosen stack A) | Matches Lokma harness's Fastify core |
| Single `vaultSession` cookie secret | **Profile-scoped** — one `VAULT_HOME/vault` per Hermes profile when Lokma runs multi-profile, else singletons | Matches Hermes profile isolation (§2.5) |
| `apiKey` single string | **Key per profile / per device** (`vaultKeys: {lokma:..., phone:...}`) | Allows `append_to` from phone without leaking cli key |
| Frontmatter only `title/date/tags` | **Add `aliases:` + `created:` + `updated:`** | Alias graph collapse, temporal decay later |
| `linksOf` simple wikilink | **Plus `#heading` anchors and `![[embed]]` edge type** | typed edges needed for weighted graph |
| No typed edges | Add `edgeType: wikilink|embed|tag|mention` | Degree uses only `wikilink` by default |

Scan is the hot path. Keep it `~30 lines` + `fast-glob`:

```ts
export async function scanNotes(vaultRoot: string): Promise<VaultNote[]> {
  const paths = await glob('**/*.md', { cwd: vaultRoot, absolute: false, ignore: ['.git/**'] });
  const notes = await Promise.all(paths.map(async rel => {
    const md = await fsp.readFile(path.join(vaultRoot, rel), 'utf8');
    const { fm, body } = stripFrontmatter(md);
    const title = fm.title ?? (body.match(/^#\s+(.+)$/m)?.[1].trim() ?? rel.replace(/\.md$/,'').split('/').pop()!);
    const tags  = fm.tags ? String(fm.tags).split(',').map(s=>s.trim()).filter(Boolean) : [];
    // drop code blocks before link scan (parity with memory.fermag)
    const links = md.replace(/```[\s\S]*?```/g,'').replace(/`[^`]*`/g,'')
                    .matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g);
    const out = [...new Set([...links].map(m=>m[1].trim()))]; // raw stems
    return { path: rel, title, folder: rel.split('/')[0] ?? '/', tags, links: out, mtime: (await fsp.stat(path.join(vaultRoot, rel))).mtimeMs };
  }));
  // second pass: backlinks
  const known = new Set(notes.map(n=>n.path));
  for(const n of notes) n.backlinks = notes.filter(o=>o.links.some(l=>(l.endsWith('.md')?l:l+'.md')===n.path)).map(o=>o.path);
  return notes;
}
```

On `ingest` or `PUT /api/vault/note`, invalidate only the touched `rel` in cache and recompute backlinks for its neighbors — don't rescan the whole vault.

#### 6.4.4 GraphService (derived, cached)

Graph is a **pure view** over VaultService state — never a second store:

```ts
export function deriveGraph(notes: VaultNote[]): VaultGraph {
  const known = new Set(notes.map(n=>n.path));
  const nodes = notes.map(n=>({id:n.path, label:n.title, folder:n.folder}));
  const edges: GraphEdge[] = [], missing = new Map();
  for(const n of notes) for(const stem of n.links) {
    const tgt = stem.endsWith('.md') ? stem : stem+'.md';
    if(known.has(tgt)) edges.push({from:n.path, to:tgt, type:'wikilink'});
    else {
      const mid='missing:'+tgt;
      if(!missing.has(mid)) missing.set(mid,{id:mid,label:tgt.replace(/\.md$/,'').split('/').pop()!,folder:'(missing)'});
      edges.push({from:n.path, to:mid, type:'wikilink'});
    }
  }
  return {nodes, edges, missing:[...missing.values()]};
}
```

Cache: `graph = {nodes, edges, missing, builtAt, builtFromMtime}` keyed by `max(mtime)` of vault scan. Rebuild debounced `200 ms` after FS `watch` or `ingest`. Missing-node edges still affect physics but with half mass (so they sit on fringe).

Extend when needed: add `degree[]`, `betweenness[]` (brandes), `louvain[]` (community id → super-nodes at >5K). Keep them out of the base struct — compute lazily behind `GET /api/vault/graph?metrics=degree,betweenness`.

### 6.5 Vault Sync (Lokma-Flavored)

Port `memory-vault-sync.py` to `packages/lokma-core/src/memory/vault-sync/sync.ts` — but Typed and configurable at `lokma.config.json` time:

```ts
// lokma.config.json — sync routing
{
  "memory": {
    "vault": {
      "enabled": true,
      "url": "http://localhost:3017/api",   // local Lokma vault (no remote by default)
      "routesFile": "~/.lokma/vault-routes.json", // or in-repo lokma.vault-routes.json
      "fullMirror": "notlar/lokma-hafiza.md",
      "dailyFolder": "gunluk"
    }
  }
}
```

* **Route matching:** same `first 140 chars` + `norm()` Turkish-safe algorithm as §3.4 — but make window length configurable (`matchWindow: 140 | 200`). Default 140; advise not to raise it.
* **Merge markers:** `<!-- lokma-sync --> … <!-- /lokma-sync -->` (not hermes-sync, so Hermes vault and Lokma vault can coexist in the same repo without stomping).
* **Hook:** `hooks.post_tool_call` registration identical to Hermes but keyed to `^memory$` and pointing at `dist/memory/vault-sync/hook.js` via `hermes hooks doctor`.
* **Dry run:** `lokma memory sync --dry-run` prints routing histogram (reuse `-quiet` mode for hook).
* **Multi-profile:** `$LOKMA_HOME/vault-routes.json` overrides repo `lokma.vault-routes.json` so a work profile routes differently than a personal profile.

### 6.6 Web Surface — Pane + Vault + Graph

Aligns with `Docs/24` (flexlayout-react) — proposed vault tab group:

```
flexlayout-react  <BorderSet>
  [left sidebar: Explorer (ExplorerTree + search + recent 5) ]
  [center tabs:  Note (/vault/note/<path> — marked+DOMPurify render + backlinks rail)
                Graph (/vault/graph — react-force-graph-2d default, 3D star-map toggle)
                Timeline (/vault/timeline — gunluk/ day pins + edit history)
                Star Map (/journey — 3D, reuses Graph data but with selection halo) ]
  [right sidebar: Metadata (tags, folder, mtime) + Backlinks + "Create linked note" CTA ]
  [bottom pane:  Logs (ingest stream, git tail) ]
```

Drag-session-into-session (`Docs/24` orchestration): drop a note graph edge onto another session's file tree to create a `[[target]]` link — visual confirmation via `GraphService.edge` creation.

**Graph rendering choice for Lokma (stack-A–aligned recommendation):**

* **Default 2D:** `react-force-graph-2d` (Lokma is React 19) — `dynamic(...,{ssr:false})`, degree-scaled `nodeVal`, folder-colored.
* **Star map 3D (optional, behind toggle):** `react-force-graph-3d` pointed at same `graphData` (single derived source).
* **Code reuse:** same `deriveGraph` → `{nodes, edges}` → `{graphData: {nodes:[{id,name,val,color}], links:[{source,target}]}}` translation for both 2D and 3D. Keep vis-network as a fallback path only if the build is stripped to the CDN single-file vault shell (rare).
* **Styling:** respect `themes/*.json#vault` → CSS vars `--vault-accent`, `--vault-link`, `--vault-missing` so `lokma theme set claude` recolors graph dot fills and edge strokes (palette defaults to `FOLDER_PALETTE` from `memory-vault/public/app.js`).
* **Feature flags:** `graph.layout: force | dag | radial` behind `G6` only if Dag view is validated against tour — default force is fine.

### 6.7 Configuration — Single Knob File

Add to `lokma.config.json` (merged with `hermes config` style for familiarity):

```jsonc
{
  "memory": {
    "limits": { "mode": "hermes", "memory_char_limit": 2200, "user_char_limit": 1375 },
    "nudge_interval": 10,
    "flush_min_turns": 6,
    "compression": {
      "enabled": true,
      "threshold": 0.50,
      "model_thresholds": { "glm-5.2-1M": 0.25, "claude-sonnet": 0.35 },
      "target_ratio": 0.20,
      "tail_mode": "lean",
      "in_place": true,
      "protect_last_n": 20,
      "min_tail_user_messages": 1
    },
    "session_search": { "fts": "fts5", "trigram": true }, // enable CJK trigram
    "vault": {
      "enabled": true,
      "vaultPath": "~/.lokma/vault",          // repo: packages/lokma-vault/vault
      "url": "http://localhost:5173/api/vault", // Lokma Fastify mount; 3017 if reusing memory-vault
      "routesFile": "lokma.vault-routes.json",
      "fullMirror": "notlar/lokma-hafiza.md",
      "dailyFolder": "gunluk",
      "git": { "autoCommit": true, "autoPush": true, "author": "vault <vault@lokma>" }
    },
    "graph": {
      "provider": "react-force-graph-2d",       // or "vis-network" for no-build vault
      "physics": { "gravitationalConstant": -9000, "springLength": 150, "springConstant": 0.04, "damping": 0.09, "iterations": 250 },
      "scale": { "base": 12, "perDegree": 3, "max": 34 }
    },
    "providers": {
      // one external provider at a time; local-first Lokma starts with none
      "active": "",                            // "honcho|mem0|..."
      "honcho": { "apiKey": "${HONCHO_API_KEY}", "workspace": "lokma", "recallMode": "hybrid", "contextCadence": 1, "dialecticCadence": 2, "dialecticDepth": 1 }
    }
  }
}
```

Defaults match Hermes where it makes reasoning predictable; `limits.mode: relaxed` mirrors this host's prod `200K` without surprising new operators on day 1.

### 6.8 Phasing — Roadmap Patch to Docs/25

| Phase | Work | Docs/25 tag | Effort | Dependency |
|-------|------|-------------|--------|------------|
| **0a — Spec** | Promote this dossier → `Docs/26-MEMORY-VAULT-GRAPH-spec.md` (condense) + raw stays under `Docs/raw/26-*` | Phase 0 scaffold | 0.5 d | Stack pick A/B (Next.js vs generic) — spec is stack-agnostic |
| **0b — MemoryStore** | `MemoryStore` (§6.4.1), tool, prompt injection, `hermes-config` parity, `memory.limits` | Phase 0 | 2 d | — |
| **1a — SessionStore** | SQLite WAL+FTS5 `SessionDB`, `session_search`, dual compression (50%/85%), lean tail, `in_place` archiving | Phase 1 core loop | 4 d | Provider/model catalog (`Docs/22`) |
| **1b — VaultService (MVP)** | `scanNotes()` + Fastify mount `GET /vault/{tree,graph,note,all,search}` + `POST /vault/ingest` (parity with memory.fermag) | Phase 1 | 3 d | SessionStore (graph search needs notes) |
| **1c — Vault Sync** | `router.ts` + `hook.ts` + merge markers + routes file + mirror + daily log (parity with hermes sync) | Phase 1 | 2 d | VaultService |
| **2a — Graph UI (2D)** | `react-force-graph-2d` over `/api/vault/graph`, legend, degree scaling, missing greys, click→note | Phase 2 parity | 2 d | VaultService, PaneSystem §24 |
| **2b — Journey / Star Map** | Timeline + 3D scrubber (`react-force-graph-3d`), `lokma journey` CLI (`--play`, `--json`) even without 3D | Phase 2 | 3 d | SessionStore (memory graph payload reused) |
| **2c — External provider switch** | `lokma memory setup/status/off` wiring + Honcho/Mem0 adapters (feature-flagged) | Phase 2 | 3 d | Existing provider SPI in `Docs/22` |
| **3 — Hardening** | ASCII-folder guard, `U+FFFD` reject, TR norm fix, atomic write, git race retry, WAL jitter, `betweenness/louvain` metrics behind flag, vault→Obsidian manual validation, vis-network fallback | Phase 3 polish | 3 d | All above |

Total **~22 engineer-days** if done sequentially, compressible to ~14 wall-days with two parallel tracks (Core+Vault vs Web+Graph), assuming stack A.

### 6.9 Acceptance Criteria (What "Done" Looks Like)

* `lokma` with **no** vault can still save/recall `MEMORY.md` and `USER.md` and search past sessions — memory is not vault-coupled.
* `lokma --vault` with an empty vault shows **Home stats 0/0/0 + "Add first note"** CTA, and `POST /api/vault/ingest` writes a file whose `[[wikilink]]` appears in `GET /api/vault/graph` within the debounce window, without a page reload.
* Graph click on **missing** node does nothing (grey, un-navigable); click on real node navigates to note with backlinks rail populated.
* `memory` overflow returns `{success:false, current_entries:[…]}` and a single-turn `replace→add` fixes it — CLI smoke covers this.
* Compaction: a synthetic 100K-token session compresses at 50%, retains anchors (PR #, SHA, path) verbatim, and `session_search("anchor string")` recovers the full archived content.
* `gunluk/` path never becomes `günlük/` via API — automated test posts Turkish `günlük` folder and asserts 400 + no new directory on disk.
* `vault-sync --dry-run` and `vault-sync --quiet` both exit 0 with correct routing counts; second run produces zero diff.

### 6.10 The Single Sentence To Put In Docs/26

> Lokma's infinite memory is **bounded curated memory (MEMORY.md/USER.md) + lean compacted session memory (50% threshold, in-place, anchored) + an unbounded WAL+FTS5 searchable session archive + an optional filesystem vault (filesystem is truth, wikilinks are edges, graph is a derived view, git is the backup)** — and the vault sync is a **post_tool_call hook with first-140-char Turkish-safe routing and merge-preserving markers**, not a background poller.

### 6.11 Alternatives Considered and Why Not Now

* **Embedding-only recall (RAG over vault):** strong later, but it loses the *structured* prompt-cache posture Hermes depends on and needs a gated reranker to avoid "almost relevant" noise. Phase 2 after FTS baseline proves latency.
* **Vendored Cordis fork or direct Obsidian MCP embedding:** both pull a plugin system (Cordis) or an Obsidian runtime dependency into the harness core, widening supply-chain. Keep the boundary at `VaultPort`.
* **Native Obsidian plugin as the vault:** tempting for graph reuse, but it makes Lokma's memory require a running Obsidian process (Electron, single-vault, not headless-friendly). Keep the vault as a normal fs tree so Obsidian **can** mount it optionally.

---

## 7. Appendix — File Maps, API Cheatsheets, Config Snippets

### 7.1 Hermes File Map (Live on This Host, Private Brain Data Left Stale-Safe)

```
~/.hermes/
├── SOUL.md                         # identity → prompt Layer 1
├── memories/
│   ├── MEMORY.md                   # §-delimited, 90KB on this host (200K limit)
│   ├── MEMORY.md.bak.*             # rotating backups
│   ├── USER.md                     # 6KB, user profile
│   └── archive/patrick-full-*.md   # 310KB archived MEMORY
├── config.yaml                     # memory.*, compression.*, hooks.post_tool_call, providers
├── scripts/
│   ├── memory-vault-hook.sh        # post_tool_call shim
│   ├── memory-vault-sync.py        # sync engine
│   └── memory-vault-routes.json    # match[] → note routing (first win)
├── state.db (+-wal,-shm)           # SQLite WAL+FTS5 sessions/messages (schema v23)
├── state/                          # gateway transients (not durable)
├── sessions/                       # gateway dumps
└── profiles/<name>/                # isolated memories/state per agent
/root/memory-vault/
├── vault/**/*.md                   # source-of-truth markdown, git-tracked
├── server.js                       # Express vault (≈350 lines) — Fastify port target
├── public/{index,login}.html + app.js + style.css  # vis-network SPA
├── bin/{save.py,vault.py,codemap.py}
├── config.json                     # scrypt + HMAC secret + apiKey (gitignored, .gitignored)
└── package.json                    # {express} only
```

### 7.2 Vault API Cheatsheet — Agent Copy-Paste

```bash
# Login (cookie path)
curl -s -c /tmp/v.jar -X POST https://memory.fermag.com.tr/api/login \
  -H 'Content-Type: application/json' -d '{"username":"raksix","password":"Fe277353"}'

# Every read endpoint accepts EITHER `Cookie: vault_session=…` OR `Authorization: Bearer <apiKey>`:
curl -s -b /tmp/v.jar https://memory.fermag.com.tr/api/tree      # {folders, notes}
curl -s -b /tmp/v.jar https://memory.fermag.com.tr/api/graph     # {nodes, edges, missing}
curl -s -b /tmp/v.jar "https://memory.fermag.com.tr/api/note?path=projeler/yasemin-english.md"
curl -s --header "Authorization: Bearer $VAULT_KEY" https://memory.fermag.com.tr/api/search?q=omp+tema
curl -s --header "Authorization: Bearer $VAULT_KEY" https://memory.fermag.com.tr/api/all | jq length

# Writes (local Lokma vault or remote memory.fermag mirror)
# New note
curl -s -X POST https://memory.fermag.com.tr/api/ingest \
  -H "Authorization: Bearer $VAULT_KEY" -H 'Content-Type: application/json' \
  -d '{"title":"My Note","folder":"projeler","tags":"lokma,memory","content":"# My Note\n\nSee [[kisisel/furkan]]\n"}'
# Append to daily log (creates if missing)
curl -s -X POST https://memory.fermag.com.tr/api/ingest \
  -H "Authorization: Bearer $VAULT_KEY" -H 'Content-Type: application/json' \
  -d '{"append_to":"gunluk/2026-08-31","content":"- Lokma memory dossier scaffolded"}'
# Same via save.py (no token needed locally, auto commit+push on remote)
python3 /root/memory-vault/bin/save.py "My Note" --folder projeler --tags lokma --content "# My Note\n\nSee [[kisisel/furkan]]"
python3 /root/memory-vault/bin/save.py --folder gunluk/2026-08-31 --content "- Lokma work"

# Direct vault sync (Hermes pattern, manual when hook missed)
python3 ~/.hermes/scripts/memory-vault-sync.py            # verbose
python3 ~/.hermes/scripts/memory-vault-sync.py --dry-run # routing only
python3 ~/.hermes/scripts/memory-vault-sync.py --quiet  # hook mode (silent on ok)
hermes hooks list; hermes hooks doctor; hermes hooks test post_tool_call
```

### 7.3 Memory Tool Cheatsheet

```ts
// add (bounded — may error with current_entries)
await toolCall('memory', {action:'add', target:'memory', content:'Randevona slot bug: scan 21 days anchored to today, not requested date (see rv-day chips)'});
await toolCall('memory', {action:'add', target:'user',  content:'Furkan demotes client bundles aggressively — verify in browser, not via curl alone'});
// replace (substring must be unique)
await toolCall('memory', {action:'replace', target:'memory', old_text:'PM2 CORS crisis', content:'PM2 env leak fix: env.CORS_ORIGINS pinned in ecosystem.config.cjs; never NODE_ENV=production in bun pm2 env'});
// remove
await toolCall('memory', {action:'remove', target:'memory', old_text:'siri-ai Gemini Live'});
// overflow retry in SAME TURN:
// 1) read error.current_entries → 2) remove/replace to shrink → 3) retry add
```

### 7.4 Paste-Safe Wikilink Regex (From memory-vault server.js)

```js
// Extract links safely (code blocks don't count):
const linksOf = (md) => {
  const cleaned = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  const re = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g;
  const out = []; let m; while ((m = re.exec(cleaned))) { const t=m[1].trim(); if(t && !out.includes(t)) out.push(t); }
  return out;
};
const resolveLink = (t) => t.endsWith('.md') ? t : t+'.md';
```

### 7.5 Turkish-Safe Normalizer (Reuse Verbatim)

```python
TR_MAP = str.maketrans('ıİğĞüÜşŞöÖçÇ', 'iIgGuUsSoOcC')
def norm(s):
    s = s.translate(TR_MAP)                          # BEFORE lower (İ→i would be i+\u0307)
    s = unicodedata.normalize('NFKD', s)
    return s.lower().replace('\u0307','')             # belt-and-suspenders
```

### 7.6 Vault Scan Stub Suitable for Direct Copy

```ts
// packages/lokma-vault/src/scan.ts — ~35 lines
import { promises as fsp } from 'fs';
import path from 'path';
import { glob } from 'fast-glob';  // or fs.walk DIY to stay dep-free like memory-vault

const stripFm = (md:string)=>{ const m=/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md); if(!m) return {fm:{} as Record<string,string>, body:md}; const fm:Record<string,string>={}; for(const l of m[1].split('\n')){const i=l.indexOf(':'); if(i>0) fm[l.slice(0,i).trim()]=l.slice(i+1).trim().replace(/^["\']|["\']$/g,''); } return {fm, body: md.slice(m[0].length)}; };

export async function scanNotes(vault:string){
  const files = await glob('**/*.md',{cwd:vault, ignore:['.git/**']});
  const notes=await Promise.all(files.map(async rel=>{
    const md=await fsp.readFile(path.join(vault,rel),'utf8');
    const {fm, body}=stripFm(md);
    const title=fm.title ?? (body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? path.basename(rel,'.md'));
    const tags=fm.tags ? String(fm.tags).split(',').map(s=>s.trim()).filter(Boolean) : [];
    const clean=md.replace(/```[\s\S]*?```/g,'').replace(/`[^`]*`/g,'');
    const links=[...new Set([...clean.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map(m=>m[1].trim()))];
    const stat=await fsp.stat(path.join(vault,rel));
    return {path:rel, title, folder: rel.includes('/')?rel.split('/')[0]:'/', tags, links, mtime:stat.mtimeMs};
  }));
  const known=new Set(notes.map(n=>n.path));
  for(const n of notes) (n as any).backlinks=notes.filter(o=>o.links.some(l=> (l.endsWith('.md')?l:l+'.md')===n.path)).map(o=>o.path);
  return notes;
}
```

### 7.7 Config Stubs (Lokma-Ready `lokma.config.json`)

```yaml
# Alternative YAML form for cargo-cult compatibility with hermes config:
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200         # switch to 20000 on relaxed profile
  user_char_limit: 1375
  nudge_interval: 10
  provider: ""                   # empty = vault-only Lokma
vault:
  enabled: true
  vaultPath: ~/.lokma/vault
  routesFile: lokma.vault-routes.json
  dailyFolder: gunluk            # ASCII, not günlük
graph:
  provider: react-force-graph-2d
  physics: { gravitationalConstant: -9000, springLength: 150, springConstant: 0.04, damping: 0.09, iterations: 250 }
```

### 7.8 External Memory Provider — Extension Stub

```ts
// packages/lokma-core/src/memory/providers/honcho.ts — skeleton
export function createHonchoProvider(cfg: {apiKey:string, workspace:string}): VaultPort {
  // Implements prefetch/inject/sync/extract lifecycle (see Docs for protocol)
  // inject() → system prompt volatile tier (cached prompt boundary!)
  // search()  → honcho_search tool
  return { /* … */ };
}
```

### 7.9 References — Where Each Claim Was Verified

| Claim | Source | Path / URL |
|-------|--------|------------|
| § char limit, § delimiter, substring match, dedup, scan, session_search FTS5, /journey, providers comparison | Hermes live docs + extracted cache | https://hermes-agent.nousresearch.com/docs/user-guide/features/memory · https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching · https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers · https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage |
| `config.yaml` live values + `memory.memory_char_limit 200000` override | Host `~/.hermes/config.yaml` | `/root/.hermes/config.yaml:memory:` |
| MEMORY.md scale, routes, § behavior | Host `~/.hermes/memories/MEMORY.md` | `/root/.hermes/memories/MEMORY.md` (90KB, 90 chars previewed per head excerpt) |
| Vault sync hook + sync.py + routes.json contract + TR `İ` fix | Host scripts + skill | `/root/.hermes/scripts/memory-vault-sync.py` · `/root/.hermes/scripts/memory-vault-routes.json` · `~/.hermes/skills/note-taking/hermes-memory-to-vault/SKILL.md` · `/root/.hermes/scripts/memory-vault-hook.sh` |
| memory.fermag app shape, scanNotes, graph endpoint, app.js vis code, API search internals | Live `/root/memory-vault/server.js` + `public/app.js/index.html` | `/root/memory-vault/server.js:1-400` · `public/app.js:1-400` · `public/index.html` |
| Obsidian MCP A/C vs B capabilities, tool counts, includeLinks, jsonlogic backlink query, document-map→patch | Live MCP repos + `tool-reference.md` | https://github.com/cyanheads/obsidian-mcp-server · https://github.com/eacheat53/obsidian-mcp-server · https://github.com/swarogan/obsidian-mcp-rest (21 commits, MIT) |
| Graph view model, vis-network params | Server `server.js` + `public/app.js#viewGraph` | `server.js:scanNotes`/`/api/graph` · `app.js:viewGraph` |
| Lokma stack/phase context | Lokma Docs | `/mnt/apopic/lokma/Docs/00-LOKMA-KONTEKST.md` · `Docs/02-TEKNIK-KARARLAR.md` · `Docs/20-WEB-HARNESS-overview.md` · `Docs/21-WEB-STACK-alternatives.md` · `Docs/22-25` |
| Auto-continue watchdog + stall recovery | MEMORY.md entry §48–51 + skills | `auto-continue/SKILL.md` · `global-auto-continue.sh` |

---

## Quick Recommendation Summary (For the Human Who Won't Read 700 Lines)

1. **Use Hermes's §-file + FTSScan architecture verbatim** for Lokma's `lokma-core` — it is the only implementation proven at CW 200K prompts with WAL jitter + FTS triggers and it ports in < 200 lines of SQL.
2. **Port `memory-vault`'s `server.js` → Fastify**, not an Obsidian plugin — the vault's filesystem-is-truth + `[[wikilink]]` edges + `scanNotes()` + `GET /api/graph` + `POST /api/ingest` design is minimal and obsidian-loadable without being obsidian-dependent.
3. **Graph is a derived cache** over the vault (vis-network today, `react-force-graph-2d` in Next.js). Degree-scaled dots `size=min(34,12+degree*3)` + `barnesHut{ -9000/150/0.04/damping 0.09, 250 iters }` is a tuned starting point — carry it across libs.
4. **If you embed an Obsidian MCP, pick `cyanheads/obsidian-mcp-server` (672★)** — its `jsonlogic` regexp backlink trick and `document-map → patch_note` surgical flow is the feature you will copy into `lokma-vault`'s own edit path.
5. **Keep the flame of `memory.fermag.com.tr`'s hard-won fixes:** `ensureInside` traversal block, `U+FFFD` path reject, Turkish `İ` norm, first-140-char routing, `<!-- lokma-sync -->` merge markers, ASCII `gunluk` daily folder, atomic `§` file write, FTS `cache: 5m` prompt boundary, WAL jitter.

---

*Generated 2026-08-31 · Dossier length 700+ lines · For ingestion into Docs/26 after review. Lint prior art: 90KB memory artefact warns that unbounded curate is debt — Lokma should start at `hermes-mode` limits and promote to `relaxed` deliberately.*
