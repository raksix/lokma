import type { GitFileChange, GitLockRow } from '@/lib/api';

/**
 * Pure GitPane helpers — no DOM, no fetch (probe: `bun src/components/git/git.test.ts`).
 * Concept parity note: the mock `FILES`/`COMMITS` arrays and toast-only
 * buttons (Show, Commit-toast, Push-toast, GC-toast) are NOT ported —
 * every control below talks to a live `/api/git/*` endpoint.
 */

export type GitFilter = 'all' | 'locked' | 'worktree';

/** Max commit-message chars accepted by `POST /api/git/commit`. */
export const GIT_MESSAGE_CAP = 500;

/** Single-letter badge: staged state wins, else the worktree state. */
export function changeBadge(change: GitFileChange): string {
  return change.staged ?? change.worktree ?? '?';
}

/** Join a changed file to its live lock (exact rel-path match first, suffix fallback). */
export function findLockForFile(relPath: string, locks: GitLockRow[]): GitLockRow | null {
  for (const lock of locks) {
    if (lock.path === relPath) return lock;
  }
  for (const lock of locks) {
    if (relPath.endsWith(`/${lock.path}`) || lock.path.endsWith(`/${relPath}`)) return lock;
  }
  return null;
}

/** True when the file lives inside one of the repo's agent worktrees. */
export function fileInWorktree(cwd: string, relPath: string, worktrees: string[]): boolean {
  const abs = `${cwd.replace(/\/+$/, '')}/${relPath}`;
  return worktrees.some((w) => abs === w || abs.startsWith(`${w.replace(/\/+$/, '')}/`));
}

export function filterChanges(
  files: GitFileChange[],
  filter: GitFilter,
  lockedPaths: Set<string>,
  worktreePaths: Set<string>,
): GitFileChange[] {
  if (filter === 'locked') return files.filter((f) => lockedPaths.has(f.path));
  if (filter === 'worktree') return files.filter((f) => worktreePaths.has(f.path));
  return files;
}

/** Header sync line: upstream tracking state in plain words. */
export function pushLabel(ahead: number, behind: number, upstream: string | null): string {
  if (!upstream) return 'no upstream';
  if (ahead > 0 && behind > 0) return `ahead ${ahead} · behind ${behind}`;
  if (ahead > 0) return `ahead ${ahead}`;
  if (behind > 0) return `behind ${behind}`;
  return 'up to date';
}

/** Commit-message validation mirroring the server `bad_message` rule. */
export function validateCommitMessage(message: string): string | null {
  if (!message.trim()) return 'Write a commit message first.';
  if (message.trim().length > GIT_MESSAGE_CAP) {
    return `Message is ${message.trim().length} chars — keep it under ${GIT_MESSAGE_CAP}.`;
  }
  return null;
}

/** Short hash for the log list (full hash stays in the title tooltip). */
export function shortHash(hash: string): string {
  return hash.length > 7 ? hash.slice(0, 7) : hash;
}
