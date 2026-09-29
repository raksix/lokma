/**
 * SingleChatView probe for REQ-111 (live tool rows interleave in flow order).
 * Run: `bun src/components/chat/single-chat-view.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import type { ToolCallEntry } from '@/lib/ws';
import { interleaveLiveBlocks, liveAfterPersisted, promptAnchors, promptLabel } from './single-chat-view';
import type { TranscriptMessage } from './single-chat-view';

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

// ---------------------------------------------------------------- REQ-140
// The rail lists the user's own prompts only, and a click must land on the
// prompt row — which only user/assistant rows carry (`chat-msg-<index>`).

function msg(role: string, content: string): TranscriptMessage {
  return { role, content };
}

// 8. Only `user` rows become anchors — assistant/tool/thinking rows are skipped.
const mixed = [
  msg('user', 'first prompt'),
  msg('assistant', 'answer'),
  msg('thinking', 'thought'),
  msg('tool', '{"tool":"read"}'),
  msg('user', 'second prompt'),
];
let anchors = promptAnchors(mixed);
assert(anchors.length === 2, 'anchors cover user prompts only');
assert(anchors[0].index === 0 && anchors[1].index === 4, 'anchors keep absolute transcript indices');
assert(anchors[0].label === 'first prompt', 'anchor label is the prompt text');

// 9. Rails read the whole transcript, so a prompt above the render window still
//    gets a dot; its index stays the scroll target.
anchors = promptAnchors([msg('user', 'old prompt'), msg('assistant', 'x'), msg('user', 'later prompt')]);
assert(anchors.length === 2 && anchors[1].index === 2, 'anchors cover prompts outside the render window too');

// 9b. Identical prompt text still yields one dot per send: anchors are keyed by
//     transcript index, not by text, so a repeated prompt (the live probe sends
//     PROMPT RAIL PROBE TWO twice) must not be collapsed into one dot.
anchors = promptAnchors([
  msg('user', 'PROMPT RAIL PROBE TWO'),
  msg('assistant', 'first answer'),
  msg('user', 'PROMPT RAIL PROBE TWO'),
]);
assert(anchors.length === 2, 'identical prompts each get their own dot');
assert(anchors[0].label === anchors[1].label, 'identical prompts share the same label text');
assert(anchors[0].index === 0 && anchors[1].index === 2, 'identical prompts keep distinct scroll targets');

// 10. No prompts → no rail (empty sessions stay clean).
assert(promptAnchors([msg('assistant', 'a'), msg('tool', 'b')]).length === 0, 'no user rows means no dots');

// 11. Labels are single-line and capped, so long prompts stay readable.
assert(promptLabel('line one\nline two') === 'line one line two', 'newlines collapse to one line');
assert(promptLabel('x'.repeat(80)).length === 48, 'long prompt is capped at 48 chars');
assert(promptLabel('x'.repeat(80)).endsWith('…'), 'capped label ends with an ellipsis');
assert(promptLabel('   ') === 'Empty prompt', 'blank prompt still gets a label');

console.log('single-chat-view.test.ts: all REQ-140 prompt-rail checks passed');

// ---------------------------------------------------------------- REQ-170
// The transcript is canonical: a call (or text) that already landed as a
// transcript row must not paint a second time in the live layer while the
// run is still going (the user saw every tool call twice: timeline + live).

function toolRow(callId: string, tool = 'read_file'): TranscriptMessage {
  return { role: 'tool', content: JSON.stringify({ tool, ok: true, result: 'ok' }), toolName: tool, toolCallId: callId };
}

// 12. A completed call leaves the live layer (its transcript row is canonical);
//     the call that is still running stays.
let live = liveAfterPersisted(
  'looking',
  [{ callId: 'c1', at: 7 }, { callId: 'c2', at: 7 }],
  { c1: call('read_file'), c2: call('write_file') },
  '',
  [msg('user', 'do it'), toolRow('c1')],
);
assert(live.blocks.filter((b) => b.kind === 'tool').length === 1, 'completed call no longer painted live');
assert(live.blocks.some((b) => b.kind === 'tool' && b.callId === 'c2'), 'the still-running call keeps its live row');
assert(!live.blocks.some((b) => b.kind === 'tool' && b.callId === 'c1'), 'persisted call id is gone from live');

// 13. Persisted assistant text is consumed — only the new tail paints.
live = liveAfterPersisted('done part and more', [], {}, '', [msg('user', 'q'), msg('assistant', 'done part')]);
assert(live.blocks.length === 1 && live.blocks[0].kind === 'text' && live.blocks[0].text === ' and more', 'persisted text prefix is not painted twice');

// 14. Rows above the last user row never absorb the fresh run's buffer.
live = liveAfterPersisted('hello', [], {}, '', [msg('user', 'old'), msg('assistant', 'hello'), msg('user', 'new')]);
assert(live.blocks.length === 1 && live.blocks[0].kind === 'text' && live.blocks[0].text === 'hello', 'earlier runs never consume the fresh stream');

// 15. Whitespace at a row edge (the server trims) still matches.
live = liveAfterPersisted('hello world', [], {}, '', [msg('user', 'q'), msg('assistant', 'hello')]);
assert(live.blocks.length === 1 && live.blocks[0].kind === 'text' && live.blocks[0].text === ' world', 'trimmed row edges still consume');

// 16. Buffers that disagree fail open — nothing is swallowed.
live = liveAfterPersisted('totally different', [], {}, '', [msg('user', 'q'), msg('assistant', 'hello')]);
assert(live.blocks.length === 1 && live.blocks[0].kind === 'text' && live.blocks[0].text === 'totally different', 'a mismatch shows the live buffer untouched');

// 17. Marks rebase onto the trimmed buffer so text still interleaves.
live = liveAfterPersisted(
  'AB',
  [{ callId: 'cX', at: 1 }, { callId: 'c2', at: 2 }],
  { cX: call('a'), c2: call('b') },
  '',
  [msg('user', 'q'), msg('assistant', 'A'), toolRow('cX')],
);
assert(
  live.blocks.length === 2 && live.blocks[0].kind === 'text' && live.blocks[0].text === 'B' && live.blocks[1].kind === 'tool' && live.blocks[1].callId === 'c2',
  'rebased marks keep text-before-live-tool order',
);

// 18. Thinking consumes its persisted prefix (only when such rows are shown —
//     the chat filter drops persisted thinking, so the live copy stays).
live = liveAfterPersisted('', [], {}, 'step onestep two more', [msg('user', 'q'), msg('thinking', 'step one'), msg('thinking', 'step two')]);
assert(live.thinking === ' more', 'persisted thinking is cut from the live block');
live = liveAfterPersisted('', [], {}, 'reasoning here', [msg('user', 'q')]);
assert(live.thinking === 'reasoning here', 'thinking survives when the transcript carries none');

// 19. An unparseable tool row must NOT hide the call — the timeline renders
//     nothing for it, so the live row is the only copy.
live = liveAfterPersisted('', [], { c1: call('read_file') }, '', [msg('user', 'q'), { role: 'tool', content: 'not json', toolCallId: 'c1' }]);
assert(live.blocks.some((b) => b.kind === 'tool' && b.callId === 'c1'), 'unparseable rows never swallow a live call');

// 20. No transcript at all = yesterday's behavior (regression guard).
live = liveAfterPersisted('hello', [{ callId: 'c1', at: 5 }], { c1: call('read') }, 'think', []);
assert(live.blocks.length === 2 && live.blocks[1].kind === 'tool' && live.thinking === 'think', 'empty transcript leaves the live layer untouched');

console.log('single-chat-view.test.ts: all REQ-170 live-dedupe checks passed');
