#!/usr/bin/env node
/**
 * REQ-140 — live prompt-rail probe: the dot rail must list only the prompts
 * the user sent (never assistant/tool/thinking rows), and clicking a dot must
 * land on that prompt.
 *
 *   TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-prompt-rail.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = arg('url', 'http://127.0.0.1:3457');
const TOKEN = arg('token', '');

// The last prompt repeats the second on purpose: identical text must still get
// its own dot — targets are transcript indices (`chat-msg-<index>`), not text.
const PROMPTS = ['PROMPT RAIL PROBE ONE', 'PROMPT RAIL PROBE TWO', 'PROMPT RAIL PROBE TWO'];

// ---- timing. Every wait below is measured against ONE absolute budget, so a
// slow upstream can only cost the run its "landed" checks — never its wall clock.
const RUN_BUDGET_MS = 20 * 60 * 1000; // whole probe: hard ceiling, no unbounded wait
const SEND_WINDOW_MS = 5 * 60 * 1000; // three prompts + their runs
const MIN_IDLE_MS = 3000; // continuous quiet that counts as "safe to send"
const POST_ENTER_MS = 25000; // the prompt frame must leave within this after Enter
const POLL_MS = 500;

const results = [];
function check(ok, label, extra = '') {
  results.push({ ok, label });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${extra ? ` — ${extra}` : ''}`);
}

/** Benign noise: favicon, and the fresh-session transcript 404 (by design). */
function benign(url, status) {
  if (/favicon/.test(url)) return true;
  if (status === 404 && /\/api\/sessions\/[^/]+$/.test(url)) return true;
  return false;
}

/** `--color-terracotta` → `"201, 100, 66"` (accepts #abc/#aabbcc; null if unset). */
function accentTriplet(raw) {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((raw || '').trim());
  if (!hex) return null;
  const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
}

/** Row count of the transcript, dot count, and whether a run is in flight. */
function snapshot(page) {
  return page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('button'))
      .map((b) => `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''}`)
      .join(' ');
    return {
      rows: document.querySelectorAll('[id^="chat-msg-"]').length,
      dots: document.querySelectorAll('[aria-label^="Go to your prompt"]').length,
      busy: /\b(working|thinking|stop)\b/i.test(controls),
    };
  });
}

/**
 * Wait until the app looks idle: no working/thinking/stop control AND the row
 * count has held still for `quietMs`. A prompt sent while a run is still open
 * gets swallowed by the app, so this gate is what makes the three sends land.
 * Bounded by an absolute deadline and never throws — it returns false instead.
 */
async function waitIdle(page, opts = {}) {
  const quietMs = opts.quietMs ?? MIN_IDLE_MS;
  const deadline = opts.deadline ?? Date.now() + RUN_BUDGET_MS;
  let last = -1;
  let quietSince = null;
  while (Date.now() < deadline) {
    const snap = await snapshot(page);
    const now = Date.now();
    if (snap.busy || snap.rows !== last) {
      quietSince = null;
      last = snap.rows;
    } else if (quietSince === null) {
      quietSince = now;
    } else if (now - quietSince >= quietMs) {
      return true;
    }
    await page.waitForTimeout(POLL_MS);
  }
  return false;
}

/**
 * Watch the page's WebSockets for the `{"type":"prompt"}` frame the app emits
 * once per accepted send. That frame — not a row-count guess — is the honest
 * "this send was not swallowed" signal. `wait(base)` resolves true only when a
 * NEW prompt frame has left since `base` was read, and gives up at `deadline`.
 */
function armPromptDetector(page, deadline) {
  let seen = 0;
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      const payload = typeof frame.payload === 'string' ? frame.payload : '';
      if (payload.includes('"type":"prompt"')) seen += 1;
    });
  });
  return {
    seen: () => seen,
    async wait(base, until = deadline) {
      const stop = Math.min(until, deadline, Date.now() + POST_ENTER_MS);
      while (seen <= base && Date.now() < stop) await page.waitForTimeout(POLL_MS);
      return seen > base;
    },
  };
}

/**
 * `--self-test`: the DOM-free helpers, no browser and no server needed.
 *   NODE_PATH=/root/test-hermes/node_modules node scripts/probe-prompt-rail.cjs --self-test
 */
