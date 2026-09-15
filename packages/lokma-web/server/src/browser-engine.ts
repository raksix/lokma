import { existsSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import {
  browserTabs,
  BrowserEngineError,
  type BrowserScrollDirection,
  type BrowserToolEngine,
} from '@lokma/core';

/**
 * Server browser engine (REQ-154) — a REAL headless Chromium behind the
 * agent's browser tools, bound one page per browser tab.
 *
 * Design notes:
 * - Lazy: nothing launches until the first tool call; the browser is closed
 *   again when the last page went idle, so an unused server pays nothing.
 * - URL-synced: before every call the page is navigated to the tab's CURRENT
 *   url (the tab record is the single source of truth the pane also renders),
 *   so agent calls and pane history never diverge on WHICH page is meant.
 * - Honest split: the engine renders server-side while the pane renders the
 *   user's own iframe — same URL, separate pixels. `touchAgentUse` stamps the
 *   tab so the pane can show the split (badge); docs say it explicitly.
 * - SSRF guard on every load: loopback/private/link-local hosts and hosts
 *   resolving to such addresses are refused (the pane's own iframe stays
 *   untouched — this guard is engine-only).
 * - Credentials: `type` never echoes password/token field values back.
 *
 * Env overrides: `LOKMA_BROWSER_CHROME` (chromium binary), `LOKMA_BROWSER_CACHE`
 * (ms-playwright root, default `/root/.cache/ms-playwright`).
 */

const NAV_TIMEOUT_MS = 25_000;
const OP_TIMEOUT_MS = 20_000;
const SHOT_TIMEOUT_MS = 30_000;
const IDLE_PAGE_MS = 10 * 60 * 1000;
const REAP_INTERVAL_MS = 60_000;
const HOST_CACHE_TTL_MS = 5 * 60 * 1000;
const READ_DEFAULT_CHARS = 8_000;

/** Race an op against a wall-clock cap → typed timeout error. */
function withTimeout<T>(ms: number, op: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new BrowserEngineError('timeout', `${what} did not finish within ${ms} ms`)), ms);
    t.unref?.();
    op.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** Resolve the chromium binary (env override → newest cached ms-playwright build). */
let chromePathCache: string | null = null;
function resolveChromePath(): string {
  if (chromePathCache) return chromePathCache;
  const env = process.env.LOKMA_BROWSER_CHROME;
  if (env) {
    if (!existsSync(env)) throw new BrowserEngineError('engine_unavailable', `LOKMA_BROWSER_CHROME points at a missing file: ${env}`);
    chromePathCache = env;
    return chromePathCache;
  }
  const root = process.env.LOKMA_BROWSER_CACHE || '/root/.cache/ms-playwright';
  try {
    const dirs = readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
    for (let i = dirs.length - 1; i >= 0; i -= 1) {
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = join(root, dirs[i], sub);
        if (existsSync(p)) {
          chromePathCache = p;
          return p;
        }
      }
    }
  } catch {
    // fall through to the honest error below
  }
  throw new BrowserEngineError(
    'engine_unavailable',
    `No Chromium found under ${root} — set LOKMA_BROWSER_CHROME to the binary path.`,
  );
}

/** RFC1918/loopback/link-local/CGNAT + IPv6 private ranges. */
function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link local
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // not an IP at all → treat as unsafe here
}

type PageEntry = { page: Page; lastUsedAt: number };

