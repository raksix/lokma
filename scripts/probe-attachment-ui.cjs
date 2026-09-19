#!/usr/bin/env node
/**
 * REQ-160 UI proof — after a reload the agent-sent screenshot must render as
 * an inline image again (rows arrive over the socket now, and the mapper used
 * to drop `attachments`, so nothing was painted at all).
 *
 * Run: TK=$(HOME=/root bun scripts/mint-e2e-token.mjs 2>/dev/null | tail -1) && \
 *      NODE_PATH=/root/test-hermes/node_modules xvfb-run -a node scripts/probe-attachment-ui.cjs \
 *        --url https://lokma.fermag.com.tr --token "$TK" --session sess_mu7la9j9_fvo6
 */
const { chromium } = require('playwright-core');

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const URL_BASE = arg('url', 'https://lokma.fermag.com.tr');
const TOKEN = arg('token', '');
const SESSION = arg('session', '');
if (!TOKEN || !SESSION) {
  console.error('usage: --token <bearer> --session <sess_id>');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed += 1;
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // The shell keeps its active session in localStorage, so the chat can be
  // opened straight on the target instead of fighting the sidebar.
  await ctx.addInitScript(
    ([t, sid]) => {
      try {
        localStorage.setItem('lokma-token', t);
        localStorage.setItem('lokma:sessionId', sid);
      } catch {}
    },
    [TOKEN, SESSION],
  );
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/?token=${encodeURIComponent(TOKEN)}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);

  // Session id was seeded above; the shell restores it on boot.
  await sleep(6000);

  const seen = await page.evaluate(() => {
    const images = [...document.querySelectorAll('[data-chat-attachment="image"] img')];
    const cards = [...document.querySelectorAll('[data-chat-attachment="file"]')];
    const loading = [...document.querySelectorAll('[data-attachments] div')].filter((el) =>
      (el.textContent || '').includes('Görsel yükleniyor'),
    );
    return {
      images: images.length,
      naturalWidths: images.map((i) => i.naturalWidth),
      cards: cards.length,
      loading: loading.length,
    };
  });
  check('an inline attachment image is painted after reload', seen.images > 0, `images=${seen.images}`);
  check('the image actually decoded (naturalWidth > 0)', seen.naturalWidths.some((w) => w > 0), `widths=${JSON.stringify(seen.naturalWidths)}`);
  check('no attachment is stuck on the loading placeholder', seen.loading === 0, `loading=${seen.loading}`);
  console.log(`file cards on screen: ${seen.cards}`);
  await page.screenshot({ path: '/tmp/req160-attachment-ui.png' });
  console.log(`screenshot: /tmp/req160-attachment-ui.png`);
  await browser.close();
  console.log(`\nprobe-attachment-ui: ${passed}/3 checks passed.`);
  process.exit(passed === 3 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
