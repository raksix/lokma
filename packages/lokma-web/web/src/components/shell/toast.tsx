import * as React from 'react';

/**
 * Toast bus — app-wide fire-and-forget notifications.
 * Same `lokma-toast` CustomEvent contract as the concept shell, so any pane
 * can call `emitToast(msg)` without importing React state. Exactly one
 * `ToastHost` lives near the app root and renders the latest message.
 */

/** DOM event name carrying the toast text in `detail`. */
export const TOAST_EVENT = 'lokma-toast';

/** Emit a toast from anywhere (panes, shortcuts, API error paths). */
export function emitToast(message: string): void {
  if (!message) return;
  try {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
  } catch {
    // Non-browser runtimes ignore toasts.
  }
}

/**
 * ToastHost — listens on the bus, shows the latest message, auto-dismisses.
 * Render once near the app root; a crashing pane must never take it down.
 */
export function ToastHost({ durationMs = 3200 }: { durationMs?: number }) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const onToast = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      if (typeof detail !== 'string' || !detail) return;
      setMsg(detail);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), durationMs);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [durationMs]);

  if (!msg) return null;
  return (
    <div
      role="status"
      className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#262624] px-3 py-1.5 text-xs text-white shadow-lg"
    >
      {msg}
    </div>
  );
}
