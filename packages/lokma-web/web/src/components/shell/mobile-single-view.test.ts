/**
 * mobile-single-view.test.ts — REQ-024 regression gate for the mobile
 * single-view (no pane system below the 768px breakpoint).
 * Probes the pure helpers plus source-presence guards (repo precedent:
 * narrow-layout.test.ts scans sources the same way).
 * Run: `bun src/components/shell/mobile-single-view.test.ts` (no DOM).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOBILE_TABS,
  isMobileViewport,
  isPaneSystemAllowed,
  mobileTabLabel,
} from './responsive';

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

// Pure helpers — the mobile tab contract
check('four mobile surfaces', MOBILE_TABS.length === 4);
check(
  'tab order is chat/sessions/files/tools',
  JSON.stringify(MOBILE_TABS) === JSON.stringify(['chat', 'sessions', 'files', 'tools']),
);
check('chat label', mobileTabLabel('chat') === 'Chat');
check('sessions label', mobileTabLabel('sessions') === 'Sessions');
check('files label', mobileTabLabel('files') === 'Files');
check('tools label', mobileTabLabel('tools') === 'Tools');

// Pane system is desktop-only
check('mobile forbids the pane system', isPaneSystemAllowed(true) === false);
check('desktop allows the pane system', isPaneSystemAllowed(false) === true);

// No DOM under bun — the live probe must stay false, never throw
check('no-DOM viewport probe is false', isMobileViewport() === false);

// Source guards — the single view is wired, the pane entries are gated
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

const shell = read(join('components', 'app-shell.tsx'));
check('shell renders MobileSingleView', shell.includes('<MobileSingleView'));
check('shell forces tiling off on mobile', shell.includes('setTiling(false)'));
check('shell forces windowed off on mobile', shell.includes('setWindowed(false)'));
check('shell hides drawer chrome on mobile', shell.includes('hideSideToggles'));
check('tiling toggle hides on mobile', shell.includes('tiling || isMobile'));
check('shell has a dedicated mobile branch', shell.includes('if (isMobile) {'));

const single = read(join('components', 'shell', 'mobile-single-view.tsx'));
check('single view has a labelled bottom nav', single.includes('aria-label="Mobile navigation"'));
check('single view reaches chat', single.includes('<Chat'));
check('single view reaches sessions', single.includes('<SessionsSidebar'));
check('single view reaches files', single.includes('<FileBrowser'));
check('single view reaches inspector tools', single.includes('<InspectorPanel'));
check('single view never enables tiling', !single.includes('setTiling(true)'));
check('single view never requests pane tabs', !single.includes('requestFileTab') && !single.includes('requestSessionTab'));
check('bottom nav scrolls on tiny screens', single.includes('overflow-x-auto'));
check('tool picker scrolls on tiny screens', single.includes('role="tablist"'));
check(
  'lucide icons only (no emoji surfaces)',
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(single),
);

const header = read(join('components', 'header.tsx'));
check('header supports hideSideToggles', header.includes('hideSideToggles'));

const files = read(join('components', 'files', 'file-browser.tsx'));
check('file open gates tiling on viewport', files.includes('isMobileViewport()'));

const sessions = read(join('components', 'sessions', 'sessions-sidebar.tsx'));
check('session drag gates tiling on viewport', sessions.includes('isMobileViewport()'));
check('open-as-pane hides on mobile', sessions.includes('isMobile ? null'));

console.log(`mobile-single-view.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
