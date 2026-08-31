# Lokma Web Harness — Detailed Feature Spec (Raw Research)

> **Purpose:** Full parity spec for Lokma Web Harness — every Claude Code capability exposed in the browser. Each feature describes **UI**, **API**, and **Data Model**.  
> **Date:** 2026-08-31 · Status: Draft research → will be normalized into `Docs/`  
> **Scope:** 10 mandatory feature areas. Target: ≥350 lines. Actual: ~750 lines.  
> **Stack assumptions:** `lokma-core` (agent loop, shared), `lokma-ai` (provider layer), `lokma-web` = Fastify + WebSocket + Next.js 15 + React + xterm.js + Monaco Diff + Recharts + Tailwind + CSS-var themes. Storage: SQLite (local) / Postgres (cloud), filesystem JSONL for transcripts.  

---

## Table of Contents
1. Provider Management
2. Model Management
3. Token Usage & Cost Tracking
4. Session Management
5. Tool Parity (40+ Tools)
6. Permission System in Web UI
7. Hooks / Skills / Plugins in Web
8. MCP in Web
9. Git Integration in Web
10. Real-time Streaming UX
11. Cross-cutting: Auth, Themes, Security, Deployment, Open Questions

---

## 1) Provider Management

### Why
Claude Code is Anthropic-only. Lokma is multi-provider — the web harness must let users add/rotate providers without touching `~/.lokma/credentials.json` by hand.

### Supported Provider Types
| id | Transport | Auth | Notes |
|---|---|---|---|
| `anthropic` | HTTPS (Anthropic API) | API key `sk-ant-*` or OAuth (`claude auth login` token) | Primary, prompt caching, extended thinking |
| `openai` | HTTPS (OpenAI / Azure / compatible) | API key `sk-*` or Azure AD | `gpt-4o`, `o1`, `o3` |
| `deepseek` | HTTPS | API key | `deepseek-chat`, `deepseek-reasoner` |
| `google` | HTTPS (Vertex / AI Studio) | API key or GCP service account JSON | `gemini-2.0-flash`, `2.5-pro` |
| `openrouter` | HTTPS | API key `sk-or-*` | Proxy to 100+ models, unified pricing |
| `ollama` | HTTP local (`http://localhost:11434`) | None (or basic auth) | Local models, `llama3.1`, `qwen2.5-coder` |
| `bedrock` | AWS SDK | IAM / SSO | Anthropic via Bedrock |
| `custom` | OpenAI-compatible base URL | API key + baseURL | vLLM, LiteLLM, LM Studio |

### UI
- **Route:** `/settings/providers` + modal `Add Provider`.
- **List view:** Table: `Provider | Status (connected/error/disabled) | Default model | Latency (last ping) | Actions`.
  - Status badge: green dot = last health check `200` within 5m; yellow = rate-limited; red = auth error.
  - Inline latency spark (last 20 pings).
- **Add/Edit modal:**
  - Step 1: pick provider type (grid of logos + `Custom`).
  - Step 2: dynamic form per type. Common fields: `Display name`, `Base URL` (for custom/ollama/azure), `API key` (password input with reveal + paste, never echoed), `OAuth Connect` button where supported (Anthropic, Google, Azure). Ollama shows `Detected models` auto-discovered via `GET /api/tags`.
  - Test button → `POST /api/providers/:id/test` spins, shows `✓ 320ms · models: 12`.
  - Save → validates, writes credential, triggers model catalog refresh.
- **API Key UX:** Masked `sk-ant-••••abcd`, `Rotate` → new key input + `Keep old for 5 min` grace toggle (for zero-downtime). `Reveal` requires re-auth (password / OS keychain prompt). Copy button.
- **OAuth flow UX:** "Connect with Anthropic" → popup `https://claude.ai/oauth/authorize?...` → redirect to `http://localhost:3456/api/auth/callback?code=...` → exchanges code, stores `access_token` + `refresh_token` + `expires_at`. Status shows `OAuth · expires in 23h · [Refresh]`.
- **Enable/Disable toggle:** Per provider switch (does not delete credentials). Disabled providers hidden from model picker and fallback chain but retained for quick re-enable.
- **Delete:** Confirm dialog warns "3 sessions use this provider; they will fallback to ...". Soft-delete option `Keep credentials for 30 days`.
- **Bulk:** Import from env: `Import from env` scans `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` etc. Export masked list for sharing.

### API
```
GET    /api/providers                    → Provider[]
POST   /api/providers                    { type, name, baseUrl?, apiKey?, oauthCode?, headers? } → Provider
GET    /api/providers/:id
PATCH  /api/providers/:id                { name?, baseUrl?, apiKey?, enabled?, defaultModel? }
DELETE /api/providers/:id                ?hard=false
POST   /api/providers/:id/test           → { ok, latencyMs, models: string[], error? }
POST   /api/providers/:id/oauth/start    → { url }  (returns authorize URL)
GET    /api/auth/callback                ?code&state → exchanges, redirects to /settings/providers?connected=id
POST   /api/providers/:id/oauth/refresh  → { expiresAt }
GET    /api/providers/health             → { id, status, latencyMs, lastError }[]
```

Example `Provider` response:
```json
{
  "id": "prv_abc123",
  "type": "anthropic",
  "name": "Anthropic (personal)",
  "baseUrl": null,
  "enabled": true,
  "authKind": "oauth",
  "status": "connected",
  "defaultModel": "claude-sonnet-4-5",
  "createdAt": "2026-08-30T12:00:00Z",
  "lastTestAt": "2026-08-31T00:10:00Z",
  "lastLatencyMs": 312,
  "modelsCount": 5
}
```

- Auth: `Authorization: Bearer <lokma_session_jwt>`; provider credential endpoints require `POST` with CSRF + re-auth header if `authKind` is sensitive.
- Rate limit: `test` endpoint 10 req/min per provider.

### Data Model
```ts
// shared: packages/lokma-shared/src/schemas/provider.ts (Zod)
type ProviderType = 'anthropic'|'openai'|'deepseek'|'google'|'openrouter'|'ollama'|'bedrock'|'custom';
type AuthKind = 'apiKey'|'oauth'|'iam'|'none';
type ProviderStatus = 'connected'|'error'|'disabled'|'untested';

interface Provider {
  id: string;              // prv_<nanoid>
  type: ProviderType;
  name: string;            // user label, unique
  baseUrl?: string;        // for custom/ollama/azure/bedrock
  authKind: AuthKind;
  enabled: boolean;
  status: ProviderStatus;
  defaultModel?: string;   // model id within catalog
  createdAt: string;
  updatedAt: string;
  lastTestAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
  metadata?: Record<string,unknown>; // e.g. { azureDeploymentMap, gcpProjectId }
}

// Storage
// File (local):  ~/.lokma/credentials.json  (0600, never committed)
//   { providers: Provider[], secrets: { [providerId]: { apiKey?: string, oauth?: { access, refresh, expiresAt } } } }
//   secrets encrypted at rest via OS keychain (keytar) where available; fallback AES-256-GCM with machine key.
// DB (cloud):  table `providers` + `provider_secrets` (vault-encrypted, key per user, rotation logs)
// Cache:       `provider_models` derived (see §2)
```

- Validation: `baseUrl` must be https unless `type=ollama` or `allowInsecure=true`; `name` unique per user; duplicate `baseUrl+apiKey` rejected.
- Rotation audit: `provider_audit_log { providerId, action: 'rotate'|'test'|'oauth_refresh', at, actor, ip }`.

---

## 2) Model Management

### Why
Users must see every available model per provider, toggle visibility, pin defaults, and define fallback routing (e.g. Opus → Sonnet → DeepSeek if 429).

### UI
- **Route:** `/settings/models` — grouped by provider collapsible sections.
- **Catalog table per provider:**
  - Columns: `[ ] Enabled | Model name | Context window | Input $/MTok | Output $/MTok | Capabilities (vision, tools, reasoning, 1M) | Latency | Default ★`.
  - Row actions: `Enable/Disable` toggle, `Set as default for provider`, `Pin to quick picker`.
  - Bulk: `Enable all vision models`, `Disable 1M beta`.
