/**
 * terminal.test.ts — probe for the pure TerminalPane helpers.
 * Run: `bun src/components/terminal/terminal.test.ts` (no DOM, no server).
 */
import {
  TERMINAL_BUFFER_CAP,
  appendCapped,
  exitSummary,
  filterLines,
  statusLabel,
  stripAnsi,
  terminalLabel,
} from './terminal';
import type { TerminalInfo } from '@/lib/api';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

const info = (over: Partial<TerminalInfo> = {}): TerminalInfo => ({
  id: 'term_abc123',
  shell: '/bin/bash',
  cwd: '/tmp/work',
  pid: 4242,
  agentId: null,
  sessionId: 'sess_1',
  status: 'running',
  startedAt: '2026-09-03T00:00:00.000Z',
  exitCode: null,
  signal: null,
  cols: 80,
  rows: 24,
  ...over,
});

// terminalLabel
check('plain shell shows shell + pid', terminalLabel(info()) === 'bash · 4242');
check('agent shell shows agent id', terminalLabel(info({ agentId: 'builder-1' })) === 'builder-1');
check('missing pid shows shell only', terminalLabel(info({ pid: null })) === 'bash');

// statusLabel
check('running status', statusLabel(info()) === 'running · pid 4242');
check('exited status', statusLabel(info({ status: 'exited', exitCode: 1 })) === 'exit 1');
check('killed status', statusLabel(info({ status: 'exited', signal: 'SIGTERM' })) === 'killed (SIGTERM)');
check('error status', statusLabel(info({ status: 'error' })) === 'spawn failed');

// exitSummary
check('running has no summary', exitSummary(info()) === null);
check('clean exit', exitSummary(info({ status: 'exited', exitCode: 0 })) === 'Process exited with code 0');
check('failed exit', exitSummary(info({ status: 'exited', exitCode: 2 })) === 'Process exited with code 2');
check('signal summary', exitSummary(info({ status: 'exited', signal: 'SIGKILL' })) === 'Process ended (SIGKILL)');
check('error summary', exitSummary(info({ status: 'error' })) === 'Shell failed to start');

// appendCapped
check('append joins', appendCapped('ab', 'cd') === 'abcd');
check('empty chunk is noop', appendCapped('ab', '') === 'ab');
check('over-cap keeps the tail', appendCapped('abcdef', 'gh', 5) === 'defgh');
check('default cap is sane', TERMINAL_BUFFER_CAP >= 100_000);

// stripAnsi
check('strips SGR colors', stripAnsi('[32mok[0m') === 'ok');
check('strips cursor codes', stripAnsi('a[2Kb') === 'ab');
check('plain text untouched', stripAnsi('hello $ world [x]') === 'hello $ world [x]');
check('empty untouched', stripAnsi('') === '');

// filterLines
const buf = 'echo hello\nnpm test passed\nnothing here';
check('empty query returns all lines', filterLines(buf, '').length === 3);
check('substring match', filterLines(buf, 'npm').length === 1);
check('case-insensitive', filterLines(buf, 'HELLO').length === 1);
check('no match is empty', filterLines(buf, 'zzz').length === 0);

console.log(`terminal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
