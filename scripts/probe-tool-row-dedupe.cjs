#!/usr/bin/env node
/**
 * REQ-170 live probe — a tool call must be painted exactly ONCE while the run
 * is going: live while it runs, timeline once its row lands.
 *
 * Real model run on the deployed app: the probe creates a session in the repo
 * workspace, sends a prompt that calls three read-only tools, and watches the
 * DOM the whole time. Instead of blind sampling it installs a page-side
 * MutationObserver (before the app boots) that scans every rendered tool-row
 * title (describeToolCall text, e.g. 'Read <path>') on EVERY DOM change:
 *
 *   - `max[title]`     — the highest number of rows with that title ever seen
 *                        in one DOM state. The old bug painted a completed
 *                        call twice at once (its timeline row plus a second
 *                        copy under the 'Lokma' live block) => 2.
 *   - `liveSeen[title]` — the title was at some point inside the live block
 *                        (the `space-y-1.5` list under the 'Lokma' header).
 *
 * Assertions:
 *   1. max[title] === 1 for every call, and it was seen live at least once
 *      (the live layer paints in-flight calls; the fix must not hide them),
 *   2. once the run ends every call appears exactly once and none is left in
 *      the live block,
 *   3. the run really exercised several tools (>= 3 distinct titles).
 *
 * Usage: TK=$(HOME=/root bun scripts/mint-e2e-token.mjs | tail -1)
 *   NODE_PATH=/root/test-hermes/node_modules \
 *     xvfb-run -a node scripts/probe-tool-row-dedupe.cjs --url https://lokma.fermag.com.tr --token "$TK"
 */
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'https://lokma.fermag.com.tr';
const CHROME = process.env.LOKMA_CHROME || '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const TOKEN =
  (process.argv.includes('--token') ? process.argv[process.argv.indexOf('--token') + 1] : '') ||
  process.env.TOKEN ||
  '';
const MODEL =
  (process.argv.includes('--model') ? process.argv[process.argv.indexOf('--model') + 1] : '') ||
  'commandcode/deepseek/deepseek-v4.1-flash';
const CWD = process.argv.includes('--cwd')
  ? process.argv[process.argv.indexOf('--cwd') + 1]
  : '/mnt/apopic/lokma';
const RUN_TIMEOUT_MS = 240000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) {
  console.error('TOKEN is required (HOME=/root bun scripts/mint-e2e-token.mjs)');
  process.exit(1);
}

const failures = [];
const ok = (name, pass, detail) => {
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
  if (!pass) failures.push(name);
};

/** One DOM snapshot of every tool-row title (describeToolCall shapes) + placement. */
const SAMPLE = () => {
  const rows = [];
  const nodes = document.querySelectorAll('summary span.font-medium');
  for (const el of nodes) {
    const text = (el.textContent || '').trim();
    if (!/^(Read|List|Search|Run|Write|Open|Send) /.test(text)) continue;
    rows.push({ text, live: !!el.closest('div[class*="space-y-1.5"]') });
  }
  return rows;
};

const PROMPT =
  'Üç dosyayı oku ve üçünü de aynı turda çağır: ' +
  "read_file ile 1) 'package.json', 2) 'LICENSE', 3) 'Docs/README.md'. " +
  'Başka araç kullanma, metin yazma; üçünün sonucu gelince tek cümleyle özetle ve dur.';

