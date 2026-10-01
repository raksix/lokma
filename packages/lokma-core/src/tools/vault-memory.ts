import { z } from 'zod';
import {
  MemoryError,
  memoryAdd,
  memoryRemove,
  memoryReplace,
  readMemoryEntries,
} from '../memory/index.js';
import { VaultError, searchNotesDetailed } from '../vault/index.js';
import type { ToolDefinition } from './registry.js';

/**
 * Vault + Memory tool family (REQ-181 wave 2) — the agent uses the SAME
 * core modules the Vault and Memory surfaces call: `vault/fts.ts` drives the
 * full-text search (FTS5 with an honest substring fallback, engine reported
 * per call) and `memory/manager.ts` owns the entry-level reads/writes with
 * single-match guards and the live budget line. Failures come back as
 * `{ ok: false, code, message }` — never as silent no-ops or fabricated hits.
 */

/** Snippets are a preview; the full note is one `vault_search` folder away. */
const VAULT_SNIPPET_CAP = 240;

const VaultSearchInput = z.object({
  /** Search terms; omit to list the newest notes (folder-browser mode). */
  q: z.string().max(200).optional(),
  /** Folder prefix inside the vault, e.g. `projeler` or `projeler/lokma`. */
  folder: z.string().max(200).optional(),
});

const MemoryTarget = z.enum(['memory', 'user']);

const MemoryReadInput = z.object({ target: MemoryTarget });

const MemoryWriteInput = z.object({
  op: z.enum(['add', 'replace', 'remove']),
  target: MemoryTarget,
  /** Body for `op=add`. */
  content: z.string().min(1).max(20_000).optional(),
  /** Anchor for `op=replace`/`op=remove` — must match exactly one entry. */
  old_text: z.string().min(1).max(2_000).optional(),
  /** Body for `op=replace`. */
  new_text: z.string().min(1).max(20_000).optional(),
});

export const VAULT_MEMORY_TOOL_NAMES = ['vault_search', 'memory_read', 'memory_write'] as const;

export function buildVaultMemoryTools(): ToolDefinition[] {
  return [
    {
      name: 'vault_search',
      description:
        'Full-text search the memory vault (FTS5 with a substring fallback) and return matching notes — path, title and a snippet; an empty query lists the newest notes.',
      inputSchema: VaultSearchInput,
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async (input) => {
        const { q, folder } = input as z.infer<typeof VaultSearchInput>;
        try {
          const { hits, engine } = await searchNotesDetailed(q, folder ?? '');
          return {
            ok: true,
            count: hits.length,
            engine,
            hits: hits.map((h) => ({
              path: h.path,
              title: h.title,
              tags: h.tags,
              snippet: h.snippet.slice(0, VAULT_SNIPPET_CAP),
            })),
          };
        } catch (e) {
          if (e instanceof VaultError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'memory_read',
      description:
        "Read the agent's memory file ('memory') or the user profile file ('user') — every entry plus the live budget line.",
      inputSchema: MemoryReadInput,
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async (input) => {
        const { target } = input as z.infer<typeof MemoryReadInput>;
        const { entries, count, usage } = await readMemoryEntries(target);
        return { ok: true, target, usage, count, entries };
      },
    },
    {
      name: 'memory_write',
      description:
        'Add, replace or remove one entry in the agent memory or user profile file — single-match anchors, and the fresh budget line comes back after the write.',
      inputSchema: MemoryWriteInput,
      readOnly: false,
      maxResultSizeChars: 4_000,
      handler: async (input) => {
        const { op, target, content, old_text, new_text } = input as z.infer<typeof MemoryWriteInput>;
        try {
          if (op === 'add') {
            if (!content) return { ok: false, code: 'missing_content', message: 'op=add needs `content`' };
            await memoryAdd(target, content);
          } else if (op === 'replace') {
            if (!old_text || !new_text) {
              return { ok: false, code: 'missing_args', message: 'op=replace needs `old_text` and `new_text`' };
            }
            await memoryReplace(target, old_text, new_text);
          } else {
            if (!old_text) return { ok: false, code: 'missing_args', message: 'op=remove needs `old_text`' };
            await memoryRemove(target, old_text);
          }
          const { count, usage } = await readMemoryEntries(target);
          return { ok: true, op, target, count, usage };
        } catch (e) {
          if (e instanceof MemoryError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
