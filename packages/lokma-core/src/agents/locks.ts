import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha1HexSync } from 'lokma-shared';
import type { Lock } from 'lokma-shared';
import { expandHome, ensureDir } from '../utils/fs.js';

/**
 * Advisory file locks — Layer 1 collision-free primitive.
 * See Docs/30 §10.1 — .agentlocks/locks/<sha1(path)>.json + heartbeat + lease.
 */

const LOCKS_DIR = '.agentlocks/locks';

function lockPath(filePath: string): string {
  const hex = sha1HexSync(filePath);
  return join(expandHome(LOCKS_DIR), `${hex}.json`);
}

export async function acquire(path: string, owner: string, leaseMs = 60_000, reason?: string): Promise<{ ok: true; lock: Lock } | { ok: false; holder: string; until: number; path: string }> {
  const lp = lockPath(path);
  try {
    const raw = await readFile(lp, 'utf-8');
    const existing = JSON.parse(raw) as Lock;
    if (existing.leaseUntil > Date.now()) {
      return { ok: false, holder: existing.owner, until: existing.leaseUntil, path };
    }
  } catch {}
  const lock: Lock = { path, owner, acquiredAt: Date.now(), leaseUntil: Date.now() + leaseMs, mode: 'exclusive', reason };
  await ensureDir(LOCKS_DIR);
  await writeFile(lp, JSON.stringify(lock, null, 2), 'utf-8');
  return { ok: true, lock };
}

export async function release(path: string, owner: string): Promise<boolean> {
  const lp = lockPath(path);
  try {
    const raw = await readFile(lp, 'utf-8');
    const existing = JSON.parse(raw) as Lock;
    if (existing.owner !== owner) return false;
    await rm(lp, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function heartbeat(path: string, owner: string, leaseMs = 60_000): Promise<boolean> {
  const lp = lockPath(path);
  try {
    const raw = await readFile(lp, 'utf-8');
    const existing = JSON.parse(raw) as Lock;
    if (existing.owner !== owner) return false;
    existing.leaseUntil = Date.now() + leaseMs;
    await writeFile(lp, JSON.stringify(existing, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** Every lock file on disk (live + expired) — callers split by `leaseUntil`. */
export async function listLocks(): Promise<Lock[]> {
  const dir = expandHome(LOCKS_DIR);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: Lock[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      const raw = await readFile(join(dir, name), 'utf-8');
      const lock = JSON.parse(raw) as Lock;
      if (typeof lock.path === 'string' && typeof lock.owner === 'string') out.push(lock);
    } catch {
      // Corrupt lock files are skipped, never fatal.
    }
  }
  return out;
}