(async () => {
  // 1. One session in the repo workspace — the tools are jailed to the cwd.
  const created = await fetch(BASE + '/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ cwd: CWD, model: MODEL }),
  });
  ok('session created over REST', created.status === 200 || created.status === 201, 'HTTP ' + created.status);
  const session = await created.json();
  const sessionId = session.id || session.sessionId;
  console.log('sessionId: ' + sessionId);

  // 2. Open the app straight into that session, with the DOM watcher installed
  //    before any app code runs.
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await ctx.addInitScript(
    (args) => {
      try {
        localStorage.setItem('lokma-token', args.token);
        localStorage.setItem('lokma:sessionId', args.sessionId);
      } catch (e) {
        /* ignore */
      }
      const rec = { max: {}, liveSeen: {}, scans: 0 };
      window.__req170 = rec;
      const scan = () => {
        try {
          rec.scans += 1;
          const counts = {};
          const nodes = document.querySelectorAll('summary span.font-medium');
          for (const el of nodes) {
            const text = (el.textContent || '').trim();
            if (!/^(Read|List|Search|Run|Write|Open|Send) /.test(text)) continue;
            counts[text] = (counts[text] || 0) + 1;
            if (el.closest('div[class*="space-y-1.5"]')) rec.liveSeen[text] = true;
          }
          for (const key of Object.keys(counts)) {
            rec.max[key] = Math.max(rec.max[key] || 0, counts[key]);
          }
        } catch (e) {
          /* ignore */
        }
      };
      new MutationObserver(scan).observe(document, { childList: true, subtree: true });
      scan();
    },
    { token: TOKEN, sessionId },
  );
  const page = await ctx.newPage();

  let doneSeen = false;
  let promptSent = false;
  const frames = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      const s = String(f.payload);
      if (s.indexOf('"type":"prompt"') !== -1) promptSent = true;
    });
    ws.on('framereceived', (f) => {
      const s = String(f.payload);
      frames.push(s);
      if (s.indexOf('"type":"done"') !== -1) doneSeen = true;
    });
  });

  await page.goto(BASE + '/?token=' + TOKEN, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  const box = page.locator('textarea').first();
  await box.click();
  await box.fill(PROMPT);
  await box.press('Enter');

  // 3. Sample alongside the observer: the time series proves WHEN rows moved
  //    from live to timeline; the observer proves no state was ever doubled.
  const samples = [];
  const startedAt = Date.now();
  let afterDone = 0;
  while (Date.now() - startedAt < RUN_TIMEOUT_MS) {
    const rows = await page.evaluate(SAMPLE);
    samples.push({ t: Date.now() - startedAt, rows });
    if (doneSeen) {
      afterDone += 1;
      if (afterDone >= 8) break; // ~2 s of settled post-run samples
    }
    await sleep(250);
  }
  const rec = await page.evaluate(() => window.__req170 || { max: {}, liveSeen: {}, scans: 0 });

  const toolStarts = frames
    .filter((f) => f.indexOf('"type":"tool_start"') !== -1)
    .map((f) => {
      const m = f.match(/"tool":"([^"]+)"/);
      return m ? m[1] : '?';
    });
  const toolResults = frames.filter((f) => f.indexOf('"type":"tool_result"') !== -1).length;
  const finalRows = samples.length ? samples[samples.length - 1].rows : [];
  const finalCounts = {};
  for (const r of finalRows) finalCounts[r.text] = (finalCounts[r.text] || 0) + 1;
  const titles = Object.keys(finalCounts);
  const liveAtEnd = finalRows.filter((r) => r.live).length;
  const doubled = Object.entries(rec.max).filter(([, n]) => n > 1);
  const neverLive = titles.filter((t) => !rec.liveSeen[t]);

  console.log('samples: ' + samples.length + ' (' + samples.filter((s) => s.rows.length > 0).length + ' with rows), observer scans: ' + rec.scans);
  console.log('server frames: ' + toolStarts.length + ' tool_start [' + toolStarts.join(', ') + '], ' + toolResults + ' tool_result');
  for (const t of titles) {
    console.log('  row: final ' + finalCounts[t] + 'x  max-seen ' + (rec.max[t] || 0) + 'x  live-seen ' + (rec.liveSeen[t] ? 'yes' : 'no') + '  ' + t);
  }

  ok('the prompt really started a run', promptSent && doneSeen, 'prompt=' + promptSent + ' done=' + doneSeen);
  ok('the run called several tools (>= 3 distinct rows)', titles.length >= 3, titles.length + ' distinct');
  ok('no tool call is ever painted twice (no doubled DOM state)', doubled.length === 0, doubled.map(([t, n]) => t + ' x' + n).join(' | ') || 'clean');
  ok('every call was painted live while it ran', neverLive.length === 0, neverLive.join(' | ') || 'all ' + titles.length);
  ok(
    'after the run every call appears exactly once',
    titles.length > 0 && titles.every((t) => finalCounts[t] === 1),
    JSON.stringify(finalCounts),
  );
  ok('nothing is left in the live block after the run', liveAtEnd === 0, liveAtEnd + ' live row(s)');

  const shot = '/tmp/req170-tool-row-dedupe.png';
  try {
    await page.screenshot({ path: shot });
    console.log('screenshot: ' + shot);
  } catch (e) {
    console.log('screenshot skipped: ' + (e && e.message ? e.message : String(e)));
  }
  await browser.close();

  // 4. Clean up the probe's own session and re-check it stays gone.
  if (process.argv.includes('--keep')) {
    console.log('--keep: session left in place for inspection: ' + sessionId);
  } else {
    const del = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sessionId), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    await sleep(500);
    const recheck = await fetch(BASE + '/api/sessions/' + encodeURIComponent(sessionId), {
      headers: { Authorization: 'Bearer ' + TOKEN },
    });
    ok(
      'probe session deleted',
      del.status === 200 || del.status === 204 || recheck.status === 404,
      'HTTP ' + del.status + ' (recheck ' + recheck.status + ')',
    );
    ok('probe session stays gone', recheck.status === 404, 'HTTP ' + recheck.status);
  }

  if (failures.length) {
    console.log('\nprobe-tool-row-dedupe: ' + failures.length + ' regression(s): ' + failures.join(', '));
    process.exit(1);
  }
  console.log('\nprobe-tool-row-dedupe: one call, one row — all checks passed.');
})();
