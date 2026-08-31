# Web Features — Providers, Models, Sessions, Usage (Full Spec)

> **Scope:** Every Claude Code capability that must exist in the web harness, specified as UI + API + Data Model.
> **Parity target:** `10-ARASTIRMA-claude-code-birebir-analiz.md` (40+ tools, sessions, permissions, MCP, git, hooks, skills).

## 1. Provider Management

### 1.1 What it is

Providers are LLM backends. The harness is model-agnostic — the provider layer (`lokma-ai`) abstracts them.

Default providers (MVP):

| ID | Name | Auth | Models |
|----|------|------|--------|
| `anthropic` | Anthropic | API key / OAuth | claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5 |
| `openai` | OpenAI | API key | gpt-4o, gpt-4o-mini, o1, o1-mini |
| `deepseek` | DeepSeek | API key | deepseek-chat, deepseek-reasoner |
| `google` | Google | API key | gemini-2.0-flash, gemini-1.5-pro |
| `ollama` | Ollama (local) | none (localhost) | llama3.3, qwen2.5, mistral |
| `openrouter` | OpenRouter | API key | 100+ via proxy |

User can add any OpenAI-compatible endpoint (custom base URL + key).

### 1.2 UI

**Location:** `Settings → Providers` (also `Command Palette → Manage Providers`)

- **List:** Card per provider: logo, name, status (connected / error / not configured), model count, enabled count.
- **Add:** `+ Add Provider` → dialog: `ID` (select or custom), `Name`, `Base URL` (for custom), `API Key` (secret input, show/hide), `Test Connection` button (pings `/v1/models`).
- **Edit:** Click card → sheet: edit base URL / key, `Test`, `Save`, `Delete` (with confirm).
- **Status:** Green dot = last `GET /v1/models` succeeded, red = failed (tooltip with error), gray = not configured.
- **Reorder:** Drag handle — priority order matters for fallback routing (first = primary).

### 1.3 API

```
GET    /api/providers              → { providers: Provider[] }
POST   /api/providers              → { provider: Provider }  (body: { id, name, baseUrl?, apiKey })
PATCH  /api/providers/:id          → { provider: Provider }
DELETE /api/providers/:id          → 204
POST   /api/providers/:id/test     → { ok: boolean, models: string[], error?: string }
GET    /api/providers/:id/models   → { models: Model[] }  (proxies to provider)
```

Auth: `Authorization: Bearer <lokma_token>` (httpOnly cookie alternative). Keys stored encrypted at rest (AES-256-GCM, key from `LOKMA_ENCRYPTION_KEY` env, never returned in GET — only `keySet: boolean`).

### 1.4 Data Model

```ts
// lokma-shared/src/schemas/provider.ts
const ProviderSchema = z.object({
  id: z.string(),              // "anthropic" | "custom-xyz"
  name: z.string(),            // "Anthropic"
  baseUrl: z.string().url().optional(), // for custom OpenAI-compatible
  apiKeyEncrypted: z.string(), // AES-GCM, never exposed
  keySet: z.boolean(),         // derived, for UI
  enabled: z.boolean().default(true),
  priority: z.number(),        // sort order, 0 = first
  status: z.enum(["ok","error","unconfigured"]),
  lastTestAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
})
```

Storage: `providers` table (SQLite/Postgres via drizzle) — or `~/.lokma/providers.json` in local mode.

---

## 2. Model Management

### 2.1 What it is

Models belong to providers. The catalog is fetched from each provider's `/v1/models` and merged. User decides which models are enabled (visible/selectable) and which is default.

### 2.2 UI

**Location:** `Settings → Models` (also session header model switcher)

- **Catalog table:**
  ```
  | ☑ | Model              | Provider   | Context | Enabled |
  |---|--------------------|------------|---------|---------|
  | ☑ | claude-sonnet-4-5  | Anthropic  | 200k    | ●       |
  | ☐ | claude-opus-4-5    | Anthropic  | 200k    | ○       |
  | ☑ | gpt-4o             | OpenAI     | 128k    | ●       |
  | ☑ | deepseek-chat      | DeepSeek   | 64k     | ●       |
  ```
  - Checkbox = enabled (only enabled models appear in the session model switcher).
  - `Enabled` dot = per-provider toggle (disable whole provider → all its models hidden).
  - `Allow All` / `Disable All` per provider.
  - Search box (live filter by `id` / `provider`).
  - Badge per model: `provider` pill (like CommandCode Router: `anthropic` blue, `openai` green).

