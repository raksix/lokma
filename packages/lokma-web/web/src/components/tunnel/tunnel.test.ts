/**
 * tunnel.test.ts — probe for the Share/tunnel panel helpers (REQ-193 slice 8).
 * Run: `bun src/components/tunnel/tunnel.test.ts` (no DOM, no server, no network).
 *
 * The load-bearing assertions are the NEGATIVE ones. A `displayUrl()` that
 * fell back to a constructed host (`https://x.trycloudflare.com`) would keep
 * every positive check green — the pane would just render a frame that cannot
 * load, which is exactly the fabricated-url behaviour Kapsam 4 forbids. So the
 * probe pins "no url on every non-running branch" and "no hint while running".
 */
import {
  displayUrl,
  expiryLine,
  formatStamp,
  installHint,
  isLive,
  portPayload,
  stateView,
} from './tunnel';
import type { TunnelStatusRes } from '@/lib/api';

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

function status(over: Partial<TunnelStatusRes> = {}): TunnelStatusRes {
  return {
    state: 'stopped',
    url: null,
    provider: null,
    startedAt: null,
    expiresAt: null,
    message: 'No tunnel is running.',
    installHint: null,
    ...over,
  };
}

const RUNNING = status({
  state: 'running',
  url: 'https://real-reported-host.trycloudflare.com',
  provider: 'cloudflared',
  startedAt: '2026-10-03T10:07:01Z',
  expiresAt: '2026-10-03T11:07:01Z',
  installHint: null,
});

// --- live branch: the server's url is shown verbatim -----------------------
check('live is running', isLive(RUNNING));
check('live shows the reported url', displayUrl(RUNNING) === RUNNING.url);
check('live has no install hint', installHint(RUNNING) === null);
check('running row label', stateView('running').label === 'Running');
check('running row is green', stateView('running').tone.includes('emerald'));

// --- every non-live branch renders NO url (the fabrication guard) ---------
const NOT_LIVE: Array<[string, TunnelStatusRes]> = [
  ['stopped', status()],
  ['starting', status({ state: 'starting' })],
  ['error', status({ state: 'error', message: 'cloudflared is not installed.' })],
  ['running without url', status({ state: 'running', url: null, provider: 'ngrok' })],
  ['running with empty url', status({ state: 'running', url: '', provider: 'ngrok' })],
];
for (const [name, s] of NOT_LIVE) {
  check(`${name}: not live`, !isLive(s));
  check(`${name}: no url displayed`, displayUrl(s) === null);
}
check('null status has no url', displayUrl(null) === null);
check('null status is not live', !isLive(null));

// --- refusal branch: the install command is DATA, shown as a line ---------
const NO_BINARY = status({
  state: 'error',
  message: 'No tunnel provider is available on this machine.',
  installHint: 'npm i -g cloudflared',
});
check('install hint from the field', installHint(NO_BINARY) === 'npm i -g cloudflared');
// Measured regression (slice 8): the helper used to fall back to `message`, so
// an idle stopped box rendered "Tunnel is off — nothing is listening from
// outside." INSIDE the copyable command block. Prose in a data field is the bug
// slice 7 removed from the error path; the panel must not reintroduce it.
check('the message is NOT used as a command', installHint(status({ state: 'error', message: 'run lokma doctor' })) === null);
check('blank hint yields null, never the message', installHint(status({ state: 'error', message: 'x', installHint: '   ' })) === null);
check('nothing at all yields null', installHint(status({ state: 'error', message: '', installHint: '' })) === null);
check('idle stopped shows no command', installHint(status({ message: 'No tunnel is running.' })) === null);
check('idle stopped has no url either', displayUrl(status({ message: 'No tunnel is running.' })) === null);

// --- unknown/hostile state values fall back, never invent -----------------
check('unknown state reads Stopped', stateView('wat').label === 'Stopped');
check('non-string state reads Stopped', stateView(7).label === 'Stopped');
check('unknown state shows no url', displayUrl(status({ state: 'exploded' as never })) === null);

// --- stamps --------------------------------------------------------------
check('iso stamp is formatted', (formatStamp('2026-10-03T10:07:01Z') ?? '').length > 0);
check('junk stamp stays visible', formatStamp('whenever') === 'whenever');
check('null stamp is null', formatStamp(null) === null);
check('expiry shown for a live tunnel', (expiryLine(RUNNING) ?? '').startsWith('Ends '));
check('expiry hidden when stopped', expiryLine(status({ expiresAt: '2026-10-03T10:07:01Z' })) === null);
check('expiry hidden without a provider stamp', expiryLine(status({ state: 'running', url: 'https://h', provider: 'ngrok' })) === null);

// --- port payload: never a silently-substituted fallback ------------------
check('blank port sends no port', Object.keys(portPayload('  ')).length === 0);
check('numeric port passes through', portPayload('8080').port === 8080);
check('numeric port is a number not a string', typeof portPayload('8080').port === 'number');
check('whitespace-trimmed port', portPayload(' 9000 ').port === 9000);
check(
  'junk port is sent as NaN (server 400 names the range), not defaulted',
  Number.isNaN(portPayload('3456x').port as number),
);
check(
  'a typo never becomes the default port',
  (portPayload('3456x').port as number) !== 3456,
);

console.log(`tunnel.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);