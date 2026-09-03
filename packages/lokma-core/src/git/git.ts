import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { listWorktrees } from '../agents/worktree.js';

const exec = promisify(execFile);

/**
 * Repo git access — the single DRY implementation behind `GET /api/git/*`.
 * Every operation runs with `cwd` as the repo root (no path jail needed —
 * git itself scopes to the repo; a non-repo yields `repo: false` on status
 * and `not_a_repo` (400) on mutating reads like log).
 * Timeouts keep a hung remote from wedging the server (push gets the longest).
 * See Docs/24 §git pane.
 */

/** `git status` refused here (larger repos still answer; output is porcelain). */
const GIT_TIMEOUT_MS = 15000;
/** `git push` may wait on a slow remote. */
const GIT_PUSH_TIMEOUT_MS = 60000;
/** Cap for `git log` entries per request. */
export const GIT_LOG_DEFAULT_MAX = 20;
export const GIT_LOG_HARD_MAX = 100;
/** Bytes of push output kept for the pane (remote chatter trimmed to the tail). */
const PUSH_TAIL_CHARS = 2000;

/** One changed path: staged (index) vs worktree states kept separate. */
export type GitFileChange = {
  path: string;
  staged: string | null;
  worktree: string | null;
};

export type GitStatus = {
  repo: true;
  cwd: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileChange[];
  counts: { changed: number; staged: number; unstaged: number };
  /** Agent worktree roots under this repo (drives the safe banner + filter). */
  worktrees: string[];
};

export type GitLogEntry = {
  hash: string;
  short: string;
  message: string;
  author: string;
  date: string;
};

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class GitError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'GitError';
    this.code = code;
    this.status = status;
  }
}

async function runGit(cwd: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  try {
    return await exec('git', args, { cwd, timeout, maxBuffer: 4 * 1024 * 1024 });
  } catch (e) {
    const err = e as { code?: unknown; stderr?: unknown; message?: string };
    // `git rev-parse` exits 128 outside a repo — every caller maps it.
    if (err?.code === 128) throw new GitError('not_a_repo', `${cwd} is not a git repository`, 400);
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new GitError('git_missing', 'git binary not found on the server', 500);
    }
    const detail = typeof err?.stderr === 'string' && err.stderr.trim()
      ? err.stderr.trim().split('\n').pop()!
      : (err?.message ?? 'git failed');
    throw new GitError('git_failed', detail.slice(0, 300), 500);
  }
}

