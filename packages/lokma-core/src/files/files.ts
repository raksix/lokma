import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { normalize, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { writeAtomic } from '../utils/fs.js';

const exec = promisify(execFile);

/**
 * Workspace file access — the single DRY implementation behind
 * `GET /api/files*` and the WS `@file` mention reader.
 * Every path is workspace-relative and jailed to the session cwd:
 * anything resolving outside the root throws `outside_root`.
 * See Docs/24 §file browser.
 */

/** Max bytes returned by `read()` (larger files come back truncated). */
export const FILES_READ_CAP = 256 * 1024;
/** Full files above this size are refused (even hash-checked reads). */
export const FILES_READ_HARD_CAP = 8 * 1024 * 1024;
/** Max bytes accepted by `write()`. */
export const FILES_WRITE_CAP = 1024 * 1024;
/** Default + max hits for `search()`. */
export const FILES_SEARCH_DEFAULT_MAX = 50;
export const FILES_SEARCH_HARD_MAX = 200;

/** Dirs never listed or searched (build output, deps, VCS, caches). */
const SKIPPED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  '.turbo',
  'coverage',
  '__pycache__',
  '.venv',
  'vendor',
]);

export type FileKind = 'file' | 'dir';
/** Git overlay states: Modified / Added / Deleted / Renamed / untracked (?). */
export type GitState = 'M' | 'A' | 'D' | 'R' | '?';

export type FileEntry = {
  name: string;
  /** Workspace-relative path with `/` separators (matches `@mention` syntax). */
  path: string;
  type: FileKind;
  size: number;
  mtimeMs: number;
  git: GitState | null;
};

export type FileContent = {
  path: string;
  content: string;
  /** sha256 of the FULL file (powers the `expectedSha` write guard). */
  sha: string;
  size: number;
  truncated: boolean;
};

export type FileWriteResult = { path: string; sha: string; size: number; created: boolean };

export type FileSearchHit = { path: string; type: FileKind; score: number };

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class FileError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'FileError';
    this.code = code;
    this.status = status;
  }
}

/** sha256 hex of a UTF-8 string. */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * Jail a workspace-relative path inside `cwd`.
 * Throws `bad_path` (empty/null bytes) or `outside_root` (escape attempt).
 */
export function resolveInRoot(cwd: string, raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) {
    throw new FileError('bad_path', 'path must be a non-empty string', 400);
  }
  const root = resolve(cwd);
  const abs = resolve(root, normalize(raw.trim()));
  const rel = relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== abs) {
    throw new FileError('outside_root', 'path escapes the workspace root', 400);
  }
  return abs;
}

/** Workspace-relative `/`-separated path for an absolute path under root. */
function toRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/') || '.';
}

function toGitState(x: string, y: string): GitState | null {
  const c = y !== ' ' && y !== '.' ? y : x;
  if (c === 'M' || c === 'T') return 'M';
  if (c === 'A') return 'A';
  if (c === 'D') return 'D';
  if (c === 'R' || c === 'C') return 'R';
  if (c === '?') return '?';
  return null;
}

/**
 * Parse `git status --porcelain=v1 -uall` into rel-path → state.
 * Rename lines (`R  old -> new`) are indexed under the NEW path.
 * Untracked dirs (`?? dir/`) are indexed both bare and slashed so
 * directory entries match too. Empty map when not a repo (never throws).
 */
function parsePorcelain(root: string, stdout: string): Map<string, GitState> {
  const out = new Map<string, GitState>();
  for (const line of stdout.split('\n')) {
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4);
    const state = toGitState(x, y);
    if (!state || !p) continue;
    out.set(p, state);
    if (p.endsWith('/')) out.set(p.slice(0, -1), state);
  }
  void root;
  return out;
}

/** Most significant state wins when a dir aggregates mixed child states. */
function pickDirState(states: Set<GitState>): GitState {
  if (states.has('M')) return 'M';
  if (states.has('A')) return 'A';
  if (states.has('D')) return 'D';
  if (states.has('R')) return 'R';
  return '?';
}

/** Map every dirty path to its ancestor dirs (bounded by the overlay size). */
function dirtyDirs(overlay: Map<string, GitState>): Map<string, Set<GitState>> {
  const out = new Map<string, Set<GitState>>();
  for (const [p, state] of overlay) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join('/');
      let set = out.get(dir);
      if (!set) {
        set = new Set();
        out.set(dir, set);
      }
      set.add(state);
    }
  }
  return out;
}

/** Subsequence fuzzy score (higher = better); -1 when not a subsequence. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  let qi = 0;
  let score = 0;
  let last = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) {
      // Contiguous runs + basename hits rank higher.
      score += last === ti - 1 ? 3 : 1;
      last = ti;
      qi += 1;
    }
  }
  if (qi < q.length) return -1;
  const base = t.split('/').pop() ?? t;
  if (base.includes(q)) score += 5;
  if (base.startsWith(q)) score += 5;
  return score;
}

/** File access scoped to one workspace root (one instance per request). */
export class WorkspaceFiles {
  readonly root: string;

  constructor(cwd: string) {
    this.root = resolve(cwd);
  }

