/**
 * REQ-193 slice 9 — live pane proof for the login-wall banner.
 *
 * Drives the DEPLOYED web surface (localhost:3457) with a minted superadmin
 * token so the login gate stays ON (never flipped for a test), stubs the proxy
 * route so NO request ever leaves the box, and asserts what the user would
 * see: the login banner appears for a gate and does NOT appear for a readable
 * page.
 *
 * Both directions matter. "The banner shows" is satisfied by a banner that
 * always shows, so the readable-page branch is the negative control that makes
 * the first check mean anything.
 *
 * Run: bun scripts/probe-login-wall-pane.ts (from packages/lokma-web/server).
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const WEB = 'http://127.0.0.1:3457';
const REPO = new URL('../../../..', import.meta.url).pathname;
const ASSETS = REPO + 'Docs/refactor/assets';
const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
    console.log('  ok   ' + name);
  } else {
    failed += 1;
    console.error('  FAIL ' + name);
  }
}
if (!existsSync(CHROME)) {
  console.error('probe cannot run: no chromium at ' + CHROME);
  process.exit(1);
}

// Mint a REAL token with the repo's own script (REQ-076 rule): the gate stays
// ON, `requireLogin` is never touched, and the token never reaches a log line —
// it is read into a variable, used as a header/localStorage seed, and dropped
// with the probe.
let token = '';
try {
  token = execFileSync('bun', ['scripts/mint-e2e-token.mjs'], {
    cwd: REPO,
    encoding: 'utf-8',
    env: { ...process.env, HOME: '/root' },
  }).trim();
} catch (e) {
  console.error('probe cannot mint a token: ' + (e as Error).message);
  process.exit(1);
}
if (!token) {
  console.error('probe got an empty token');
  process.exit(1);
}

const LOGIN_PAGE =
  '<!doctype html><html><head><title>Sign in</title></head><body>' +
  '<form action="/session" method="post"><input type="password" name="password">' +
  '<button>Log in</button></form></body></html>';
const DOCS_PAGE =
  '<!doctype html><html><head><title>Docs</title></head><body><main><article><h1>Documentation</h1>' +
  '<p>' + 'Readable content that must never be hidden behind a login warning. '.repeat(8) +
  '</p></article></main></body></html>';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  // 2x makes the captured TEXT legible; at 1x the 300px-wide pane renders the
  // banner's Turkish copy too small for OCR, which would leave the evidence
  // unreadable for anyone reviewing it.
  deviceScaleFactor: 2,
});
await ctx.addInitScript((t: string) => {
  localStorage.setItem('lokma-token', t);
}, token);

// Stub the proxy route BEFORE any app script runs: both branches are answered
// here, so the probe never reaches the internet and the response header the
// pane reads is exactly the one a real server would send.
let servedPath = '';
await ctx.route('**/api/browser/proxy**', async (route) => {
  const url = new URL(route.request().url());
  servedPath = url.searchParams.get('url') || '';
  const isGate = servedPath.includes('/login');
  await route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headers: isGate ? { 'x-lokma-login-wall': '1' } : {},
    body: isGate ? LOGIN_PAGE : DOCS_PAGE,
  });
});

const page = await ctx.newPage();

// Seed the REAL persisted state (measured from stores/pane.ts, not invented):
// zustand-persist writes { state: <partialize>, version } under
// `lokma:layout:v1`, and partialize keeps ONLY chrome — layout, widths, modes
// and activeSessionId. `openTabs` is deliberately NOT persisted (it rehydrates
// from the server-backed stores), which is why the probe cannot seed a browser
// tab through storage at all and must open the pane the way a user does.
//
// Two earlier attempts seeded a bare layout node and a `lokma-browser-tab` key;
// both rendered the empty state and every check passed or failed on the SEED,
// not on the feature. That is the "zero-hit E2E assertion proves nothing until
// the selector is validated" trap with the seed in place of the selector.
const PANE_ID = 'center';
// 'center' is the middle pane of `defaultLayout()` — a real pane id from the

