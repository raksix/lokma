import { z } from 'zod';

/**
 * Persona templates shipped with Lokma.
 * Each maps to a SOUL.md starter under skills/lokma-personas/.
 */
export const PersonaSchema = z.enum([
  'reviewer',
  'planner',
  'tester',
  'researcher',
  'builder',
  'custodian',
  'custom',
]);

export type Persona = z.infer<typeof PersonaSchema>;

/** Lifecycle state — mirrors 30-AGENT-SYSTEM §5 state machine. */
export const AgentStateSchema = z.enum([
  'idle',
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'killed',
]);

export type AgentState = z.infer<typeof AgentStateSchema>;

/** Per-agent token / USD budgets — hard stops (error_max_budget). */
export const AgentBudgetsSchema = z.object({
  tokens: z.number().int().positive().default(500_000),
  usd: z.number().positive().default(10),
  perTurn: z.number().int().positive().optional(),
});

export type AgentBudgets = z.infer<typeof AgentBudgetsSchema>;

/**
 * Agent identity — durable entity under ~/.lokma/agents/<id>/.
 * See Docs/30-AGENT-SYSTEM §2, §4, §12.
 */
export const AgentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(40),
  persona: PersonaSchema,
  model: z.string().min(1), // e.g. anthropic/claude-4-sonnet
  provider: z.string().min(1),
  fallback: z.array(z.string()).default([]),
  state: AgentStateSchema.default('idle'),
  cwd: z.string().optional(),
  worktree: z.string().optional(),
  // Budgets pinned per agent
  budgets: AgentBudgetsSchema.default({ tokens: 500_000, usd: 10 }),
  // Memory usage tracking
  memory: z
    .object({
      char_limit: z.number().int().positive().default(8000),
      used: z.number().int().nonnegative().default(0),
    })
    .default({ char_limit: 8000, used: 0 }),
  // Audit — who created this agent
  createdBy: z.string().default('human'), // human | ai:<parentId>
  createdAt: z.string().datetime().optional(),
});

export type Agent = z.infer<typeof AgentSchema>;

/** Input for create_agent tool — capability-gated by agent-spawner skill. */
export const CreateAgentInputSchema = z.object({
  name: z.string().min(1).max(40),
  persona: PersonaSchema.default('builder'),
  model: z.string().optional(),
  soul: z.string().optional(),
  cwd: z.string().optional(),
  budgets: z.object({ tokens: z.number().optional(), usd: z.number().optional() }).optional(),
  reason: z.string().min(10),
});

export type CreateAgentInput = z.infer<typeof CreateAgentInputSchema>;
