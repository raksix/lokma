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

// Utils (DRY — reuse from here, don't duplicate)
export * from './utils/index.js';