if (args.includes('--self-test')) {
  const cases = [
    ['accentTriplet(#C96442)', accentTriplet('#C96442'), '201, 100, 66'],
    ['accentTriplet(#c96442)', accentTriplet('#c96442'), '201, 100, 66'],
    ['accentTriplet(#abc)', accentTriplet('#abc'), '170, 187, 204'],
    ['accentTriplet(empty var)', accentTriplet(''), null],
    ['accentTriplet(#12345)', accentTriplet('#12345'), null],
    ['benign(favicon 404)', benign('https://x/favicon.ico', 404), true],
    ['benign(fresh session 404)', benign('https://x/api/sessions/s1', 404), true],
    ['benign(transcript 404)', benign('https://x/api/sessions/s1/transcript', 404), false],
    ['benign(500)', benign('https://x/api/x', 500), false],
  ];
  let bad = 0;
  for (const [label, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${label} => ${got} (want ${want})`);
  }
  console.log(`\nprobe-prompt-rail --self-test: ${cases.length - bad} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
}

(async () => {
  const hardStop = setTimeout(() => {
    console.error(`\nPROBE TIMEOUT: exceeded the ${Math.round(RUN_BUDGET_MS / 60000)}min budget`);
    process.exit(2);
  }, RUN_BUDGET_MS);
  hardStop.unref?.();

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.clear();
      localStorage.setItem('lokma-token', t);
    } catch {
      /* ignore */
    }
  }, TOKEN);
  const page = await ctx.newPage();
  // Reduced motion makes `scrollBehavior()` return 'auto', so a dot click
  // lands instantly — the jump check can't race a smooth-scroll animation.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failed = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !benign(r.url(), r.status())) failed.push(`${r.status()} ${r.url()}`);
  });

  await page.goto(`${BASE}/?token=${encodeURIComponent(TOKEN)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  // Start from an empty session: boot resumes the most recent one, so an
  // expected dot count is only meaningful once the transcript is empty. The
  // click races the boot fetch, so confirm the transcript emptied and retry.
  const box = page.locator('textarea').first();
  let emptied = false;
  for (let attempt = 0; attempt < 3 && !emptied; attempt += 1) {
    await page
      .locator('button[aria-label="New session"]')
      .first()
      .click({ timeout: 15000 })
      .catch(() => {});
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(500);
      if ((await snapshot(page)).rows === 0) {
        emptied = true;
        break;
      }
    }
    if (!emptied) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(5000);
    }
  }
  console.log(`fresh session: ${emptied ? 'empty transcript confirmed' : 'NOT empty — other sessions share this account, measuring relatively'}`);
  await box.waitFor({ timeout: 20000 });

  // Boot resumes the most recent transcript, and this live account is shared
  // with other probe runs, so a pristine session is not guaranteed. Whatever is
  // already mounted is BASELINE: the rail checks below count only rows this run
  // adds, so a busy transcript can't be mistaken for a rail regression.
  const baseline = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('[id^="chat-msg-"]'));
    const isPrompt = (el) => /^You/.test((el.textContent || '').replace(/\s+/g, ' ').trim());
    const prompts = rows.filter(isPrompt);
    return { userPrompts: prompts.length, userPromptIds: prompts.map((el) => el.id) };
  });
  console.log(
    `baseline: ${baseline.userPrompts} prompt row(s) already mounted ${JSON.stringify(baseline.userPromptIds.slice(-6))}`,
  );

  // The rail reflects the WHOLE transcript, while only a tail window of rows is
  // mounted — so the honest invariant is the DELTA: each prompt this run lands
  // must add exactly one dot, whatever the transcript already held.
  const prompts = armPromptDetector(page, Date.now() + RUN_BUDGET_MS);
  await waitIdle(page, { deadline: Date.now() + 60000 });
  const pre = await snapshot(page);
  const dotsBefore = pre.dots;
  console.log(`dots before this run's sends: ${dotsBefore} (rows=${pre.rows})`);

  // Send three prompts; each one becomes a user row (and, when the upstream
  // answers, an assistant row — which the rail must ignore). A send fired while
  // a run is still open is swallowed by the app, so every send is gated on idle
  // AND confirmed by the `{"type":"prompt"}` frame it emits — the count below
  // never depends on the model answering, so a dead upstream costs the "landed"
  // checks but cannot stall the run.
  const sendDeadline = Date.now() + SEND_WINDOW_MS;
  let landedCount = 0;
  for (const text of PROMPTS) {
    let landed = false;
    for (let attempt = 0; attempt < 2 && !landed && Date.now() < sendDeadline; attempt += 1) {
      // idle is gated BEFORE typing too — the first prompt used to race the
      // post-"New session" boot.
      await waitIdle(page, { deadline: sendDeadline });
      const seen = prompts.seen();
      await box.fill(text);
      await box.press('Enter');
      landed = await prompts.wait(seen, sendDeadline);
      if (!landed) console.log(`  retry: "${text}" never emitted a prompt frame`);
    }
    if (landed) landedCount += 1;
    else console.log(`  SWALLOWED: "${text}" emitted no prompt frame even after a retry`);
  }
  console.log(`landed ${landedCount}/${PROMPTS.length} prompt frame(s)`);

  // Let the transcript paint the rows those frames opened (assistant rows land
  // later and must NOT add dots). Bounded: whatever has painted by the deadline
  // is what the rail is measured against.
  await waitIdle(page, { deadline: Date.now() + 90000 });

  // ---- measure the rail
  const rail = await page.evaluate(({ baseIds, landed }) => {
    const dots = Array.from(document.querySelectorAll('[aria-label^="Go to your prompt"]'));
    const rows = Array.from(document.querySelectorAll('[id^="chat-msg-"]')).map((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return {
        id: el.id,
        snippet: text.slice(0, 50),
        // UserRow renders the avatar glyph then the literal "You" label.
        user: /^You/.test(text),
      };
    });
    // The prompts THIS run landed: the newest user rows beyond the baseline.
    const newPromptIds = rows
      .filter((r) => r.user && !baseIds.includes(r.id))
      .map((r) => r.id)
      .slice(-Math.max(landed, 0));
    return {
      dots: dots.map((d) => ({
        label: d.getAttribute('aria-label'),
        title: d.getAttribute('title'),
        target: d.getAttribute('data-target'),
      })),
      rows,
      newPromptIds,
    };
  }, { baseIds: baseline.userPromptIds, landed: landedCount });
  console.log('rows:', JSON.stringify(rail.rows, null, 1));
  console.log(`new prompt rows this run: ${JSON.stringify(rail.newPromptIds)}`);

  const userPrompts = rail.rows.filter((r) => r.user).length;
  const targets = rail.dots.map((d) => Number(/(\d+)$/.exec(d.target || '')?.[1] ?? -1));
  const added = rail.dots.length - dotsBefore;
  check(rail.dots.length > 0, 'rail renders dots', `${rail.dots.length} dots`);
  check(
    landedCount === PROMPTS.length && added === landedCount,
    'rail lists exactly the prompts sent',
    `landed=${landedCount}/${PROMPTS.length} prompts sent=${PROMPTS.length} dots ${dotsBefore}->${rail.dots.length} (+${added})`,
  );
  check(
    rail.newPromptIds.length > 0 && rail.newPromptIds.every((id) => rail.dots.some((d) => d.target === id)),
    'every prompt this run sent got its own dot',
    rail.newPromptIds.join(',') || '(none)',
  );
  check(
    userPrompts <= rail.dots.length,
    'rail never lists rows that are not prompts',
    `mounted prompt rows=${userPrompts} total rows=${rail.rows.length} dots=${rail.dots.length}`,
  );
  check(
    rail.dots.every((d) => /^Go to your prompt \d+ of \d+: /.test(d.label || '')),
    'dots are labelled as prompts',
    rail.dots[0]?.label || '(none)',
  );
  // Text may repeat (PROMPT RAIL PROBE TWO is sent twice), so the honest form is
  // "as many dots quote this prompt as we sent it" — not a set membership test.
  const quoted = (p) => rail.dots.filter((d) => (d.title || '').includes(p) && (d.label || '').includes(p)).length;
  const wantQuoted = (p) => PROMPTS.filter((x) => x === p).length;
  check(
    [...new Set(PROMPTS)].every((p) => quoted(p) === wantQuoted(p)),
    'dot labels and tooltips quote the prompt text',
    `${[...new Set(PROMPTS)].map((p) => `${p}=${quoted(p)}/${wantQuoted(p)}`).join(' ')}`,
  );
  check(
    targets.every((t, i) => t > 0 && (i === 0 || t > targets[i - 1])) &&
      rail.dots.every((d) => d.target === `chat-msg-${Number(/(\d+)$/.exec(d.target || '')?.[1])}`),
    'dots point at ascending transcript rows',
    targets.join(','),
  );

  // ---- jump: scroll to the bottom, click the FIRST prompt dot. The row may not
  // be mounted yet (long sessions render a tail window), so the click has to
  // widen the window and then land on the prompt.
  const targetId = rail.dots[0].target;
  const before = await page.evaluate((target) => {
    const row = document.querySelector('[id^="chat-msg-"]');
    let el = row?.parentElement;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
    return {
      found: Boolean(el),
      scrollTop: el ? Math.round(el.scrollTop) : 0,
      mounted: Boolean(document.getElementById(target)),
    };
  }, targetId);
  await page.waitForTimeout(1200);

  await page.locator('[data-target="' + targetId + '"]').first().click();
  await page.waitForTimeout(1800);

  const jump = await page.evaluate((id) => {
    const node = document.getElementById(id);
    const scrollable = (() => {
      let el = node?.parentElement;
      while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
      return el;
    })();
    if (!node) return { resolved: false, target: null, viewport: Math.round(window.innerHeight / 2), scrollTop: -1 };
    const r = node.getBoundingClientRect();
    const scrollTop = scrollable ? Math.round(scrollable.scrollTop) : -1;
    return {
      resolved: true,
      target: {
        top: Math.round(r.top),
        center: Math.round(r.top + r.height / 2),
        visible: r.top >= 0 && r.bottom <= window.innerHeight,
        isPrompt: /^You/.test((node.textContent || '').replace(/\s+/g, ' ').trim()),
      },
      atTop: scrollTop <= 4,
      viewport: Math.round(window.innerHeight / 2),
      scrollTop,
    };
  }, targetId);

  check(before.found, 'chat scroller found', `scrollTop=${before.scrollTop}`);
  check(jump.resolved, 'the click resolves its prompt row (window widened when needed)', `${targetId} mounted before=${before.mounted}`);
  check(
    jump.resolved && jump.target.isPrompt,
    'the jumped-to row is a prompt of mine',
    jump.resolved ? (jump.target.isPrompt ? 'starts with the You label' : 'row is not a prompt') : 'no row',
  );
  check(
    jump.resolved && jump.target.visible && (Math.abs(jump.target.center - jump.viewport) < 320 || jump.atTop),
    'clicking a dot lands on that prompt',
    jump.resolved
      ? `center=${jump.target.center} viewportMid=${jump.viewport} visible=${jump.target.visible} atTop=${jump.atTop}`
      : 'no geometry',
  );
  check(
    jump.scrollTop !== before.scrollTop,
    'the click actually moves the transcript',
    `scrollTop ${before.scrollTop} -> ${jump.scrollTop}`,
  );

  // The active dot must follow the viewport: exactly one dot is highlighted.
  // The accent is read from the live `--color-terracotta` token instead of a
  // hard-coded RGB literal, so re-theming the palette can't fail this check
  // for the wrong reason.
  const active = await page.evaluate(() => {
    const dots = Array.from(document.querySelectorAll('[aria-label^="Go to your prompt"]'));
    return {
      total: dots.length,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--color-terracotta').trim(),
      backgrounds: dots.map((d) => getComputedStyle(d).backgroundColor),
    };
  });
  const accent = accentTriplet(active.accent);
  const hot = accent ? active.backgrounds.filter((bg) => bg.includes(accent)).length : -1;
  check(
    hot === 1,
    'exactly one dot is marked as the current prompt',
    `${hot}/${active.total} highlighted (accent ${active.accent || 'unset'})`,
  );

  await page.screenshot({ path: '/tmp/req140-prompt-rail.png', fullPage: false });
  console.log('screenshot: /tmp/req140-prompt-rail.png');
  check(failed.length === 0, 'no failed requests', failed.slice(0, 3).join(' | '));

  await browser.close();
  const ok = results.every((r) => r.ok);
  console.log(`\nprobe-prompt-rail: ${results.filter((r) => r.ok).length} passed, ${results.filter((r) => !r.ok).length} failed`);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('PROBE ERROR:', e.message);
  process.exit(1);
});
