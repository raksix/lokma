/**
 * SetupPane pure-helper probe — run with:
 *   `bun src/components/setup/setup.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  allOffMap,
  countPassed,
  currentMap,
  defaultMap,
  doctorCopyText,
  doctorLine,
  enabledIds,
  formatLatency,
  probeTone,
  summarizeInit,
} from './setup';
import type { DoctorCheckView, SetupFeatureView } from '@/lib/api';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const features = (over: Partial<SetupFeatureView> = {}): SetupFeatureView => ({
  id: 'browser',
  label: 'Browser',
  desc: 'Browser Use / Playwright / CDP',
  docs: '32-§3',
  defaultOn: true,
  enabled: false,
  ...over,
});

const probe = (over: Partial<DoctorCheckView> = {}): DoctorCheckView => ({
  name: 'config',
  ok: true,
  latencyMs: 3,
  detail: '~/.lokma/config.json parses',
  ...over,
});

// ─── tones + latency ───────────────────────────────────────────────
check('pass tone is emerald', probeTone(true).includes('emerald'));
check('fail tone is red', probeTone(false).includes('red-400'));
check('latency formats ms', formatLatency(12) === '12ms');
check('latency rounds', formatLatency(12.6) === '13ms');
check('latency zero', formatLatency(0) === '0ms');
check('latency negative is dash', formatLatency(-1) === '—');
check('latency NaN is dash', formatLatency(NaN) === '—');

// ─── counts ────────────────────────────────────────────────────────
check('count passed 2/3', JSON.stringify(countPassed([probe(), probe(), probe({ ok: false })])) === JSON.stringify({ passed: 2, total: 3 }));
check('count empty is 0/0', JSON.stringify(countPassed([])) === JSON.stringify({ passed: 0, total: 0 }));

// ─── checkbox maps ─────────────────────────────────────────────────
const rows = [features({ id: 'browser', enabled: true }), features({ id: 'gateway', label: 'Gateway', defaultOn: false, enabled: true })];
check('current map follows stored flags', JSON.stringify(currentMap(rows)) === JSON.stringify({ browser: true, gateway: true }));
check('default map follows registry defaults', JSON.stringify(defaultMap(rows)) === JSON.stringify({ browser: true, gateway: false }));
check('all-off map is all false', JSON.stringify(allOffMap(rows)) === JSON.stringify({ browser: false, gateway: false }));
check('enabled ids list on-flags', JSON.stringify(enabledIds({ browser: true, gateway: false })) === JSON.stringify(['browser']));
check('enabled ids empty when all off', enabledIds({ browser: false }).length === 0);

// ─── init summary ──────────────────────────────────────────────────
check('init summary counts both lists', summarizeInit(['a'], ['b', 'c']) === '1 created · 2 already present');
check('init summary zero created', summarizeInit([], ['a']) === '0 created · 1 already present');

// ─── doctor copy ───────────────────────────────────────────────────
check('doctor line pass mark', doctorLine(probe()) === '✓ config — ~/.lokma/config.json parses (3ms)');
check('doctor line fail mark', doctorLine(probe({ ok: false, detail: 'no providers' })).startsWith('✗ config — no providers'));
const allPass = doctorCopyText([probe(), probe({ name: 'locks', detail: '0 stale' })]);
check('copy ends with all-passed footer', allPass.endsWith('All checks passed · 2/2'));
check('copy has one line per check plus footer', allPass.split('\n').length === 3);
const mixed = doctorCopyText([probe(), probe({ name: 'models', ok: false, detail: 'none enabled' })]);
check('copy ends with failing footer when mixed', mixed.endsWith('1/2 passed — see failing rows above'));
check('copy keeps the failing row', mixed.includes('✗ models — none enabled'));

console.log(`\nsetup probe: ${passed} passed`);
