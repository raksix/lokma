import type { ShareSessionSnapshot, TraceEventKind, TraceEventView } from '@/lib/api';

/**
 * Pure helpers for the ObservabilityPane (W6-24, Docs/24 + Docs/36 §sharing).
 * No fetching here — the pane owns all I/O through `@/lib/api`.
 */

export type TraceFilter = 'all' | 'agent' | 'tool';

const AGENT_KINDS: ReadonlySet<TraceEventKind> = new Set(['agent_created', 'spawned', 'agent_state']);
const TOOL_KINDS: ReadonlySet<TraceEventKind> = new Set(['lock_acquired', 'soul_write', 'memory_write']);

/** Concept filter parity: `agent` = lifecycle rows, `tool` = lock/write rows. */
export function filterTraceEvents(events: TraceEventView[], filter: TraceFilter): TraceEventView[] {
  if (filter === 'agent') return events.filter((e) => AGENT_KINDS.has(e.kind));
  if (filter === 'tool') return events.filter((e) => TOOL_KINDS.has(e.kind));
  return events;
}

/** Timeline dot color — lifecycle violet, writes terracotta, locks zinc. */
export function eventTone(kind: TraceEventKind): string {
  if (kind === 'soul_write' || kind === 'memory_write') return 'bg-terracotta';
  if (kind === 'lock_acquired') return 'bg-zinc-500';
  return 'bg-[#6C5CE7]';
}

/** Relative seconds against the first event (`0.0s`, `2.1s` — concept shape). */
export function formatElapsed(ts: string, baseTs: string): string {
  const ms = Date.parse(ts) - Date.parse(baseTs);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Header range line (`0.0s → 3.9s · 8 events`) — empty timeline is honest. */
export function timelineRange(events: TraceEventView[]): string {
  if (events.length === 0) return 'no events yet';
  const first = events[0].ts;
  const last = events[events.length - 1].ts;
  return `${formatElapsed(first, first)} → ${formatElapsed(last, first)} · ${events.length} event${events.length === 1 ? '' : 's'}`;
}

/** Deterministic per-agent badge (terracotta/violet/emerald rotation). */
export function agentBadge(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const tones = [
    'bg-terracotta text-white border-terracotta',
    'bg-[#6C5CE7] text-white border-[#6C5CE7]',
    'bg-emerald-600 text-white border-emerald-600',
  ];
  return tones[h % tones.length];
}

/** Compact byte count for the docs line (`1.2k`, `3.4M`). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}k`;
  return `${(n / (1024 * 1024)).toFixed(1)}M`;
}

/** Short age for share rows (`just now`, `5m ago`, `3h ago`, `2d ago`). */
export function formatAge(iso: string, nowMs = Date.now()): string {
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Single-line excerpt for replay rows (newlines collapsed, capped). */
export function replayExcerpt(content: string, max = 160): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Narrow an unknown transcript row into a renderable replay row. */
export function asReplayRow(raw: unknown): { role: string; content: string; timestamp: string; toolName?: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if ((r.role !== 'user' && r.role !== 'assistant' && r.role !== 'tool') || typeof r.content !== 'string') {
    return null;
  }
  return {
    role: r.role,
    content: r.content,
    timestamp: typeof r.timestamp === 'string' ? r.timestamp : '',
    ...(typeof r.toolName === 'string' ? { toolName: r.toolName } : {}),
  };
}

/** Narrow an unknown share snapshot into a session snapshot (null = agent). */
export function asSessionSnapshot(raw: unknown): ShareSessionSnapshot | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.messages) || typeof r.id !== 'string') return null;
  const messages = r.messages
    .map(asReplayRow)
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .map((m) => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      timestamp: m.timestamp,
      ...(m.toolName ? { toolName: m.toolName } : {}),
    }));
  return {
    id: r.id,
    cwd: typeof r.cwd === 'string' ? r.cwd : '',
    model: typeof r.model === 'string' ? r.model : null,
    title: typeof r.title === 'string' ? r.title : r.id,
    messages,
    count: typeof r.count === 'number' ? r.count : messages.length,
  };
}

/** 3-layer safe summary for an agent (`lease → expectedSha → worktree`). */
export function safeSummary(lockCount: number, worktree: string | null): { label: string; tone: string } {
  if (lockCount > 0 && worktree) return { label: `HUD green — ${lockCount} lock${lockCount === 1 ? '' : 's'} + worktree`, tone: 'text-emerald-400' };
  if (lockCount > 0 || worktree) return { label: 'HUD amber — partial isolation (locks or worktree only)', tone: 'text-amber-400' };
  return { label: 'HUD grey — main checkout, no locks held', tone: 'text-zinc-400' };
}
