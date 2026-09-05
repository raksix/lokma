/**
 * responsive.test.ts — probe for the pure responsive-shell helpers.
 * Run: `bun src/components/shell/responsive.test.ts` (no DOM, no server).
 */
import {
  MOBILE_BREAKPOINT,
  anyDrawerOpen,
  closeAllSidebars,
  initialSidebarVisibility,
  isMobileWidth,
  mobileQuery,
  nextSidebarVisibility,
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

console.log(`responsive.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
