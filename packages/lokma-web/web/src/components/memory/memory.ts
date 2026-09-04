/**
 * MemoryPane pure helpers — the memory-deep wave 2 UI tab (Docs/28 §5.2).
 *
 * The server owns the global §-delimited MEMORY.md / USER.md store
 * (`GET/POST/PATCH/DELETE /api/memory`, `MemoryError` codes mirrored here).
 * These helpers stay side-effect free so the probe can cover them without
 * a server: target labels, usage meter math, entry filtering, form
 * validation, and server-error-code → human-hint mapping.
 */
import type { MemoryTarget } from '@/lib/api';

/** The two global memory targets the server serves. */
export const MEMORY_TARGETS: readonly MemoryTarget[] = ['memory', 'user'] as const;

/** Short human label per target (concept parity — server sends no labels). */
export function targetLabel(target: MemoryTarget): string {
  return target === 'user' ? 'USER.md' : 'MEMORY.md';
}

/** One-line description per target shown under the toggle. */
export function targetHint(target: MemoryTarget): string {
  return target === 'user'
    ? 'Who you are — durable user facts the harness re-reads every run.'
    : 'What the harness learned — durable cross-session notes.';
}

/** Usage ratio in [0, 1], clamped so a corrupt payload cannot break the bar. */
export function usageRatio(chars: number, limit: number): number {
  if (!Number.isFinite(chars) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(1, Math.max(0, chars / limit));
}

/** Bar tone: calm below 70%, warning to 90%, destructive past that. */
export function usageTone(chars: number, limit: number): 'default' | 'warning' | 'destructive' {
  const ratio = usageRatio(chars, limit);
  if (ratio >= 0.9) return 'destructive';
  if (ratio >= 0.7) return 'warning';
  return 'default';
}

/** Case-insensitive substring filter over entries (empty query returns all). */
export function filterEntries(entries: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return entries;
  return entries.filter((e) => e.toLowerCase().includes(q));
}

/** Character count of one entry (the unit the server limit counts). */
export function entryChars(entry: string): number {
  return entry.length;
}

export type MemoryAddForm = { content: string };

/** Add-form validation mirroring the server `empty_content` 400. */
export function validateAddForm(form: MemoryAddForm): string | null {
  if (form.content.trim() === '') return 'Write the fact first — empty entries are rejected.';
  return null;
}

export type MemoryReplaceForm = { oldText: string; content: string };

/** Replace-form validation mirroring the server `empty_old_text` / `empty_content` 400s. */
export function validateReplaceForm(form: MemoryReplaceForm): string | null {
  if (form.oldText.trim() === '') return 'Pick the entry to replace first.';
  if (form.content.trim() === '') return 'Write the replacement text — empty entries are rejected.';
  return null;
}

/**
 * Human hint per server `MemoryError` code (the pane shows this next to the
 * raw message so a 409 never looks like a crash).
 */
export function errorHint(code: string): string {
  switch (code) {
    case 'memory_full':
      return 'Store is full — delete or shorten an entry, then retry.';
    case 'ambiguous_match':
      return 'Several entries match — copy the full entry text and retry.';
    case 'no_match':
      return 'No entry matches that text — it may have been deleted.';
    case 'empty_content':
      return 'Empty entries are rejected — write the fact first.';
    case 'empty_old_text':
      return 'Pick the entry to replace first.';
    case 'bad_target':
      return 'Unknown target — use MEMORY.md or USER.md.';
    default:
      return '';
  }
}

/** Remaining characters before the target limit hits (never negative). */
export function charsLeft(chars: number, limit: number): number {
  return Math.max(0, limit - chars);
}