/** True when `cwd` sits inside a git work tree (never throws). */
export async function isRepo(cwd: string): Promise<boolean> {
  try {
    await exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/** Split one porcelain v1 line into staged (X) + worktree (Y) columns. */
function splitPorcelainLine(line: string): { path: string; staged: string | null; worktree: string | null } | null {
  if (line.length < 4) return null;
  const x = line[0];
  const y = line[1];
  let p = line.slice(3).trim();
  // Rename lines (`R  old -> new`) are indexed under the NEW path.
  const arrow = p.indexOf(' -> ');
  if (arrow !== -1) p = p.slice(arrow + 4);
  if (!p) return null;
  const staged = x !== ' ' && x !== '?' ? x : null;
  const worktree = y !== ' ' ? y : null;
  if (!staged && !worktree) return null;
  return { path: p, staged, worktree };
}

/** Git operations scoped to one repo root (one instance per request). */
export class RepoGit {
  readonly root: string;

  constructor(cwd: string) {
    this.root = resolve(cwd);
  }

  /** Branch + upstream + ahead/behind + staged/unstaged file list. */
  async status(): Promise<GitStatus | { repo: false; cwd: string }> {
    if (!(await isRepo(this.root))) return { repo: false as const, cwd: this.root };
    const { stdout: branchOut } = await runGit(this.root, ['rev-parse', '--abbrev-ref', 'HEAD'], GIT_TIMEOUT_MS);
    const branch = branchOut.trim() || 'HEAD';
    let upstream: string | null = null;
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: up } = await runGit(this.root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], GIT_TIMEOUT_MS);
      upstream = up.trim() || null;
      if (upstream) {
        const { stdout: counts } = await runGit(this.root, ['rev-list', '--left-right', '--count', 'HEAD...@{u}'], GIT_TIMEOUT_MS);
        const [a, b] = counts.trim().split(/\s+/).map(Number);
        ahead = Number.isFinite(a) ? a : 0;
        behind = Number.isFinite(b) ? b : 0;
      }
    } catch {
      // No upstream configured — branch without tracking is normal, not a failure.
    }
    const { stdout } = await runGit(this.root, ['status', '--porcelain=v1', '-uall', '--', '.'], GIT_TIMEOUT_MS);
    const files: GitFileChange[] = [];
    for (const line of stdout.split('\n')) {
      const parsed = splitPorcelainLine(line);
      if (parsed) files.push(parsed);
    }
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return {
      repo: true as const,
      cwd: this.root,
      branch,
      upstream,
      ahead,
      behind,
      files,
      worktrees: await listWorktrees(this.root).catch(() => [] as string[]),
      counts: {
        changed: files.length,
        staged: files.filter((f) => f.staged).length,
        unstaged: files.filter((f) => f.worktree).length,
      },
    };
  }

  /** Recent commits, newest first (`\x1f`-separated fields, `\x1e`-separated records). */
  async log(max: unknown): Promise<{ branch: string; commits: GitLogEntry[] }> {
    if (!(await isRepo(this.root))) throw new GitError('not_a_repo', `${this.root} is not a git repository`, 400);
    const n = typeof max === 'number' && Number.isFinite(max)
      ? Math.max(1, Math.min(Math.floor(max), GIT_LOG_HARD_MAX))
      : GIT_LOG_DEFAULT_MAX;
    const { stdout: branchOut } = await runGit(this.root, ['rev-parse', '--abbrev-ref', 'HEAD'], GIT_TIMEOUT_MS);
    const { stdout } = await runGit(
      this.root,
      ['log', `-n${n}`, '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%cI%x1e'],
      GIT_TIMEOUT_MS,
    );
    const commits: GitLogEntry[] = [];
    for (const record of stdout.split('\x1e')) {
      const [hash, short, message, author, date] = record.split('\x1f');
      if (!hash?.trim()) continue;
      commits.push({
        hash: hash.trim(),
        short: (short ?? '').trim(),
        message: (message ?? '').trim(),
        author: (author ?? '').trim(),
        date: (date ?? '').trim(),
      });
    }
    return { branch: branchOut.trim() || 'HEAD', commits };
  }

  /**
   * Stage everything (`git add -A`) and commit.
   * Empty message → 400 `bad_message`; clean tree → 400 `nothing_to_commit`.
   */
  async commit(message: unknown): Promise<{ hash: string; short: string; message: string }> {
    if (!(await isRepo(this.root))) throw new GitError('not_a_repo', `${this.root} is not a git repository`, 400);
    if (typeof message !== 'string' || !message.trim() || message.trim().length > 500) {
      throw new GitError('bad_message', 'commit needs { message: "<1-500 chars>" }', 400);
    }
    await runGit(this.root, ['add', '-A'], GIT_TIMEOUT_MS);
    try {
      await exec('git', ['commit', '-m', message.trim()], { cwd: this.root, timeout: GIT_TIMEOUT_MS });
    } catch (e) {
      const err = e as { stdout?: unknown; stderr?: unknown };
      // "nothing to commit" lands on stdout in some git versions, stderr in others — check both.
      const combined = `${typeof err?.stdout === 'string' ? err.stdout : ''}\n${typeof err?.stderr === 'string' ? err.stderr : ''}`;
      if (combined.includes('nothing to commit')) {
        throw new GitError('nothing_to_commit', 'working tree is clean — nothing to commit', 400);
      }
      throw new GitError('git_failed', combined.trim().split('\n').pop()?.slice(0, 300) ?? 'commit failed', 500);
    }
    const { stdout } = await runGit(this.root, ['rev-parse', 'HEAD'], GIT_TIMEOUT_MS);
    const hash = stdout.trim();
    return { hash, short: hash.slice(0, 7), message: message.trim() };
  }

  /** Push to the upstream (or explicit remote/branch). Output tail kept for the pane. */
  async push(remote: unknown, branch: unknown): Promise<{ pushed: boolean; output: string }> {
    if (!(await isRepo(this.root))) throw new GitError('not_a_repo', `${this.root} is not a git repository`, 400);
    const args = ['push'];
    if (typeof remote === 'string' && remote.trim()) args.push(remote.trim());
    if (typeof branch === 'string' && branch.trim()) args.push(branch.trim());
    try {
      const { stdout, stderr } = await exec('git', args, { cwd: this.root, timeout: GIT_PUSH_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
      const combined = `${stdout}\n${stderr}`.trim();
      return { pushed: true, output: combined.slice(-PUSH_TAIL_CHARS) };
    } catch (e) {
      const err = e as { stdout?: unknown; stderr?: unknown };
      const combined = `${String(err?.stdout ?? '')}\n${String(err?.stderr ?? '')}`.trim();
      throw new GitError('push_failed', combined.slice(-300) || 'git push failed', 500);
    }
  }

  /** Prune stale worktree metadata (`git worktree prune` — the pane GC button). */
  async gc(): Promise<{ pruned: boolean }> {
    if (!(await isRepo(this.root))) throw new GitError('not_a_repo', `${this.root} is not a git repository`, 400);
    await runGit(this.root, ['worktree', 'prune'], GIT_TIMEOUT_MS);
    return { pruned: true };
  }
}
