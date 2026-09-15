import type { BrowserTab } from '@/lib/api';

/**
 * Pure BrowserPane helpers — no DOM, no fetch (probe: `bun src/components/browser/browser.test.ts`).
 * URL rule mirrors the server `normalizeTabUrl` (same transform, both sides):
 * trim, bare host gains `https://`, only http(s) loads. The server stays the
 * source of truth — the pane pre-validates for instant feedback only.
 * Concept parity note: the hardcoded per-agent pills and toast-only
 * Back/Forward/Reload buttons are NOT ported — every control talks to a
 * live `/api/browser/*` endpoint.
 */

/** Max URL chars accepted by `POST /api/browser/*` (mirrors the server cap). */
export const BROWSER_URL_CAP = 2048;

/** Blank new-tab page owned by the session (server default on open). */
export const BROWSER_BLANK_URL = 'about:blank';

/** Client-side URL check mirroring the server `bad_url` rule. Null = valid. */
export function validateTabUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Type a web address first.';
  if (trimmed === BROWSER_BLANK_URL) return null;
  if (trimmed.length > BROWSER_URL_CAP) {
    return `Address is ${trimmed.length} chars — keep it under ${BROWSER_URL_CAP}.`;
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return 'That is not a valid web address.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only http(s) addresses can be opened in a tab.';
  }
  if (!parsed.hostname) return 'That is not a valid web address.';
  return null;
}

/** Short tab label: host + trimmed path, or "New tab" for the blank page. */
export function tabLabel(tab: BrowserTab): string {
  if (tab.url === BROWSER_BLANK_URL) return 'New tab';
  try {
    const parsed = new URL(tab.url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const label = `${parsed.host}${path}`;
    return label.length > 32 ? `${label.slice(0, 31)}…` : label;
  } catch {
    return tab.url.length > 32 ? `${tab.url.slice(0, 31)}…` : tab.url;
  }
}

/** True when the tab has an earlier page (server would not 409 `no_history`). */
export function canGoBack(tab: BrowserTab): boolean {
  return tab.index > 0;
}

/** True when the tab has a later page (server would not 409 `no_history`). */
export function canGoForward(tab: BrowserTab): boolean {
  return tab.index < tab.history.length - 1;
}

/** History position line, e.g. "2 of 5" (1-based for humans). */
export function historyPosition(tab: BrowserTab): string {
  return `${tab.index + 1} of ${tab.history.length}`;
}

export type AgentTabGroup = { agentId: string | null; tabs: BrowserTab[] };

/**
 * Group tabs by owning agent (server order = newest first, preserved).
 * Unowned tabs form the trailing group so per-agent pills render first.
 */
export function groupByAgent(tabs: BrowserTab[]): AgentTabGroup[] {
  const order: (string | null)[] = [];
  const groups = new Map<string | null, BrowserTab[]>();
  for (const tab of tabs) {
    if (!groups.has(tab.agentId)) {
      groups.set(tab.agentId, []);
      order.push(tab.agentId);
    }
    groups.get(tab.agentId)?.push(tab);
  }
  order.sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return 0;
  });
  return order.map((agentId) => ({ agentId, tabs: groups.get(agentId) ?? [] }));
}

/** Short workspace scope label (basename of the session cwd). */
export function shortScope(cwd: string | null): string {
  if (!cwd) return 'no scope';
  const trimmed = cwd.replace(/\/+$/, '');
  const base = trimmed.split('/').pop() ?? trimmed;
  return base || trimmed;
}

/**
 * REQ-150 — sites that answer `X-Frame-Options: SAMEORIGIN`/`DENY` (youtube.com,
 * google.com, x.com …) refuse to render inside the pane's iframe: the frame
 * stays blank and no error reaches us. YouTube publishes embeddable player
 * URLs that DO allow framing, so rewrite the common watch forms to the
 * privacy-friendly no-cookie embed. Returns null when there is no
 * frame-friendly equivalent (channels, home page, playlists without an id).
 */
export function embedUrlFor(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  const ID = /^[\w-]{6,}$/;
  let videoId = '';
  if (host === 'youtu.be') videoId = parts[0] ?? '';
  else if (parts[0] === 'watch') videoId = parsed.searchParams.get('v') ?? '';
  else if (parts[0] === 'shorts' || parts[0] === 'live' || parts[0] === 'embed') videoId = parts[1] ?? '';
  if (videoId && ID.test(videoId)) return `https://www.youtube-nocookie.com/embed/${videoId}`;
  const list = parsed.searchParams.get('list');
  if (list && ID.test(list)) return `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`;
  return null;
}

/**
 * REQ-153 — which URL the pane's iframe should actually load.
 *
 * YouTube's own pages (home, channels, search, playlists without an id) have no
 * embeddable form and answer `X-Frame-Options: SAMEORIGIN`, so they render as
 * dead space. The Piped front-end serves the same catalogue and DOES allow
 * framing (verified: 200, no X-Frame-Options, boots inside a sandboxed iframe),
 * so those pages are routed through it. Video links keep YouTube's own
 * no-cookie player (better quality than a proxy front-end).
 *
 * Returns null when the URL is fine as-is (normal sites frame normally).
 */
export function paneUrlFor(input: string): string | null {
  const embed = embedUrlFor(input);
  if (embed) return embed;
  const raw = input.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
  if (host !== 'youtube.com' && host !== 'youtu.be') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  // Search pages map to Piped's own search route.
  if (parts[0] === 'results') {
    const q = parsed.searchParams.get('search_query') ?? '';
    return `https://piped.video/search${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  }
  const path = parsed.pathname === '/' ? '/' : parsed.pathname;
  const query = parsed.search;
  return `https://piped.video${path}${query}`;
}

/** REQ-153: true when the pane is showing a URL through the Piped front-end. */
export function isPipedUrl(input: string | null | undefined): boolean {
  if (!input) return false;
  try {
    const host = new URL(input).hostname.replace(/^www\./, '').toLowerCase();
    return host === 'piped.video';
  } catch {
    return false;
  }
}
