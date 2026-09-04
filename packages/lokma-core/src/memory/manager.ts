import { readFile, writeFile } from 'node:fs/promises';
import { expandHome, ensureDir } from '../utils/fs.js';
import { dirname } from 'node:path';

/**
 * Memory manager — §-delimited MEMORY.md / USER.md.
 * Frozen snapshot injected at session start; memory tool does add/replace/remove.
 * Failures throw `MemoryError` (`{ code, message }` over the wire — the same
 * contract as `VaultError`/`SkillError`), so the agent loop and the REST
 * route share one code path. See Docs/28-MEMORY-infinite-vault-graph §5.2.
 */

const SEP = '\n§\n';

/** Char budgets — Hermes parity (Docs/28 §1.1). */
export const MEMORY_LIMITS = { memory: 20000, user: 5000 } as const;

export type MemoryTargetName = 'memory' | 'user';

export class MemoryError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'MemoryError';
    this.code = code;
    this.status = status;
  }
}

function assertTarget(target: unknown): asserts target is MemoryTargetName {
  if (target !== 'memory' && target !== 'user') {
    throw new MemoryError('bad_target', 'target must be "memory" or "user"', 400);
  }
}

export async function readMemory(target: 'memory' | 'user'): Promise<string[]> {
  const path = target === 'memory' ? '~/.lokma/memories/MEMORY.md' : '~/.lokma/memories/USER.md';
  try {
    const raw = await readFile(expandHome(path), 'utf-8');
    return raw.split(SEP).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function writeMemory(target: 'memory' | 'user', entries: string[]): Promise<void> {
  const path = target === 'memory' ? '~/.lokma/memories/MEMORY.md' : '~/.lokma/memories/USER.md';
  const full = expandHome(path);
  await ensureDir(dirname(full));
  const content = entries.join(SEP) + (entries.length ? '\n' : '');
  await writeFile(full, content, 'utf-8');
}

export type MemoryUsage = {
  target: MemoryTargetName;
  entries: string[];
  count: number;
  chars: number;
  limit: number;
  /** Live `"<chars>/<limit>"` string — Docs/28 §5.2 overflow shape. */
  usage: string;
};

/** Read entries plus the live budget line (drives the REST GET + overflow errors). */
export async function readMemoryEntries(target: unknown): Promise<MemoryUsage> {
  assertTarget(target);
  const entries = await readMemory(target);
  const chars = entries.join(SEP).length;
  const limit = MEMORY_LIMITS[target];
  return { target, entries, count: entries.length, chars, limit, usage: `${chars}/${limit}` };
}

function assertContent(content: unknown): asserts content is string {
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new MemoryError('empty_content', 'content must be a non-empty string', 400);
  }
}

function assertOldText(oldText: unknown): asserts oldText is string {
  if (typeof oldText !== 'string' || oldText.length === 0) {
    throw new MemoryError('empty_old_text', 'old_text must be a non-empty string', 400);
  }
}

export async function memoryAdd(
  target: 'memory' | 'user',
  content: string,
): Promise<{ ok: boolean; entries?: string[] }> {
  assertTarget(target);
  assertContent(content);
  const entries = await readMemory(target);
  if (entries.includes(content)) return { ok: true }; // dedup exact
  const limit = MEMORY_LIMITS[target];
  const next = [...entries, content];
  const size = next.join(SEP).length;
  if (size > limit) {
    // Echo live entries so the caller can self-repair in the same turn (Docs/28 §5.2).
    throw new MemoryError(
      'memory_full',
      `Memory at ${size}/${limit}, consolidate: replace/remove stale entries`,
      409,
    );
  }
  await writeMemory(target, next);
  return { ok: true };
}

export async function memoryReplace(
  target: 'memory' | 'user',
  oldText: string,
  newText: string,
): Promise<{ ok: boolean; entries?: string[] }> {
  assertTarget(target);
  assertOldText(oldText);
  assertContent(newText);
  const entries = await readMemory(target);
  const matches = entries.filter((e) => e.includes(oldText));
  if (matches.length === 0) throw new MemoryError('no_match', 'No entry matching old_text', 404);
  if (matches.length > 1) {
    throw new MemoryError(
      'ambiguous_match',
      `Multiple entries match old_text (${matches.length})`,
      409,
    );
  }
  const idx = entries.findIndex((e) => e.includes(oldText));
  entries[idx] = newText;
  await writeMemory(target, entries);
  return { ok: true };
}

export async function memoryRemove(
  target: 'memory' | 'user',
  oldText: string,
): Promise<{ ok: boolean; entries?: string[] }> {
  assertTarget(target);
  assertOldText(oldText);
  const entries = await readMemory(target);
  const matches = entries.filter((e) => e.includes(oldText));
  if (matches.length === 0) throw new MemoryError('no_match', 'No entry matching old_text', 404);
  if (matches.length > 1) {
    throw new MemoryError(
      'ambiguous_match',
      `Multiple entries match old_text (${matches.length})`,
      409,
    );
  }
  const next = entries.filter((e) => !e.includes(oldText));
  await writeMemory(target, next);
  return { ok: true };
}