  private async gitOverlay(): Promise<Map<string, GitState>> {
    try {
      const { stdout } = await exec('git', ['status', '--porcelain=v1', '-uall', '--', '.'], {
        cwd: this.root,
        timeout: 8000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return parsePorcelain(this.root, stdout);
    } catch {
      // Not a repo (or git missing) — overlay stays empty, never a failure.
      return new Map();
    }
  }

  /** One directory level, dirs-first, with the git overlay attached. */
  async list(rel = '.'): Promise<{ path: string; entries: FileEntry[] }> {
    const abs = resolveInRoot(this.root, rel);
    let dirStat;
    try {
      dirStat = await stat(abs);
    } catch {
      throw new FileError('file_not_found', `No such directory: ${rel}`, 404);
    }
    if (!dirStat.isDirectory()) {
      throw new FileError('not_a_directory', `Not a directory: ${rel}`, 400);
    }
    const overlay = await this.gitOverlay();
    const descendants = dirtyDirs(overlay);
    const names = await readdir(abs);
    const entries: FileEntry[] = [];
    for (const name of names) {
      if (name === '.' || name === '..') continue;
      const childAbs = resolve(abs, name);
      let s;
      try {
        s = await stat(childAbs);
      } catch {
        continue;
      }
      const isDir = s.isDirectory();
      if (isDir && SKIPPED_DIRS.has(name)) continue;
      if (!isDir && !s.isFile()) continue;
      const relPath = toRel(this.root, childAbs);
      const direct = overlay.get(relPath) ?? overlay.get(`${relPath}/`) ?? null;
      const kids = isDir ? descendants.get(relPath) : undefined;
      entries.push({
        name,
        path: relPath,
        type: isDir ? 'dir' : 'file',
        size: isDir ? 0 : s.size,
        mtimeMs: s.mtimeMs,
        git: direct ?? (kids ? pickDirState(kids) : null),
      });
    }
    entries.sort((a, b) =>
      a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
    );
    return { path: toRel(this.root, abs), entries };
  }

  /** Full content (capped) + full-file sha for the save guard. */
  async read(rel: string): Promise<FileContent> {
    const abs = resolveInRoot(this.root, rel);
    let s;
    try {
      s = await stat(abs);
    } catch {
      throw new FileError('file_not_found', `No such file: ${rel}`, 404);
    }
    if (!s.isFile()) {
      throw new FileError('not_a_file', `Not a file: ${rel}`, 400);
    }
    if (s.size > FILES_READ_HARD_CAP) {
      throw new FileError('too_large', `File exceeds the 8MB read limit: ${rel}`, 400);
    }
    const buf = await readFile(abs);
    if (buf.subarray(0, 8192).includes(0)) {
      throw new FileError('binary_file', `Binary files cannot be previewed: ${rel}`, 400);
    }
    const full = buf.toString('utf-8');
    const truncated = buf.length > FILES_READ_CAP;
    return {
      path: toRel(this.root, abs),
      content: truncated ? buf.subarray(0, FILES_READ_CAP).toString('utf-8') : full,
      sha: sha256Hex(full),
      size: buf.length,
      truncated,
    };
  }

  /**
   * Write content (atomic). `expectedSha` guards against lost updates:
   * mismatch (or sha given for a missing file) → 409 `stale_file`.
   * Missing path + no sha creates the file (parents included).
   */
  async write(rel: string, content: unknown, expectedSha?: unknown): Promise<FileWriteResult> {
    if (typeof content !== 'string') {
      throw new FileError('bad_content', 'write needs { content: string }', 400);
    }
    if (Buffer.byteLength(content, 'utf-8') > FILES_WRITE_CAP) {
      throw new FileError('too_large', 'Content exceeds the 1MB write limit', 400);
    }
    if (expectedSha !== undefined && (typeof expectedSha !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSha))) {
      throw new FileError('bad_sha', 'expectedSha must be a sha256 hex string', 400);
    }
    const abs = resolveInRoot(this.root, rel);
    let current: string | null = null;
    try {
      const s = await stat(abs);
      if (s.isDirectory()) throw new FileError('not_a_file', `Not a file: ${rel}`, 400);
      current = await readFile(abs, 'utf-8');
    } catch (e) {
      if (e instanceof FileError) throw e;
      current = null;
    }
    if (current !== null) {
      if (expectedSha !== undefined && sha256Hex(current) !== expectedSha) {
        throw new FileError('stale_file', 'File changed on disk — reload and retry', 409);
      }
    } else if (expectedSha !== undefined) {
      throw new FileError('stale_file', 'File no longer exists on disk', 409);
    }
    await writeAtomic(abs, content);
    return {
      path: toRel(this.root, abs),
      sha: sha256Hex(content),
      size: Buffer.byteLength(content, 'utf-8'),
      created: current === null,
    };
  }

  /** Fuzzy file search over the workspace (skips deps/build/VCS dirs). */
  async search(query: unknown, max?: unknown): Promise<{ q: string; hits: FileSearchHit[] }> {
    if (typeof query !== 'string' || !query.trim() || query.trim().length > 120) {
      throw new FileError('bad_query', 'search needs ?q=<1-120 chars>', 400);
    }
    const q = query.trim();
    const limit =
      max === undefined ? FILES_SEARCH_DEFAULT_MAX : Math.min(Math.max(Number(max) || 0, 1), FILES_SEARCH_HARD_MAX);
    const scored: FileSearchHit[] = [];
    const stack: string[] = [this.root];
    let visited = 0;
    while (stack.length && visited < 20_000) {
      const dir = stack.pop() as string;
      visited += 1;
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (name === '.' || name === '..') continue;
        const abs = resolve(dir, name);
        let s;
        try {
          s = await stat(abs);
        } catch {
          continue;
        }
        const isDir = s.isDirectory();
        if (isDir && SKIPPED_DIRS.has(name)) continue;
        if (!isDir && !s.isFile()) continue;
        const relPath = toRel(this.root, abs);
        const score = fuzzyScore(q, relPath);
        if (score >= 0) scored.push({ path: relPath, type: isDir ? 'dir' : 'file', score });
        if (isDir && toRel(this.root, abs).split('/').length <= 12) stack.push(abs);
      }
    }
    scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return { q, hits: scored.slice(0, limit) };
  }
}
