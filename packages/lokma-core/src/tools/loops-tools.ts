import { z } from 'zod';
import { cwdLockConflict, createLoop, listLoops, LoopError, normalizeLoopCwd } from '../loops/index.js';
import type { ToolDefinition } from './registry.js';

/**
 * Loop tool family (REQ-201 kapsam 4) — the second half of the user's sentence
 * ("looplar biz ya da agent oluşturunca …"): the agent drives the SAME store
 * `POST /api/loops` calls, so a loop the agent creates is the same record the
 * console lists, with `origin: 'agent'` stamped so the UI can tell whose it is.
 *
 * Two rules this file owns, both measured rather than assumed:
 *
 * 1. **Creating is not starting.** `createLoop` writes a `draft` — it does not
 *    claim the cwd and does not enqueue a turn. An agent that creates a
 *    background loop must not silently start spending tokens, so the return
 *    carries the record AND `nextStep` (what the user does with it). A return
 *    value that leaves the caller with nothing to do is the same hole as a
 *    refusal without an install command.
 *
 * 2. **A second loop in a live cwd is refused BY NAME.** The store only claims
 *    the lock at `draft → running`, so two drafts in one directory both pass
 *    creation and collide later at start — the honest refusal then arrives at
 *    the worst moment, with only a lock id. So the tool checks FIRST and names
 *    the loop that already works there (name + id), which is what kapsam 5
 *    asks for. Terminal loops (`done`/`error`) never block: history is kept
 *    and a new run is the normal way forward.
 *
 * `cwd_locked` refusals come back as `{ ok: false, code, message }`, never as a
 * silent no-op, and the message names the holder because the caller's only way
 * to proceed is to use a different directory.
 */

/** What the UI needs from a `create_loop` frame — the panel surfaces it live. */
export type LoopCreateUiAction = {
  loopId: string;
  loopName: string;
};

export type LoopToolsOpts = {
  /**
   * Forwards the created loop as a `ui_action` frame (REQ-181's frame
   * contract) so the console shows it without a refresh. Optional: CLI and
   * test hosts without a UI skip the frame and the tool still answers.
   */
  emit?: (payload: { action: 'open_loop'; loopId: string; loopName: string }) => void;
};

const LoopListInput = z.object({
  /** Restrict to one project (`-` = project-less loops, as the route does). */
  projectId: z.string().min(1).max(64).optional(),
  /** Include the ledger tail per loop (verbose; off by default). */
  verbose: z.boolean().optional(),
});

const LoopCreateInput = z.object({
  /** Short human name — the console lists loops by name, so it must be one. */
  name: z.string().min(1).max(80),
  /** Absolute workspace directory this loop works in (its lock target). */
  cwd: z.string().min(1).max(1024),
  /** The task replayed every iteration. */
  prompt: z.string().min(1).max(20_000),
  /** Owning project, when the loop is project-scoped (REQ-203 groups by it). */
  projectId: z.string().min(1).max(64).nullish(),
  /** `manual` (default) waits for a press; `interval` repeats every N minutes. */
  trigger: z
    .object({
      kind: z.enum(['manual', 'interval', 'cron']).optional(),
      intervalMinutes: z.number().min(1).max(10_000).nullish(),
      schedule: z.string().min(1).max(120).nullish(),
      cooldownSeconds: z.number().int().min(0).max(86_400).nullish(),
      maxEmptyIters: z.number().int().min(1).max(100).nullish(),
    })
    .optional(),
  /** Ceilings; `maxUsd: 0` is the deliberate off switch (never runs). */
  budget: z
    .object({
      maxIters: z.number().int().min(1).max(1_000_000).optional(),
      maxHours: z.number().min(0.01).max(10_000).optional(),
      maxUsd: z.number().min(0).max(100_000).optional(),
    })
    .optional(),
  /** Stop score the loop aims at (`target_reached`). */
  target: z.string().max(500).nullish(),
  /** Model override; omit to inherit the session's model. */
  model: z.string().min(1).max(200).optional(),
});

export const LOOP_TOOL_NAMES = ['loop_list', 'loop_create'] as const;

/** One row for the agent: the fields a decision needs, not the whole record. */
function loopSummary(loop: {
  id: string;
  name: string;
  cwd: string;
  projectId: string | null;
  status: string;
  stopReason: string | null;
  origin: string;
  trigger: { kind: string };
  spent: { iters: number; usd: number; tokens: number };
  budget: { maxIters: number; maxUsd: number };
  lastRunOutcome: string | null;
}): Record<string, unknown> {
  return {
    id: loop.id,
    name: loop.name,
    cwd: loop.cwd,
    projectId: loop.projectId,
    status: loop.status,
    stopReason: loop.stopReason,
    origin: loop.origin,
    trigger: loop.trigger.kind,
    iters: `${loop.spent.iters}/${loop.budget.maxIters}`,
    usd: `${loop.spent.usd}/${loop.budget.maxUsd}`,
    tokens: loop.spent.tokens,
    lastRunOutcome: loop.lastRunOutcome,
  };
}

