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

// Utils (DRY — reuse from here, don't duplicate)
export * from './utils/index.js';
