# Lokma Bots — Grok-Bots-Inspired Bot System

> **Inspired by:** xAI **Grok Bots** (`grok.com` · `docs.x.ai/grok-bot/*` · `x.ai/blog` Aug 11 & 26 2026) + Hermes `bots` (Grok-like `bot.json` + Bot Gallery)
> **Raw:** `raw/42-grok-bots-ham-arastirma.md` (1,121 lines, 114 KB, 25+ sources)
> **Companion:** `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` · `27-SKILLS-auto-discovery-hermes-inspired.md` · `28-MEMORY-infinite-vault-graph.md` · `26-CONFIG-and-CREDENTIALS.md`
> **Owner ask (verbatim):** *"hermese bots diye bir özellik geldi grok bots. Onun gibi bir sistemi de eklemek için lokma bots adında bir plan daha çıkar döküman yaz nasıl çalışıyor nasıl olmuş detaylıca"*

---

## 1. What Grok Bots Are (What Hermes Copied)

**Grok bots** are **durable, named teammates** on a persistent Linux VM — each has its own browser/FS/terminal, connectors/MCP where available (otherwise `computer-use`), and a shareable store.

**Key facts from docs.x.ai + x.ai/blog (Aug 2026):**

| Aspect | How Grok Does It |
|--------|------------------|
| **What a bot is** | Named teammate (name + title + description + avatar) with its own **system prompt (instructions)**, **tools/connectors/MCP**, **files/knowledge**, **model choice**, **memory** — lives on a VM, persists across chats |
| **Creation** | `New → Create new agent` → Edit Profile (name/title/description/avatar) → description vs message prompt pattern (description = who it is; message prompt = first instruction) → attach files/connectors/knowledge → pick model → publish. Limit **50 bots**, 10-min teach |
| **Discovery** | **Bot store / marketplace** — featured/mine/shared, `bot.store` (independent app store), `awesome-grok-bot-plugins` (219 plugins), RuntimeWire report; one-click fork/chat/share |
| **Using a bot** | Switch bot in chat → bot's system prompt + tools + knowledge are injected; group chat with multiple bots; `computer` takeover (bot drives browser/terminal) |
| **Differentiator vs single chat** | Each bot is a **specialist** with own memory/tools — not just a prompt preset; durable VM + FS + browser per bot |
| **Pricing/limits** | Plan-gated (Grok plans), 50-bot cap, 10-min teach, team/enterprise tiers (`docs.x.ai` teams/enterprise) |
| **Artifacts** | Skills/routines (`skills-routines`), files/results (`files/results`), computer/apps (`computer/apps`), approvals/security (`approvals/security`) |

**Hermes `bots`** mirrors this: `bot.json` spec + Bot Gallery pane + bot vs agent vs persona mapping (Hermes `30-*` §personality: persona = SOUL template, bot = persona+model+tools+knowledge packaged, agent = running instance).

---

## 2. Why Lokma Bots vs Lokma Agents (Not a Duplicate)

From `30-AGENT-SYSTEM` (553 lines, 40 KB):

| Concept | What It Is | Lifecycle | Cost |
|---------|------------|-----------|------|
| **Persona (SOUL)** | `SOUL.md` template — 6 persona slots, tone + rules + memory hint | Static file, no runtime | 0 |
| **Bot** | **Shareable specialist package** — persona + model + tools + skills + MCP + knowledge + memory scope + visibility, versioned, forkable | Static `bot.json` + files, **no worktree**, instant to create/share | 0 until run |
| **Agent** | **Running instance** of a bot (or raw SOUL) — has `agentId`, `worktree`, `budgets`, `locks`, `heartbeat`, `SQLite WAL` | Spawned → `maxConcurrent` slot → `maxAgents` cap → queue → heartbeat → kill | Metered (`TokenLedger`) |

> **Mental model:** Persona = template, **Bot = packaged product** (like a Grok bot in the store), **Agent = running process** (like a Grok bot in a chat with VM). A bot can be **instantiated** as one or many agents (e.g., 5 parallel `code-reviewer` bots on different worktrees).

---

## 3. Bot Spec — `bot.json`

Stored at `~/.lokma/bots/<botId>/bot.json` (global) or `.lokma/bots/<botId>/bot.json` (project-local). Also the **export/import** format (share via URL/file).

