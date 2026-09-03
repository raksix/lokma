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