- **Model picker (global, in header + chat):** Dropdown like `/model` in CLI. Shows: `★ Pinned (3) — separator — By provider (grouped) — separator — Recent (last 5)`. Search filter. Each entry shows `name · context · $`. Disabled models greyed with "Enable in settings".
- **Fallback routing editor:**
  - Visual chain: `Primary → Fallback 1 → Fallback 2 → ...` drag to reorder.
  - Per-hop condition: `On 429 / 5xx / timeout / context overflow`. Add hop via `+ Add fallback` picker (only enabled models).
  - Preview: `Simulate failure of primary → would try ...`.
  - Global toggle: `Auto-fallback on rate limit` + `Ask before switching model` checkbox (like Claude Code `ask before switching`).
- **Capability badges & warnings:** `1M beta` warns "prompt caching TTL differs"; `reasoning` shows effort selector (low/medium/high/max). `modelOverrides` map for `availableModels` / `enforceAvailableModels`.
- **Pricing override:** Admin can override `$` per model for self-hosted proxies; shows `(custom pricing)` tag.

### API
```
GET    /api/models                       ?providerId? → ModelDef[]
GET    /api/models/catalog               → { providerId, models: ModelDef[] }[]  (full refresh)
POST   /api/models/refresh               { providerId? } → triggers provider discovery (Anthropic /api/models, OpenAI /v1/models, Ollama /api/tags)
PATCH  /api/models/:modelId              { enabled, pinned?, isDefaultForProvider? }
GET    /api/models/routing               → RoutingConfig
PUT    /api/models/routing               { chain: { providerId, modelId, on: ('429'|'5xx'|'timeout'|'contextOverflow')[] }[], autoFallback, askBeforeSwitch }
GET    /api/models/picker                → { pinned, recent, byProvider }  (for header dropdown)
POST   /api/models/select                { modelId } → sets session model (also PATCH /api/sessions/:id { modelId })
```

Example `ModelDef`:
```json
{
  "id": "claude-sonnet-4-5",
  "providerId": "prv_abc123",
  "displayName": "Claude Sonnet 4.5",
  "contextWindow": 200000,
  "contextWindowBeta1M": true,
  "pricing": { "inputPerMTok": 3.00, "outputPerMTok": 15.00, "cacheRead": 0.30, "cacheWrite": 3.75 },
  "capabilities": ["tools","vision","promptCaching","extendedThinking"],
  "enabled": true,
  "pinned": true,
  "isDefaultForProvider": true,
  "latencyP50Ms": 900
}
```

Routing config example:
```json
{
  "chain": [
    { "providerId": "prv_anth", "modelId": "claude-opus-4-6", "on": ["429","5xx"] },
    { "providerId": "prv_anth", "modelId": "claude-sonnet-4-5", "on": ["429","5xx","timeout"] },
    { "providerId": "prv_openrouter", "modelId": "deepseek/deepseek-v3", "on": ["*"] }
  ],
  "autoFallback": true,
  "askBeforeSwitch": false
}
```

### Data Model
```ts
interface ModelDef {
  id: string;                 // canonical: claude-sonnet-4-5, gpt-4o, deepseek-chat, gemini-2.0-flash
  providerId: string;         // FK providers.id
  displayName: string;
  contextWindow: number;      // tokens
  contextWindowBeta1M?: boolean;
  pricing: { inputPerMTok: number; outputPerMTok: number; cacheRead?: number; cacheWrite?: number; currency?: 'USD' };
  capabilities: ('tools'|'vision'|'promptCaching'|'extendedThinking'|'reasoningEffort'|'jsonMode')[];
  enabled: boolean;
  pinned: boolean;
  isDefaultForProvider: boolean;
  availableVia?: string[];    // aliases: ['sonnet','sonnet[1m]']
  metadata?: { deprecationDate?, betaUntil? };
}

interface RoutingConfig {
  userId: string;
  chain: { providerId: string; modelId: string; on: string[] }[]; // ordered
  autoFallback: boolean;
  askBeforeSwitch: boolean;
  effortDefault?: 'low'|'medium'|'high'|'max'|'auto';
  maxRetriesPerHop?: number;
}

// Storage
// File:  ~/.lokma/models.json  +  ~/.lokma/routing.json
// DB:    tables `models` (upsert on refresh), `model_enablement` (userId, modelId, enabled, pinned), `routing_configs`
// Cache: refresh job every 6h or on provider test; Ollama discovered instantly.
```

- Discovery: `lokma-ai` adapters call provider list-models; unknown models kept but flagged `discoveredAt`; removed models soft-deleted (retain pricing for cost history).
- Enforcement: `enforceAvailableModels` + `availableModels` allowlist; UI hides non-allowlisted even if provider advertises.

---

## 3) Token Usage & Cost Tracking

### Why
Claude Code shows `/cost` and `/usage` breakdowns. Web must make cost transparent across sessions, models, days — with charts.

### UI
- **Header badge:** `⌁ 42% · $1.23 · Sonnet` — context %, session cost, active model. Click → popover with `Input 12.3k (cached 8k) · Output 4.1k · Cost $0.42 · /context grid`.
- **Route:** `/usage` — three tabs:
  - **Overview:** KPI cards: `Today $ · Week $ · Month $ · Total tokens · Avg $/session`. Date range picker (Today/7d/30d/Custom).
  - **Charts:**
    - Stacked bar: `Tokens per day (input vs output vs cached)` (Recharts, theme-aware).
    - Line: `Cost per day` with model breakdown toggle.
    - Donut: `Cost by model` (click slice → filter).
    - Heatmap (optional): `Sessions per hour`.
  - **By Session table:** `Session | Model | Tokens in/out/cached | Cost | Duration | Date | [View]`. Sortable, paginated.
  - **By Model table:** `Model | Calls | Tokens | Cost | Avg latency | Error rate`.
- **Session detail drawer:** Inside chat header → `Usage` tab shows per-turn ledger: `Turn 1: 2.1k in / 0.8k out · $0.03 · 1.2s` + running total + prompt-cache hit rate.
- **Export:** `Export CSV` (all rows) and `Export JSONL` (raw ledger).
- **Budget alerts:** Setting `Monthly budget $` → progress bar turns amber at 80%, red at 100%, optional email/push notification (webhook).

### API
```
GET    /api/usage/summary                ?from&to&groupBy=day|model|session → Summary
GET    /api/usage/sessions               ?from&to&modelId?&sort&limit&cursor → Paginated SessionUsage[]
GET    /api/usage/models                 ?from&to → ModelUsage[]
GET    /api/usage/ledger                 ?sessionId&turn? → TokenLedgerEntry[]
GET    /api/usage/daily                  ?from&to → { date, input, output, cached, cost }[]
POST   /api/usage/report                 { from, to, format: 'csv'|'json' } → file download URL
GET    /api/usage/budget                 → { monthlyLimit, spent, remaining, alertAt }
PUT    /api/usage/budget                 { monthlyLimit, alertAt? }
```

Example summary:
```json
{
  "range": { "from": "2026-08-01", "to": "2026-08-31" },
  "totals": { "input": 823412, "output": 412331, "cached": 512000, "cost": 18.42, "sessions": 27 },
  "byModel": [{ "modelId": "claude-sonnet-4-5", "cost": 12.1, "tokens": 900000 }],
  "byDay": [{ "date": "2026-08-30", "cost": 2.3, "input": 45000, "output": 21000 }]
}
```

### Data Model
```ts
interface TokenLedgerEntry {
  id: string;                 // ulid
  sessionId: string;
  turn: number;               // incrementing
  modelId: string;
  providerId: string;
  at: string;                 // ISO
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;  // prompt-cache hits
  cacheCreationTokens?: number; // cache writes
  cost: number;               // computed via pricing at time of call
  latencyMs: number;
  finishReason?: 'stop'|'length'|'tool_calls'|'error';
  errorCode?: string;
}

interface SessionUsage {
  sessionId: string;
  projectHash: string;
  modelId: string;
  startedAt: string; endedAt?: string;
  totals: { input: number; output: number; cached: number; cost: number; turns: number };
  durationMs?: number;
}

// Storage
// Primary:  append-only ledger — filesystem `~/.lokma/projects/<hash>/sessions/<id>.usage.jsonl` + DB `token_ledger` (mirrored)
// Aggregation:  materialized views `usage_daily`, `usage_by_model` refreshed every 1m (local: in-memory LRU; cloud: Postgres matview + cron)
// Pricing:     snapshotted per entry (pricing at call time) so historical cost stable even if catalog price changes.
// Retention:   ledger kept forever; raw provider responses pruned after 30d.
// Privacy:     no prompt text in ledger — only token counts.
```

