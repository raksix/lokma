/**
 * Composer thinking picker probe (REQ-133) — the persisted level is what
 * later prompts read, so the fallbacks matter more than the happy path.
 * Run: `bun src/components/chat/composer.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 */
import { PROMPT_FILE_CHAR_CAP } from '@lokma/shared/protocol/ws';
import { readThinking, promptFilesFor, sendDedupeKey, type Attachment } from './composer';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

/** Minimal attachment factory for the pure wire/guard helpers (REQ-187). */
function att(over: Partial<Attachment> & Pick<Attachment, 'name' | 'kind'>): Attachment {
  return {
    mime: 'text/plain',
    size: 10,
    content: 'hello',
    ...over,
  } as Attachment;
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

// 3. Every rung of the REQ-139 ladder survives a reload (Hermes parity).
for (const level of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const) {
  store.set('lokma-composer-thinking', level);
  assert(readThinking() === level, `the ${level} rung is honoured`);
}

// 4. A stale value (older pick, typo, hand-edited storage) degrades to off.
store.set('lokma-composer-thinking', 'ultra');
assert(readThinking() === 'off', 'a stale value degrades to off');

// 5. Private mode / blocked storage must not break the composer.
globals.localStorage = {
  getItem: () => {
    throw new Error('storage denied');
  },
};
assert(readThinking() === 'off', 'a throwing storage degrades to off');

console.log('composer.test.ts: thinking picker checks passed');

// ── REQ-187: attachment → wire payload helpers ─────────────────────────────
// 6. Text/files ride `files`; images never do (they ride `images` as bytes).
const textAtt = att({ name: 'notes.md', kind: 'text', mime: 'text/markdown', size: 2048, content: '# Notes' });
const imageAtt = att({ name: 'shot.png', kind: 'image' });
const mixed = [textAtt, imageAtt, att({ name: 'data.json', kind: 'text', content: '{"a":1}' })];
const wire = promptFilesFor(mixed);
assert(wire.length === 2, 'only text-kind attachments become files');
assert(wire[0]?.name === 'notes.md' && wire[0]?.mime === 'text/markdown' && wire[0]?.size === 2048, 'metadata survives');
assert(wire[1]?.content === '{"a":1}', 'content survives');
assert(promptFilesFor([imageAtt]).length === 0, 'images never become files');

// 7. The cap is the shared protocol cap (one constant owns the budget).
assert(PROMPT_FILE_CHAR_CAP === 100_000, 'inline budget follows the shared cap');

// 8. Dedupe key: same text + same names collapses; same text + different
// files does NOT (a file swap must never be swallowed as a double Enter).
const keyA = sendDedupeKey('hello', [textAtt]);
assert(sendDedupeKey('hello', [textAtt]) === keyA, 'identical payloads share a key');
assert(sendDedupeKey('hello', []) !== keyA, 'attachment-free text differs from attached');
assert(sendDedupeKey('hello', [att({ name: 'other.txt', kind: 'text' })]) !== keyA, 'a file swap changes the key');

console.log('composer.test.ts: REQ-187 attachment helpers passed');
