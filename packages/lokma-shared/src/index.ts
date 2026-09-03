/**
 * @lokma/shared — single source of truth.
 * Both CLI (Ink) and Web (Fastify + Next.js) import from here.
 * No runtime side effects — pure schemas + protocol + utils.
 */

// Schemas
export * from './schemas/agent.js';
export * from './schemas/auth.js';
export * from './schemas/bot.js';
export * from './schemas/lock.js';
export * from './schemas/memory.js';
export * from './schemas/skill.js';
export * from './schemas/plugin.js';
export * from './schemas/cron.js';
export * from './schemas/config.js';
export * from './schemas/vault.js';

// Protocol
export * from './protocol/ws.js';
export * from './protocol/types.js';

// Utils
export * from './utils/index.js';
