import { z } from 'zod';
import {
  TEST_PLAN_CAP,
  TEST_TARGET_LEN_CAP,
  TEST_TARGETS_CAP,
  TEST_TIMEOUT_CAP_MS,
  TestError,
  runTestRun,
  type ExecuteCheck,
} from '../testing/index.js';
import type { ToolDefinition } from './registry.js';

/**
 * Testing Lab tool (REQ-181 wave 1) — the agent runs the same check suite
 * the Testing pane runs: every target is one real GET against THIS server
 * (the host binds an `app.inject`-based runner, so the check exercises the
 * real handler — never a stub), then the outcomes are classified and the
 * plan + bodies scanned for leaked secrets. Without a bound runner the tool
 * answers honestly (`runner_unavailable`) instead of faking a run.
 */

const TestingRunInput = z.object({
  /** What is being verified (the report's plan line). */
  plan: z.string().min(1).max(TEST_PLAN_CAP),
  /** Path targets (`/health`, `/api/models`); omitted = the default set. */
  targets: z
    .array(z.string().min(1).max(TEST_TARGET_LEN_CAP))
    .min(1)
    .max(TEST_TARGETS_CAP)
    .optional(),
  includeShannon: z.boolean().optional(),
  timeoutMs: z.number().int().positive().max(TEST_TIMEOUT_CAP_MS).optional(),
});

/**
 * Build the Testing Lab tool family. `executeCheck` is host-bound: the web
 * server passes its in-process `app.inject` runner; hosts without one get
 * the honest `runner_unavailable` result per call.
 */
export function buildTestingTools(opts: { executeCheck?: ExecuteCheck }): ToolDefinition[] {
  return [
    {
      name: 'testing_run',
      description:
        'Run a Testing Lab check: issue a real GET against each target path on this server, classify the outcomes (contract/env/fragility) and scan for leaked secrets. Use after a change to verify the app still answers.',
      inputSchema: TestingRunInput,
      readOnly: false,
      maxResultSizeChars: 16_000,
      handler: async (input) => {
        if (!opts.executeCheck) {
          return {
            ok: false,
            code: 'runner_unavailable',
            message: 'No HTTP runner is bound in this host — the Testing Lab needs the web server process.',
          };
        }
        const { plan, targets, includeShannon, timeoutMs } = input as z.infer<typeof TestingRunInput>;
        try {
          const { id, report } = await runTestRun(opts.executeCheck, plan, targets, { includeShannon, timeoutMs });
          return {
            ok: true,
            id,
            pass: report.pass,
            fail: report.fail,
            flaky: report.flaky,
            shannon: report.shannon,
            durationMs: report.durationMs,
            tests: report.tests.map((t) => ({
              name: t.name,
              status: t.status,
              ms: t.ms,
              detail: t.detail,
              classification: t.classification ?? null,
            })),
          };
        } catch (e) {
          if (e instanceof TestError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}

/** Names only — cheap index for tests + gates. */
export const TESTING_TOOL_NAMES = ['testing_run'] as const;