/** Terminal loops keep their history and never block a new one in the same cwd. */
const BLOCKING_STATUSES: ReadonlySet<string> = new Set(['draft', 'running', 'paused']);

/**
 * Who already works in this directory. Two answers, both named: an existing
 * non-terminal LOOP (`loop:<id>` owner or a plain record) and a live agent lock
 * (`agent:<id>`), which the loop store would otherwise only report at start.
 */
async function cwdOccupant(cwd: string): Promise<{ id: string; name: string; status: string } | null> {
  const target = normalizeLoopCwd(cwd);
  // Live lock first: it is the authoritative "someone is editing right now",
  // and it covers AGENT owners the loop records do not know about.
  const conflict = await cwdLockConflict('', target);
  if (conflict) {
    const heldId = conflict.holderLoopId;
    // A lock owner is only an id — resolve the record so the refusal names the
    // loop the user will recognise, not "an existing loop", and reports the
    // status it is REALLY in rather than assuming `running`.
    if (heldId) {
      for (const loop of await listLoops()) {
        if (loop.id === heldId) return { id: heldId, name: loop.name, status: loop.status };
      }
      return { id: heldId, name: 'a loop with no readable record', status: 'running' };
    }
    return { id: conflict.holder, name: `agent ${conflict.holder}`, status: 'running' };
  }
  for (const loop of await listLoops()) {
    if (BLOCKING_STATUSES.has(loop.status) && normalizeLoopCwd(loop.cwd) === target) {
      return { id: loop.id, name: loop.name, status: loop.status };
    }
  }
  return null;
}

export function buildLoopTools(opts: LoopToolsOpts = {}): ToolDefinition[] {
  return [
    {
      name: 'loop_list',
      description:
        'List the harness loops with their status, trigger, spent budget and last turn outcome — the same records the Loops console renders.',
      inputSchema: LoopListInput,
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async (input) => {
        const { projectId, verbose } = (input ?? {}) as z.infer<typeof LoopListInput>;
        try {
          const all = await listLoops();
          const loops = projectId === undefined ? all : all.filter((l) => (projectId === '-' ? l.projectId === null : l.projectId === projectId));
          return { ok: true, count: loops.length, loops: loops.map((l) => loopSummary(l)) };
        } catch (e) {
          if (e instanceof LoopError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'loop_create',
      description:
        'Create a repeating loop in this workspace: a task prompt, the directory it works in, and a trigger (manual by default, or interval/cron to repeat). It is created as a draft — report the loop id back so the user can start it.',
      inputSchema: LoopCreateInput,
      readOnly: false,
      maxResultSizeChars: 6_000,
      handler: async (input) => {
        const parsed = LoopCreateInput.safeParse(input ?? {});
        if (!parsed.success) {
          return { ok: false, code: 'bad_input', message: parsed.error.issues[0]?.message ?? 'invalid arguments' };
        }
        const data = parsed.data;
        try {
          const occupant = await cwdOccupant(data.cwd);
          if (occupant) {
            return {
              ok: false,
              code: 'cwd_locked',
              message: `${normalizeLoopCwd(data.cwd)} is already worked on by loop "${occupant.name}" (${occupant.id}, ${occupant.status}) — use another directory, or stop that loop first`,
            };
          }
          const loop = await createLoop({
            name: data.name,
            cwd: data.cwd,
            prompt: data.prompt,
            projectId: data.projectId ?? null,
            // Stamped, not defaulted: the console must be able to say whose loop
            // this is without asking the model.
            origin: 'agent',
            trigger: data.trigger,
            budget: data.budget,
            target: data.target ?? null,
            model: data.model,
          });
          opts.emit?.({ action: 'open_loop', loopId: loop.id, loopName: loop.name });
          return {
            ok: true,
            loopId: loop.id,
            status: loop.status,
            loop: loopSummary(loop),
            // Narrows on the discriminated union: `interval` has the number,
            // `cron` has the schedule, `event`/`manual` have neither — asking
            // for a field the kind does not carry is the TS error the compiler
            // hands us for free.
            nextStep:
              loop.trigger.kind === 'manual'
                ? 'start it from the Loops console (or run one turn)'
                : loop.trigger.kind === 'interval'
                  ? `it repeats every ${loop.trigger.intervalMinutes} min — start it from the Loops console`
                  : loop.trigger.kind === 'cron'
                    ? `it fires on "${loop.trigger.schedule}" — start it from the Loops console`
                    : `it fires on ${loop.trigger.event} — start it from the Loops console`,
          };
        } catch (e) {
          if (e instanceof LoopError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}