```json
{
  "id": "code-reviewer-v2",
  "name": "Code Reviewer",
  "avatar": "🔍",
  "description": "Strict reviewer — finds security + correctness issues, never approves sloppy diffs.",
  "systemPrompt": "You are a senior reviewer. Rules: 1) Check every diff hunk... 2) Never approve if tests missing...",
  "model": "anthropic/claude-opus-4",
  "fallback": ["openai/gpt-5", "google/gemini-2.5-pro"],
  "tools": ["read_file", "write_file", "patch", "terminal", "browser_exec"],
  "skills": ["code-review", "security-audit"],
  "mcpServers": ["github", "linear"],
  "knowledgeFiles": ["./knowledge/review-rubric.md", "./knowledge/secure-coding.md"],
  "memoryScope": "bot",        // "bot" | "project" | "user" | "isolated"
  "budgets": { "maxTokens": 80000, "maxUsd": 2.00, "maxTurns": 40 },
  "visibility": "private",     // "private" | "shared" | "public"
  "version": "2.1.0",
  "createdFrom": "soul:reviewer", // or "bot:code-reviewer-v1" (fork provenance)
  "tags": ["review", "security"]
}
```

| Field | Meaning |
|-------|---------|
| `id` | Slug, unique in `~/.lokma/bots/` |
| `name`/`avatar`/`description` | Gallery display (avatar = emoji or `/.lokma/bots/<id>/avatar.png`) |
| `systemPrompt` | Injected as `SOUL.md` when instantiated as agent |
| `model`/`fallback` | Per-bot model routing (see `30-*` §model per agent) |
| `tools` | Allowlist — agent only gets these tools (subset of `30-*` toolset) |
| `skills`/`mcpServers` | Auto-loaded on spawn (see `27-*` skill injection) |
| `knowledgeFiles` | RAG — files are read into context on spawn (or via `read_file` tool) |
| `memoryScope` | `bot` = bot-local `MEMORY.md`; `project` = shared `.lokma/MEMORY.md`; `isolated` = ephemeral |
| `budgets` | Per-run caps (see `30-*` budgets) |
| `visibility` | `private` (only you) · `shared` (team via URL) · `public` (gallery) |

Validation: Zod schema `BotSchema` (same pattern as `26-*` config).

---

## 4. Bot Lifecycle

```
Create ──► Edit ──► Test (playground) ──► Publish ──► Fork ──► Run as Agent
  │          │            │                  │           │           │
  │          │            │                  │           │           └─ agentId, worktree, locks, heartbeat
  │          │            │                  │           └─ clone bot.json + files, new id+version
  │          │            │                  └─ visibility: shared/public, appears in Gallery
  │          │            └─ chat with bot in sandbox (no worktree, ephemeral)
  │          └─ name/avatar/prompt/model/tools/knowledge/files
  └─ from scratch  OR  from SOUL (soul:reviewer)  OR  from existing bot (fork)
```

- **Create:** `lokma bot create --from soul:reviewer --name "Code Reviewer"` or Web Gallery `+ New Bot`
- **Edit:** `lokma bot edit <id>` (opens `bot.json` + knowledge files) or Web `Bot Editor` pane
- **Test:** **Playground** — chat with bot in a sandbox session (no worktree, no locks, ephemeral `state.db` row) — same as Grok's "test in chat"
- **Publish:** `lokma bot publish <id> --visibility shared` → generates share URL `https://lokma.sh/b/<id>` (or file export `bot.json` + `knowledge/`)
- **Fork:** `lokma bot fork <url> --as my-reviewer` → clones to `~/.lokma/bots/my-reviewer/`
- **Run as agent:** `lokma bot run <id> --task "Review PR #42"` → spawns agent (`maxConcurrent` slot, worktree, budgets) — or Web `Run as Agent` button

---

## 5. Bot Store — Web Gallery Pane

```
┌─ Bot Gallery ───────────────────────────────────────┐
│ [Featured] [Mine] [Shared] [Public]   [+ New Bot]   │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │ 🔍 Code │ │ 🎨 Design│ │ 🧪 Tester│  …            │
│ │ Reviewer│ │ Critic  │ │ Harness │                │
│ │ v2.1.0  │ │ v1.3.0  │ │ v1.0.0  │                │
│ │ [Fork]  │ │ [Fork]  │ │ [Fork]  │                │
│ │ [Chat]  │ │ [Chat]  │ │ [Run]   │                │
│ └─────────┘ └─────────┘ └─────────┘                │
│ Detail drawer: systemPrompt · model · tools ·       │
│ knowledge · memoryScope · budgets · version history │
└─────────────────────────────────────────────────────┘
```

- **Tabs:** Featured (curated) · Mine (private) · Shared (team) · Public (hub)
- **Actions:** `Fork` (clone), `Chat` (playground), `Run as Agent` (spawn), `Share` (copy URL), `Export` (download `bot.json` bundle)
- **Detail:** full `bot.json` + knowledge file list + version history (fork provenance chain)

---

## 6. Sharing & Marketplace

