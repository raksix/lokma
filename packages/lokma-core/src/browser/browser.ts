/**
 * Browser tabs — server-owned per-agent tab registry behind the BrowserPane (W3-12).
 * Each tab is a real navigation record: current URL + back/forward history +
 * owning agent/session + workspace scope label. Pages themselves render live in
 * the user's browser via a sandboxed iframe (the browser engine is the client,
 * not the server) — so Back/Forward/Reload move a REAL history pointer and the
 * iframe navigates to REAL urls; nothing here is faked.
 *
 * Honest scope: no CDP/screenshot pipeline yet (no Playwright/puppeteer dep in
 * the repo). Live AI-driven screenshots over WS (`browser_navigate` tool +
 * screenshot frames) land with the agent tool loop (W4+). Until then the server
 * owns tabs + history and the client renders them.
 * See Docs/24 §browser pane.
 */

/** Max history entries kept per tab (oldest dropped past this). */
export const BROWSER_HISTORY_CAP = 50;
/** Max concurrently open tabs (429 `browser_limit` past this). */
export const BROWSER_MAX_TABS = 20;
/** Max URL chars accepted (400 `bad_url` past this). */
export const BROWSER_URL_CAP = 2048;

export type BrowserTabRecord = {
  id: string;
  url: string;
  /** Full navigation history, oldest first. */
  history: string[];
  /** Index into `history` pointing at `url`. */
  index: number;
  /** Owning agent (optional label) — tabs group by this when set. */
  agentId: string | null;
  /** Owning web session (tabs list-filter by this). */
  sessionId: string;
  /** Workspace scope shown under each tab (session cwd, may be empty). */
  cwd: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpenTabOpts = {
  url?: string;
  agentId?: string;
  sessionId?: string;
  cwd?: string;
};

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class BrowserError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BrowserError';
    this.code = code;
    this.status = status;
  }
}

const TAB_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function newTabId(): string {
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function assertTabId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !TAB_ID_PATTERN.test(id)) {
    throw new BrowserError('bad_tab_id', 'Invalid tab id', 400);
  }
}

/**
 * Normalize user input into a loadable http(s) URL.
 * Bare hosts gain `https://`; non-http(s) schemes (javascript:, data:,
 * file:, ...) are rejected so a tab can never become an XSS/sandbox-escape
 * vector. Mirrors the web `normalizeUrlInput` helper (same rule, both sides).
 */
export function normalizeTabUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new BrowserError('bad_url', 'url must be a non-empty string', 400);
  }
  const trimmed = input.trim();
  if (trimmed.length > BROWSER_URL_CAP) {
    throw new BrowserError('bad_url', `url must be under ${BROWSER_URL_CAP} chars`, 400);
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new BrowserError('bad_url', 'url is not a valid web address', 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BrowserError('bad_url', 'Only http(s) urls can be opened in a tab', 400);
  }
  if (!parsed.hostname) {
    throw new BrowserError('bad_url', 'url is not a valid web address', 400);
  }
  return parsed.toString();
}

function cleanLabel(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

class BrowserTabs {
  private tabs = new Map<string, BrowserTabRecord>();

  /** Open a tab — url defaults to a blank new-tab page owned by the session. */
  open(opts: OpenTabOpts = {}): { record: BrowserTabRecord } {
    const live = [...this.tabs.values()].filter((t) => t.sessionId === (opts.sessionId ?? ''));
    if (live.length >= BROWSER_MAX_TABS) {
      throw new BrowserError('browser_limit', `Too many open tabs (max ${BROWSER_MAX_TABS})`, 429);
    }
    const url = opts.url === undefined ? 'about:blank' : normalizeTabUrl(opts.url);
    const now = new Date().toISOString();
    const record: BrowserTabRecord = {
      id: newTabId(),
      url,
      history: [url],
      index: 0,
      agentId: cleanLabel(opts.agentId),
      sessionId: typeof opts.sessionId === 'string' && opts.sessionId ? opts.sessionId : '',
      cwd: cleanLabel(opts.cwd),
      createdAt: now,
      updatedAt: now,
    };
    this.tabs.set(record.id, record);
    return { record };
  }

  /** List tabs, newest first; filter by owning session when given. */
  list(sessionId?: string): BrowserTabRecord[] {
    const all = [...this.tabs.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (sessionId === undefined || sessionId === '') return all;
    return all.filter((t) => t.sessionId === sessionId);
  }

  get(id: string): { record: BrowserTabRecord } {
    assertTabId(id);
    const record = this.tabs.get(id);
    if (!record) throw new BrowserError('tab_not_found', 'No such browser tab', 404);
    return { record };
  }

  /** Navigate — pushes onto history (forward entries dropped), returns the tab. */
  navigate(id: string, url: unknown): { record: BrowserTabRecord } {
    assertTabId(id);
    const record = this.tabs.get(id);
    if (!record) throw new BrowserError('tab_not_found', 'No such browser tab', 404);
    const next = normalizeTabUrl(url);
    record.history = [...record.history.slice(0, record.index + 1), next].slice(-BROWSER_HISTORY_CAP);
    record.index = record.history.length - 1;
    record.url = next;
    record.updatedAt = new Date().toISOString();
    return { record };
  }

  /** Step the history pointer back — 409 `no_history` at the oldest entry. */
  back(id: string): { record: BrowserTabRecord } {
    assertTabId(id);
    const record = this.tabs.get(id);
    if (!record) throw new BrowserError('tab_not_found', 'No such browser tab', 404);
    if (record.index <= 0) throw new BrowserError('no_history', 'No earlier page in this tab', 409);
    record.index -= 1;
    record.url = record.history[record.index];
    record.updatedAt = new Date().toISOString();
    return { record };
  }

  /** Step the history pointer forward — 409 `no_history` at the newest entry. */
  forward(id: string): { record: BrowserTabRecord } {
    assertTabId(id);
    const record = this.tabs.get(id);
    if (!record) throw new BrowserError('tab_not_found', 'No such browser tab', 404);
    if (record.index >= record.history.length - 1) {
      throw new BrowserError('no_history', 'No later page in this tab', 409);
    }
    record.index += 1;
    record.url = record.history[record.index];
    record.updatedAt = new Date().toISOString();
    return { record };
  }

  /** Reload — no state change besides the touch; the client re-sets the frame. */
  reload(id: string): { record: BrowserTabRecord } {
    assertTabId(id);
    const record = this.tabs.get(id);
    if (!record) throw new BrowserError('tab_not_found', 'No such browser tab', 404);
    record.updatedAt = new Date().toISOString();
    return { record };
  }

  /** Forget a tab (history goes with it). Unknown ids 404 like the rest. */
  close(id: string): { closed: boolean } {
    assertTabId(id);
    if (!this.tabs.delete(id)) throw new BrowserError('tab_not_found', 'No such browser tab', 404);
    return { closed: true };
  }

  /** Test-only reset (live probes run against throwaway procs, never prod). */
  clearForTests(): void {
    this.tabs.clear();
  }
}

/** Process-wide singleton — tabs live as long as the server does. */
export const browserTabs = new BrowserTabs();
