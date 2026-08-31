import { z } from 'zod';

/**
 * Memory entries are §-delimited (U+00A7) in MEMORY.md / USER.md.
 * Frozen snapshot injected into prompt at session start — see Docs/28.
 */
export const MemoryTargetSchema = z.enum(['memory', 'user']);
export type MemoryTarget = z.infer<typeof MemoryTargetSchema>;

export const MemoryActionSchema = z.enum(['add', 'replace', 'remove']);
export type MemoryAction = z.infer<typeof MemoryActionSchema>;

export const MemoryEntrySchema = z.object({
  content: z.string().min(1),
  createdAt: z.string().datetime().optional(),
  agentId: z.string().optional(), // per-agent scoping (§3.1)
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/** Input for memory tool — substring old_text matching (0 or 2+ matches → error). */
export const MemoryInputSchema = z.object({
  action: MemoryActionSchema,
  target: MemoryTargetSchema.default('memory'),
  content: z.string().optional(),
  old_text: z.string().optional(),
});

export type MemoryInput = z.infer<typeof MemoryInputSchema>;
