/**
 * Pure Usage-pane helpers — no React, no server.
 * Covered by `usage.test.ts` (`bun src/components/usage/usage.test.ts`).
 */
import type { UsageDayPoint, UsageModelRow } from '@/lib/api';

/** Stacked-area palette — terracotta first, same order as the concept chart. */
export const CHART_COLORS = ['#C96442', '#6C5CE7', '#10B981', '#D9A441', '#3E8FD9', '#8A8F98'];

/** Compact token count: 942 → "942", 187400 → "187.4k", 2.1M stays "2.1M". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const v = Math.max(0, Math.round(n));
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return `${v}`;
}

/** Compact USD: 3.82 → "$3.82", 0.0012 → "$0.0012" (dust stays visible). */
export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const v = Math.max(0, n);
  return `$${v.toFixed(v < 0.01 && v > 0 ? 4 : 2)}`;
}

/**
 * Short display id: "anthropic/claude-sonnet-4-5" → "sonnet-4-5",
 * "openai/gpt-4o-mini" → "gpt-4o-mini". Drops the provider prefix, the
 * `claude-` infix, and dated `-YYYYMMDD` suffixes — display only.
 */
export function shortModel(id: string): string {
  const slug = id.includes('/') ? (id.split('/').pop() ?? id) : id;
  const undated = slug.replace(/-\d{8}$/, '');
  return undated.startsWith('claude-') ? undated.slice('claude-'.length) : undated;
}

/**
 * Pick chart layers: top `max` models by tokens + an "other" bucket when
 * more models exist. Returns full model ids (stable keys) in stack order.
 */
export function chartKeys(byModel: UsageModelRow[], max = 3): { keys: string[]; other: boolean } {
  const keys = byModel.slice(0, max).map((r) => r.model);
  return { keys, other: byModel.length > keys.length };
}

/** Collapse a day series to the chart keys (+ "other" when needed). */
export function collapseSeries(
  series: UsageDayPoint[],
  keys: string[],
  other: boolean,
): { day: string; total: number; layers: Record<string, number> }[] {
  return series.map((p) => {
    const layers: Record<string, number> = {};
    let rest = 0;
    for (const [model, tokens] of Object.entries(p.byModel)) {
      if (keys.includes(model)) layers[model] = tokens;
      else rest += tokens;
    }
    for (const k of keys) layers[k] = layers[k] ?? 0;
    if (other) layers.other = rest;
    return { day: p.day, total: p.total, layers };
  });
}

/**
 * Stacked-area SVG paths (bottom layer first). X spreads evenly across
 * `width`; Y scales by the max day total. Empty input → flat baselines.
 */
export function buildStackedPaths(
  rows: { total: number; layers: Record<string, number> }[],
  keys: string[],
  width: number,
  height: number,
): string[] {
  const n = rows.length;
  if (n === 0 || keys.length === 0) return keys.map(() => baseline(width, height));
  const max = Math.max(0, ...rows.map((r) => r.total));
  if (max <= 0) return keys.map(() => baseline(width, height));
  const x = (i: number): number => (n === 1 ? width : (i / (n - 1)) * width);
  const cum: number[][] = rows.map(() => []);
  rows.forEach((row, i) => {
    let running = 0;
    for (const k of keys) {
      running += row.layers[k] ?? 0;
      cum[i]?.push(running);
    }
  });
  return keys.map((_, layer) => {
    const top = rows.map((_, i) => `${fmt(x(i))},${fmt(height - ((cum[i]?.[layer] ?? 0) / max) * height)}`);
    return `M${top.join(' L')} L${fmt(x(n - 1))},${height} L${fmt(x(0))},${height} Z`;
  });
}

function baseline(width: number, height: number): string {
  return `M0,${height} L${fmt(width)},${height} L${fmt(width)},${height} L0,${height} Z`;
}

function fmt(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** X-axis labels: every day for a week, every 5th/15th for 30d/90d. */
export function axisLabels(days: string[]): string[] {
  const stride = days.length <= 7 ? 1 : days.length <= 31 ? 5 : 15;
  return days.map((d, i) => (i % stride === 0 || i === days.length - 1 ? weekday(d) : ''));
}

function weekday(isoDay: string): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ms = Date.parse(`${isoDay}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return isoDay;
  return names[new Date(ms).getUTCDay()] ?? isoDay;
}

/** "Today 14:31" / "Yesterday" / "3d ago" / ISO date for session rows. */
export function formatLastActive(iso: string, nowMs = Date.now()): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const dayMs = 86_400_000;
  const startOf = (t: number): number => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const diff = Math.round((startOf(nowMs) - startOf(ms)) / dayMs);
  if (diff <= 0) {
    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `Today ${hh}:${mm} UTC`;
  }
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  return iso.slice(0, 10);
}

/** Trigger a browser download for a fetched blob (no-op outside the DOM). */
export function downloadBlob(filename: string, blob: Blob): void {
  try {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // Download affordance only — the export bytes already arrived.
  }
}
