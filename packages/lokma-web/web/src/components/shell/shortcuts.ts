/**
 * shortcuts.ts — single registry for every global harness keyboard shortcut.
 *
 * The AppShell keydown handler AND the ShortcutsDialog both read this list,
 * so the dialog can never drift from what the keys actually do. To add a
 * shortcut: append one entry here, handle `def.id` in AppShell, done.
 *
 * REQ-007: the `[`/`]` descriptions follow the sidebar swap — use
 * `resolveShortcuts(explorerSide)` wherever the swap state is known.
 */
import { sidebarPanelTitle, type ExplorerSide } from './responsive';

export type ShortcutDef = {
  /** Stable id the AppShell handler switches on. */
  id: 'search' | 'model' | 'explorer' | 'left' | 'right' | 'dismiss' | 'help';
  /** Human-readable key combo (shown in <kbd>). */
  keys: string[];
  /** One-line description for the help dialog and footer hint. */
  description: string;
};

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'search', keys: ['Ctrl/⌘', 'K'], description: 'Search sessions, notes and commands' },
  { id: 'model', keys: ['Ctrl/⌘', 'M'], description: 'Jump to the model picker' },
  { id: 'explorer', keys: ['Ctrl/⌘', 'P'], description: 'Toggle Explorer and focus files' },
  { id: 'left', keys: ['['], description: 'Toggle left sidebar (Inspector)' },
  { id: 'right', keys: [']'], description: 'Toggle right sidebar (Explorer)' },
  { id: 'dismiss', keys: ['Esc'], description: 'Close search, drawers and dialogs' },
  { id: 'help', keys: ['?'], description: 'Open this shortcut list' },
];

/** Event that opens the shortcuts dialog from anywhere (footer hint, panes). */
export const SHOW_SHORTCUTS_EVENT = 'lokma:show-shortcuts';

/**
 * REQ-007 — SHORTCUTS with the `[`/`]` descriptions following the sidebar
 * swap. The default registry above already matches `explorerSide: 'right'`.
 */
export function resolveShortcuts(explorerSide: ExplorerSide): ShortcutDef[] {
  return SHORTCUTS.map((s) => {
    if (s.id === 'left' || s.id === 'right') {
      return { ...s, description: `Toggle ${s.id} sidebar (${sidebarPanelTitle(s.id, explorerSide)})` };
    }
    return s;
  });
}

export function requestShortcutsDialog(): void {
  window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT));
}

/** True when the key event started inside an editable control. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
