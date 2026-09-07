/**
 * responsive.test.ts — probe for the pure responsive-shell helpers.
 * Run: `bun src/components/shell/responsive.test.ts` (no DOM, no server).
 */
import {
  EXPLORER_SIDE_KEY,
  MOBILE_BREAKPOINT,
  anyDrawerOpen,
  closeAllSidebars,
  initialSidebarVisibility,
  isMobileWidth,
  mobileQuery,
  nextSidebarVisibility,
  readExplorerSide,
  sidebarPanelTitle,
  sidebarToggleTitle,
  swappedExplorerSide,
  writeExplorerSide,
} from './responsive';
import { SHORTCUTS, resolveShortcuts } from './shortcuts';

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

// isMobileWidth — boundary at 768
check('breakpoint is 768', MOBILE_BREAKPOINT === 768);
check('375px phone is mobile', isMobileWidth(375) === true);
check('767px is mobile', isMobileWidth(767) === true);
check('768px is desktop', isMobileWidth(768) === false);
check('1440px is desktop', isMobileWidth(1440) === false);
check('NaN is not mobile', isMobileWidth(Number.NaN) === false);
check('Infinity is not mobile', isMobileWidth(Number.POSITIVE_INFINITY) === false);

// mobileQuery — shared matchMedia string
check('default query is max-width 767px', mobileQuery() === '(max-width: 767px)');
check('custom breakpoint shifts the query', mobileQuery(1024) === '(max-width: 1023px)');

// initialSidebarVisibility — desktop open, mobile closed
check(
  'desktop opens both',
  JSON.stringify(initialSidebarVisibility(false)) === JSON.stringify({ left: true, right: true }),
);
check(
  'mobile closes both',
  JSON.stringify(initialSidebarVisibility(true)) === JSON.stringify({ left: false, right: false }),
);

// nextSidebarVisibility — desktop toggles independently
check(
  'desktop left toggle keeps right open',
  JSON.stringify(nextSidebarVisibility({ left: true, right: true }, 'left', false)) ===
    JSON.stringify({ left: false, right: true }),
);
check(
  'desktop right toggle keeps left open',
  JSON.stringify(nextSidebarVisibility({ left: true, right: true }, 'right', false)) ===
    JSON.stringify({ left: true, right: false }),
);
check(
  'desktop can open both at once',
  JSON.stringify(nextSidebarVisibility({ left: true, right: false }, 'right', false)) ===
    JSON.stringify({ left: true, right: true }),
);

// nextSidebarVisibility — mobile drawers are exclusive
check(
  'mobile opening left closes right',
  JSON.stringify(nextSidebarVisibility({ left: false, right: true }, 'left', true)) ===
    JSON.stringify({ left: true, right: false }),
);
check(
  'mobile opening right closes left',
  JSON.stringify(nextSidebarVisibility({ left: true, right: false }, 'right', true)) ===
    JSON.stringify({ left: false, right: true }),
);
check(
  'mobile tapping open drawer closes it',
  JSON.stringify(nextSidebarVisibility({ left: true, right: false }, 'left', true)) ===
    JSON.stringify({ left: false, right: false }),
);
check(
  'mobile opening from closed keeps the other closed',
  JSON.stringify(nextSidebarVisibility({ left: false, right: false }, 'right', true)) ===
    JSON.stringify({ left: false, right: true }),
);

// closeAllSidebars
check(
  'close-all clears both',
  JSON.stringify(closeAllSidebars({ left: true, right: true })) ===
    JSON.stringify({ left: false, right: false }),
);
check(
  'close-all on closed stays closed',
  JSON.stringify(closeAllSidebars({ left: false, right: false })) ===
    JSON.stringify({ left: false, right: false }),
);

// anyDrawerOpen
check('drawer open on mobile', anyDrawerOpen({ left: true, right: false }, true) === true);
check('no drawer on mobile', anyDrawerOpen({ left: false, right: false }, true) === false);
check('desktop panels are not drawers', anyDrawerOpen({ left: true, right: true }, false) === false);

// REQ-007 sidebar swap — default side, flip, titles, persistence key
check('swap key is namespaced', EXPLORER_SIDE_KEY === 'lokma-explorer-side');
check('no DOM store reads default right', readExplorerSide() === 'right');
check('no DOM store write is a safe no-op', (() => { writeExplorerSide('left'); return true; })());
check('flip right goes left', swappedExplorerSide('right') === 'left');
check('flip left goes right', swappedExplorerSide('left') === 'right');
check('double flip restores', swappedExplorerSide(swappedExplorerSide('left')) === 'left');
check('default right side hosts Explorer', sidebarPanelTitle('right', 'right') === 'Explorer');
check('default left side hosts Inspector', sidebarPanelTitle('left', 'right') === 'Inspector');
check('swapped left side hosts Explorer', sidebarPanelTitle('left', 'left') === 'Explorer');
check('swapped right side hosts Inspector', sidebarPanelTitle('right', 'left') === 'Inspector');
check('default left toggle copy', sidebarToggleTitle('left', 'right') === 'Toggle Inspector ([)');
check('default right toggle copy', sidebarToggleTitle('right', 'right') === 'Toggle Explorer (])');
check('swapped left toggle copy', sidebarToggleTitle('left', 'left') === 'Toggle Explorer ([)');
check('swapped right toggle copy', sidebarToggleTitle('right', 'left') === 'Toggle Inspector (])');

// REQ-007 shortcut descriptions follow the swap
check(
  'default registry matches unswapped',
  JSON.stringify(resolveShortcuts('right')) === JSON.stringify(SHORTCUTS),
);
check(
  'swapped left row names Explorer',
  resolveShortcuts('left').find((s) => s.id === 'left')?.description === 'Toggle left sidebar (Explorer)',
);
check(
  'swapped right row names Inspector',
  resolveShortcuts('left').find((s) => s.id === 'right')?.description === 'Toggle right sidebar (Inspector)',
);
check(
  'swap keeps shortcut count',
  resolveShortcuts('left').length === SHORTCUTS.length,
);

console.log(`responsive.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
