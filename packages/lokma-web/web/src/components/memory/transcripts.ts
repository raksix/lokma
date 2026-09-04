/**
 * Transcript search + compaction pure helpers — the wave 3b Memory tab
 * sections (Docs/28 session_search + §1.3 shrink).
 *
 * The server owns both surfaces (`GET /api/sessions/search` full-text over
 * transcripts, `GET|POST /api/sessions/:id/compaction` two-tier shrink).
 * These helpers stay side-effect free so the probe can cover them without
 * a server: search-form validation, role labels, engine labels, compaction
 * status tones, and human-readable report lines.
 */
import type { CompactionRunRes, CompactionStatusRes, SessionSearchHit, SessionSummary } from '@/lib/api';

/** Search-form validation mirroring the server `bad_query` 400. */
export function validateTranscriptSearch(form: { query: string }): string | null {
  if (form.query.trim() === '') return 'Type something to search transcripts — empty queries are rejected.';
  return null;
}

/** Short label per transcript role (server sends the raw role string). */
export function hitRoleLabel(hit: Pick<SessionSearchHit, 'role' | 'toolName'>): string {
  if (hit.role === 'user') return 'You';
  if (hit.role === 'assistant') return 'Assistant';
  return hit.toolName ? `Tool · ${hit.toolName}` : 'Tool';
}

/** Honest engine label from the server `engine` field (never invented). */
export function searchEngineLabel(engine: string): string {
  return engine === 'fts5' ? 'FTS5 full-text' : 'substring fallback';
}

/** Human hint per session-search error code (pane shows it next to the message). */
export function searchErrorHint(code: string): string {
  switch (code) {
    case 'bad_query':
      return 'Type at least one word — empty queries are rejected.';
    case 'bad_limit':
      return 'Something asked for too many hits — retry the search.';
    default:
      return '';
  }
}

/** `1,234,567 chars` for status lines (locale-aware, never NaN). */
export function formatChars(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 chars';
  return `${Math.floor(n).toLocaleString('en-US')} chars`;
}

/**
 * Compaction urgency tone: destructive when a summary is due, warning when
 * only hygiene is due, calm otherwise (mirrors the memory usage bands).
 */
export function compactionTone(status: Pick<CompactionStatusRes, 'hygieneNeeded' | 'summaryNeeded'>): 'default' | 'warning' | 'destructive' {
  if (status.summaryNeeded) return 'destructive';
  if (status.hygieneNeeded) return 'warning';
  return 'default';
}

/** One-line status: `12 msgs · 1,234 chars · hygiene due`. */
export function formatCompactionStatus(status: Pick<CompactionStatusRes, 'messages' | 'chars' | 'hygieneNeeded' | 'summaryNeeded'>): string {
  const due = status.summaryNeeded ? 'summary due' : status.hygieneNeeded ? 'hygiene due' : 'no compaction needed';
  return `${status.messages} msgs · ${formatChars(status.chars)} · ${due}`;
}

/** One-line last-run: `full 2h ago: 122 → 22 msgs · 101 archived` (null when never). */
export function formatLastRun(last: CompactionStatusRes['last']): string {
  if (!last) return 'Never compacted';
  const ago = formatAgo(last.compactedAt);
  const shrunk = `${last.beforeMessages} → ${last.afterMessages} msgs`;
  const archived = last.archived > 0 ? ` · ${last.archived} archived` : '';
  return `${last.mode} ${ago}: ${shrunk}${archived}`;
}

/** One-line run result: `full: 122 → 22 msgs · 101 archived · 3 anchors`. */
export function formatRunResult(run: Pick<CompactionRunRes, 'mode' | 'compacted' | 'beforeMessages' | 'afterMessages' | 'archived' | 'anchors'>): string {
  if (!run.compacted) return `${run.mode}: already lean — nothing to compact`;
  const anchors = run.anchors.length > 0 ? ` · ${run.anchors.length} anchors` : '';
  return `${run.mode}: ${run.beforeMessages} → ${run.afterMessages} msgs · ${run.archived} archived${anchors}`;
}

/** Relative age (`just now`, `5m ago`, `3h ago`, `2d ago`) — pane display only. */
export function formatAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Dropdown label for a session summary (`title · N msgs`, id fallback). */
export function sessionOptionLabel(s: Pick<SessionSummary, 'id'> & { title?: string; messageCount?: number }): string {
  const title = s.title && s.title.trim() ? s.title : s.id;
  return `${title} · ${s.messageCount ?? 0} msgs`;
}
