import { z } from 'zod';
import { UsageLedger } from '../usage/ledger.js';
import type { ToolDefinition } from './registry.js';

/**
 * Usage tool family (REQ-181 wave 3) — the agent reads the same per-project
 * usage ledger the Usage pane renders (`GET /api/usage`): totals, per-model
 * rows and the daily series for the requested window. Read-only; never
 * mutates the ledger.
 */

const UsageReportInput = z.object({
  /** Window in days (default 7, max 90 — the pane's own range). */
  days: z.number().int().min(1).max(90).optional(),
});

export const USAGE_TOOL_NAMES = ['usage_report'] as const;

export function buildUsageTools(cwd: string): ToolDefinition[] {
  return [
    {
      name: 'usage_report',
      description:
        'Report token and cost usage for the session project: totals, per-model rows and the daily series over the last N days (default 7).',
      inputSchema: UsageReportInput,
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async (input) => {
        const { days } = input as z.infer<typeof UsageReportInput>;
        const ledger = new UsageLedger(cwd);
        const summary = await ledger.summarize(days ?? 7);
        return { ok: true, ...summary };
      },
    },
  ];
}
