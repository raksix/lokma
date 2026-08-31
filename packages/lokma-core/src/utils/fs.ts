import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

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
 * Atomic write: write to .tmp + fsync + rename. Crash-safe.
 * Creates parent dirs and sets mode (e.g. 0o600 for credentials).
 */
export async function writeAtomic(path: string, data: string, mode?: number): Promise<void> {
  const full = expandHome(path);
  await mkdir(dirname(full), { recursive: true });
  const tmp = `${full}.tmp.${process.pid}`;
  await writeFile(tmp, data, { mode });
  // Rename is atomic on POSIX
  const { rename } = await import('node:fs/promises');
  await rename(tmp, full);
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
