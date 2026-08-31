import { z } from 'zod';

/**
 * Layered config — global + project + env + CLI flags.
 * See Docs/26-CONFIG-and-CREDENTIALS.md §3.
 */
export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  priority: z.number().int().default(0),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const PermissionsSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  defaultMode: z.enum(['auto', 'manual', 'acceptEdits', 'plan', 'bypass']).default('auto'),
});

export type Permissions = z.infer<typeof PermissionsSchema>;

export const AgentsConfigSchema = z.object({
  maxAgents: z.number().int().min(1).max(100).default(20),
  maxConcurrent: z.number().int().min(1).max(20).default(5),
  maxQueue: z.number().int().min(1).default(20),
  maxSpawnDepth: z.number().int().min(1).max(5).default(3),
  defaultModel: z.string().default('anthropic/claude-4-sonnet'),
  memory: z.object({ agent_char_limit: z.number().int().default(8000) }).default({ agent_char_limit: 8000 }),
  budgets: z.object({ tokens: z.number().default(500_000), usd: z.number().default(10) }).default({ tokens: 500_000, usd: 10 }),
});

export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

export const GlobalConfigSchema = z.object({
  version: z.number().int().default(1),
  defaultModel: z.string().default('anthropic::claude-sonnet-4-5'),
  defaultProvider: z.string().default('anthropic'),
  theme: z.enum(['claude', 'omp', 'midnight', 'paper']).default('omp'),
  providers: z.array(ProviderConfigSchema).default([]),
  models: z.record(z.object({ enabled: z.boolean() })).default({}),
  permissions: PermissionsSchema.default({ allow: [], deny: [], defaultMode: 'auto' }),
  mcp: z.object({ servers: z.record(z.unknown()).default({}) }).default({ servers: {} }),
  hooks: z.record(z.array(z.unknown())).default({}),
  agents: AgentsConfigSchema.default({
    maxAgents: 20,
    maxConcurrent: 5,
    maxQueue: 20,
    maxSpawnDepth: 3,
    defaultModel: 'anthropic/claude-4-sonnet',
    memory: { agent_char_limit: 8000 },
    budgets: { tokens: 500_000, usd: 10 },
  }),
  locks: z
    .object({ heartbeatMs: z.number().default(30_000), leaseMs: z.number().default(60_000), dir: z.string().default('.agentlocks/locks') })
    .default({ heartbeatMs: 30_000, leaseMs: 60_000, dir: '.agentlocks/locks' }),
  coordinator: z.object({ mode: z.enum(['auto', 'pinned', 'off']).default('auto') }).default({ mode: 'auto' }),
  vault: z
    .object({ host: z.string().optional(), apiKeyEnv: z.string().default('VAULT_API_KEY'), routes: z.string().optional() })
    .optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const ProjectSettingsSchema = z.object({
  defaultModel: z.string().optional(),
  permissions: PermissionsSchema.partial().optional(),
  hooks: z.record(z.array(z.unknown())).optional(),
  mcp: z.object({ servers: z.record(z.unknown()) }).optional(),
  plugins: z.array(z.string()).optional(),
  agents: AgentsConfigSchema.partial().optional(),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const CredentialsSchema = z.object({
  version: z.number().int().default(1),
  providers: z.record(z.object({ apiKey: z.string().optional(), oauth: z.unknown().nullable().optional() })).default({}),
  oauth: z.record(z.unknown()).default({}),
});

export type Credentials = z.infer<typeof CredentialsSchema>;
