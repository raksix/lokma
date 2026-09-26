/**
 * REQ-161 — the harness has two top-level modes: the normal chat/workspace
 * surface (`chat`) and the separate Bots section (`bots`). The mode is an
 * app-level value persisted in `localStorage`, so a reload lands back where
 * the user was; the Bots mode additionally remembers its selected bot.
 *
 * Pure storage helpers only — the shell owns the React state, so probes can
 * exercise parse/read/write without a DOM framework (same pattern as
 * `sessions/group-storage.ts`).
 */

export type AppMode = 'chat' | 'bots';

export const APP_MODE_KEY = 'lokma-app-mode:v1';
export const BOTS_SELECTED_KEY = 'lokma-bots-selected:v1';

/** Anything that is not an explicit `bots` reads as the default chat mode. */
export function parseAppMode(raw: string | null | undefined): AppMode {
  return raw === 'bots' ? 'bots' : 'chat';
}

export function readAppMode(): AppMode {
  try {
    return parseAppMode(localStorage.getItem(APP_MODE_KEY));
  } catch {
    return 'chat';
  }
}

export function writeAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_KEY, mode);
  } catch {
    // Storage-denied browsers keep the in-memory mode only.
  }
}

/** Selected bot id for the Bots mode (null when nothing was picked yet). */
export function readSelectedBot(): string | null {
  try {
    const raw = localStorage.getItem(BOTS_SELECTED_KEY);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeSelectedBot(id: string | null): void {
  try {
    if (id) localStorage.setItem(BOTS_SELECTED_KEY, id);
    else localStorage.removeItem(BOTS_SELECTED_KEY);
  } catch {
    // Same fallback as above.
  }
}
