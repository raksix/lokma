import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SessionStore } from '../session/store.js';

/**
 * UsageLedger — one JSONL line per completed model run, next to sessions.
 * Path: `~/.lokma/projects/<hash>/usage.jsonl` (same project scope as the
 * SessionStore, derived from `SessionStore.dirFor(cwd)` — never duplicated).
 * Both the WS handler (writes) and the usage routes (read/summarize/export)
 * go through here. See Docs/22 §usage.
 */

export type UsageEntry = {
  v: 1;
  /** ISO timestamp of run completion. */
  ts: string;
  sessionId: string;
  provider: string;
  /** Full `provider/id` model. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** False when the model has no list price (costUsd 0, shown as "unpriced"). */
  priced: boolean;
};

export type UsageModelRow = {
  model: string;
  family: string;
  runs: number;
  tokens: number;
  costUsd: number;
  /** Share of total tokens (0-1). */
  share: number;
};

export type UsageDayPoint = {
  /** UTC `YYYY-MM-DD`. */
  day: string;
  total: number;
  byModel: Record<string, number>;
};

export type UsageSummary = {
  rangeDays: number;
  runs: number;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  avgPerSession: number;
  topModel: string | null;
  byModel: UsageModelRow[];
  series: UsageDayPoint[];
  /** Tokens from unpriced models (excluded from costUsd, flagged in UI). */
  unpricedTokens: number;
};

function usagePath(cwd: string): string {
  return join(dirname(SessionStore.dirFor(cwd)), 'usage.jsonl');
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class UsageLedger {
  constructor(private cwd: string) {}

  /** Append one completed run. Never throws for malformed input. */
  async record(entry: Omit<UsageEntry, 'v' | 'ts'> & { ts?: string }): Promise<UsageEntry> {
    const full: UsageEntry = {
      v: 1,
      ts: entry.ts ?? new Date().toISOString(),
      sessionId: entry.sessionId,
      provider: entry.provider,
      model: entry.model,
      inputTokens: Math.max(0, Math.floor(entry.inputTokens)),
      outputTokens: Math.max(0, Math.floor(entry.outputTokens)),
      costUsd: Math.max(0, entry.costUsd),
      priced: entry.priced,
    };
    const dir = dirname(usagePath(this.cwd));
    await mkdir(dir, { recursive: true });
    await appendFile(usagePath(this.cwd), JSON.stringify(full) + '\n', 'utf-8');
    return full;
  }

  /** Read entries newer than `sinceMs` (all when omitted). Tolerates bad lines. */
  async read(sinceMs?: number): Promise<UsageEntry[]> {
    let raw: string;
    try {
      raw = await readFile(usagePath(this.cwd), 'utf-8');
    } catch {
      return [];
    }
    const out: UsageEntry[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as UsageEntry;
        if (typeof e.ts !== 'string' || typeof e.model !== 'string') continue;
        if (sinceMs !== undefined && Number.isNaN(Date.parse(e.ts))) continue;
        if (sinceMs !== undefined && Date.parse(e.ts) < sinceMs) continue;
        out.push(e);
      } catch {
        // One corrupt line never kills the ledger read.
      }
    }
    return out;
  }

  /** Aggregate the last `rangeDays` calendar days (today included, zero-filled). */
  async summarize(rangeDays: number, nowMs = Date.now()): Promise<UsageSummary> {
    const days = Math.max(1, Math.floor(rangeDays));
    const cutoff = nowMs - days * 86_400_000;
    const entries = await this.read(cutoff);

    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let unpricedTokens = 0;
    const sessionIds = new Set<string>();
    const perModel = new Map<string, { runs: number; tokens: number; costUsd: number }>();

    for (const e of entries) {
      inputTokens += e.inputTokens;
      outputTokens += e.outputTokens;
      costUsd += e.costUsd;
      sessionIds.add(e.sessionId);
      const t = e.inputTokens + e.outputTokens;
      if (!e.priced) unpricedTokens += t;
      const agg = perModel.get(e.model) ?? { runs: 0, tokens: 0, costUsd: 0 };
      agg.runs += 1;
      agg.tokens += t;
      agg.costUsd += e.costUsd;
      perModel.set(e.model, agg);
    }

    const tokens = inputTokens + outputTokens;
    const byModel: UsageModelRow[] = [...perModel.entries()]
      .map(([model, agg]) => ({
        model,
        family: model.includes('/') ? (model.split('/').pop() ?? model) : model,
        runs: agg.runs,
        tokens: agg.tokens,
        costUsd: agg.costUsd,
        share: tokens > 0 ? agg.tokens / tokens : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    // Zero-filled day buckets ending today (stable chart axis, honest gaps).
    const series: UsageDayPoint[] = [];
    const startDay = dayKey(cutoff);
    for (let i = 0; i < days; i++) {
      const ms = Date.parse(startDay + 'T00:00:00.000Z') + i * 86_400_000;
      series.push({ day: dayKey(ms), total: 0, byModel: {} });
    }
    const byDay = new Map(series.map((s) => [s.day, s]));
    for (const e of entries) {
      const point = byDay.get(dayKey(Date.parse(e.ts)));
      if (!point) continue;
      const t = e.inputTokens + e.outputTokens;
      point.total += t;
      point.byModel[e.model] = (point.byModel[e.model] ?? 0) + t;
    }

    return {
      rangeDays: days,
      runs: entries.length,
      sessions: sessionIds.size,
      inputTokens,
      outputTokens,
      tokens,
      costUsd,
      avgPerSession: sessionIds.size > 0 ? tokens / sessionIds.size : 0,
      topModel: byModel[0]?.model ?? null,
      byModel,
      series: series.filter((s) => s.day <= dayKey(nowMs)),
      unpricedTokens,
    };
  }
}
