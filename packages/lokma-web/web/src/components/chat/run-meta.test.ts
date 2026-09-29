/**
 * Run meta line probe (REQ-174) — the line under the transcript must show the
 * thinking level a run applied, and must NOT invent one when the frame has
 * none (engine runs). Plain asserts, no test framework, not part of the app
 * bundle. Run: `bun src/components/chat/run-meta.test.ts` from
 * `packages/lokma-web/web`.
 */
import { runMetaLabel } from './run-meta';
import type { CostTotal } from '@/lib/ws';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}

const base: CostTotal = { inputTokens: 1200, outputTokens: 40, costUsd: 0.001, model: 'deepseek/deepseek-v4.1-flash' };

// 1. No billed run yet → no meta line at all (the old inline gate kept).
assert(runMetaLabel({ ...base, inputTokens: 0, outputTokens: 0 }) === null, 'zero-token session renders no meta line');

// 2. The applied level rides the line as `thinking: high`.
const high = runMetaLabel({ ...base, reasoningEffort: 'high' });
assert(high !== null && high.includes('thinking: high'), 'high run meta shows thinking: high');
assert(high !== null && high.startsWith('1.2k'), 'meta still starts with the compact token count');

// 3. `off` is shown honestly, not hidden — the whole point of the REQ.
const off = runMetaLabel({ ...base, reasoningEffort: 'off' });
assert(off !== null && off.includes('thinking: off'), 'off run meta shows thinking: off');

// 4. Engine frames carry no level → no thinking token (never a guessed one).
const engine = runMetaLabel({ ...base });
assert(engine !== null && !engine.includes('thinking'), 'a level-less frame adds no thinking token');

// 5. The model still rides the line between the cost badge and the level.
assert(high !== null && high.includes('deepseek/deepseek-v4.1-flash · thinking: high'), 'model sits before the level');

console.log('run-meta.test.ts: run meta line checks passed');
