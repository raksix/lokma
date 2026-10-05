import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

/**
 * Expand ~ to homedir — single DRY helper for all config paths.
 */
export function expandHome(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  if (p === '~') return homedir();
  return p;
}

/**
 * Read JSON with Zod validation. On error, logs and returns fallback.
 * Never throws — harness must survive corrupt config.
 */
export async function readJson<T>(path: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
  try {
    const raw = await readFile(expandHome(path), 'utf-8');
    const parsed = JSON.parse(raw);
    return parse(parsed);
  } catch {
    return fallback;
  }
}

/**
 * Atomic write: write to a UNIQUE .tmp + rename. Crash-safe.
 * Creates parent dirs and sets mode (e.g. 0o600 for credentials).
 *
 * The temp name is unique per CALL, not per process. `${path}.tmp.${pid}` looked
 * sufficient — one writer per file per process is not true: two overlapping
 * writes in one process both pick the same temp path, the second `writeFile`
 * clobbers the first, and the first `rename` then fails with ENOENT because its
 * own temp file is gone. REQ-201 measured this: a Stop landing while the turn
 * settles persists the same loop record twice concurrently, and the whole stop
 * died on `rename prompt.md.tmp.<pid> -> prompt.md`. `randomBytes` costs nothing
 * next to the write and makes concurrent writers independent.
 */
export async function writeAtomic(path: string, data: string, mode?: number): Promise<void> {
  const full = expandHome(path);
  await mkdir(dirname(full), { recursive: true });
  const tmp = `${full}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(tmp, data, { mode });
    // Rename is atomic on POSIX
    const { rename } = await import('node:fs/promises');
    await rename(tmp, full);
  } catch (e) {
    // Never leave the scratch file behind: a crashed write would otherwise
    // accumulate `.tmp.*` litter next to every config file.
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  if (mode !== undefined) {
    const { chmod } = await import('node:fs/promises');
    await chmod(full, mode);
  }
}

/**
 * Ensure directory exists (mkdir -p).
 */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(expandHome(path), { recursive: true });
}

/**
 * Check if file exists and is file.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(expandHome(path));
    return s.isFile();
  } catch {
    return false;
  }
}