| Mechanism | How |
|-----------|-----|
| **Export** | `lokma bot export <id> --out ./my-bot.zip` → `bot.json` + `knowledge/` + `avatar.png` (zip) |
| **Import** | `lokma bot import ./my-bot.zip --as my-bot` or `lokma bot fork https://lokma.sh/b/<id>` |
| **URL share** | `lokma bot publish <id>` → `https://lokma.sh/b/<botId>` (or self-hosted `https://<vault>/bots/<id>`) — `GET /api/bots/:id` returns `bot.json` (secrets masked) |
| **Hub** | Future `lokma bot hub publish <id>` → `agentskills.io`-style registry (like OD's skill hub) — versioned, searchable |
| **Versioning** | `version` semver, `createdFrom` provenance, `lokma bot history <id>` shows fork chain |

No secrets are ever exported — `credentials.json` refs are masked (`credentialRef: "anthropic"` not the key).

---

## 7. Integration — Web, CLI, Future Apps

**Single source:** `~/.lokma/bots/<id>/` (global) + `.lokma/bots/<id>/` (project). Both are plain dirs — no daemon needed to list them.

**REST (when Web harness is running):**

```
GET    /api/bots                 → { bots: Bot[] } (filtered by visibility)
GET    /api/bots/:id             → Bot (secrets masked)
POST   /api/bots                 → create { from?: "soul:reviewer" | "bot:other", name, ... } → Bot
PATCH  /api/bots/:id             → edit
POST   /api/bots/:id/fork        → clone → new Bot
POST   /api/bots/:id/publish     → { url, visibility }
POST   /api/bots/:id/run         → spawn agent { agentId, task } (see 30-* spawn)
GET    /api/bots/:id/history     → { versions: Bot[] } (fork chain)
```

**CLI:**

```bash
lokma bot list
lokma bot create --from soul:reviewer --name "My Reviewer"
lokma bot edit code-reviewer-v2
lokma bot playground code-reviewer-v2   # ephemeral chat
lokma bot run code-reviewer-v2 --task "Review PR #42"
lokma bot export code-reviewer-v2 --out ./bot.zip
lokma bot fork https://lokma.sh/b/code-reviewer-v2 --as mine
```

**Future apps** (Desktop, mobile): same `GET /api/bots` + file store — no duplication, visible everywhere (like `31-*` Archify and `34-*` Design artifacts).

---

## 8. Bot vs Skill vs MCP vs Agent (How They Compose)

| Layer | What It Provides | Bot Uses It How |
|-------|------------------|-----------------|
| **Skill** (`27-*`) | `<available_skills>` + `skill_view` — procedural knowledge the agent can load | `bot.skills[]` auto-injects skills on spawn |
| **MCP** (`36-*`) | External tools (GitHub, Linear, Slack) via `mcp_servers` | `bot.mcpServers[]` — bot only gets its allowlisted MCPs |
| **Memory** (`28-*`) | `MEMORY.md` + FTS5 + vault | `bot.memoryScope` — bot-local vs project vs isolated |
| **Agent** (`30-*`) | Runtime (worktree, locks, budgets, heartbeat, Bus) | `bot` is the **spec**, `agent` is the **running instance** of that spec |

A single task can use multiple bots: `Coordinator` (from `30-*`) can spawn `code-reviewer` + `security-auditor` + `tester` bots in parallel (each in its own worktree, `maxConcurrent` slots, `Bus` for comms).

---

## 9. Roadmap Slot

| Phase | What |
|-------|------|
| **0 — Scaffold** | `~/.lokma/bots/` dirs, `BotSchema` Zod, `bot.json` read/write, `lokma bot list/create/edit` |
| **1 — Gallery** | Bot Gallery pane (Featured/Mine/Shared) + `GET /api/bots` + playground (ephemeral chat) |
| **1.5 — Run** | `lokma bot run` → agent spawn (worktree + budgets + locks) + `POST /api/bots/:id/run` |
| **2 — Share** | `fork`/`export`/`import`/`publish` + `bot.store`-style hub, versioning + provenance |
| **2.5 — Polish** | Bot-aware `lokma doctor` (bot lint), hub search, team `shared` visibility + allowlists |

---

## 10. References

- Grok Bots: https://docs.x.ai/grok-bot/overview · https://x.ai/blog (Aug 11 & 26 2026) · https://grok.com
- Bot store: https://bot.store · https://github.com/awesome-grok-bot-plugins (219 plugins)
- Hermes bots: `hermes/skills/.usage.json` + `30-AGENT-SYSTEM` persona→bot→agent mapping
- Lokma: `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` · `27-SKILLS` · `28-MEMORY` · `26-CONFIG`
