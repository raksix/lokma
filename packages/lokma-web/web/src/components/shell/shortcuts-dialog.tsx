import * as React from 'react';
import { Keyboard, X } from 'lucide-react';
import { SHORTCUTS } from './shortcuts';

/**
 * ShortcutsDialog — lists every global harness shortcut from the single
 * SHORTCUTS registry (never hand-duplicated). Opens on `?`, closes on
 * Escape, backdrop click, or the close button.
 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-line bg-white shadow-2xl dark:bg-[#1E1E21]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <Keyboard className="h-4 w-4 text-terracotta" />
          <span className="text-sm font-semibold">Keyboard shortcuts</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="ml-auto grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="max-h-[60vh] space-y-1 overflow-auto p-3">
          {SHORTCUTS.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-md px-1 py-1 text-[13px]">
              <span className="flex min-w-[92px] shrink-0 items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-line bg-muted px-1.5 py-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span className="text-zinc-600 dark:text-zinc-300">{s.description}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-2 text-[11px] text-zinc-400">
          In the chat box: Enter sends · Shift+Enter adds a newline · / opens commands
        </div>
      </div>
    </div>
  );
}
