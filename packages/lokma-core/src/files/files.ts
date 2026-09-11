import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile, rename, rm, stat } from 'node:fs/promises';
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

/** One matched line from `grep()` — 1-based line number + trimmed text. */
export type GrepMatch = { line: number; text: string };
/** All matches inside one file (files are the group, matches are the rows). */
export type GrepHit = { path: string; matches: GrepMatch[] };

/** Content search budgets: one huge file or match list must not flood a turn. */
const GREP_MAX_FILE_BYTES = 1024 * 1024;
const GREP_MAX_PER_FILE = 20;
/** Directory cap for the walkers (parity with `search()`). */
const WALK_MAX_DIRS = 20_000;

/** Clamp an optional numeric option into `[1, max]`, defaulting when absent. */
function clampCount(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * Translate a workspace glob to a RegExp over relative paths:
 * `**` crosses directories (and `**\/` also matches zero segments, so
 * `**\/*.ts` finds root-level files), `*` stops at `/`, `?` is one char.
 */
export function globToRegExp(pattern: string): RegExp {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] as string;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`${out}$`);
}

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
   * Raw bytes for binary preview (REQ-075: pdf/images). Jailed + capped;
   * no text decoding, no binary rejection — the caller sets the MIME.
   */
  async readRaw(rel: string, maxBytes = 10 * 1024 * 1024): Promise<{ path: string; bytes: Buffer; size: number }> {
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
    if (s.size > maxBytes) {
      throw new FileError('too_large', `File exceeds the preview limit: ${rel}`, 400);
    }
    const bytes = await readFile(abs);
    return { path: toRel(this.root, abs), bytes, size: s.size };
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

  /** Delete one file or directory tree (REQ-120). Jailed; missing → 404. */
  async remove(rel: string): Promise<{ path: string; wasDir: boolean }> {
    const abs = resolveInRoot(this.root, rel);
    let s;
    try {
      s = await stat(abs);
    } catch {
      throw new FileError('file_not_found', `No such file: ${rel}`, 404);
    }
    if (!s.isFile() && !s.isDirectory()) {
      throw new FileError('not_a_file', `Not a file: ${rel}`, 400);
    }
    await rm(abs, { recursive: true, force: true });
    return { path: toRel(this.root, abs), wasDir: s.isDirectory() };
  }

  /** Rename/move one file or dir inside the workspace (REQ-120). Both jailed. */
  async rename(oldRel: string, newRel: string): Promise<{ path: string }> {
    if (typeof newRel !== 'string' || !newRel.trim()) {
      throw new FileError('bad_path', 'rename needs a new path', 400);
    }
    const abs = resolveInRoot(this.root, oldRel);
    try {
      await stat(abs);
    } catch {
      throw new FileError('file_not_found', `No such file: ${oldRel}`, 404);
    }
    const dest = resolveInRoot(this.root, newRel.trim());
    if (dest === abs) return { path: toRel(this.root, abs) };
    try {
      await stat(dest);
      throw new FileError('exists', `Already exists: ${newRel.trim()}`, 409);
    } catch (e) {
      if (e instanceof FileError) throw e;
    }
    await rename(abs, dest);
    return { path: toRel(this.root, dest) };
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

  /**
   * Glob a workspace-relative pattern (`**` crosses directories, `*` does
   * not, `?` is one char). Same skip list and depth cap as `search()`, so
   * a glob never walks node_modules or build output.
   */
  async glob(pattern: unknown, max?: unknown): Promise<{ pattern: string; files: string[]; truncated: boolean }> {
    if (typeof pattern !== 'string' || !pattern.trim() || pattern.trim().length > 200) {
      throw new FileError('bad_pattern', 'glob needs a pattern of 1-200 chars', 400);
    }
    const raw = pattern.trim().replace(/^\.\//, '');
    const re = globToRegExp(raw);
    const limit = clampCount(max, 200, 500);
    const files: string[] = [];
    let truncated = false;
    for await (const relPath of this.walkFiles()) {
      if (!re.test(relPath)) continue;
      if (files.length >= limit) {
        truncated = true;
        break;
      }
      files.push(relPath);
    }
    files.sort((a, b) => a.localeCompare(b));
    return { pattern: raw, files, truncated };
  }

  /**
   * Content search over the workspace (regex by default, literal optional).
   * Skips the same dirs as `search()`, plus files over 1MB and binaries —
   * one giant match list must never flood the model.
   */
  async grep(
    query: unknown,
    opts?: { path?: unknown; max?: unknown; ignoreCase?: unknown; literal?: unknown },
  ): Promise<{ query: string; pattern: string; total: number; hits: GrepHit[]; truncated: boolean }> {
    if (typeof query !== 'string' || !query.trim() || query.length > 500) {
      throw new FileError('bad_query', 'grep needs a query of 1-500 chars', 400);
    }
    const needle = query.trim();
    const literal = opts?.literal === true;
    const flags = opts?.ignoreCase === true ? 'gi' : 'g';
    let re: RegExp;
    try {
      re = new RegExp(literal ? needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : needle, flags);
    } catch {
      throw new FileError('bad_pattern', `Invalid regular expression: ${needle}`, 400);
    }
    const sub = typeof opts?.path === 'string' && opts.path.trim() ? opts.path.trim() : '.';
    const base = resolveInRoot(this.root, sub);
    const limit = clampCount(opts?.max, 80, 400);
    const hits: GrepHit[] = [];
    let total = 0;
    let truncated = false;
    for await (const relPath of this.walkFiles(base)) {
      if (relPath.includes('min.js') || relPath.endsWith('.map')) continue;
      const abs = resolve(this.root, relPath);
      let buf: Buffer;
      try {
        const s = await stat(abs);
        if (s.size > GREP_MAX_FILE_BYTES || s.size === 0) continue;
        buf = await readFile(abs);
      } catch {
        continue;
      }
      if (buf.subarray(0, 8192).includes(0)) continue;
      const lines = buf.toString('utf-8').split('\n');
      const matches: GrepMatch[] = [];
      for (let i = 0; i < lines.length && matches.length < GREP_MAX_PER_FILE; i++) {
        const text = lines[i] ?? '';
        re.lastIndex = 0;
        if (re.test(text)) matches.push({ line: i + 1, text: text.length > 400 ? `${text.slice(0, 400)}…` : text });
      }
      if (matches.length === 0) continue;
      total += matches.length;
      hits.push({ path: relPath, matches });
      if (total >= limit) {
        truncated = true;
        break;
      }
    }
    hits.sort((a, b) => a.path.localeCompare(b.path));
    return { query: needle, pattern: re.source, total, hits, truncated };
  }

  /**
   * Exact-string edit (the workhorse Claude-Code tool): replace
   * `oldString` with `newString`. Refuses a missing or ambiguous match
   * instead of guessing, and writes with the sha it just read so a
   * concurrent writer loses the race instead of being clobbered.
   */
  async edit(
    rel: string,
    oldString: unknown,
    newString: unknown,
    opts?: { expectedSha?: unknown; replaceAll?: unknown },
  ): Promise<FileWriteResult & { replacements: number }> {
    if (typeof oldString !== 'string' || !oldString) {
      throw new FileError('bad_edit', 'edit needs a non-empty oldString', 400);
    }
    if (typeof newString !== 'string') {
      throw new FileError('bad_edit', 'edit needs a string newString', 400);
    }
    if (oldString === newString) {
      throw new FileError('bad_edit', 'oldString and newString are identical — nothing to do', 400);
    }
    const current = await this.read(rel);
    if (opts?.expectedSha !== undefined && opts.expectedSha !== current.sha) {
      throw new FileError(
        'sha_mismatch',
        `File changed on disk since it was read (expected ${String(opts.expectedSha).slice(0, 12)}…, found ${current.sha.slice(0, 12)}…) — read it again`,
        409,
      );
    }
    const first = current.content.indexOf(oldString);
    if (first < 0) {
      throw new FileError(
        'edit_not_found',
        `oldString was not found in ${rel} — read the file and copy the exact text (whitespace matters)`,
        400,
      );
    }
    const replaceAll = opts?.replaceAll === true;
    const occurrences = current.content.split(oldString).length - 1;
    if (occurrences > 1 && !replaceAll) {
      throw new FileError(
        'edit_not_unique',
        `oldString matches ${occurrences} places in ${rel} — add surrounding context to make it unique, or pass replaceAll: true`,
        400,
      );
    }
    const next = replaceAll
      ? current.content.split(oldString).join(newString)
      : current.content.slice(0, first) + newString + current.content.slice(first + oldString.length);
    const written = await this.write(rel, next, current.sha);
    return { ...written, replacements: replaceAll ? occurrences : 1 };
  }

  /**
   * Walk every file under `base` (workspace-relative or absolute), newest
   * helper shared by `glob`/`grep`. Yields workspace-relative paths.
   */
  private async *walkFiles(base?: string): AsyncGenerator<string> {
    const start = base ?? this.root;
    const stack: string[] = [start];
    let visited = 0;
    while (stack.length && visited < WALK_MAX_DIRS) {
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
        if (s.isDirectory()) {
          if (SKIPPED_DIRS.has(name)) continue;
          if (toRel(this.root, abs).split('/').length <= 12) stack.push(abs);
          continue;
        }
        if (!s.isFile()) continue;
        yield toRel(this.root, abs);
      }
    }
  }
}