- Calculation: `cost = (input - cached)*inputPrice + cached*cacheReadPrice + cacheCreation*cacheWritePrice + output*outputPrice`. All per MTok.
- Cache accounting: Anthropic cache metrics from `usage.cache_creation_input_tokens` / `cache_read_input_tokens`; other providers map to `cached=0` unless they report.
- Aggregation job: every message `tool_result` + `assistant` completion emits `ledger:write`; `usage_daily` upserts.

---

## 4) Session Management

### Why
Claude Code's session primitive: create, resume, fork, delete, with JSONL transcript, checkpoints, worktree isolation. Web must expose all of it.

### UI
- **Route:** `/sessions` — master list. Also sidebar `Recent sessions` in chat layout.
- **List view:**
  - Filters: `All | Active | Archived`, `Project` dropdown (cwd hash → display path), text search (name, last prompt).
  - Columns: `Name/id (first 8) | Project | Model | Last message preview | Turns | Cost | Updated (relative) | Status (live/idle/done/error)`.
  - Row actions: `Resume` (open), `Fork`, `Rename`, `Archive`, `Delete`, `Export`, `Open in CLI` (deep link `lokma://resume/<id>`).
  - Live indicator: green pulse for sessions with active WebSocket; click → jumps to streaming chat.
- **Create:**
  - `+ New session` button → modal: `Project dir` (picker, defaults to last cwd), `Model` (picker), `Initial prompt` (optional), `Worktree: none | new worktree <name>`, `Permission mode`.
  - Shortcuts: `Cmd+N`, `lokma` CLI creates session visible in web within 2s via polling/WS.
- **Resume:** Click row → `/chat/:sessionId` loads transcript + reconnects WS if live else shows `Resume` button (sends `claude --resume <id>` semantics).
- **Fork:** `Fork` → dialog `New name` + `Copy transcript from ...` (default: full transcript; option: `From turn N` or `Last checkpoint`). Creates new `sessionId` with `forkedFrom` pointer.
- **Delete/Archive:** `Delete` → confirm "Transcript kept? (soft delete)" toggle; soft delete hides from list but `GET /api/sessions?includeDeleted=true` for recovery 30 days. `Purge` truly deletes JSONL + checkpoints + ledger (requires typing session name).
- **Transcript viewer:** In chat, `⋯ → View raw JSONL` downloads file; `Checkpoints` tab lists checkpoints (see below).
- **Worktree badge:** If session is worktree-isolated, badge `🌿 worktree:feature-auth` with `Open worktree diff` link.

### Checkpoints & Rewind
- **Checkpoint UI:** Timeline rail on the right of chat (like git history). Each checkpoint dot labelled `Before Edit: src/auth.ts • 2m ago • [Rewind]` on hover shows `files: 3 changed`. Created automatically before `Write|Edit|Bash` that mutates FS, and manually via `Create checkpoint` button.
- **Rewind:** Click `Rewind to here` → modal "This will restore N files to this point and truncate transcript after this turn. Continue?" → `POST /api/sessions/:id/rewind { checkpointId }`.

### Worktree Isolation
- **Badge + manager:** `/sessions` filter `Worktree: yes/no`. Inside session, `Worktree: feature-auth @ ~/.lokma/worktrees/feature-auth (main → feature-auth)` with `Merge` (`git merge --no-ff`) and `Remove worktree` actions.
- Creation: `New session → Worktree: Create new` → name validated (`git worktree add` semantics, blocked if dirty).

### API
```
GET    /api/sessions                     ?projectHash?&status?&q?&includeDeleted?&limit&cursor → Session[]
POST   /api/sessions                     { projectDir, modelId?, initialPrompt?, worktree?: { name }|null, permissionMode? } → Session
GET    /api/sessions/:id
PATCH  /api/sessions/:id                 { name?, modelId?, archived? }
DELETE /api/sessions/:id                 ?hard=false → soft delete
POST   /api/sessions/:id/fork            { name?, fromTurn?, fromCheckpointId? } → Session
POST   /api/sessions/:id/resume          → { wsUrl }  (ensures daemon worker alive)
POST   /api/sessions/:id/checkpoints     { label? } → Checkpoint
GET    /api/sessions/:id/checkpoints     → Checkpoint[]
POST   /api/sessions/:id/rewind           { checkpointId } → { ok, restoredFiles: string[] }
GET    /api/sessions/:id/transcript      ?format=jsonl|json → stream
GET    /api/sessions/:id/export          ?format=jsonl|md|html → download
GET    /api/worktrees                    → Worktree[]
POST   /api/worktrees                    { name, baseBranch? }
DELETE /api/worktrees/:name
```

Example `Session`:
```json
{
  "id": "ses_7c5dcf5d8a9b",
  "name": "auth-refactor",
  "projectHash": "a1b2c3",
  "projectDir": "/home/furkan/lokma",
  "modelId": "claude-sonnet-4-5",
  "permissionMode": "default",
  "status": "idle",
  "turns": 12,
  "cost": 0.84,
  "createdAt": "2026-08-31T00:00:00Z",
  "updatedAt": "2026-08-31T00:20:00Z",
  "forkedFrom": null,
  "worktree": { "name": "feature-auth", "path": "/home/furkan/lokma/.lokma/worktrees/feature-auth", "baseBranch": "main" },
  "checkpointCount": 4,
  "live": false
}
```

### Data Model
```ts
interface Session {
  id: string;                 // ses_<nanoid>
  name?: string;              // user-editable, unique per project
  projectHash: string;        // hash(cwd) — groups sessions
  projectDir: string;
  modelId: string;
  permissionMode: PermissionMode;
  status: 'live'|'idle'|'done'|'error'|'archived'|'deleted';
  turns: number;
  cost: number;               // denormalized from ledger
  createdAt: string; updatedAt: string;
  forkedFrom?: { sessionId: string; turn?: number; checkpointId?: string };
  worktree?: { name: string; path: string; baseBranch: string };
  archived?: boolean; deletedAt?: string;
}

interface SessionMessage {    // one JSONL line
  uuid: string;
  sessionId: string;
  turn: number;
  role: 'user'|'assistant'|'tool'|'system';
  content: string | ToolCall[] | ToolResult;
  timestamp: string;
  modelId?: string;
  usage?: { input: number; output: number; cached: number };
}

interface Checkpoint {
  id: string;                 // chk_<nanoid>
  sessionId: string;
  turn: number;
  label: string;              // "Before Edit: src/auth.ts"
  createdAt: string;
  files: { path: string; hashBefore: string; hashAfter?: string }[];
  transcriptOffset: number;   // line number in JSONL to truncate to on rewind
  worktree?: string;
}

// Storage
// Filesystem (source of truth, local):
//   ~/.lokma/projects/<hash>/sessions/<sessionId>.jsonl        — append-only, one JSON per line
//   ~/.lokma/projects/<hash>/sessions/<sessionId>.meta.json    — Session object
//   ~/.lokma/projects/<hash>/checkpoints/<checkpointId>/       — file snapshots (copy-on-write, content-addressed by hash)
//   ~/.lokma/history.jsonl                                      — cross-project recent list for Ctrl+R
// DB (cloud mirror):  tables `sessions`, `session_messages` (partitioned by projectHash), `checkpoints`, `checkpoint_files`
// Worktrees:  `~/.lokma/worktrees/<name>` (git worktree) + `git worktree list` as source of truth; DB mirrors for web.
// Concurrency: file locks via `proper-lockfile`; DB uses row-level lock on session id.
```

- Resume semantics: `POST /resume` ensures `lokma daemon` worker for that session is alive (spawns if needed), returns WS URL; frontend replays JSONL then subscribes to live WS.
- Fork copies JSONL up to `fromTurn`/`checkpoint`, creates new meta with new id, copies relevant checkpoint snapshots (COW).
- Worktree lifecycle: `git worktree add/delete` wrapped; session `projectDir` is worktree path when isolated.

