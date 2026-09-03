import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Agent } from 'lokma-shared';
import { listLocks } from '../agents/locks.js';
import { requireAgent } from '../agents/registry.js';

/**
 * Agent trace timeline — every event is derived from durable state, never
 * invented. Sources: the agent `config.json` (createdAt + state + mtime),
 * SOUL.md / MEMORY.md mtimes, live advisory locks, and the `createdBy`
 * lineage field. There is no runner/event bus in core yet (Docs/30 §12
 * future) — when it lands, its rows append here as new `TraceEventKind`s.
 * See Docs/24 §orchestration + Docs/36 §observability.
 */

/** Timeline event kinds — the pane filters `agent_*`/`spawned` vs `lock_*`/`*_write`. */
export type TraceEventKind =
  | 'agent_created'
  | 'spawned'
  | 'agent_state'
  | 'soul_write'
  | 'memory_write'
  | 'lock_acquired';

export type TraceEvent = {
  /** ISO timestamp — event time, not fetch time. */
  ts: string;
  kind: TraceEventKind;
  label: string;
  detail?: string;
};

export type AgentTraceDoc = {
  exists: boolean;
  bytes: number;
  /** ISO mtime, null when the file is absent. */
  mtime: string | null;
};

export type AgentTrace = {
  agent: Agent;
  /** Ascending by `ts` (ties broken by insertion order). */
  events: TraceEvent[];
  /** Locks currently on disk owned by this agent (live + expired). */
  locks: Array<{
    path: string;
    acquiredAt: string;
    leaseUntil: string;
    live: boolean;
    reason?: string;
  }>;
  docs: { soul: AgentTraceDoc; memory: AgentTraceDoc };
  worktree: string | null;
  generatedAt: string;
};

function agentDir(id: string): string {
  return join(homedir(), '.lokma', 'agents', id);
}

async function docInfo(id: string, file: 'SOUL.md' | 'MEMORY.md'): Promise<AgentTraceDoc> {
  try {
    const st = await stat(join(agentDir(id), file));
    return { exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
  } catch {
    return { exists: false, bytes: 0, mtime: null };
  }
}

async function configMtime(id: string): Promise<string> {
  try {
    const st = await stat(join(agentDir(id), 'config.json'));
    return st.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Build the trace for one agent. Throws `AgentError` (`bad_agent_id` 400 /
 * `agent_not_found` 404) via `requireAgent` — routes map it straight to
 * `{ code, message }` like the agent routes do.
 */
export async function buildAgentTrace(id: string): Promise<AgentTrace> {
  const agent = await requireAgent(id);
  const createdTs = agent.createdAt ?? (await configMtime(id));
  const createdMs = Date.parse(createdTs);
  const events: TraceEvent[] = [];

  events.push({
    ts: createdTs,
    kind: 'agent_created',
    label: `Agent created by ${agent.createdBy}`,
    detail: `${agent.persona} · ${agent.model}`,
  });

  if (agent.createdBy !== 'human') {
    events.push({
      ts: createdTs,
      kind: 'spawned',
      label: `Spawned via ${agent.createdBy}`,
      detail: 'parent agent, bot run, or fork/clone source',
    });
  }

  if (agent.state !== 'idle') {
    events.push({
      ts: await configMtime(id),
      kind: 'agent_state',
      label: `State → ${agent.state}`,
      detail: 'latest registry write (pause/resume/kill land here)',
    });
  }

  const soul = await docInfo(id, 'SOUL.md');
  const memory = await docInfo(id, 'MEMORY.md');
  // Seed writes share the creation timestamp — only later mtimes are edits.
  // 1s grace covers same-second filesystems without hiding real edits.
  if (soul.exists && soul.mtime && Date.parse(soul.mtime) > createdMs + 1000) {
    events.push({ ts: soul.mtime, kind: 'soul_write', label: 'SOUL.md edited', detail: `${soul.bytes} bytes` });
  }
  if (memory.exists && memory.mtime && Date.parse(memory.mtime) > createdMs + 1000) {
    events.push({ ts: memory.mtime, kind: 'memory_write', label: 'MEMORY.md edited', detail: `${memory.bytes} bytes` });
  }

  const now = Date.now();
  const locks: AgentTrace['locks'] = [];
  for (const lock of await listLocks()) {
    if (lock.owner !== id) continue;
    const live = lock.leaseUntil > now;
    locks.push({
      path: lock.path,
      acquiredAt: new Date(lock.acquiredAt).toISOString(),
      leaseUntil: new Date(lock.leaseUntil).toISOString(),
      live,
      ...(lock.reason ? { reason: lock.reason } : {}),
    });
    events.push({
      ts: new Date(lock.acquiredAt).toISOString(),
      kind: 'lock_acquired',
      label: live ? `Lock acquired — ${lock.path}` : `Lock acquired (lease expired) — ${lock.path}`,
      ...(lock.reason ? { detail: lock.reason } : {}),
    });
  }
  locks.sort((a, b) => (a.acquiredAt < b.acquiredAt ? -1 : 1));

  events.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  return {
    agent,
    events,
    locks,
    docs: { soul, memory },
    worktree: agent.worktree ?? null,
    generatedAt: new Date().toISOString(),
  };
}
