/**
 * SingleChatView probe for REQ-111 (live tool rows interleave in flow order).
 * Run: `bun src/components/chat/single-chat-view.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import type { ToolCallEntry } from '@/lib/ws';
import { interleaveLiveBlocks } from './single-chat-view';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

function call(tool: string): ToolCallEntry {
  return { tool, input: {} };
}

// 1. Text-only run stays one text block (yesterday's behavior, unchanged).
let blocks = interleaveLiveBlocks('hello', [], {});
assert(blocks.length === 1 && blocks[0].kind === 'text' && blocks[0].text === 'hello', 'text-only is one block');

// 2. Empty run renders nothing.
assert(interleaveLiveBlocks('', [], {}).length === 0, 'empty run has no blocks');

// 3. Text → tool → text → tool interleaves in arrival order.
blocks = interleaveLiveBlocks('looking found it', [{ callId: 'c1', at: 7 }, { callId: 'c2', at: 16 }], {
  c1: call('read'),
  c2: call('write'),
});
assert(blocks.length === 4, 'two marks split text into four blocks');
assert(blocks[0].kind === 'text' && blocks[0].text === 'looking', 'first text slice exact');
assert(blocks[1].kind === 'tool' && blocks[1].callId === 'c1', 'first tool follows first text');
assert(blocks[2].kind === 'text' && blocks[2].text === ' found it', 'middle text slice exact');
assert(blocks[3].kind === 'tool' && blocks[3].callId === 'c2', 'second tool follows middle text');

// 4. Tool before any text renders first (no empty leading text block).
blocks = interleaveLiveBlocks('hi', [{ callId: 'c1', at: 0 }], { c1: call('read') });
assert(blocks.length === 2 && blocks[0].kind === 'tool' && blocks[1].kind === 'text', 'leading tool has no empty text before it');

// 5. Back-to-back tools with no text between render consecutively.
blocks = interleaveLiveBlocks('go', [{ callId: 'c1', at: 2 }, { callId: 'c2', at: 2 }], {
  c1: call('read'),
  c2: call('write'),
});
assert(
  blocks.length === 3 && blocks[0].kind === 'text' && blocks[1].kind === 'tool' && blocks[2].kind === 'tool',
  'adjacent tools render consecutively',
);

// 6. Out-of-range marks clamp instead of corrupting slices.
blocks = interleaveLiveBlocks('hi', [{ callId: 'c1', at: 99 }], { c1: call('read') });
assert(blocks.length === 2 && blocks[0].kind === 'text' && blocks[0].text === 'hi', 'overshoot mark keeps full text first');

// 7. Unmarked entries trail at the end — no call ever disappears.
blocks = interleaveLiveBlocks('hi', [], { c9: call('read') });
assert(blocks.length === 2 && blocks[1].kind === 'tool' && blocks[1].callId === 'c9', 'unmarked call trails, never lost');

console.log('single-chat-view.test.ts: all REQ-111 interleave checks passed');