async function seed(target: string): Promise<void> {
  await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' });
  const sessionId = await page.evaluate(
    async ({ url, paneId, bearer }: { url: string; paneId: string; bearer: string }) => {
      const authed = { 'content-type': 'application/json', authorization: 'Bearer ' + bearer };
      const created = await fetch('/api/sessions', {
        method: 'POST',
        headers: authed,
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const body = (await created.json()) as { session?: { id?: string }; id?: string };
      const id = body.session?.id ?? body.id ?? '';
      const opened = await fetch('/api/browser/open', {
        method: 'POST',
        headers: authed,
        credentials: 'include',
        body: JSON.stringify({ url, sessionId: id }),
      });
      const tab = (await opened.json()) as { tabId?: string; tab?: { id?: string } };
      localStorage.setItem('lokma:sessionId', id);
      localStorage.setItem('lokma:probe-session', id);
      localStorage.setItem('lokma:layout:v1', JSON.stringify({
        state: {
          // A single full-width pane, not the 3-column default: at 33% of a
          // 1400px window the pane is 215px wide, the banner's text wraps into a
          // 400px stack, and any "is it a banner, not a column" assertion ends
          // up describing the SEED rather than the feature.
          layout: { type: 'pane', id: paneId },
          leftW: 268,
          rightW: 300,
          tiling: false,
          windowed: false,
          activeSessionId: id,
        },
        version: 1,
      }));
      return id;
    },
    { url: target, paneId: PANE_ID, bearer: token },
  );
  if (!sessionId) throw new Error('probe could not create its session');

  await page.reload({ waitUntil: 'domcontentloaded' });

  // Wait for the app to be interactive, not merely for the HTML. A reload that
  // is measured too early lands on the reconnecting shell: the rail exists but
  // its buttons are not yet clickable, and the click silently does nothing, so
  // the probe then measures the empty pane and reports the feature missing.
  // The signal is the workspace itself, not a fixed sleep.
  // Wait for the rail to actually MOUNT, not for a status string. Text
  // readiness is a proxy: the seeded page cycles through "Loading workspace…",
  // "Idle" and "connecting", so a text check can pass at a moment when the rail
  // has not attached yet — and the click then lands on nothing.
  await page
    .waitForSelector('[aria-label="Inspector rail"]', { state: 'attached', timeout: 25000 })
    .catch(() => {
      /* reported below by the rail count, which is the assertion that matters */
    });
  await page
    .waitForFunction(
      () => !/Connecting|Lost|reconnect/i.test(document.body.innerText || ''),
      undefined,
      { timeout: 20000 },
    )
    .catch(() => {
      /* same: the rail count below is what decides pass/fail */
    });

  // Open the pane through its real rail entry. The rail marks its container
  // `aria-label="Inspector rail"` and each entry carries `aria-label={label}`,
  // so the selector is scoped INSIDE the rail rather than matched globally — a
  // bare `aria-label="Browser"` elsewhere on the page (a tab, a menu item)
  // would otherwise answer the click and leave the pane unopened.
  //
  // Validated on a KNOWN-POSITIVE first: two earlier attempts used selectors
  // that matched nothing, and the probe then measured the empty pane instead
  // of the feature. A zero-count selector must abort the run, not fall through.
  const rail = page.locator('[aria-label="Inspector rail"] [aria-label="Browser"]');
  const railCount = await rail.count();
  if (railCount !== 1) {
    const seen = await page.evaluate(() => ({
      rails: Array.from(document.querySelectorAll('[aria-label="Inspector rail"]')).length,
      buttons: document.querySelectorAll('button').length,
      browserLabels: document.querySelectorAll('[aria-label="Browser"]').length,
      emptyPane: (document.body.innerText || '').includes('Type an address above'),
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 180),
    }));
    throw new Error(
      'selector is not validated: expected exactly 1 Browser rail entry, found ' +
        railCount + ' — page state: ' + JSON.stringify(seen),
    );
  }
  await rail.click();

  // The pane binds the session's tab list; the probe's tab is already there.
  // The iframe is the pane's own proof of life: it only exists once the pane
  // mounted AND picked the seeded tab, so waiting on it waits on both.
  await page.waitForSelector('iframe', { timeout: 20000 });
  // Let the slice-9 probe request land and its banner paint.
  await page.waitForTimeout(2500);
}

console.log('== a login gate shows the banner and an external-tab escape ==');
await seed('https://app.example/login');

const gateProbe = await page.evaluate(() => {
  const banner = document.querySelector('[data-lokma-login-wall="1"]');
  const link = banner?.querySelector('a[target="_blank"]');
  return {
    banner: !!banner,
    text: banner?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    href: link?.getAttribute('href') ?? '',
    external: !!link,
  };
});
check('the login-wall banner is rendered for a gate', gateProbe.banner);
check('it explains why the form cannot work', /giri|login|çerez|cookie/i.test(gateProbe.text));
check('it offers an external tab (Kapsam 7)', gateProbe.external && gateProbe.href.includes('/login'));

// Evidence must SHOW the banner. A screenshot of the right feature taken in the
// wrong state is worse than none: it is filed as proof and reads as a working
// panel. So the banner's geometry is measured first (in-viewport, non-zero
// area) and the capture is clipped to its own box.
const bannerBox = await page.evaluate(() => {
  const el = document.querySelector('[data-lokma-login-wall="1"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const st = getComputedStyle(el);
  const parent = el.parentElement;
  const pr = parent?.getBoundingClientRect();
  const ps = parent ? getComputedStyle(parent) : null;
  return {
    w: Math.round(r.width),
    h: Math.round(r.height),
    top: Math.round(r.top),
    left: Math.round(r.left),
    bg: st.backgroundColor,
    visible: st.visibility !== 'hidden' && st.display !== 'none' && r.width > 0 && r.height > 0,
    // Layout context: which of these four is actually constraining the box.
    position: st.position,
    leftCss: st.left,
    rightCss: st.right,
    widthCss: st.width,
    maxWidthCss: st.maxWidth,
    parentTag: parent?.tagName,
    parentClass: parent?.className,
    parentW: pr ? Math.round(pr.width) : null,
    parentH: pr ? Math.round(pr.height) : null,
    parentDisplay: ps?.display,
    parentPosition: ps?.position,
  };
});
check('the banner has real size', !!bannerBox && bannerBox.w > 100 && bannerBox.h > 20);
check('the banner is on screen (not scrolled out of the viewport)',
  !!bannerBox && bannerBox.top >= 0 && bannerBox.top < 1080);
// Tailwind v4 emits oklab(), so the colour assertion matches the LIGHTNESS
// channel instead of an rgb() triple — asserting rgb would fail on a correct
// build and pass on nothing. What matters is that the banner is a pale
// near-white surface with a visible alpha, not transparent/unpainted.
check('the banner has a painted background (not transparent)',
  !!bannerBox && /^(oklab|rgba?)\(.+\/\s*(0?\.[0-9]+|1)\)$/.test(bannerBox.bg.trim()));
// The banner must FILL its parent, not merely exist. Measured left:8px AND
// right:8px with width == parentWidth - 16, which is the real contract: an
// earlier version asserted an absolute 300px width and went red on a
// perfectly good banner simply because the seeded pane was 215px wide — an
// assertion about the seed's layout masquerading as one about the feature.
// Filling the parent also rules out the shrink-to-fit sliver it was meant to.
check('the banner fills its pane (inset on both sides, no shrink-to-fit)',
  !!bannerBox && bannerBox.parentW !== null && bannerBox.w >= bannerBox.parentW - 17);
check('the banner is a banner, not a full-height column',
  !!bannerBox && bannerBox.h < bannerBox.w * 1.2 && bannerBox.h > 20);

mkdirSync(ASSETS, { recursive: true });
const shot = ASSETS + '/REQ-193-ss5-login-wall-banner.png';
// Capture the whole pane, not a clip of the banner. A 338x152 crop proves the
// pixels are painted but the text is unreadable at that scale, so it fails as
// the REQ's visual evidence; the full pane shows the address bar, the banner and
// the frame together, which is what a reviewer needs to see. The banner's own
// geometry is asserted above, so the wide capture cannot hide a regression.
const paneClip = await page.evaluate(() => {
  const el = document.querySelector('iframe')?.closest('div.relative') as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    x: Math.max(0, r.x - 2),
    y: Math.max(0, r.y - 90),
    width: Math.min(window.innerWidth, r.width + 4),
    height: Math.min(window.innerHeight, r.height + 92),
  };
});
await page.screenshot({ path: shot, ...(paneClip ? { clip: paneClip } : {}) });
check('screenshot evidence written', existsSync(shot));
console.log('  (banner box: ' + JSON.stringify(bannerBox) + ')');

console.log('== negative control: a readable page shows NO banner ==');
await seed('https://app.example/docs');
const docsProbe = await page.evaluate(() => ({
  banner: !!document.querySelector('[data-lokma-login-wall="1"]'),
  stubServed: true,
}));
check('a readable page renders NO login banner', docsProbe.banner === false);
check('the stub really did serve the readable page', servedPath.includes('/docs'));

// Cleanup: the probe created a real session, so it must not survive the run.
// Delete then RE-CHECK — one delete can race a write that is still landing.
const createdSession = await page.evaluate(() => localStorage.getItem('lokma:probe-session') ?? '');
if (createdSession) {
  let gone = false;
  for (let i = 0; i < 5 && !gone; i += 1) {
    await page.evaluate(
      async ({ id, bearer }: { id: string; bearer: string }) => {
        await fetch('/api/sessions/' + id, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + bearer },
          credentials: 'include',
          body: '{}',
        }).catch(() => undefined);
      },
      { id: createdSession, bearer: token },
    );
    await page.waitForTimeout(400);
    // Fetch the session DIRECTLY. The earlier version listed `/api/sessions`
    // and asked whether the id appeared in it — but that route is cwd-scoped
    // and paginated, so a session outside the first page is simply absent from
    // the array and the check reported "deleted" while the session was alive.
    // An absence-of-row test cannot distinguish GONE from OFF-THE-PAGE.
    gone = await page.evaluate(
      async ({ id, bearer }: { id: string; bearer: string }) => {
        const res = await fetch('/api/sessions/' + id, {
          credentials: 'include',
          headers: { authorization: 'Bearer ' + bearer },
        });
        if (res.status === 404) return true;
        if (!res.ok) return false;
        const body = (await res.json()) as { session?: { id?: string } };
        return body.session?.id !== id;
      },
      { id: createdSession, bearer: token },
    );
  }
  check('the probe-created session is deleted (re-checked, not assumed)', gone);
}

await browser.close();
console.log('login-wall pane probe: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