- **Model switcher (session header):**
  - Dropdown: only enabled models, grouped by provider, with `context` and `pricing` hint.
  - Also: `Command Palette → Switch Model` or `Ctrl+M`.

- **Fallback routing:**
  - Settings → `Fallback` toggle: if primary provider 429/500, try next enabled provider's equivalent model (e.g. `claude-sonnet-4-5` → `gpt-4o` if defined in `fallbacks.json`).
  - UI: drag to reorder fallback chain.

### 2.3 API

```
GET    /api/models                          → { models: Model[] }  (merged, cached 5m)
POST   /api/models/refresh                  → { models: Model[] }  (force re-fetch all providers)
PATCH  /api/models/:id                      → { model: Model }  (body: { enabled: boolean })
POST   /api/models/bulk                     → { updated: number } (body: { ids: string[], enabled: boolean })
GET    /api/models/enabled                  → { models: Model[] }  (only enabled, for switcher)
```

Merge logic: `GET /api/models` fetches from all `enabled` providers in parallel, tags each with `provider`, dedupes by `provider::id`, caches 5 minutes. UI badge = `provider`.

### 2.4 Data Model

```ts
const ModelSchema = z.object({
  id: z.string(),              // "claude-sonnet-4-5"
  provider: z.string(),        // "anthropic"
  providerModelId: z.string(), // raw id from provider (may differ)
  displayName: z.string(),     // "Claude Sonnet 4.5"
  contextWindow: z.number(),   // 200000
  enabled: z.boolean().default(true),
  pricing: z.object({ input: z.number(), output: z.number() }).optional(),
})
// DB: models table, unique on (provider, id), upsert on refresh.
// Frontend key: `${provider}::${id}` to handle same id on two providers.
```

---

## 3. Token Usage & Cost Tracking

### 3.1 What it tracks

Every agent turn records:

- `promptTokens`, `completionTokens`, `totalTokens`
- `model`, `provider`, `sessionId`, `timestamp`
- Derived `cost` (via `pricing` table, per 1M tokens)

Aggregations:

- Per session (header badge: `12.3k tokens · $0.04`)
- Per model (which model burns most)
- Per day / week / month (chart)
- Per provider (where spend goes)

### 3.2 UI

**Location:** `Usage` page + session header badge + command palette

- **Session badge:** `12.3k · $0.04` in header, click → detail popover (breakdown by turn).
- **Usage dashboard (`/usage`):**
  - KPI cards: `Total tokens (7d)` / `Total cost (7d)` / `Avg / session` / `Top model`.
  - Chart: `recharts` AreaChart — tokens/day, stacked by model, 7/30/90d toggle.
  - Table: `Recent sessions` — `session | model | tokens | cost | date`, click → session.
  - Export: `CSV` download.

### 3.3 API

```
GET  /api/usage/summary?range=7d          → { totalTokens, totalCost, byModel: {id: {tokens,cost}}[] }
GET  /api/usage/sessions?range=7d         → { sessions: {id, name, model, tokens, cost, updatedAt}[] }
GET  /api/usage/session/:id               → { turns: {turn, model, prompt, completion, cost}[] }
GET  /api/usage/export?range=30d&format=csv → CSV file
```

### 3.4 Data Model

```ts
const UsageEventSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  provider: z.string(),
  model: z.string(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  cost: z.number(), // computed
  createdAt: z.string().datetime(),
})
// DB: usage_events table, indexed on (sessionId, createdAt), (model, createdAt)
// Pricing: JOIN models.pricing at write time (snapshot, not live, so history stable)
```

---

## 4. Session Management

### 4.1 What it is

Sessions are the harness's unit of work — same as Claude Code (`~/.claude/projects/<hash>/` JSONL). Web must support the full lifecycle:

- **Create:** new chat (empty or with initial prompt, optional `cwd` / project).
- **List:** sidebar, searchable, grouped by project / recency.
- **Resume:** click to reopen, WebSocket replays transcript, agent resumes.
- **Fork:** branch a session (copy transcript → new ID, for experiments).
- **Rename:** inline edit (auto-title from first prompt, or LLM-generated).
- **Delete:** with confirm, transcript archived (not hard-deleted unless `purge`).
- **Worktree:** per-session git worktree isolation (optional, for parallel sessions on same project without collision).
- **Checkpoint / rewind:** snapshot before each Write/Edit, rewind button in UI.