---

## 5) Tool Parity (40+ Tools in Web)

### Principle
Web must expose **every** tool the CLI has — same registry (`lokma-core/src/tools/registry`), same permission checks, same hooks. Web-specific nuance is *rendering* and *interaction* (e.g. permission prompt as modal, not stdin).

### Full Tool Inventory (Claude Code parity)
| # | Tool | Permission | Web Renderer | Notes |
|---|---|---|---|---|
| 1 | `Read` | No (outside workdir → ask) | Code block + line numbers, image preview if binary | Range + offset support |
| 2 | `Write` | Yes | Diff preview (new file) + syntax highlight | Overwrite confirm if exists |
| 3 | `Edit` | Yes | Unified diff (monaco-diff-editor), hashline anchor | Whitespace-safe |
| 4 | `Glob` | No | File list with icons, click → Read | ripgrep-backed |
| 5 | `Grep` | No | Search results with file:line + snippet + `Open` | ripgrep, context lines |
| 6 | `Bash` | Yes (read-only whitelist auto) | xterm.js terminal block, stdout/stderr, exit code, duration | Persistent cwd/env, timeout, background |
| 7 | `PowerShell` | Yes | xterm.js (pwsh) | Windows only |
| 8 | `AskUserQuestion` | No | Modal: multi-choice + free text + `Answer` | Blocks loop until answered |
| 9 | `Agent` | No | Subagent card: nested chat, model badge, tool calls collapsed | Own context window, `yield*` |
| 10 | `TodoWrite` | No | Kanban/todo list widget, live updates | |
| 11 | `WebFetch` | Yes (domain allowlist) | Link preview + fetched markdown, truncated | |
| 12 | `WebSearch` | Yes (200/session) | Result list with title/url/snippet | Limit counter in UI |
| 13 | `LSP` | No | Go-to-def: file + symbol jump, diagnostics list | `LSP: diagnostics` panel |
| 14 | `NotebookEdit` | Yes | Notebook cell diff | |
| 15 | `EnterPlanMode`/`ExitPlanMode` | No/Yes | Banner "Plan mode — read-only" + `Approve plan` button | |
| 16 | `EnterWorktree`/`ExitWorktree` | Yes/No | Worktree badge + branch switch animation | |
| 17 | `TaskCreate/List/Get/Output` | No | Task board (like linear) | |
| 18 | `SendMessage` | No | Inline "→ sent to @agent" chip | Cross-session |
| 19 | `ListAgents` | No | Agent picker dropdown | |
| 20 | `Monitor` | Yes | Background task row with live log tail | WebSocket source |
| 21 | `Skill` | Yes | Skill card with inputs/outputs | |
| 22 | `CronCreate/List/Delete` | No | Schedule list with cron expression + next run | |
| 23 | `Checkpoint` | No | Timeline dot | |
| 24 | `Rewind` | — | Confirmation modal + restored file list | |
| 25 | `Artifact` | Yes | Embedded preview (iframe) + `Publish to claude.ai` | |
| 26 | `PushNotification` | No | Toast + browser Notification API | |
| 27 | `SendUserFile` | No | Download chip | |
| 28 | `ReportFindings` | No | Structured findings table (P0-P3) | |
| 29 | `ReadMcpResourceTool` / `ListMcpResourcesTool` | No | Resource browser | MCP |
| 30+ | MCP-provided tools (`mcp__*`) | Per-server | Dynamic renderer (name + input JSON + result) | Lazy-loaded via tool_search |

### UI — ToolRenderer
- **Chat stream:** Each `tool_start` inserts a collapsible block: header `🔧 Read src/auth.ts` (icon per tool, status spinner → ✓/✗), body expands on click. Parallel tool calls shown as a grid (2-up) before collapsing to list.
- **Diff renderer:** For `Edit`/`Write` — `monaco-diff-editor` (or `diff2html` lightweight). Header shows `src/auth.ts +12 -3` with `Accept`/`Reject` buttons in plan mode. Copy diff button.
- **Terminal renderer:** For `Bash`/`PowerShell`/`Monitor` — `xterm.js` inside block (read-only tail, full view in bottom panel). Shows `Exit 0 · 1.2s` footer. Background tasks have `View logs` → bottom panel.
- **AskUserQuestion renderer:** Modal overlay (blocks chat input): question, `Option A / B / C` radio + `Other: ___` freetext + `Submit`. Also toast in header if user scrolls away.
- **Subagent renderer:** Nested card with avatar `🤖 Explore · Sonnet`, its own tool call list (collapsed by default, expand → nested stream).
- **Permission prompt inside tool block:** If `tool_start` requires approval, block shows `Allow once · Allow always (write rule) · Deny · Edit command` buttons (see §6).

### API
Tools are **not** called directly by the frontend; the agent loop calls them. Web exposes helpers for *initiating* tool-like actions outside the loop:

```
GET    /api/tools                    → ToolDef[] (name, description, inputSchema, permission)
POST   /api/tools/preview            { tool: 'Read', input: { path } } → preview (for FileTree click without agent turn)
GET    /api/files                    ?path&glob? → file listing (Glob-backed)
GET    /api/files/read               ?path&offset&limit → file content
```

Agent loop → WS events (see §10): `tool_start`, `tool_result`, `tool_denied`.

### Data Model
```ts
interface ToolDef {
  name: string;               // 'Read' | 'Bash' | 'mcp__notion__search' ...
  description: string;
  inputSchema: JSONSchema;    // Zod → JSONSchema for UI form
  permission: 'read'|'write'|'execute';
  source: 'builtin'|'mcp'|'plugin';
  mcpServerId?: string;
}

interface ToolCall { id: string; name: string; input: unknown; permissionDecision?: 'allow'|'deny'|'ask'; }
interface ToolResult { toolCallId: string; output: string; isError: boolean; durationMs: number; }

// Registry (shared)
//   packages/lokma-core/src/tools/registry.ts  — single source, imported by CLI and web server
//   registry.register(def) — builtin + MCP + plugin tools at startup
//   tool_search: if > N tools, MCP tools deferred; web calls GET /api/tools?search=...
```

- Parity guarantee: CI test `tool-parity.test.ts` asserts `registry.list().length === expected` and every tool has a `ToolRenderer` component mapping; fails on missing renderer.
- Execution context: `ctx: { cwd, sessionId, permissionMode, signal }` — web passes same as CLI; FS scope enforced server-side (never trust client `cwd`).

---

## 6) Permission System in Web UI

### Why
Same safety as Claude Code — deny > ask > allow, modes, sandbox — but surfaced as browser UX, not stdin prompts.

### UI
- **Mode switcher (header):** Segmented control `Auto | Manual | Accept Edits | Plan | Bypass` (bypass hidden unless `enableBypass=true` in settings). `Shift+Tab` equivalent: `Cmd+Shift+P` cycles. Tooltip explains each mode. Color: Plan = amber banner, Bypass = red banner "⚠ Bypass — no prompts".
- **Permission prompt modal / inline:**
  - Triggered by `permission_prompt` WS event.
  - Shows: tool name + input preview (e.g. `Bash: rm -rf /tmp/cache` with red warning), file diff if Edit, matched rule (if any).
  - Buttons: `Allow` (once), `Allow always (add rule)`, `Deny`, `Edit before allow` (for Bash — opens editable command input), `Ask` (defer).
  - `Allow always` dropdown: `For this session` vs `Write to .claude/settings.local.json` (persists) vs `Project settings` (commit).
  - Decision required before loop continues (generator backpressure).
- **Rules editor:** `/settings/permissions`
  - Three lists: `Allow`, `Ask`, `Deny` — each row is a pattern like `Bash(npm *)`, `Read(./.env)`, `mcp__notion__*`.
  - Add row: autocomplete for tool names + pattern help (`*` word-boundary, `:*`, `Bash(git *)`). Validate inline.
  - Scope tabs: `Project (.claude/settings.json)` | `Local (.claude/settings.local.json)` | `User (~/.lokma/settings.json)` — shows merged view with `deny wins` indicator.
  - "Don't ask again" shortcut: any `Allow always` from prompt writes to local scope and appears here instantly.
  - Import/Export JSON.
