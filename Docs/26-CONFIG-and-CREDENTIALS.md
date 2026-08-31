# Config & Credentials System — Lokma's `~/.lokma/` Hierarchy

> **Purpose:** Define how Lokma stores config and secrets — mirroring Claude Code's `~/.claude.json` / `.claude/settings.json` pattern, adapted for a multi-provider harness with CLI + Web.
> **Principle:** Keys live in one encrypted file, config is layered (global → project → env), web and CLI read the same files.

## 1. Why a Layered Config (Claude Code Reference)

Claude Code uses:

- `~/.claude.json` (global, managed — don't edit)
- `.claude/settings.json` (project, committed or gitignored — team can share)
- `~/.claude/.credentials.json` (OAuth/API keys, never committed)
- Env vars override all (`ANTHROPIC_API_KEY`)

Lokma copies the shape, clarifies it:

| Layer | File | Committed | Who reads |
|-------|------|-----------|-----------|
| **Global config** | `~/.lokma/config.json` | No | CLI + Web server |
| **Project settings** | `.lokma/settings.json` or `lokma.json` (project root) | Optional (team can commit) | CLI + Web (per `cwd`) |
| **Credentials** | `~/.lokma/credentials.json` (encrypted) | **Never** | CLI + Web server only |
| **Env** | `.env` / `LOKMA_*` env vars | No | Highest priority, overrides files |

Merge order (low → high): `global config` < `project settings` < `env`. Web UI writes to the same files via `PATCH /api/config` — no separate DB.

## 2. File Layout

```
~/.lokma/
├── config.json              # global config (model, theme, provider order, permissions)
├── credentials.json         # encrypted provider keys + OAuth tokens (0600)
├── settings.json            # (alt global override, optional)
├── projects/
│   └── <hash>/              # per-project JSONL sessions (same as Claude Code ~/.claude/projects/)
│       ├── sessions/
│       │   └── <sessionId>.jsonl
│       └── checkpoints/
├── plugins/                 # installed plugins (if file-based)
├── themes/                  # user themes (optional override)
└── cache/
    └── models.json          # cached merged model catalog (5m TTL)

./ (project root)
├── .lokma/
│   └── settings.json        # project-local overrides (permissions, default model, hooks)
└── lokma.json               # alt name — if present, .lokma/settings.json is ignored
```

`credentials.json` is `0600` and encrypted at rest (see §4). It is the **only** place secrets live on disk.

## 3. Schema

### 3.1 `config.json` (global)

```json
{
  "version": 1,
  "defaultModel": "anthropic::claude-sonnet-4-5",
  "defaultProvider": "anthropic",
  "theme": "omp",
  "providers": [
    { "id": "anthropic", "enabled": true, "priority": 0 },
    { "id": "openai",    "enabled": true, "priority": 1 }
  ],
  "models": {
    "anthropic::claude-opus-4-5": { "enabled": false }
  },
  "permissions": {
    "allow": ["Read(**)", "Glob(**)"],
    "deny":  ["Bash(rm -rf /*)"],
    "defaultMode": "auto"
  },
  "mcp": {
    "servers": {
      "notion": { "transport": "http", "url": "https://mcp.notion.com/mcp", "enabled": true }
    }
  },
  "hooks": {
    "PostToolUse": [{ "matcher": "Write|Edit", "command": "prettier --write $FILE" }]
  }
}
```

Zod schema: `packages/lokma-shared/src/schemas/config.ts` — `ConfigSchema`, `ProjectSettingsSchema`.

### 3.2 `credentials.json` (encrypted)

```json
{
  "version": 1,
  "providers": {
    "anthropic": { "apiKey": "sk-ant-...", "oauth": null },
    "openai":    { "apiKey": "sk-...",    "oauth": null }
  },
  "oauth": {
    "anthropic": { "accessToken": "...", "refreshToken": "...", "expiresAt": "..." }
  }
}
```

On disk, the entire file is AES-256-GCM encrypted with a key derived from `LOKMA_ENCRYPTION_KEY` env or OS keychain (macOS Keychain / Linux Secret Service / Windows DPAPI). If no key, fallback to `0600` + `JSON.stringify` with a warning on `lokma doctor`.

### 3.3 Project `settings.json`

```json
{
  "defaultModel": "openai::gpt-4o",
  "permissions": { "allow": ["Bash(npm test)"] },
  "hooks": { "PostToolUse": [{ "matcher": "Edit", "command": "eslint --fix $FILE" }] }
}
```

Only `defaultModel`, `permissions`, `hooks`, `mcp`, `plugins` are allowed here — not provider keys.

## 4. Credentials Security

| Concern | How Lokma handles it |
|---------|----------------------|
| File permissions | `credentials.json` is `0600`, created with `0o600`, `config.json` `0644` |
| Encryption at rest | `AES-256-GCM`, key = `LOKMA_ENCRYPTION_KEY` (32 bytes hex) or OS keychain. `lokma config set-encryption-key` generates it. Web never echoes the key. |
| Web exposure | `GET /api/config` returns `keySet: boolean` per provider, never the raw key. `PATCH /api/providers/:id` accepts `apiKey` write-only. |
| Env override | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `LOKMA_ENCRYPTION_KEY` override file creds — useful for CI/Docker. |
| Rotation | `lokma auth rotate anthropic` — new key, grace window (old key valid 5m), then `credentials.json` overwritten. |
| `doctor` check | `lokma doctor` warns if `credentials.json` is `0644`, unencrypted, or has duplicate keys in env vs file. |

## 5. Config Loading (Code Sketch)

```ts
// packages/lokma-core/src/config/loader.ts
export function loadConfig(cwd: string): ResolvedConfig {
  const global  = readJson("~/.lokma/config.json", GlobalConfigSchema, {})
  const project = readJson(findUp(cwd, [".lokma/settings.json","lokma.json"]), ProjectSettingsSchema, null)
  const creds   = decrypt(readFile("~/.lokma/credentials.json")) // or {}
  const env     = readEnv() // ANTHROPIC_API_KEY etc → mapped to creds override
  return merge(global, project, { credentials: { ...creds, ...env } })
}

export function saveGlobal(patch: Partial<GlobalConfig>) {
  const cur = readJson("~/.lokma/config.json", GlobalConfigSchema, {})
  writeAtomic("~/.lokma/config.json", { ...cur, ...patch })
}
export function saveCredentials(provider: string, apiKey: string) {
  const cur = decrypt(readFile("~/.lokma/credentials.json"))
  cur.providers[provider] = { apiKey, updatedAt: new Date().toISOString() }
  writeAtomic("~/.lokma/credentials.json", encrypt(cur), 0o600)
}
```

- `readJson` = Zod parse, on error log + return default (never crash).
- `writeAtomic` = write to `.tmp` + `fsync` + `rename` (crash-safe).
- File watcher (`chokidar`) on `~/.lokma/config.json` + `.lokma/settings.json` → `ctx.emit("config/changed")` → plugin kernel hot-reloads.

## 6. CLI & Web Parity

| Action | CLI | Web |
|--------|-----|-----|
| Set default model | `lokma config set defaultModel anthropic::claude-sonnet-4-5` | Settings → Models → Default (writes `config.json`) |
| Add provider key | `lokma auth add anthropic` (prompts, writes `credentials.json`) | Settings → Providers → Add (writes same file via `POST /api/providers`) |
| Per-project allow | `.lokma/settings.json` `permissions.allow` | Project Settings → Permissions (writes same file) |
| View effective | `lokma config --dump` (merged, keys masked) | `GET /api/config/effective` (masked) |
| Doctor | `lokma doctor` (perms, encryption, dupes) | `GET /api/doctor` + UI banner |

## 7. Refactor Tasks (for Roadmap)

Moved to `03-YOL-HARITASI.md` Phase 0 + 1:

- [ ] `loader.ts` — layered read + Zod + env override + watcher
- [ ] `credentials.ts` — AES-GCM encrypt/decrypt + keychain fallback + `0600` + atomic write
- [ ] `GET /api/config` / `PATCH /api/config` / `GET /api/config/effective` — masked, same files
- [ ] `lokma config` CLI (get/set/dump) + `lokma auth` (add/rotate/test) + `lokma doctor` check
- [ ] Migration: if `providers` table exists from Phase 0 prototype, `lokma config migrate --from db`

## 8. Relation to Existing Docs

- `22-*` §1–2 (provider/model) now states: "storage is `~/.lokma/config.json` + `credentials.json`, not a DB table in MVP"
- `20-*` arch diagram: `config` is a `ctx.config` service, plugins `inject: ["config"]`, `config/changed` event triggers re-registration.

---

*Status: spec — refactor lands in Phase 0 scaffold.*
