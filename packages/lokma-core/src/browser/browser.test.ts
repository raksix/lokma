/**
 * Live probe for the browser tab registry (`./browser`) and the REQ-146
 * open-or-reuse rule wired into the `open_browser` UI-control tool.
 * Run: `bun src/browser/browser.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Memory-only registry (no disk, no HOME), so no temp-HOME guard is needed.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts` from
 * `tsc -p` output (same precedent as `tools.test.ts`).
 * See Docs/24 section browser pane.
 */
import { BrowserError, browserTabs, normalizeTabUrl } from './browser';
import { buildUiControlTools, type UiActionPayload } from '../tools/ui-control';

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

function expectBrowserError(fn: () => unknown, code: string, label: string): void {
  try {
    fn();
  } catch (e) {
    assert(e instanceof BrowserError && e.code === code, label);
    return;
  }
  throw new Error('FAIL: ' + label + ' (no error thrown)');
}

async function main(): Promise<void> {
  browserTabs.clearForTests();

  // --- explicit open() keeps its "new tab per call" semantics (pane path) ---
  const a = browserTabs.open({ url: 'https://a.example', sessionId: 'sess_open' });
  const b = browserTabs.open({ url: 'https://b.example', sessionId: 'sess_open' });
  assert(a.record.id !== b.record.id, 'open() still creates a new tab per call');
  assert(browserTabs.list('sess_open').length === 2, 'two explicit opens -> two tabs');

  // --- openOrReuse(): first call opens, later calls navigate the same tab ---
  const first = browserTabs.openOrReuse({ url: 'https://one.example', sessionId: 'sess_reuse' });
  assert(first.reused === false, 'first openOrReuse opens (reused: false)');
  const second = browserTabs.openOrReuse({ url: 'https://two.example', sessionId: 'sess_reuse' });
  assert(second.reused === true, 'second openOrReuse reuses (reused: true)');
  assert(second.record.id === first.record.id, 'reuse keeps the same tab id');
  assert(second.record.url === normalizeTabUrl('https://two.example'), 'reuse loads the new url in place');
  const reusedTabs = browserTabs.list('sess_reuse');
  assert(reusedTabs.length === 1, 'two openOrReuse calls -> one tab record');
  assert(reusedTabs[0].history.length === 2 && reusedTabs[0].index === 1, 'reuse pushes a real history entry');

  // --- scope: another session never shares or steals the tab ---
  const mine = browserTabs.openOrReuse({ url: 'https://mine.example', sessionId: 'sess_a' });
  const other = browserTabs.openOrReuse({ url: 'https://other.example', sessionId: 'sess_b' });
  assert(other.reused === false && other.record.id !== mine.record.id, 'other session opens its own tab');
  assert(browserTabs.list('sess_a').length === 1 && browserTabs.list('sess_b').length === 1, 'one tab per session');
  assert(browserTabs.list('sess_a')[0].url === normalizeTabUrl('https://mine.example'), 'reuse never leaks across sessions');

  // --- a blank open (no url) must not wipe the live page ---
  const keep = browserTabs.openOrReuse({ url: 'https://keep.example', sessionId: 'sess_keep' });
  const blank = browserTabs.openOrReuse({ sessionId: 'sess_keep' });
  assert(blank.reused === true && blank.record.id === keep.record.id, 'blank reuse targets the live tab');
  assert(blank.record.url === keep.record.url, 'blank reuse never navigates the live page away');

  // --- unscoped opens (no session) never collapse into one tab ---
  const x = browserTabs.openOrReuse({ url: 'https://x.example' });
  const y = browserTabs.openOrReuse({ url: 'https://y.example' });
  assert(x.reused === false && y.reused === false && x.record.id !== y.record.id, 'unscoped opens never collapse');

  // --- the 20-tab cap still guards explicit opens; reuse sidesteps it ---
  for (let i = 0; i < 20; i += 1) browserTabs.open({ sessionId: 'sess_cap' });
  assert(browserTabs.list('sess_cap').length === 20, 'limit fixture: 20 tabs at the cap');
  expectBrowserError(() => browserTabs.open({ sessionId: 'sess_cap' }), 'browser_limit', 'explicit open hits the 20-tab cap');
  const atCap = browserTabs.openOrReuse({ url: 'https://cap.example', sessionId: 'sess_cap' });
  assert(atCap.reused === true, 'openOrReuse reuses even at the tab cap');
  assert(browserTabs.list('sess_cap').length === 20, 'reuse adds no record (cap preserved)');

  // --- open_browser tool wiring: reuse + one ui_action frame per call ---
  const emitted: UiActionPayload[] = [];
  const tools = buildUiControlTools('/tmp', {
    sessionId: 'sess_tool',
    emit: (payload) => emitted.push(payload),
  });
  const openBrowser = tools.find((t) => t.name === 'open_browser');
  assert(openBrowser !== undefined, 'open_browser tool is registered');
  if (openBrowser) {
    const r1 = (await openBrowser.handler({ url: 'https://first.example' }, undefined)) as { tabId: string; reused: boolean };
    const r2 = (await openBrowser.handler({ url: 'https://second.example' }, undefined)) as { tabId: string; reused: boolean };
    assert(r1.reused === false && r2.reused === true, 'tool: the second open reuses the tab');
    assert(r1.tabId === r2.tabId, 'tool: both opens report the same tabId');
    assert(browserTabs.list('sess_tool').length === 1, 'tool: one tab record for the session');
    assert(emitted.length === 2, 'tool: one ui_action frame per open');
    assert(
      emitted[1].action === 'open_browser' && emitted[1].url === normalizeTabUrl('https://second.example'),
      'tool: frames carry the live url',
    );
  }

  console.log('--- ' + passed + ' checks passed ---');
}

await main();
