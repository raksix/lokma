import * as React from 'react';
import { useFocusTrap } from '@/components/shell/use-focus-trap';
import { LazyArchifyPane, PaneFallback } from '@/components/panes/lazy-panes';

/**
 * ArchifyModal — REQ-167: Archify is its OWN standalone modal — not a pane
 * tab and not a Settings section. The shell mirrors the Settings modal
 * contract: dimmed backdrop, `useFocusTrap` (Esc closes), a backdrop click
 * and an in-panel close button both close it, body scroll stays locked
 * while it is up, and the whole body lazy-loads so the diagram chunk only
 * downloads on first open (same as every other heavy surface).
 *
 * The body hosts the SAME live ArchifyPane surface the pane used (list +
 * viewer + IR/receipt/export tabs) inside an `@container` host — the pane's
 * `@min-[320px]`/`@max-[380px]` rules only resolve inside a query container
 * — and hands it the modal body's height so the pane's own columns scroll
 * instead of the modal.
 */
export function ArchifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, { onEscape: onClose });

  // Body scroll lock while the modal is up (same as Settings/MobileDrawer).
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Archify"
      data-archify-modal
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="flex h-[85vh] w-[90vw] max-w-[1280px] flex-col overflow-hidden rounded-xl border border-line bg-white p-2 shadow-2xl dark:bg-[#1E1E21]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="@container flex h-full min-h-0 flex-1 flex-col">
          <React.Suspense fallback={<PaneFallback pane="archify" />}>
            <LazyArchifyPane onRequestClose={onClose} />
          </React.Suspense>
        </div>
      </div>
    </div>
  );
}