- **Sandbox panel (advanced):** Collapse under permissions — `Filesystem allowlist` (additionalDirectories), `Network allowlist` (allowedDomains), with `*` wildcard support. Warning if bypass enabled.

### API
```
GET    /api/permissions              ?scope=project|local|user → { allow, deny, ask, defaultMode, additionalDirectories, sandbox }
PUT    /api/permissions              { scope, allow?, deny?, ask?, defaultMode?, additionalDirectories?, sandbox? }
POST   /api/permissions/check        { tool, input } → { decision: 'allow'|'deny'|'ask', matchedRule? }
POST   /api/permissions/respond      { promptId, decision: 'allow'|'deny'|'always', scope?: 'session'|'local'|'project' }
GET    /api/permissions/modes        → PermissionMode[]
PUT    /api/sessions/:id/mode        { mode: PermissionMode }
GET    /api/permissions/classifier   → { enabled, rules }  (auto-mode classifier config)
```

WS events:
```
Server → Client: { type: 'permission_prompt', id, tool, input, matchedRule?, mode }
Client → Server: { type: 'permission_response', id, decision, scope? }
```

### Data Model
```ts
type PermissionMode = 'auto'|'default'|'acceptEdits'|'plan'|'bypassPermissions'|'dontAsk';
type Rule = string; // e.g. 'Bash(npm run *)', 'Read(./.env)', 'mcp__notion__*'

interface PermissionsConfig {
  allow: Rule[]; deny: Rule[]; ask: Rule[];
  defaultMode: PermissionMode;
  additionalDirectories?: string[]; // extra FS roots
  sandbox?: { filesystem?: string[]; allowedDomains?: string[]; deniedDomains?: string[]; disableBypass?: boolean };
  disableBypassPermissionsMode?: boolean;
}

// Storage
//   User:    ~/.lokma/settings.json           { permissions: {...} }
//   Project: .claude/settings.json            { permissions: {...} }  (committed)
//   Local:   .claude/settings.local.json      { permissions: {...} }  (gitignored, "don't ask again" writes here)
//   Managed: /etc/lokma/managed-settings.json (org policy, highest precedence)
// Precedence: managed > CLI flags > project > local > user. deny > ask > allow.
// Evaluation: `permissionManager.check(toolCall, mode)` — first match wins in order deny→ask→allow; specificity does NOT reorder.
// Persistence: "Allow always" writes Rule to local scope; file-watcher invalidates cache; UI polls GET /api/permissions.
```

- Auto mode: classifier (small model) scores tool call risk; config visible via `auto-mode defaults` equivalent in web.
- Critical path protection: `rm`/`rmdir` on `/`, `~`, `.git` never auto-approved even in bypass — UI shows hard block with explanation.

---

## 7) Hooks / Skills / Plugins in Web

### A. Hooks

#### UI
- **Route:** `/settings/hooks`
- **List:** Grouped by event (30+ events: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Notification`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`, …). Each row: `matcher (regex)` → `handler (command/http/mcp/prompt/agent)` → `timeout` → `enabled toggle` → `Edit/Delete`.
- **Add/Edit modal:**
  - Event picker (searchable, with description "Fires before tool executes — can block").
  - Matcher: regex input with test field (`Test against: Bash` → highlights match).
  - Handler type tabs: `Command` (shell cmd + `$FILE` var), `HTTP` (URL + headers), `MCP` (server + tool picker), `Prompt` (LLM prompt text), `Agent` (subagent picker).
  - Fields: `command` / `url` / `prompt`, `timeout ms`, `if` (permission-style pattern), `async` checkbox, `shell: bash|powershell`.
  - Save → validates (command not empty, matcher valid regex), writes to selected scope.
- **Scope tabs:** `Project` vs `User` (like permissions). Project hooks committed; user hooks personal.
- **Test / Dry-run:** `Run hook` button simulates event with sample payload, shows stdout/stderr/exit code/decision (`allow/deny`).
- **Logs:** `Hook runs` table: `Time | Event | Matcher | Handler | Duration | Exit | Decision` with expand → full I/O JSON.

#### API
```
GET    /api/hooks                    ?scope? → HookConfig[]
POST   /api/hooks                    { event, matcher, handlers: Handler[], scope }
PATCH  /api/hooks/:id                { matcher?, handlers?, enabled? }
DELETE /api/hooks/:id
POST   /api/hooks/test               { event, matcher, handler, samplePayload } → { exitCode, stdout, decision }
GET    /api/hooks/runs               ?sessionId?&limit → HookRun[]
```

#### Data Model
```ts
type HookEvent = 'PreToolUse'|'PostToolUse'|'PostToolUseFailure'|'PostToolBatch'|'UserPromptSubmit'|'UserPromptExpansion'|'Notification'|'MessageDisplay'|'Stop'|'StopFailure'|'SessionStart'|'SessionEnd'|'SubagentStart'|'SubagentStop'|'TaskCreated'|'TaskCompleted'|'PreCompact'|'PostCompact'|'PreModelSwitch'|'PostModelSwitch'|'PermissionRequest'|'PermissionDenied'|'TeammateIdle'|'ConfigChange'|'CwdChanged'|'DirectoryAdded'|'FileChanged'|'WorktreeCreate'|'WorktreeRemove'|'InstructionsLoaded'|'Setup'|'Elicitation'|'ElicitationResult';

interface HookDef {
  id: string; // hk_<nanoid>
  event: HookEvent;
  matcher: string; // regex, e.g. 'Edit|Write'
  handlers: Handler[];
  enabled: boolean;
  scope: 'project'|'user';
}

type Handler =
  | { type: 'command'; command: string; timeout?: number; if?: string; async?: boolean; shell?: string }
  | { type: 'http'; url: string; timeout?: number; if?: string; async?: boolean }
  | { type: 'mcp'; server: string; tool: string; timeout?: number }
  | { type: 'prompt'; prompt: string; timeout?: number }
  | { type: 'agent'; agent: string; prompt: string };

// Storage:  ~/.lokma/settings.json { hooks: { [event]: { matcher, hooks }[] } }
//          .claude/settings.json { hooks: ... }  (project)
// Execution: hookRunner.run(event, context) → spawns child_process/stdout JSON → decision; async handlers don't block loop.
```

### B. Skills

#### UI
- **Route:** `/skills` (and `/settings/skills` compact view)
- **Grid:** Cards per skill: `Name · Description · Source (builtin/plugin/user) · Slash command /skill-name · [Run] [Edit] [Disable]`.
- **Run:** Click `Run` → modal prompts for skill inputs (defined by skill markdown frontmatter `inputs:`), then enqueues `Skill` tool call in current session (or creates new session if none active). Shows output in chat.
- **Create/Edit:** Markdown editor with frontmatter: `name`, `description`, `inputs`, `tools`. Live preview of slash command. Save to `~/.lokma/skills/<name>.md` or `.claude/skills/<name>.md`.
- **Discovery:** `Marketplace` tab shows installable skills from enabled plugins; `Install` copies to project/user.

#### API
```
GET    /api/skills                   → Skill[]
POST   /api/skills                   { name, description, markdown, scope }
PATCH  /api/skills/:name             { enabled?, markdown? }
DELETE /api/skills/:name
POST   /api/skills/:name/run         { sessionId?, inputs } → { toolCallId }
```

#### Data Model
```ts
interface Skill {
  name: string;               // 'review-pr'
  description: string;
  markdown: string;           // full MD with frontmatter
  scope: 'user'|'project'|'plugin';
  pluginId?: string;
  slashCommand: string;       // '/review-pr'
  enabled: boolean;
  inputs?: { name: string; type: string; required: boolean }[];
}
// Storage:  ~/.lokma/skills/*.md  +  .claude/skills/*.md  +  ~/.lokma/plugins/<id>/skills/*.md
// Discovery budget: skillListingBudgetFraction / skillListingMaxDescChars honored in picker.
```

### C. Plugins

#### UI
- **Route:** `/plugins` + `/plugins/marketplace`
- **Installed tab:** Table `Plugin | Version | Source (marketplace/local) | Scope (user/project/local) | Status | [Enable/Disable] [Uninstall] [Update]`. Error tab shows load failures.
- **Marketplace tab:** Searchable catalog (official + community + custom). Card: `Name · Description · Author · Stars · [Install]`. Install modal: pick `Scope` (user/project/local).
- **Plugin detail drawer:** Shows bundled `skills`, `agents`, `hooks`, `mcpServers`, `themes` inside plugin + file list. `View manifest` (`.claude-plugin/plugin.json`).
- **Local dev:** `Add marketplace → Local path` + `Install from path` for plugin authors.

