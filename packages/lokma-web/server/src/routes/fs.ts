import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, normalize, sep } from 'node:path';
import type { FastifyInstance } from 'fastify';

/**
 * Server directory browser (REQ-084) — powers the folder picker in the
 * New Project modal (`GET /api/fs/list?path=`).
 *
 * Directories ONLY (never file names, never contents), dot-entries hidden
 * (covers `.lokma/`, `.ssh/` and other auth material), 500-entry cap.
 * `path` defaults to the server home; `~` expands to it. The jail is the
 * filesystem root: absolute + normalized, so `..` above `/` collapses and
 * cannot escape (a HOME-only jail would hide `/mnt/apopic`, where this
 * box keeps every project). Gated by the global auth hook like every
 * other `/api/*` route (see `auth-gate-policy.ts`).
 */

export const FS_MAX_PATH_LEN = 500;
export const FS_MAX_ENTRIES = 500;

export type FsDirEntry = { name: string; path: string };

export class FsError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'FsError';
    this.code = code;
    this.status = status;
  }
}

/** Resolve `?path=` to an absolute jailed directory (pure — unit-tested). */
export function resolveFsPath(raw: unknown): string {
  const home = homedir();
  let candidate: string;
  if (raw === undefined || raw === '') {
    candidate = home;
  } else {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > FS_MAX_PATH_LEN || raw.includes('\0')) {
      throw new FsError('bad_path', 'path must be a directory path', 400);
    }
    const trimmed = raw.trim();
    candidate = trimmed === '~' ? home : trimmed.startsWith('~/') ? home + trimmed.slice(1) : trimmed;
  }
  if (!isAbsolute(candidate)) {
    throw new FsError('bad_path', 'path must be absolute (or ~)', 400);
  }
  const resolved = normalize(candidate);
  if (resolved !== sep && !resolved.startsWith(sep)) {
    throw new FsError('outside_root', 'path escapes the filesystem root', 400);
  }
  return resolved;
}

/** True when an entry name is listable (visible directory, not hidden). */
export function isListableDirName(name: string): boolean {
  return name !== '' && !name.startsWith('.');
}

export async function listFsDirs(rawPath: unknown): Promise<{
  path: string;
  parent: string | null;
  home: string;
  entries: FsDirEntry[];
  truncated: boolean;
}> {
  const path = resolveFsPath(rawPath);
  const home = homedir();
  let names: string[];
  try {
    names = await readdir(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') throw new FsError('not_found', `no such directory: ${path}`, 404);
    if (code === 'ENOTDIR') throw new FsError('not_a_directory', `not a directory: ${path}`, 400);
    if (code === 'EACCES' || code === 'EPERM') throw new FsError('forbidden', `cannot list directory: ${path}`, 403);
    throw e;
  }
  const dirs: FsDirEntry[] = [];
  for (const name of names) {
    if (!isListableDirName(name)) continue;
    const full = path === sep ? sep + name : path + sep + name;
    try {
      const st = await stat(full);
      if (st.isDirectory()) dirs.push({ name, path: full });
    } catch {
      // Vanished / unreadable mid-listing — skip, never fail the whole page.
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  const truncated = dirs.length > FS_MAX_ENTRIES;
  return {
    path,
    parent: path === sep ? null : dirname(path),
    home,
    entries: truncated ? dirs.slice(0, FS_MAX_ENTRIES) : dirs,
    truncated,
  };
}

export async function fsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/fs/list', async (req, reply) => {
    const query = req.query as { path?: unknown };
    try {
      return { ok: true, ...(await listFsDirs(query.path)) };
    } catch (e) {
      if (e instanceof FsError) return reply.status(e.status).send({ code: e.code, message: e.message });
      throw e;
    }
  });
}
