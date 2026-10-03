/**
 * tunnel.ts — pure view helpers for the Share/tunnel settings surface
 * (REQ-193 Kapsam 4 panel half).
 *
 * No DOM, no server: everything here is a pure function over one
 * `TunnelStatusRes`, probe-covered in `tunnel.test.ts`.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the panel renders the provider's url,
 * it never constructs one. `displayUrl()` returns a string ONLY when the server
 * reported `state: 'running'` AND a non-empty url; every other branch is null
 * and the pane shows the server's own `message` instead. A panel that
 * assembled `https://<something>.trycloudflare.com` would render a frame that
 * cannot load — the exact "fake url" the REQ forbids.
 *
 * The port is deliberately NOT validated here. `parseTunnelPort` in
 * `packages/lokma-core/src/cloud/tunnel.ts` is the ONE port rule (it guards
 * both the route and the CLI); a second copy in the browser could disagree
 * with it, so the pane sends what the user typed and renders the server's 400
 * verbatim when it refuses.
 */

import type { TunnelState, TunnelStatusRes } from '@/lib/api';

/** One display row: label + tone class, derived from the state alone. */
export type TunnelStateView = { label: string; tone: string };

const STATE_VIEWS: Record<TunnelState, TunnelStateView> = {
  stopped: { label: 'Stopped', tone: 'text-zinc-500' },
  starting: { label: 'Starting…', tone: 'text-amber-600 dark:text-amber-500' },
  running: { label: 'Running', tone: 'text-emerald-600 dark:text-emerald-500' },
  error: { label: 'Not started', tone: 'text-red-600 dark:text-red-500' },
};

/** Display row for a tunnel state. Unknown values fall back to Stopped. */
export function stateView(state: unknown): TunnelStateView {
  const key = typeof state === 'string' && state in STATE_VIEWS ? (state as TunnelState) : 'stopped';
  return STATE_VIEWS[key];
}

/** True only when the server says it is up AND handed back a real url. */
export function isLive(status: TunnelStatusRes | null): status is TunnelStatusRes & { url: string } {
  return status !== null && status.state === 'running' && typeof status.url === 'string' && status.url !== '';
}

/**
 * The url to show, or null when there is none to show.
 *
 * Never derived, never defaulted: a `running` state without a url is a
 * contradiction the server can only produce by lying, so this returns null and
 * the pane falls back to the message rather than printing a placeholder host.
 */
export function displayUrl(status: TunnelStatusRes | null): string | null {
  return isLive(status) ? status.url : null;
}

/**
 * The install/configure line, or null.
 *
 * ONLY the server's `installHint` FIELD, never the message. Measured: the pane
 * reached for the message as a fallback and rendered "Tunnel is off — nothing
 * is listening from outside." inside the copyable command block — a
 * diagnosis where a command belongs. An idle `stopped` box has no failed
 * attempt and therefore no command, which is correct: the Start button is the
 * action, and the route answers with the real command when it refuses.
 */
export function installHint(status: TunnelStatusRes | null): string | null {
  if (!status || status.state === 'running') return null;
  const hint = typeof status.installHint === 'string' ? status.installHint.trim() : '';
  return hint === '' ? null : hint;
}

/** `2026-10-03T10:07:01Z` → a short local stamp; junk input stays visible. */
export function formatStamp(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return new Date(at).toLocaleString();
}

/**
 * What the expiry line says, or null when the provider never said.
 * Only shown next to a live url — an expiry for a tunnel that is off is
 * noise that reads like a live deadline.
 */
export function expiryLine(status: TunnelStatusRes | null): string | null {
  if (!isLive(status)) return null;
  const at = formatStamp(status.expiresAt);
  return at === null ? null : `Ends ${at}`;
}

/**
 * The port to send: undefined when the field is blank (server applies its own
 * default), otherwise the number the user typed. Non-numeric text is sent as
 * written on purpose — the server's 400 names the valid range, and inventing a
 * fallback port here would silently tunnel a DIFFERENT local service.
 */
export function portPayload(raw: string): { port?: number } {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  const n = Number(trimmed);
  return Number.isInteger(n) ? { port: n } : { port: Number.NaN as number };
}