import type { AgentInfo } from '@/lib/api';

/**
 * Pure AgentHub helpers — no DOM, no fetch (probe: `bun src/components/agents/agents.test.ts`).
 * Normalization mirrors the server `AgentSchema` (Docs/30 §2): the pane never
 * trusts the wire shape, every row goes through `normalizeAgent` first.
 * Concept parity note: the hardcoded `AGENTS` array, the mock token/cost
 * figures (`8.2k · $0.03`) and the toast-only Run/Pause/Kill/Fork/Clone/Import
 * buttons are NOT ported — every control talks to a live `/api/agents/*`
 * endpoint, and live-run stats stay hidden until the orchestration wave owns
 * real numbers (no invented usage figures, ever).
 */

/** Persona options accepted by `POST /api/agents` (server PersonaSchema). */
export const PERSONA_OPTIONS = [
  'builder',
  'reviewer',
  'planner',
  'tester',
  'researcher',
  'custodian',
  'custom',
] as const;

export type PersonaOption = (typeof PERSONA_OPTIONS)[number];

/** Lifecycle states (server AgentStateSchema, Docs/30 §5). */
export const AGENT_STATES = [
  'idle',
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'killed',
] as const;

/** Terminal states reject pause/kill (server 409 `terminal_state`). */
export const TERMINAL_STATES: readonly string[] = ['completed', 'failed', 'killed'];

/** Normalized agent row — safe defaults for anything the server omits. */
export type HubAgent = {
  id: string;
  name: string;
  persona: string;
  model: string;
  state: string;
  cwd: string | null;
  budgetTokens: number;
  budgetUsd: number;
  createdBy: string;
  createdAt: string | null;
};

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Normalize one wire record into a HubAgent (never throws on odd shapes). */
export function normalizeAgent(info: AgentInfo): HubAgent {
  const budgets =
    typeof info.budgets === 'object' && info.budgets !== null
      ? (info.budgets as Record<string, unknown>)
      : {};
  return {
    id: info.id,
    name: asString(info.name, info.id),
    persona: asString(info.persona, 'builder'),
    model: asString(info.model, 'unknown model'),
    state: asString(info.state, 'idle'),
    cwd: typeof info.cwd === 'string' && info.cwd ? info.cwd : null,
    budgetTokens: asPositiveNumber(budgets.tokens, 500_000),
    budgetUsd: asPositiveNumber(budgets.usd, 10),
    createdBy: asString(info.createdBy, 'human'),
    createdAt: typeof info.createdAt === 'string' ? info.createdAt : null,
  };
}

/** Status-dot classes for the lifecycle state (concept colors, lucide only). */
export function stateTone(state: string): string {
  switch (state) {
    case 'running':
      return 'bg-emerald-500 animate-pulse';
    case 'queued':
      return 'bg-blue-500';
    case 'paused':
      return 'bg-amber-500';
    case 'failed':
      return 'bg-red-500';
    case 'completed':
      return 'bg-teal-500';
    case 'killed':
      return 'bg-zinc-500';
    default:
      return 'bg-zinc-300';
  }
}

/** True when the agent was spawned by another agent (`ai:<parentId>`). */
export function isAiCreated(createdBy: string): boolean {
  return createdBy.startsWith('ai:');
}

/** Two-letter avatar initials from the display name. */
export function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed.slice(0, 2).toUpperCase() || 'AG';
}

/**
 * 1-based queue position among `queued` agents (oldest first by createdAt),
 * null when the agent is not queued. Mirrors the server caps banner
 * (`maxQueue`) — the Hub shows the position, the server owns the queue.
 */
export function queuePosition(agents: HubAgent[], id: string): number | null {
  const queued = agents
    .filter((a) => a.state === 'queued')
    .sort((a, b) => (a.createdAt ?? a.id).localeCompare(b.createdAt ?? b.id));
  const index = queued.findIndex((a) => a.id === id);
  return index === -1 ? null : index + 1;
}

export type AgentForm = {
  name: string;
  persona: string;
  model: string;
  cwd: string;
  tokens: string;
  usd: string;
};

/**
 * Client-side create-form check mirroring the server rules (same limits, both
 * sides). Null = valid. The server stays the source of truth — this only
 * gives instant feedback before the POST.
 */
export function validateAgentForm(form: AgentForm): string | null {
  const name = form.name.trim();
  if (!name || name.length > 40) return 'Give the agent a name (1-40 chars).';
  if (!(PERSONA_OPTIONS as readonly string[]).includes(form.persona)) {
    return 'Pick a persona from the list.';
  }
  const model = form.model.trim();
  if (!model || model.length > 200) return 'Set a model (e.g. anthropic/claude-4-sonnet).';
  if (form.cwd.trim().length > 500) return 'That working directory looks too long.';
  if (form.tokens.trim()) {
    const tokens = Number(form.tokens);
    if (!Number.isInteger(tokens) || tokens <= 0 || tokens > 100_000_000) {
      return 'Token budget must be a positive whole number (max 100M).';
    }
  }
  if (form.usd.trim()) {
    const usd = Number(form.usd);
    if (!Number.isFinite(usd) || usd <= 0 || usd > 100_000) {
      return 'USD budget must be a positive number (max 100000).';
    }
  }
  return null;
}

/** Compact budget line, e.g. `500k tokens · $10`. */
export function formatBudget(tokens: number, usd: number): string {
  const short = tokens >= 1_000_000 ? `${tokens / 1_000_000}M` : `${Math.round(tokens / 1000)}k`;
  return `${short} tokens · $${usd}`;
}

/** Empty create-form defaults (model matches the server default). */
export function emptyAgentForm(): AgentForm {
  return { name: '', persona: 'builder', model: 'anthropic/claude-4-sonnet', cwd: '', tokens: '', usd: '' };
}
