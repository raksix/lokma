import * as React from 'react';

/**
 * REQ-169 — instance `bootstrapped` flag, shared shell-wide.
 *
 * Single source of truth is the SERVER bit returned by
 * `GET /api/auth/settings` (`{ settings, bootstrapped }`): once the first
 * admin is registered there is nothing left to set up, so conditional
 * entries — today the Setup rail icon (desktop rail + mobile tools strip)
 * — disappear. The App boot gate already fetches that endpoint on every
 * load; it seeds this store from the SAME response, so no extra request is
 * made and a page reload re-verifies the state.
 *
 * Unknown state (still loading, or the fetch failed and the gate fell back
 * to login) deliberately counts as NOT bootstrapped: the Setup entry stays
 * visible exactly like before — hiding is opt-in on a real server `true`.
 * The Setup pane itself stays registered either way (programmatic access
 * via tab/URL/command is unaffected); only the rail/strip listing changes.
 */

let bootstrapped = false;
const listeners = new Set<() => void>();

/** Seed from the auth-settings response (App boot gate). */
export function setInstanceBootstrapped(value: boolean): void {
  if (bootstrapped === value) return;
  bootstrapped = value;
  for (const listener of listeners) listener();
}

/** Pure read — `true` only after the server reported a bootstrapped instance. */
export function isInstanceBootstrapped(): boolean {
  return bootstrapped;
}

export function subscribeInstanceBootstrapped(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React binding so components re-render when the flag lands. */
export function useInstanceBootstrapped(): boolean {
  return React.useSyncExternalStore(subscribeInstanceBootstrapped, isInstanceBootstrapped, isInstanceBootstrapped);
}