export class BrowserEngine implements BrowserToolEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages = new Map<string, PageEntry>();
  private launching: Promise<BrowserContext> | null = null;
  private hostChecks = new Map<string, { ok: boolean; at: number }>();

  /** Lazy launch — one browser + one isolated context for all tabs. */
  private async ensureContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    this.launching ??= (async () => {
      const chromePath = resolveChromePath();
      const pw = await import('playwright-core').catch((e: unknown) => {
        this.launching = null;
        throw new BrowserEngineError('engine_unavailable', `playwright-core is not installed in this server: ${(e as Error).message}`);
      });
      const browser = await pw.chromium.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      browser.on('disconnected', () => {
        this.browser = null;
        this.context = null;
        this.launching = null;
        this.pages.clear();
      });
      this.browser = browser;
      this.context = context;
      return context;
    })().catch((e: unknown) => {
      this.launching = null;
      throw e;
    });
    return this.launching;
  }

  /** SSRF guard: only public http(s) hosts may load in the engine. */
  private async assertPublicUrl(raw: string): Promise<void> {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new BrowserEngineError('bad_url', `Not a valid URL: ${raw.slice(0, 300)}`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new BrowserEngineError('blocked_url', `Only http(s) pages can load in the engine (got ${u.protocol}).`);
    }
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata.google.internal'
    ) {
      throw new BrowserEngineError('blocked_url', `Refusing a private host: ${host}`);
    }
    const cached = this.hostChecks.get(host);
    if (cached && Date.now() - cached.at < HOST_CACHE_TTL_MS) {
      if (!cached.ok) throw new BrowserEngineError('blocked_url', `Refusing a private address behind ${host}`);
      return;
    }
    let addrs: string[];
    if (isIP(host)) {
      addrs = [host];
    } else {
      const resolved = await lookup(host, { all: true }).catch(() => null);
      if (!resolved || resolved.length === 0) {
        throw new BrowserEngineError('dns_failed', `Could not resolve ${host}`);
      }
      addrs = resolved.map((r) => r.address);
    }
    const priv = addrs.find((a) => isPrivateAddress(a));
    if (priv) {
      this.hostChecks.set(host, { ok: false, at: Date.now() });
      throw new BrowserEngineError('blocked_url', `Refusing a private/loopback address (${host} → ${priv})`);
    }
    this.hostChecks.set(host, { ok: true, at: Date.now() });
  }

  /** Get (or create) the engine page for a tab, synced to the tab's URL. */
  private async ensurePage(tabId: string): Promise<Page> {
    const { record } = browserTabs.get(tabId);
    const url = record.url;
    if (!url || url === 'about:blank') {
      throw new BrowserEngineError('no_page', 'This tab has no page open — open a URL first (open_browser), then retry.');
    }
    await this.assertPublicUrl(url);
    let entry = this.pages.get(tabId);
    if (entry && entry.page.isClosed()) {
      this.pages.delete(tabId);
      entry = undefined;
    }
    if (!entry) {
      const context = await this.ensureContext();
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      entry = { page, lastUsedAt: Date.now() };
      this.pages.set(tabId, entry);
    }
    if (entry.page.url() !== url) {
      await withTimeout(
        NAV_TIMEOUT_MS,
        entry.page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).then(() => undefined),
        'Navigation',
      ).catch((e: unknown) => {
        if (e instanceof BrowserEngineError) throw e;
        throw new BrowserEngineError('nav_failed', `Could not load ${url}: ${(e as Error).message.slice(0, 200)}`);
      });
    }
    entry.lastUsedAt = Date.now();
    try {
      browserTabs.touchAgentUse(tabId);
    } catch {
      // Tab vanished mid-call — the page result still stands; the next call 404s.
    }
    return entry.page;
  }

  private async readScroll(page: Page): Promise<{ scrollY: number; scrollHeight: number; viewportHeight: number }> {
    return page.evaluate(() => ({
      scrollY: Math.round(window.scrollY),
      scrollHeight: Math.round(document.documentElement.scrollHeight),
      viewportHeight: Math.round(window.innerHeight),
    }));
  }

  /** Wait for smooth scrolling to settle (two stable reads or ~1.6 s cap). */
  private async settleScroll(page: Page, before: number): Promise<void> {
    let prev = before;
    let stable = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(140);
      const { scrollY } = await this.readScroll(page);
      if (scrollY === prev) {
        stable += 1;
        if (stable >= 2) return;
      } else {
        stable = 0;
        prev = scrollY;
      }
    }
  }

  async readPage(tabId: string, opts: { maxChars?: number }): Promise<{
    url: string; title: string; text: string; totalChars: number; truncated: boolean;
    scrollY: number; scrollHeight: number; viewportHeight: number;
  }> {
    const page = await this.ensurePage(tabId);
    const maxChars = Math.min(Math.max(opts.maxChars ?? READ_DEFAULT_CHARS, 500), 20_000);
    const data = await withTimeout(OP_TIMEOUT_MS, page.evaluate((cap: number) => {
      const text = document.body ? document.body.innerText : '';
      return {
        title: document.title,
        url: location.href,
        text: text.slice(0, cap),
        totalChars: text.length,
        scrollY: Math.round(window.scrollY),
        scrollHeight: Math.round(document.documentElement.scrollHeight),
        viewportHeight: Math.round(window.innerHeight),
      };
    }, maxChars), 'Reading the page');
    return { ...data, truncated: data.totalChars > maxChars };
  }

  async scroll(tabId: string, opts: { direction: BrowserScrollDirection; amount?: number }): Promise<{
    scrollY: number; scrollHeight: number; viewportHeight: number; atTop: boolean; atBottom: boolean;
  }> {
    const page = await this.ensurePage(tabId);
    const before = await this.readScroll(page);
    const vp = page.viewportSize() ?? { width: 1280, height: 800 };
    const step = opts.amount ?? Math.max(200, Math.round(before.viewportHeight * 0.9));
    const delta =
      opts.direction === 'top' ? -1_000_000
        : opts.direction === 'bottom' ? 1_000_000
          : opts.direction === 'up' ? -step
            : step;
    await withTimeout(OP_TIMEOUT_MS, (async () => {
      await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
      await page.mouse.wheel(0, delta);
      await this.settleScroll(page, before.scrollY);
    })(), 'Scrolling');
    const after = await this.readScroll(page);
    return {
      ...after,
      atTop: after.scrollY <= 2,
      atBottom: after.scrollY + after.viewportHeight >= after.scrollHeight - 2,
    };
  }

  async click(tabId: string, opts: { selector?: string; text?: string }): Promise<{
    matched: string; url: string; title: string; navigated: boolean;
  }> {
    const page = await this.ensurePage(tabId);
    const before = page.url();
    const target = opts.selector
      ? { locator: page.locator(opts.selector), label: opts.selector }
      : { locator: page.getByText(opts.text as string, { exact: false }), label: `text=${opts.text}` };
    try {
      await withTimeout(OP_TIMEOUT_MS, target.locator.first().click({ timeout: 8_000 }).then(() => undefined), 'Clicking');
    } catch (e) {
      if (e instanceof BrowserEngineError) throw e;
      if ((e as Error).name === 'TimeoutError') {
        throw new BrowserEngineError('element_not_found', `No clickable element matched ${target.label}`);
      }
      throw e;
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    return {
      matched: target.label,
      url: page.url(),
      title: await page.title().catch(() => ''),
      navigated: page.url() !== before,
    };
  }

  async type(tabId: string, opts: { selector: string; text: string; submit?: boolean }): Promise<{
    selector: string; masked: boolean; url: string; title: string; submitted: boolean;
  }> {
    const page = await this.ensurePage(tabId);
    const locator = page.locator(opts.selector).first();
    const masked = await locator
      .evaluate((el) => {
        const input = el as HTMLInputElement;
        const probe = `${input.type ?? ''} ${input.name ?? ''} ${input.id ?? ''} ${input.placeholder ?? ''}`;
        return /password|passwd|token|secret|otp|api[-_ ]?key/i.test(probe);
      })
      .catch(() => false);
    try {
      await withTimeout(OP_TIMEOUT_MS, locator.fill(opts.text, { timeout: 8_000 }).then(() => undefined), 'Typing');
    } catch (e) {
      if (e instanceof BrowserEngineError) throw e;
      if ((e as Error).name === 'TimeoutError') {
        throw new BrowserEngineError('element_not_found', `No fillable field matched ${opts.selector}`);
      }
      throw e;
    }
    let submitted = false;
    if (opts.submit) {
      submitted = true;
      await page.keyboard.press('Enter').catch(() => undefined);
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    // The value is intentionally never echoed — only whether it was a secret field.
    return {
      selector: opts.selector,
      masked,
      url: page.url(),
      title: await page.title().catch(() => ''),
      submitted,
    };
  }

  async screenshot(tabId: string, opts: { fullPage?: boolean; cwd?: string }): Promise<{
    file: string; absolutePath: string; width: number; height: number; fullPage: boolean;
  }> {
    const page = await this.ensurePage(tabId);
    const fullPage = opts.fullPage === true;
    const vp = page.viewportSize() ?? { width: 1280, height: 800 };
    const dims = fullPage
      ? await page.evaluate(() => ({
          width: Math.round(document.documentElement.scrollWidth),
          height: Math.round(document.documentElement.scrollHeight),
        })).catch(() => vp)
      : { width: vp.width, height: vp.height };
    const buffer = await withTimeout(
      SHOT_TIMEOUT_MS,
      page.screenshot({ fullPage, type: 'png' }),
      'Screenshot',
    );
    // Workspace root: explicit override → the tab record's session cwd → server cwd.
    const recordCwd = browserTabs.get(tabId).record.cwd;
    const cwd = opts.cwd?.trim() || recordCwd || process.cwd();
    const dir = join(cwd, '.lokma', 'browser-shots');
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `${tabId.replace(/[^A-Za-z0-9_-]/g, '')}-${stamp}.png`;
    const absolutePath = join(dir, name);
    await writeFile(absolutePath, buffer);
    return { file: `.lokma/browser-shots/${name}`, absolutePath, width: dims.width, height: dims.height, fullPage };
  }

  /** Close one tab's engine page (tab closed in the registry). */
  async dispose(tabId: string): Promise<void> {
    const entry = this.pages.get(tabId);
    this.pages.delete(tabId);
    if (entry) await entry.page.close().catch(() => undefined);
  }

  /** Reap idle pages; close the browser entirely when nothing is left. */
  async reapIdle(now = Date.now()): Promise<void> {
    for (const [tabId, entry] of [...this.pages.entries()]) {
      if (now - entry.lastUsedAt > IDLE_PAGE_MS) {
        await this.dispose(tabId);
      }
    }
    if (this.pages.size === 0 && this.browser) {
      const browser = this.browser;
      this.browser = null;
      this.context = null;
      this.launching = null;
      await browser.close().catch(() => undefined);
    }
  }

  /** Best-effort shutdown (signals + tests). */
  async shutdown(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    this.context = null;
    this.launching = null;
    this.pages.clear();
    if (browser) await browser.close().catch(() => undefined);
  }
}

/** Process-wide singleton the agent loop binds as the default engine. */
export const defaultBrowserEngine = new BrowserEngine();

const reaper = setInterval(() => {
  void defaultBrowserEngine.reapIdle();
}, REAP_INTERVAL_MS);
reaper.unref?.();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void defaultBrowserEngine.shutdown();
  });
}