#### API
```
GET    /api/plugins                  → Plugin[]
GET    /api/plugins/marketplace      ?q&source → MarketplaceEntry[]
POST   /api/plugins/install          { name, marketplace, scope, version? }
POST   /api/plugins/uninstall        { name, scope }
POST   /api/plugins/enable           { name, enabled }
POST   /api/plugins/reload           → { reloaded: string[] }
GET    /api/plugins/marketplaces     → Marketplace[]
POST   /api/plugins/marketplaces/add { source, scope, sparse? }
```

#### Data Model
```ts
interface Plugin {
  id: string;                 // 'code-review@claude-plugins-official'
  name: string; version: string;
  marketplace: string;
  scope: 'user'|'project'|'local';
  enabled: boolean;
  installedAt: string;
  path: string;               // ~/.lokma/plugins/cache/<id>/<version>
  manifest: { skills: string[]; agents: string[]; hooks: string[]; mcpServers: string[]; themes?: string[] };
  error?: string;
}
// Storage:  ~/.lokma/plugins/cache/<id>/<version>/  +  settings.json { enabledPlugins: { [id]: boolean }, extraKnownMarketplaces: [...] }
// Install:  clones marketplace repo, copies plugin, installs npm deps, registers hooks/skills/mcp.
```

---

## 8) MCP in Web

### UI
- **Route:** `/settings/mcp` — primary MCP management page (mirrors `claude mcp` CLI + `/mcp` TUI).
- **Server list:** Table `Name | Transport (http/sse/stdio/ws) | URL/Command | Scope (user/project/local) | Status (connected/auth required/error) | Tools count | [Enable/Disable] [Edit] [Remove]`.
  - Status details drawer: `Last connected 2m ago · Tools: 12 · Warnings: 2` + per-tool list with `Search` (for tool deferral) + `alwaysLoad` toggle.
  - Auth badge: `OAuth required → [Login]` or `✓ Authenticated`.
- **Add/Edit modal:**
  - Transport tabs: `HTTP` (url + headers), `SSE` (url), `stdio` (command + args + env vars table), `WebSocket` (url).
  - Common: `Name` (slug, unique), `Scope` (user/project/local), `alwaysLoad` (exempt from tool_search deferral), `Env` (for stdio, supports `${VAR}` / `${VAR:-default}`).
  - Headers table for HTTP (e.g. `Authorization: Bearer ***`).
  - `Test connection` → live probe, shows discovered tools.
- **OAuth flow:** `Login` button → `POST /api/mcp/:name/login` → opens popup to provider OAuth → callback to `/api/mcp/callback` → stores credential, updates status. `Logout` clears credential.
- **Tool search (deferral):** When > N tools, banner "Many tools — some deferred. Search to load." Search input → `tool_search` in background.
- **Prompts as commands:** MCP prompts appear in `Skills` as `/server:prompt` chips.
- **Resources & elicitation:** `Resources` tab per server shows `ListMcpResources` result; `Elicitation` shows pending prompts requiring user input (modal).
- **Channels:** If server supports push channels, `Channels: Telegram → session` row with `Enable` toggle.

### API
```
GET    /api/mcp/servers              → McpServer[]
POST   /api/mcp/servers              { name, transport, url?, command?, args?, env?, headers?, scope, alwaysLoad? } → McpServer
PATCH  /api/mcp/servers/:name        { enabled?, headers?, env?, alwaysLoad? }
DELETE /api/mcp/servers/:name
POST   /api/mcp/servers/:name/test   → { ok, tools: string[], latencyMs, error? }
POST   /api/mcp/servers/:name/login  → { url }  (OAuth authorize URL)
POST   /api/mcp/servers/:name/logout → { ok }
GET    /api/mcp/callback             ?code&state → OAuth exchange
GET    /api/mcp/servers/:name/tools  → ToolDef[]  (discovered)
GET    /api/mcp/servers/:name/resources → McpResource[]
POST   /api/mcp/servers/:name/resources/read { uri } → content
GET    /api/mcp/elicitations         ?server? → Elicitation[]
POST   /api/mcp/elicitations/:id/respond { result }
```

Example `McpServer`:
```json
{
  "name": "notion",
  "transport": "http",
  "url": "https://mcp.notion.com/mcp",
  "scope": "user",
  "enabled": true,
  "status": "connected",
  "alwaysLoad": false,
  "toolsCount": 8,
  "headers": { "Authorization": "Bearer ***" },
  "lastConnectedAt": "2026-08-31T00:15:00Z"
}
```

### Data Model
```ts
type McpTransport = 'http'|'sse'|'stdio'|'ws';
type McpScope = 'user'|'project'|'local';
type McpStatus = 'connected'|'auth_required'|'error'|'disabled'|'connecting';

interface McpServer {
  name: string;               // slug, unique per scope
  transport: McpTransport;
  url?: string;               // http/sse/ws
  command?: string; args?: string[]; env?: Record<string,string>; // stdio
  headers?: Record<string,string>; // http
  scope: McpScope;
  enabled: boolean;
  alwaysLoad: boolean;
  status: McpStatus;
  toolsCount?: number;
  lastConnectedAt?: string;
  lastError?: string;
}

interface McpResource { uri: string; name: string; mimeType?: string; }

// Storage
//   Project: .mcp.json  { mcpServers: { [name]: { type, url, headers, env } } }  (committed, no secrets)
//   User:    ~/.lokma/mcp.json  or  ~/.claude.json { mcpServers: ... }  (global)
//   Secrets: vault (headers with tokens, OAuth tokens via oauth store)
//   Runtime: McpManager — background connect with 5s timeout, non-blocking (MCP_CONNECTION_NONBLOCKING=1), cache tools, notifications/tools/list_changed, roots/list_changed.
// Tool naming:  `mcp__<server>__<tool>` with double underscore; deferred via ENABLE_TOOL_SEARCH=auto:N.
```

- Security: `additionalDirectories` + `sandbox` apply to stdio servers; OAuth scoped per server; managed `allowedMcpServers/deniedMcpServers`.
- Long tool calls auto-backgrounded: WS emits `tool_start` then later `tool_result` when done.

---

## 9) Git Integration in Web

### UI
- **Bottom panel tabs:** `Terminal | Git | Preview (diff) | Logs` — persistent across sessions.
- **Git tab:**
  - **Status card:** `Branch: main · Ahead 2 · Behind 0 · [Pull] [Push]` + `Staged (3) | Unstaged (5) | Untracked (2)` collapsible lists. Each file: `M src/auth.ts [+12 -3]` with `Stage/Unstage` + `Diff` + `Open` actions. Checkboxes for multi-stage.
  - **Diff viewer:** Click file → `monaco-diff-editor` shows staged vs unstaged vs HEAD. Toggle `Staged / Unstaged / HEAD` tabs. `Stage hunk` buttons per hunk.
  - **Commit composer:** Textarea for message (with `Generate message` → calls agent to draft), `Stage all` checkbox, `Commit` button → `POST /api/git/commit`. Shows `Co-authored-by: Lokma` toggle (respects `includeCoAuthoredBy`).
  - **Branch manager:** Dropdown `Current: main` → list branches + `+ New branch` input + `Switch` + `Merge` (worktree aware). Shows `Worktree branches` section.
  - **History:** `Recent commits` list (10) with `hash · message · author · time` + `View` → diff. `Load more`.
  - **PR actions:** `Create PR` button → modal: `Base (main)` + `Title` (auto-generated) + `Body` (auto) + `Draft` toggle → `POST /api/git/pr` (wraps `gh pr create`). `View PR` link after creation. `From PR` — open session linked to PR number.
  - **GitHub Actions hint:** If `.github/workflows/lokma.yml` missing, banner "Enable @lokma mentions → [Install GitHub App]" → guides to `POST /api/git/github/install`.
