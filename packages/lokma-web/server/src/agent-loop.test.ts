/**
 * Agent-loop history probe (REQ-071).
 * Run: `bun src/agent-loop.test.ts` from `packages/lokma-web/server`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Not imported by server code, so `tsc -p` output ignores it.
 */
import { buildLoopHistory, truncateHistoryText } from './agent-loop';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

const msg = (role: 'user' | 'assistant' | 'tool', content: string, extra?: { toolName?: string; toolCallId?: string }) => ({
  role,
  content,
  timestamp: '2026-09-08T00:00:00.000Z',
  ...extra,
});

// 1. Short text rides untouched.
assert(truncateHistoryText('hi', 8000) === 'hi', 'short text untouched');

// 2. Long text truncates with a visible marker.
const cut = truncateHistoryText('z'.repeat(9000), 8000);
assert(cut.length < 9000 && cut.includes('[truncated 1000 chars]'), 'long text cut + marked');

// 3. One giant message cannot evict the conversation.
const giant = 'G'.repeat(60_000);
const history = buildLoopHistory([
  msg('user', 'remember the word BANANA'),
  msg('assistant', 'Got it, BANANA noted.'),
  msg('assistant', giant),
  msg('user', 'what was the word?'),
]);
const joined = history.map((m) => m.content).join('\n');
assert(joined.includes('BANANA'), 'early conversation survives a 60KB giant');
assert(history[history.length - 1].content === 'what was the word?', 'newest prompt rides whole');
assert(joined.length < 60_000, 'giant truncated in history');

// 4. Huge tool_result JSON shrinks to 2K.
const toolHistory = buildLoopHistory([
  msg('user', 'list files'),
  msg('tool', 'R'.repeat(30_000), { toolName: 'list_files', toolCallId: 't1' }),
  msg('user', 'now write it'),
]);
const toolRow = toolHistory.find((m) => m.content.includes('<tool_result'));
assert(toolRow !== undefined && toolRow.content.length < 5_000, 'tool row truncated');
assert(toolHistory[toolHistory.length - 1].content === 'now write it', 'newest prompt whole after tool row');

console.log(`\nagent-loop probe: ${passed} passed`);
