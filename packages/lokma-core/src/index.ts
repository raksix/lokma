/**
 * @lokma/core — kernel barrel.
 * Import from here in both CLI and Web server — ensures one loop, one SessionStore.
 */

// Context
export * from './context/context.js';

// Tools
export * from './tools/index.js';

// Session (JSONL — same files for CLI + Web)
export * from './session/index.js';

// Config & credentials (layered, AES-GCM 0600)
export * from './config/index.js';

// Skills (Hermes-inspired auto-discovery)
export * from './skills/index.js';

// Memory (infinite + vault)
export * from './memory/index.js';

// Vault (file-backed markdown graph + search + ingest for the VaultPane)
export * from './vault/index.js';

// Agents (per-agent SOUL/MEMORY/model + caps + locks + worktree)
export * from './agents/index.js';

// Usage (per-run token/cost ledger + model pricing)
export * from './usage/index.js';

// Workspace files (jailed tree/read/write/search + git overlay)
export * from './files/index.js';

// Repo git (branch/status/log/commit/push/worktree-prune for the GitPane)
export * from './git/index.js';

// Terminals (live shell processes + scrollback, piped stdio over WS)
export * from './terminal/index.js';

// Browser tabs (per-agent tab registry + real history for the BrowserPane)
export * from './browser/index.js';

// Archify (typed IR → validated deterministic HTML/SVG + share cards)
export * from './archify/index.js';

// Design Studio (6 artifact types over bundled systems + DESIGN.md guard)
export * from './design/index.js';

// Testing Lab (plan → run → classify → junit over live handlers)
export * from './testing/index.js';

// Bots (shareable bot.json packages + run-as-agent for the BotsPane)
export * from './bots/index.js';

// Auth (users + projects + invites + RBAC can() for the AuthPane)
export * from './auth/index.js';

// Setup (optional-stack features + init for the SetupPane, Docs/32)
export * from './setup/index.js';

// Plugins (kernel registry + hot toggle + add-from-URL for the Plugins pane)
export * from './plugins/index.js';

// Observability (agent trace timeline + frozen share snapshots for the
// Observability pane)
export * from './observability/index.js';

// Cron + approvals (per-agent cron jobs + WS decision log for the
// CronApprovals pane, Docs/30 §5 + §6)
export * from './cron/index.js';

// Themes (canonical named-theme registry for CLI + server + web,
// Phase 3 themes polish)
export * from './themes/index.js';

// Cloud transfer (portable ~/.lokma export/import for the move to a cloud
// box, Phase 3 cloud prep wave 1)
export * from './cloud/index.js';

// Utils (DRY — reuse from here, don't duplicate)
export * from './utils/index.js';