- **Agent Git usage:** When agent runs `Bash(git status/commit/branch)`, Git tab auto-refreshes via WS `git:changed` event. No manual refresh needed.
- **Worktree visualization:** In worktree sessions, Git tab shows `Worktree: feature-auth (main → feature-auth) · [Merge to main] [Remove worktree]`.

### API
```
GET    /api/git/status               ?projectDir? → { branch, ahead, behind, staged: File[], unstaged: File[], untracked: File[] }
GET    /api/git/diff                 ?path&staged?&base? → { diff, hunks }
POST   /api/git/stage                { paths: string[], staged: boolean } → { ok }
POST   /api/git/commit               { message, paths?: string[], amend?: boolean, coAuthored?: boolean } → { hash }
POST   /api/git/branch               { name, switch?: boolean } → { branch }
POST   /api/git/checkout             { branch } → { ok }
GET    /api/git/log                  ?limit&offset → Commit[]
GET    /api/git/branches             → Branch[]
POST   /api/git/push                 { remote?, branch? } → { ok }
POST   /api/git/pull                 → { ok }
POST   /api/git/pr                   { title, body, base?, draft? } → { url, number }
GET    /api/git/pr/:number           → PR
POST   /api/git/worktree/add         { name, baseBranch? } → Worktree
DELETE /api/git/worktree/:name
GET    /api/git/github/status        → { installed, workflowExists }
POST   /api/git/github/install       → { url }  (GitHub App install URL)
```

### Data Model
```ts
interface GitStatus {
  branch: string;
  ahead: number; behind: number;
  staged: GitFile[]; unstaged: GitFile[]; untracked: GitFile[];
}
interface GitFile { path: string; status: 'M'|'A'|'D'|'R'|'?'|'U'; additions?: number; deletions?: number; }
interface Commit { hash: string; message: string; author: string; at: string; }
interface Branch { name: string; current: boolean; upstream?: string; }
interface Worktree { name: string; path: string; branch: string; baseBranch: string; }

// Storage: git is source of truth (filesystem). Web server shells out to `git` / `gh` CLI.
//   No DB for git state; caching: status cached 2s, invalidated on `git:changed` event from file watcher or agent Bash tool.
//   PRs via `gh` CLI; fallback to GitHub REST if gh missing.
```

- Security: Git commands scoped to `projectDir` + `additionalDirectories`; `Bash(rm -rf .git)` denied even in bypass via critical path protection.
- File watcher: `chokidar` watches `.git/index` + working tree; emits `git:changed` WS event → Git tab refreshes.

---

## 10) Real-time Streaming UX

### Why
Claude Code's TUI streams tokens via async generator with backpressure. Web must feel equally live — text deltas, tool blocks appearing, permission prompts, all over WebSocket/SSE with reconnect.

### Transport
- **Primary:** WebSocket `ws(s)://host/ws/:sessionId` (Fastify `@fastify/websocket`).
  - Auth: `Sec-WebSocket-Protocol: bearer.<jwt>` or query `?token=...` (fallback for Safari). JWT from `POST /api/auth/login` or `lokma web --token`.
  - Fallback: SSE `GET /api/sessions/:id/stream` (for proxies that block WS). Same event schema.
- **Binary framing:** JSON text frames; optional `permessage-deflate`.
- **Heartbeat:** Server pings every 20s; client pongs; disconnect after 60s silence.

### Event Protocol (shared with CLI `stream-json`)
```ts
// Server → Client
type AgentEvent =
  | { type: 'connected', sessionId: string, resumeFromTurn: number }
  | { type: 'text_delta', turn: number, text: string }           // token chunk
  | { type: 'text_done', turn: number, fullText: string }
  | { type: 'tool_start', turn: number, id: string, tool: string, input: unknown }
  | { type: 'tool_result', turn: number, id: string, tool: string, output: string, isError: boolean, durationMs: number }
  | { type: 'tool_denied', turn: number, id: string, tool: string, reason: string }
  | { type: 'permission_prompt', id: string, tool: string, input: unknown, matchedRule?: string } // blocks
  | { type: 'ask_question', id: string, questions: { question: string, options: string[] }[] }    // blocks
  | { type: 'checkpoint', checkpointId: string, label: string }
  | { type: 'git_changed' }                                        // triggers Git tab refresh
  | { type: 'hook_run', event: string, exitCode: number }
  | { type: 'usage_delta', input: number, output: number, cached: number, cost: number }
  | { type: 'model_switched', from: string, to: string, reason: 'fallback'|'user' }
  | { type: 'subagent_start', id: string, agent: string, model: string }
  | { type: 'subagent_delta', id: string, text: string }
  | { type: 'subagent_done', id: string }
  | { type: 'error', message: string, code?: string }
  | { type: 'done', turn: number, status: 'done'|'max_turns'|'aborted'|'error' }
  | { type: 'aborted' } // user pressed Esc / Stop

// Client → Server
type ClientEvent =
  | { type: 'prompt', text: string, modelId?: string, permissionMode?: string } // new user turn
  | { type: 'permission_response', id: string, decision: 'allow'|'deny'|'always', scope?: string }
  | { type: 'answer', id: string, answers: string[] }            // AskUserQuestion
  | { type: 'abort' }                                             // Esc
  | { type: 'ping' }
```

### UI — Streaming Behavior
- **Chat list:** Virtualized (`@tanstack/virtual`) for 1000+ messages. New `text_delta` appends to last assistant bubble with typewriter + caret `▌` (blinking). Markdown rendered incrementally (streaming MD parser — bold/code not flickering). Code blocks syntax-highlighted after `text_done` (shiki).
- **Tool blocks streaming:** `tool_start` immediately inserts skeleton block with spinner + input preview; `tool_result` fills it, spinner → ✓/✗, auto-collapses long output (>20 lines) with `Show more`. Parallel tools: staggered insertion, grid layout while pending.
- **Permission & question blocking:** When `permission_prompt` / `ask_question` arrives, loop pauses (generator `yield`). Chat input replaced by decision buttons; header shows "Waiting for your decision". No new prompts accepted until resolved. Timeout → `Deny` after 5 min (configurable).
- **Abort (Esc):** `Esc` or `Stop` button → sends `{type:'abort'}` → server aborts provider stream (AbortController), running tools `SIGTERM` after 5s `SIGKILL`. UI shows "Aborted" chip + `Resume` suggestion.
- **Reconnect & replay:**
  - On disconnect, banner "Reconnecting… (3/5)" with exponential backoff (1s,2s,4s,8s,16s). WS URL includes `?resumeFromTurn=N`; server replays missed `AgentEvent`s from JSONL (`transcriptOffset`).
  - If session still live server-side, client catches up and continues streaming mid-turn (typewriter resumes from correct offset).
  - If server restarted, client `GET /api/sessions/:id/transcript` then re-subscribes.
- **Optimistic UX:**
  - User prompt appears instantly (optimistic) before server ack; grey until `connected` ack.
  - `Bash` long-running: show live `xterm.js` tail via `tool_result` chunks (chunked output), not waiting for completion.
  - `WebSearch` limit counter decrements optimistically.
- **Performance:**
  - Backpressure: server `yield*` respects `ws.bufferedAmount` — if > 64KB, pauses generation 50ms. Client `requestAnimationFrame` batches `text_delta` (max 60fps) to avoid React thrash.
  - Text deltas coalesced: server buffers 20ms before flushing (reduces frames).
  - Tool output truncated server-side at 50KB (with "Output truncated — [View full in terminal]" link).
- **Accessibility & polish:**
  - Theme-aware: streaming caret + spinner use theme `accent` color.
  - Sound: optional `ding` on `done` / `permission_prompt` (toggle in settings, respects `prefers-reduced-motion`).
  - Browser Notifications: if tab backgrounded and `permission_prompt` / `done`, show `new Notification('Lokma needs attention')` (requires permission).
  - Copy: `Copy` button per message + `Copy all` per turn; `Regenerate` (re-run last prompt) in `⋯` menu.

### API (transport management)
```
GET    /api/sessions/:id/stream      (SSE fallback) → text/event-stream
WS     /ws/:sessionId                (WebSocket primary)
GET    /api/sessions/:id/events      ?fromTurn&limit → AgentEvent[]  (polling fallback for very restrictive proxies)
POST   /api/sessions/:id/prompt      { text, modelId? } → { accepted: true }  (REST alternative to WS prompt)
POST   /api/sessions/:id/abort       → { aborted: true }
```

