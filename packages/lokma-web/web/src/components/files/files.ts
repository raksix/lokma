/**
 * files.ts — pure helpers for the FileBrowser pane (no React, no DOM).
 * Ranking lives server-side (`GET /api/files/search`); the client only
 * filters already-loaded tree nodes and splices `@mention` text.
 * Covered by `files.test.ts` (`bun src/components/files/files.test.ts`).
 */
import type { FileEntry } from '@/lib/api';

/** Last segment of a workspace-relative path. */
export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/** Parent dir of a workspace-relative path ('.' for top-level entries). */
export function parentDir(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '.' : path.slice(0, i) || '.';
}

/** Join one tree level with `/` separators (matches `@mention` syntax). */
export function joinRel(dir: string, name: string): string {
  return dir === '.' ? name : `${dir}/${name}`;
}

/** Compact byte count for the tree + editor footer. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human label for a git overlay badge (null = clean/tracked or unknown). */
export function gitLabel(git: FileEntry['git']): string | null {
  switch (git) {
    case 'M':
      return 'Modified';
    case 'A':
      return 'Added';
    case 'D':
      return 'Deleted';
    case 'R':
      return 'Renamed';
    case '?':
      return 'Untracked';
    default:
      return null;
  }
}

/** Instant filter over already-loaded tree nodes (case-insensitive). */
export function filterLoaded(query: string, entries: FileEntry[]): FileEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.path.toLowerCase().includes(q));
}

/**
 * Splice `@path` into composer text (single DRY helper for drop-to-chat,
 * the context-menu "Insert mention" action, and the Composer drop signal).
 * Never duplicates a mention that is already present.
 */
export function appendMention(text: string, path: string): string {
  if (!path) return text;
  const token = `@${path}`;
  if (text.includes(token)) return text;
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed} ${token} ` : `${token} `;
}

/** DOM event name the FileBrowser fires to drop a mention into the Composer. */
export const INSERT_MENTION_EVENT = 'lokma-insert-mention';

/** DOM event name AppShell fires on Ctrl+P to focus the file search box. */
export const FOCUS_FILES_EVENT = 'lokma-focus-files';

/** Drag MIME type for file rows (falls back to `text/plain` `@path`). */
export const FILE_DRAG_MIME = 'application/x-lokma-file';

/** Ask the chat to insert a workspace file as an `@mention`. */
export function emitInsertMention(path: string): void {
  try {
    window.dispatchEvent(new CustomEvent<string>(INSERT_MENTION_EVENT, { detail: path }));
  } catch {
    // Probes (no DOM) never emit.
  }
}
