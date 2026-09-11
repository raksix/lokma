/**
 * Composer thinking picker probe (REQ-133) — the persisted level is what
 * later prompts read, so the fallbacks matter more than the happy path.
 * Run: `bun src/components/chat/composer.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 */
import { readThinking } from './composer';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const store = new Map<string, string>();
const globals = globalThis as unknown as Record<string, unknown>;
globals.localStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
};

// 1. Nothing stored → the harness sends no reasoning field at all.
assert(readThinking() === 'off', 'an empty store defaults to off');

// 2. A previously picked level survives a reload.
store.set('lokma-composer-thinking', 'high');
assert(readThinking() === 'high', 'a stored level is honoured');

// 3. A stale value (older pick, typo, hand-edited storage) degrades to off.
store.set('lokma-composer-thinking', 'ultra');
assert(readThinking() === 'off', 'a stale value degrades to off');

// 4. Private mode / blocked storage must not break the composer.
globals.localStorage = {
  getItem: () => {
    throw new Error('storage denied');
  },
};
assert(readThinking() === 'off', 'a throwing storage degrades to off');

console.log('composer.test.ts: thinking picker checks passed');
