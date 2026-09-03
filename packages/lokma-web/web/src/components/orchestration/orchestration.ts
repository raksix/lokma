import { PERSONA_OPTIONS } from '@/components/agents';
import type { CreateAgentBody } from '@/lib/api';
import type { HubAgent } from '@/components/agents';

/**
 * Pure OrchestrationPane helpers — no DOM, no fetch
 * (probe: `bun src/components/orchestration/orchestration.test.ts`).
 * The pane shows the LIVE registry (same rows as the Hub, grouped by
 * state) plus real fan-out creation and real kill-all. Anything the
 * server cannot do yet (run execution, pipeline phases, agent bus) stays
 * out of this file — the pane labels those as future work instead of
 * faking them.
 * Row normalization, state colors and persona options are reused from
 * `@/components/agents` (single source, never duplicated here).
 */

/** Tree group order — live states first, terminal states last. */
export const ORCH_STATE_ORDER = [
  'running',
  'queued',
  'idle',
  'paused',
  'completed',
  'failed',
  'killed',
] as const;

/** Client-side tree filter (mirrors the concept's all/running/queued). */
export type OrchFilter = 'all' | 'running' | 'queued';

export const ORCH_FILTERS: readonly OrchFilter[] = ['all', 'running', 'queued'];

export type StateGroup = { state: string; items: HubAgent[] };

function stateRank(state: string): number {
  const index = (ORCH_STATE_ORDER as readonly string[]).indexOf(state);
  return index === -1 ? ORCH_STATE_ORDER.length : index;
}

/** Group rows by state, ordered live-first (unknown states trail). */
export function groupByState(agents: HubAgent[]): StateGroup[] {
  const buckets = new Map<string, HubAgent[]>();
  for (const agent of agents) {
    const list = buckets.get(agent.state) ?? [];
    list.push(agent);
    buckets.set(agent.state, list);
  }
  return [...buckets.entries()]
    .map(([state, items]) => ({ state, items }))
    .sort((a, b) => stateRank(a.state) - stateRank(b.state));
}

/** Apply the header filter to the flat row list. */
export function filterTree(agents: HubAgent[], filter: OrchFilter): HubAgent[] {
  if (filter === 'all') return agents;
  return agents.filter((a) => a.state === filter);
}

/** Header badge numbers — straight counts, never estimated. */
export function countLive(agents: HubAgent[]): { running: number; queued: number; total: number } {
  return {
    running: agents.filter((a) => a.state === 'running').length,
    queued: agents.filter((a) => a.state === 'queued').length,
    total: agents.length,
  };
}

/**
 * Compact elapsed time since `createdAt` (`12s`, `3m 04s`, `2h 05m`,
 * `3d 2h`). Returns an em dash when the timestamp is missing, invalid,
 * or in the future — never a guessed number.
 */
export function elapsedSince(createdAt: string | null, nowMs: number): string {
  if (!createdAt) return '—';
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return '—';
  const seconds = Math.floor((nowMs - then) / 1000);
  if (seconds < 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export type LineageKind = 'human' | 'fork' | 'clone' | 'fanout' | 'ai';

/**
 * Parse `createdBy` into a lineage pointer. The server writes
 * `fork:<id>` / `clone:<id>` on copies, `fanout:<stem>` on fan-out
 * batches (this pane), and `ai:<parentId>` on agent-spawned agents.
 */
export function lineageOf(createdBy: string): { kind: LineageKind; parent: string | null } {
  if (createdBy.startsWith('fork:') && createdBy.length > 5) return { kind: 'fork', parent: createdBy.slice(5) };
  if (createdBy.startsWith('clone:') && createdBy.length > 6) return { kind: 'clone', parent: createdBy.slice(6) };
  if (createdBy.startsWith('fanout:') && createdBy.length > 7) return { kind: 'fanout', parent: createdBy.slice(7) };
  if (createdBy.startsWith('ai:') && createdBy.length > 3) return { kind: 'ai', parent: createdBy.slice(3) };
  return { kind: 'human', parent: null };
}

export type LineageGroup = { key: string; label: string; count: number };

/**
 * Non-human lineage batches derived from real `createdBy` values
 * (fan-out stems, fork/clone parents, ai parents), biggest first.
 */
export function lineageGroups(agents: HubAgent[]): LineageGroup[] {
  const counts = new Map<string, number>();
  for (const agent of agents) {
    const { kind, parent } = lineageOf(agent.createdBy);
    if (kind === 'human' || !parent) continue;
    const label = kind === 'fanout' ? `fan-out ${parent}` : `${kind} of ${parent}`;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count);
}

/** Ids the Cancel-all button will actually kill (non-terminal states). */
export function killableIds(agents: HubAgent[], terminalStates: readonly string[]): string[] {
  return agents.filter((a) => !terminalStates.includes(a.state)).map((a) => a.id);
}

export type FanoutForm = {
  stem: string;
  persona: string;
  model: string;
  count: string;
  cwd: string;
};

/** Empty fan-out form defaults (model matches the server default). */
export function emptyFanoutForm(): FanoutForm {
  return { stem: '', persona: 'builder', model: 'anthropic/claude-4-sonnet', count: '3', cwd: '' };
}

export const FANOUT_MIN_COUNT = 1;
export const FANOUT_MAX_COUNT = 20;

/**
 * Client-side fan-out check mirroring the server create rules (same
 * limits, both sides). `remainingSlots` is `maxAgents - registry size`.
 * Null = valid. The server stays the source of truth — this only gives
 * instant feedback before the POSTs.
 */
export function validateFanoutForm(form: FanoutForm, remainingSlots: number): string | null {
  const stem = form.stem.trim();
  if (!stem || stem.length > 40) return 'Give the batch a name stem (1-40 chars).';
  if (!(PERSONA_OPTIONS as readonly string[]).includes(form.persona)) {
    return 'Pick a persona from the list.';
  }
  const model = form.model.trim();
  if (!model || model.length > 200) return 'Set a model (e.g. anthropic/claude-4-sonnet).';
  const count = Number(form.count);
  if (!Number.isInteger(count) || count < FANOUT_MIN_COUNT || count > FANOUT_MAX_COUNT) {
    return `Count must be a whole number (${FANOUT_MIN_COUNT}-${FANOUT_MAX_COUNT}).`;
  }
  if (form.cwd.trim().length > 500) return 'That working directory looks too long.';
  if (count > remainingSlots) {
    return `Only ${remainingSlots} registry slot${remainingSlots === 1 ? '' : 's'} left — lower the count or delete an agent.`;
  }
  return null;
}

/**
 * Expand a valid fan-out form into real `POST /api/agents` bodies.
 * Names are `${stem} ${i + 1}` (trimmed to the server's 40-char limit);
 * every member records `fanout:<stem>` so lineage stays traceable.
 */
export function buildFanoutBodies(form: FanoutForm): CreateAgentBody[] {
  const stem = form.stem.trim();
  const count = Number(form.count);
  const bodies: CreateAgentBody[] = [];
  for (let i = 1; i <= count; i += 1) {
    bodies.push({
      name: `${stem} ${i}`.slice(0, 40),
      persona: form.persona,
      model: form.model.trim(),
      ...(form.cwd.trim() ? { cwd: form.cwd.trim() } : {}),
      createdBy: `fanout:${stem}`,
    });
  }
  return bodies;
}
