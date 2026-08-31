import { readFile, writeFile } from 'node:fs/promises';
import { expandHome, ensureDir } from '../utils/fs.js';
import { dirname } from 'node:path';

/**
 * Memory manager — §-delimited MEMORY.md / USER.md.
 * Frozen snapshot injected at session start; memory tool does add/replace/remove.
 * See Docs/28-MEMORY-infinite-vault-graph §1, §5.2
 */

const SEP = '\n§\n';

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

export async function memoryAdd(target: 'memory' | 'user', content: string): Promise<{ ok: boolean; error?: string; entries?: string[] }> {
  const entries = await readMemory(target);
  if (entries.includes(content)) return { ok: true }; // dedup exact
  // Check char limit (20k/5k defaults)
  const limit = target === 'memory' ? 20000 : 5000;
  const next = [...entries, content];
  const size = next.join(SEP).length;
  if (size > limit) {
    return { ok: false, error: `Memory at ${size}/${limit}, consolidate: replace/remove stale entries`, entries };
  }
  await writeMemory(target, next);
  return { ok: true };
}

export async function memoryReplace(target: 'memory' | 'user', oldText: string, newText: string): Promise<{ ok: boolean; error?: string; entries?: string[] }> {
  const entries = await readMemory(target);
  const matches = entries.filter((e) => e.includes(oldText));
  if (matches.length === 0) return { ok: false, error: `No entry matching old_text`, entries };
  if (matches.length > 1) return { ok: false, error: `Multiple entries match old_text (${matches.length})`, entries };
  const idx = entries.findIndex((e) => e.includes(oldText));
  entries[idx] = newText;
  await writeMemory(target, entries);
  return { ok: true };
}

export async function memoryRemove(target: 'memory' | 'user', oldText: string): Promise<{ ok: boolean; error?: string; entries?: string[] }> {
  const entries = await readMemory(target);
  const matches = entries.filter((e) => e.includes(oldText));
  if (matches.length === 0) return { ok: false, error: `No entry matching old_text`, entries };
  if (matches.length > 1) return { ok: false, error: `Multiple entries match old_text (${matches.length})`, entries };
  const next = entries.filter((e) => !e.includes(oldText));
  await writeMemory(target, next);
  return { ok: true };
}