### 4.2 UI

**Location:** Left sidebar (Sessions) — see `24-*` for full pane spec, summary here.

- **Sessions panel:**
  - Search box (filter by name / first prompt).
  - Group: `Today` / `Yesterday` / `This week` / `Earlier`  (or by project if `Group by project` toggle on).
  - Row: `●` status dot (running/idle/error), `name`, `model`, `updatedAt`, `token` badge, `…` menu (Rename / Fork / Delete / Export).
  - Active row highlighted, click → load in center pane (chat).
  - `+ New Session` button (top), also `Ctrl+N`.

- **Chat (center pane):**
  - Message list (user bubble right / assistant left, tool renderers inline).
  - Input: `textarea` + `Send` + `Model switcher` + `/` slash menu + `@` file mention.
  - Streaming: `text_delta` appends, `tool_start` shows spinner, `tool_result` renders.
  - Permission prompt: inline card (`Allow` / `Deny` / `Always allow`).
  - AskUserQuestion: inline multiple-choice.
  - Footer: `tokens · cost · model · context %` bar.

- **Worktree badge:** if session is in a worktree, show `⎇ branch` pill in header, click → `Exit worktree`.

### 4.3 API

```
GET    /api/sessions                    → { sessions: Session[] }  (sorted by updatedAt desc)
POST   /api/sessions                    → { session: Session }  (body: { initialPrompt?, projectId?, model? })
GET    /api/sessions/:id                → { session: Session, messages: Message[] }
PATCH  /api/sessions/:id                → { session: Session }  (body: { name })
POST   /api/sessions/:id/fork           → { session: Session }  (new ID, copied transcript)
DELETE /api/sessions/:id                → 204
POST   /api/sessions/:id/resume         → { session: Session }  (replay, reopen WS)
GET    /api/sessions/:id/export         → JSONL file download
WS     /ws/:sessionId                   → bidirectional agent events (see 12-* §3.3)
```

### 4.4 Data Model

```ts
const SessionSchema = z.object({
  id: z.string(), // nanoid
  name: z.string(), // auto from first prompt or "Untitled"
  projectId: z.string().nullable(), // FK → projects.id (or cwd hash)
  model: z.string(), // "anthropic::claude-sonnet-4-5"
  status: z.enum(["idle","running","error"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  // transcript: JSONL file at ~/.lokma/projects/<hash>/sessions/<id>.jsonl
  // checkpoints: ~/.lokma/projects/<hash>/checkpoints/<id>/
})

const MessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string(), createdAt: z.string() }),
  z.object({ role: z.literal("assistant"), content: z.string(), toolCalls: ToolCallSchema.array().optional() }),
  z.object({ role: z.literal("tool"), toolCallId: z.string(), content: z.string(), isError: z.boolean() }),
])
```

Storage: same as CLI — `~/.lokma/projects/<hash>/sessions/<id>.jsonl` (local) or Postgres + S3 JSONL (cloud). Web and CLI read the same files — no duplication.

---

## 5. Other Claude Code Features in Web (Checklist)

All must be reachable from web — not necessarily in MVP, but specced:

| Feature | Web location | Notes |
|---------|--------------|-------|
| **Permissions** | Settings → Permissions + session permission banner | allow/deny/ask rules, `auto` classifier |
| **Hooks** | Settings → Hooks (table: event → matcher → command) | same `PostToolUse` etc. |
| **Skills** | Command palette `/` + Settings → Skills | markdown skills, slash commands |
| **Plugins** | Settings → Plugins (marketplace, install/enable) | see `23-*` |
| **MCP** | Settings → MCP (add/test/enable, 4 transports) | same `.mcp.json` |
| **Git** | Git panel (branch, diff, commit, PR, `@lokma` config) | same `gh` flow |
| **Memory** | Project Settings → LOKMA.md editor + Memory viewer | 200 lines / 25KB |
| **Subagents** | Orchestration view — see `24-*` | same `Agent` tool |
| **Checkpoints** | Session → `Rewind` button per edit | same snapshot |
| **Worktrees** | Session header `⎇` pill + New Session → Worktree toggle | same `EnterWorktree` |

---

*Next: `23-PLUGIN-SYSTEM-deepseek-cordis.md` — how plugins work.*
