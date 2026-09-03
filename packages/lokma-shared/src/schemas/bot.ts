import { z } from 'zod';

/**
 * Bot descriptor — one `bot.json` per bot (Docs/35-BOTS §3).
 * Persona = SOUL template, bot = packaged product (persona + model +
 * tools + skills + knowledge, versioned + forkable), agent = running
 * instance of a bot. Stored at `~/.lokma/bots/<id>/bot.json` (global)
 * or `<project>/.lokma/bots/<id>/bot.json` (project-local), plus one
 * bundled template (`lokma-ceo`) shipped in lokma-core.
 * No secrets ever live here — only `credentialRef`-style names, and the
 * server never echoes keys (same rule as providers `keySet`).
 */

/** Gallery visibility — Featured/Mine/Shared tabs derive from this. */
export const BotVisibilitySchema = z.enum(['private', 'shared', 'public']);

export type BotVisibility = z.infer<typeof BotVisibilitySchema>;

/** Which MEMORY.md the spawned agent reads/writes (Docs/28 + 35 §8). */
export const BotMemoryScopeSchema = z.enum(['bot', 'project', 'user', 'isolated']);

export type BotMemoryScope = z.infer<typeof BotMemoryScopeSchema>;

/** Where a bot record came from — bundled templates are read-only. */
export const BotSourceSchema = z.enum(['bundled', 'global', 'project']);

export type BotSource = z.infer<typeof BotSourceSchema>;

/** Bounded string list (tools/skills/tags/…) — caps abuse, mirrors file caps. */
function stringList(maxItems: number, maxLen: number): z.ZodDefault<z.ZodArray<z.ZodString>> {
  return z.array(z.string().min(1).max(maxLen)).max(maxItems).default([]);
}

/** Per-run caps the spawned agent inherits (Docs/30 budgets). */
export const BotBudgetsSchema = z.object({
  maxTokens: z.number().int().positive().max(100_000_000).default(80_000),
  maxUsd: z.number().positive().max(100_000).default(2),
  maxTurns: z.number().int().positive().max(1000).default(40),
});

export type BotBudgets = z.infer<typeof BotBudgetsSchema>;

export const BotSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  /** Display hint only — the pane renders initial squares, never this glyph. */
  avatar: z.string().min(1).max(64).optional(),
  description: z.string().min(1).max(500),
  /** Injected as SOUL.md when the bot runs as an agent. */
  systemPrompt: z.string().min(1).max(20_000),
  /** e.g. anthropic/claude-opus-4 — same `provider/model` shape as agents. */
  model: z.string().min(1).max(200),
  fallback: stringList(10, 200),
  /** Tool allowlist — the spawned agent only gets these tools. */
  tools: stringList(50, 100),
  /** Auto-loaded on spawn (Docs/27 skill injection). */
  skills: stringList(50, 100),
  /** Bot only gets its allowlisted MCPs. */
  mcpServers: stringList(20, 100),
  /** RAG paths relative to the bot dir (read into context on spawn). */
  knowledgeFiles: stringList(50, 300),
  memoryScope: BotMemoryScopeSchema.default('bot'),
  budgets: BotBudgetsSchema.default({ maxTokens: 80_000, maxUsd: 2, maxTurns: 40 }),
  visibility: BotVisibilitySchema.default('private'),
  version: z
    .string()
    .min(1)
    .max(32)
    .default('1.0.0'),
  /** Fork provenance (`bot:<id>`) or SOUL origin (`soul:<persona>`). */
  createdFrom: z.string().min(1).max(200).optional(),
  tags: stringList(20, 60),
  author: z.string().min(1).max(60).optional(),
  createdAt: z.string().datetime().optional(),
  /** Curated Gallery flag — only bundled templates ship it today. */
  featured: z.boolean().default(false),
  source: BotSourceSchema.default('global'),
});

export type Bot = z.infer<typeof BotSchema>;
