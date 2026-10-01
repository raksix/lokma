/**
 * REQ-181 wave-5 surface-tool probe — the Terminal tool family against a REAL
 * shell. `terminal_write` wraps the same `terminal/terminal.ts` manager the
 * TerminalPane drives: default targeting picks this session's newest live
 * shell, a raw write (enter:false) types without running until Enter arrives,
 * explicit ids are ownership-checked, and dead or unknown shells answer
 * honestly. No network is touched.
 * Run: `bun src/tools/surface-tools-wave5.test.ts` from `packages/lokma-core`.
 */
import { strict as assert } from 'node:assert';
import { READ_TOOLS, WRITE_TOOLS, decideToolCall } from './gate';
import { TERMINAL_TOOL_NAMES, buildTerminalTools } from './terminal-tools';
import { terminalManager } from '../terminal/terminal';
import type { ToolDefinition } from './registry';

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type ToolResult = Record<string, unknown> & { ok: boolean; code?: string };

async function run(tool: ToolDefinition, input: unknown): Promise<ToolResult> {
  return (await tool.handler(input, undefined)) as ToolResult;
}

function countIn(haystack: string, needle: string): number {
  let n = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    n += 1;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return n;
}

// ── Gate classification: the catalog drives these sets (no second list) ──
const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
const PLAN = { allow: [] as string[], deny: [] as string[], defaultMode: 'plan' as const };

check(WRITE_TOOLS.has('terminal_write') && !READ_TOOLS.has('terminal_write'), 'terminal_write derives as a write');
check(WRITE_TOOLS.has('open_terminal') && !READ_TOOLS.has('open_terminal'), 'open_terminal stays write-classified');
check(decideToolCall(AUTO, 'terminal_write') === 'ask', 'auto: terminal_write asks');
check(decideToolCall(PLAN, 'terminal_write') === 'deny', 'plan: terminal_write refused');

// ── Builder exposes exactly the catalog names, in order ──────────────────
const tools = buildTerminalTools({ sessionId: 'wave5-probe' });
check(
  tools.map((t) => t.name).join(',') === TERMINAL_TOOL_NAMES.join(','),
  'terminal builder exposes the catalog names in order',
);
const write = tools[0] as ToolDefinition;
check(write.readOnly !== true, 'terminal_write is not readOnly');
check(
  typeof write.description === 'string' && write.description.trim().length >= 20,
  'description is a real sentence: terminal_write',
);

// ── Live: a REAL shell through the same manager the pane uses ────────────
const fresh = await run(write, { data: 'echo wave5-nope' });
check(fresh.ok === false && fresh.code === 'no_terminal', 'no open shell: terminal_write answers no_terminal');

const spawnedIds: string[] = [];
try {
  const { record } = await terminalManager.spawn({ cwd: process.cwd(), sessionId: 'wave5-probe' });
  spawnedIds.push(record.id);
  check(record.status === 'running' && record.sessionId === 'wave5-probe', 'probe shell is live and session-tagged');

  // Default target: no id passed — the session's newest live shell answers.
  const echo = await run(write, { data: 'echo wave5-ok' });
  check(echo.ok === true && echo.terminalId === record.id, 'default target is the session newest shell (no id passed)');
  check(typeof echo.output === 'string' && (echo.output as string).includes('wave5-ok'), 'the command output lands in the result');

  // Raw typing: enter:false must NOT execute until a newline arrives.
  const raw = await run(write, { data: 'echo wave5-raw', enter: false });
  const rawOut = typeof raw.output === 'string' ? raw.output : '';
  check(raw.ok === true && raw.terminalId === record.id, 'enter:false writes to the same shell');
  check(countIn(rawOut, 'wave5-raw') <= 1, 'enter:false typed the text without a result line (not executed yet)');
  const finish = await run(write, { data: '\n', enter: false });
  check(
    finish.ok === true && (typeof finish.output === 'string' ? finish.output : '').includes('wave5-raw'),
    'a bare newline then runs the pending command',
  );

  // Unknown id: honest not-found (the manager validates the pattern + lookup).
  const bogus = await run(write, { terminalId: 'term_nope5', data: 'echo x' });
  check(bogus.ok === false && bogus.code === 'terminal_not_found', 'unknown terminal id answers terminal_not_found');

  // Ownership: a shell tagged with another session is refused.
  const other = await terminalManager.spawn({ cwd: process.cwd(), sessionId: 'other-session' });
  spawnedIds.push(other.record.id);
  const foreign = await run(write, { terminalId: other.record.id, data: 'echo x' });
  check(foreign.ok === false && foreign.code === 'not_your_terminal', 'a shell from another session is refused');

  // Exited shell: written after kill, answers terminal_exited (never silent).
  await terminalManager.kill(record.id);
  const dead = await run(write, { terminalId: record.id, data: 'echo x' });
  check(dead.ok === false && dead.code === 'terminal_exited', 'an exited shell answers terminal_exited');
  const gone = await run(write, { data: 'echo x' });
  check(gone.ok === false && gone.code === 'no_terminal', 'default targeting skips exited shells');
} finally {
  for (const id of spawnedIds) {
    try {
      await terminalManager.remove(id);
    } catch {
      // Already gone — the cleanup must never mask the real failure.
    }
  }
}

check(terminalManager.list().length === 0, 'cleanup: every probe shell is reaped');

console.log(`\nsurface-tools wave-5 probe: ${passed} checks passed`);