### Data Model / Server Internals
```ts
// Server: packages/lokma-web/src/ws.ts
// - Map<sessionId, Set<WebSocket>>  — multiple tabs can subscribe to same session (broadcast).
// - Agent loop: async function* queryLoop(opts) — same as CLI (lokma-core), yields AgentEvent
// - For each yield: 1) append to JSONL, 2) emit to all WS clients, 3) if permission_prompt/ask_question → await client response (Promise with timeout), 4) continue.
// - AbortController per turn; on client abort, controller.abort() → provider stream cancelled.
// - Heartbeat interval, bufferedAmount backpressure, 20ms delta coalescing.
// - Reconnect: client sends resumeFromTurn; server reads JSONL offset → replays events.

// Client: packages/lokma-web/web/hooks/useSessionStream.ts
// - useWebSocket(url, { onEvent, onReconnect }) — handles auth, backoff, heartbeat, replay.
// - useChatState — reducer for messages, tool blocks, permission queue.
// - useVirtual — virtualized list, auto-scroll to bottom on new delta (unless user scrolled up → show "New messages ↓" pill).
```

- Security: WS auth via JWT (HttpOnly cookie + header); CSRF token for `prompt` POST; origin check; rate limit `prompt` 20/min per session.
- Observability: `ws:connections` gauge, `ws:events_sent` counter, `stream.latency` histogram (delta coalescing p50/p95).

---

## 11) Cross-cutting Concerns

### Auth & Tenancy
- **Local (Faz 1):** `lokma web --port 3456 --token $(lokma auth token)` — token in `~/.lokma/web-token` (HttpOnly cookie). No multi-user.
- **Cloud (Faz 2):** JWT via `POST /api/auth/login` (email/password or OAuth via `provider` table). Row-level security: `userId` on all tables (`sessions`, `providers`, `ledger`, `mcp`). Rate limit per user/IP.
- **Env:** `LOKMA_WEB_JWT_SECRET`, `LOKMA_VAULT_KEY`, `DATABASE_URL`.

### Themes
- **Tokens:** `themes/<name>.json` → CSS vars (`--bg`, `--fg`, `--accent`, `--border`, …) + CLI Chalk mapping. Web: `data-theme="omp"` → vars applied; CLI+Web share same token file. 4 built-ins: `claude` (cream/terracotta), `omp` (dark/amber), `midnight` (slate), `paper` (light). Custom themes via plugin.
- **Web UI:** All components use vars; streaming caret/spinner diff green/red respect theme. Recharts theme derived from vars.

### Security
- **Credential storage:** OS keychain (keytar) > AES-GCM; never log keys; masked in API responses (`••••abcd`).
- **Sandbox:** Applies to `Bash`/`PowerShell`/`stdio MCP` only; FS & network allowlists enforced server-side regardless of client `projectDir`.
- **Audit:** All provider/model/permission/mcp writes logged to `audit_log` with actor/ip.

### File Layout (Web + Shared)
```
~/.lokma/
├── settings.json            # user permissions, hooks, theme, model, routing
├── credentials.json         # providers + secrets (0600, keychain)
├── models.json              # catalog cache
├── routing.json             # fallback chain
├── history.jsonl            # cross-project history
├── web-token                # local WS auth
├── projects/<hash>/
│   ├── sessions/<id>.jsonl
│   ├── sessions/<id>.meta.json
│   ├── sessions/<id>.usage.jsonl
│   ├── checkpoints/<chk>/
│   └── memory.md            # auto memory
├── plugins/cache/<id>/<ver>/
├── worktrees/<name>/        # git worktrees
└── mcp.json                 # user MCP servers
.claude/
├── settings.json            # project permissions/hooks (committed)
├── settings.local.json      # local overrides (gitignored)
├── skills/*.md
├── agents/*.md
├── rules/*.md
└── worktrees/
.mcp.json                    # project MCP servers
LOKMA.md                     # project memory (like CLAUDE.md)
themes/*.json
```

### Deployment (Web)
- **Local:** `lokma web` spawns Fastify `:3456` (WS + REST) + Next.js `:3000` (or single port with Next standalone). `pm2` optional. `nginx` reverse proxy `lokma.fermag.com.tr → :3456`.
- **Cloud:** Docker per-session sandbox (Firecracker/gVisor optional), `lokma-cloud-api :4401` orchestrates.
- **Build:** `bun run build` → `dist/lokma` (CLI) + `packages/lokma-web/.next/standalone` (web).

### Open Questions (for Furkan)
- [ ] Domain: `lokma.fermag.com.tr` vs `lokma.sh` vs `lokma.run`?
- [ ] First providers: Anthropic-only MVP or 6 providers from day one?
- [ ] Local-first vs cloud-first for Faz 1 web? (Spec assumes local Remote-Control-like.)
- [ ] Theme fidelity: exact OMP token parity or Lokma-original tokens?
- [ ] Data retention: ledger forever vs 90-day prune for local?
- [ ] Multi-user cloud auth: password vs magic link vs OAuth only?

---

## Appendix: API Route Summary (Web Server)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/providers | jwt | List providers |
| POST | /api/providers | jwt | Add provider |
| PATCH | /api/providers/:id | jwt | Update provider |
| DELETE | /api/providers/:id | jwt | Delete |
| POST | /api/providers/:id/test | jwt | Health check |
| POST | /api/providers/:id/oauth/start | jwt | OAuth URL |
| GET | /api/auth/callback | — | OAuth callback |
| GET | /api/models | jwt | List models |
| POST | /api/models/refresh | jwt | Refresh catalog |
| PATCH | /api/models/:id | jwt | Enable/pin |
| GET/PUT | /api/models/routing | jwt | Fallback chain |
| GET | /api/usage/summary | jwt | Usage summary |
| GET | /api/usage/sessions | jwt | Per-session usage |
| GET | /api/usage/daily | jwt | Daily rollup |
| GET | /api/sessions | jwt | List sessions |
| POST | /api/sessions | jwt | Create |
| PATCH | /api/sessions/:id | jwt | Update |
| DELETE | /api/sessions/:id | jwt | Delete |
| POST | /api/sessions/:id/fork | jwt | Fork |
| POST | /api/sessions/:id/resume | jwt | Resume/wsUrl |
| GET | /api/sessions/:id/transcript | jwt | JSONL |
| POST | /api/sessions/:id/rewind | jwt | Rewind |
| GET | /api/tools | jwt | Tool catalog |
| GET | /api/permissions | jwt | Get rules |
| PUT | /api/permissions | jwt | Set rules |
| POST | /api/permissions/respond | jwt | Prompt response |
| GET/POST/PATCH/DELETE | /api/hooks/* | jwt | Hooks CRUD |
| GET/POST/PATCH/DELETE | /api/skills/* | jwt | Skills CRUD |
| GET/POST/DELETE | /api/plugins/* | jwt | Plugins |
| GET/POST/PATCH/DELETE | /api/mcp/servers/* | jwt | MCP |
| GET | /api/git/status | jwt | Git status |
| POST | /api/git/commit | jwt | Commit |
| POST | /api/git/pr | jwt | Create PR |
| WS | /ws/:sessionId | jwt | Live stream |
| GET | /api/sessions/:id/stream | jwt | SSE fallback |

---

## References
- `Docs/10-ARASTIRMA-claude-code-birebir-analiz.md` (18KB, Claude Code feature inventory)
- `Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` (17KB, Lokma harness architecture)
- `Docs/raw/10-claude-code-ham-arastirma.md` (957 lines, raw Claude Code dump: CLI, tools, permissions, hooks, MCP, plugins, etc.)
- `Docs/01-PROJE-TANIMI.md` & `Docs/00-LOKMA-KONTEKST.md`
- Claude Code docs: `code.claude.com/docs` (tools, permissions, hooks, mcp, settings, model-config, github-actions)
- OMP (oh-my-pi) harness: `github.com/can1357/oh-my-pi` (benchmaxxed tooling, hashline, themes)

*Next: Normalize this raw spec into `Docs/20-WEB-HARNESS-SPEC.md` (or split into `20A..20J` per feature), then Faz 0 scaffold.*
