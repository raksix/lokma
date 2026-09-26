/**
 * terminal.test.ts — probe for the pure TerminalPane helpers.
 * Run: `bun src/components/terminal/terminal.test.ts` (no DOM, no server).
 *
 * REQ-162 dropped the plain-text scrollback helpers (stripAnsi, keyToBytes,
 * filterLines, copyText) — the xterm emulator owns those concerns now, so
 * the checks for them are gone along with the code.
 */
import {
  FRAME_DEDUPE_MS,
  isRecentDuplicate,
  shouldSendResize,
  TERMINAL_BUFFER_CAP,
  appendCapped,
  connectionNotice,
  exitSummary,
  resolveTerminalCwd,
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
  pty: true,
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

// shouldSendResize (REQ-162: resize frames only on a real fitted change)
check('a first size is always news', shouldSendResize(null, { cols: 100, rows: 30 }) === true);
check('an unchanged size is not re-sent', shouldSendResize({ cols: 100, rows: 30 }, { cols: 100, rows: 30 }) === false);
check('a width change is sent', shouldSendResize({ cols: 100, rows: 30 }, { cols: 101, rows: 30 }) === true);
check('a height change is sent', shouldSendResize({ cols: 100, rows: 30 }, { cols: 100, rows: 31 }) === true);
check('a zero-box fit (hidden pane) is never sent', shouldSendResize(null, { cols: 0, rows: 0 }) === false);
check('a 1-col fit is never sent', shouldSendResize({ cols: 80, rows: 24 }, { cols: 1, rows: 24 }) === false);
check('a 1-row fit is never sent', shouldSendResize({ cols: 80, rows: 24 }, { cols: 80, rows: 1 }) === false);
check('a NaN fit is never sent', shouldSendResize(null, { cols: Number.NaN, rows: 24 }) === false);
check('after a hidden fit the real size is still sent', shouldSendResize({ cols: 80, rows: 24 }, { cols: 120, rows: 40 }) === true);

// resolveTerminalCwd (REQ-060: new shells default to the selected project dir)
const rtc = (
  over: Partial<Parameters<typeof resolveTerminalCwd>[0]> = {},
): { cwd: string; adopted: boolean } =>
  resolveTerminalCwd({ sessionChanged: false, knownCwd: '/proj/a', currentCwd: '', adopted: false, ...over });
check(
  'switch adopts new cwd over a manual edit',
  JSON.stringify(rtc({ sessionChanged: true, knownCwd: '/proj/b', currentCwd: '/manual/x', adopted: true })) ===
    JSON.stringify({ cwd: '/proj/b', adopted: true }),
);
check(
  'switch to unknown session clears to pristine',
  JSON.stringify(rtc({ sessionChanged: true, knownCwd: undefined, currentCwd: '/proj/a', adopted: true })) ===
    JSON.stringify({ cwd: '', adopted: false }),
);
check(
  'null known cwd clears on switch',
  JSON.stringify(rtc({ sessionChanged: true, knownCwd: null, currentCwd: '/proj/a', adopted: true })) ===
    JSON.stringify({ cwd: '', adopted: false }),
);
check(
  'blank known cwd never adopts on switch',
  JSON.stringify(rtc({ sessionChanged: true, knownCwd: '   ', currentCwd: '/proj/a', adopted: true })) ===
    JSON.stringify({ cwd: '', adopted: false }),
);
check(
  'late arrival adopts into pristine input',
  JSON.stringify(rtc()) === JSON.stringify({ cwd: '/proj/a', adopted: true }),
);
check(
  'manual edit survives late arrival',
  JSON.stringify(rtc({ currentCwd: '/manual/x' })) === JSON.stringify({ cwd: '/manual/x', adopted: false }),
);
check(
  'refresh keeps adopted cwd',
  JSON.stringify(rtc({ currentCwd: '/proj/a', adopted: true })) ===
    JSON.stringify({ cwd: '/proj/a', adopted: true }),
);
check(
  'refresh never clobbers a manual edit',
  JSON.stringify(rtc({ knownCwd: '/proj/b', currentCwd: '/manual/x', adopted: false })) ===
    JSON.stringify({ cwd: '/manual/x', adopted: false }),
);
check(
  'adopted input ignores later server-side drift',
  JSON.stringify(rtc({ knownCwd: '/proj/b', currentCwd: '/proj/a', adopted: true })) ===
    JSON.stringify({ cwd: '/proj/a', adopted: true }),
);

// connectionNotice (REQ-107: SSH-style socket visibility)
check('open renders no notice', connectionNotice('open') === null);
check('idle waits on auto-retry', connectionNotice('idle')?.action === null);
check('connecting waits on auto-retry', connectionNotice('connecting')?.action === null);
check('closed offers reconnect', connectionNotice('closed')?.action === 'reconnect');
check('error offers retry', connectionNotice('error')?.action === 'reconnect');
check(
  'notice texts are non-empty',
  ['idle', 'connecting', 'closed', 'error'].every((s) => (connectionNotice(s as 'idle')?.text ?? '').length > 0),
);

// --- REQ-158: duplicate frame deliveries -------------------------------------

const frame = (terminalId: string, data: string) => ({ terminalId, data });

const echoLine = 'root@box:~# echo MARKER-158\r\n';
const outLine = 'MARKER-158\r\n';

check('the first frame of a terminal is kept', isRecentDuplicate([], frame('t1', echoLine), 5) === false);
check(
  'an identical frame right after another is one delivery',
  isRecentDuplicate([{ ...frame('t1', echoLine), at: 1000 }], frame('t1', echoLine), 1050) === true,
);
check(
  'the same bytes past the window are a real repeat',
  isRecentDuplicate([{ ...frame('t1', echoLine), at: 1000 }], frame('t1', echoLine), 1000 + FRAME_DEDUPE_MS) === false,
);
check(
  'different bytes for one terminal never collide',
  isRecentDuplicate([{ ...frame('t1', echoLine), at: 1000 }], frame('t1', outLine), 1001) === false,
);
check(
  'another terminal never collides',
  isRecentDuplicate([{ ...frame('t1', echoLine), at: 1000 }], frame('t2', echoLine), 1001) === false,
);
// Follow-up: duplicates can interleave (echo, output, echo, output).
const ring = [{ ...frame('t1', echoLine), at: 1000 }, { ...frame('t1', outLine), at: 1010 }];
check('an interleaved second copy is still dropped', isRecentDuplicate(ring, frame('t1', echoLine), 1200) === true);
check('the output copy is dropped too', isRecentDuplicate(ring, frame('t1', outLine), 1200) === true);
check('short chunks (a bare Enter) are never deduped', isRecentDuplicate(ring, frame('t1', '\r\n'), 1001) === false);

console.log(`terminal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
