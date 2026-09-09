import * as React from 'react';
import { Maximize, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// PaneFullscreenModal (REQ-089): app-level fullscreen for ONE pane subtree.
// A fixed overlay — never the browser Fullscreen API. The body renders the
// LIVE subtree (same WorkspacePane wiring as the background), so splits,
// tabs, and drops keep working inside; closing loses no state because the
// live layout was underneath all along. `z-[70]` clears the settings/project
// modals (`z-[60]`) and every in-pane overlay (`z-50`).
// Surface note: `bg-white` is solid in light and maps to #1E1E21 via the
// `.dark .bg-white` override in index.css (`bg-background`/`bg-card` compile
// to nothing — @theme defines no such colors).
export function PaneFullscreenModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} fullscreen`}
      className="fixed inset-0 z-[70] flex flex-col bg-black/60 p-2 sm:p-4"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden rounded-lg border bg-white shadow-2xl">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
          <Maximize className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
          <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">Fullscreen — Esc closes</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 shrink-0 p-0"
            title="Exit fullscreen (Esc)"
            aria-label="Exit fullscreen"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

// FullscreenPlaceholder (REQ-089): what the background tree renders for panes
// currently shown in the fullscreen modal. Keeps the slot (no geometry shift,
// no double mount) and offers one click back out.
export function FullscreenPlaceholder({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#FDFCFB] p-3 text-center dark:bg-muted/40">
      <Maximize className="h-4 w-4 text-muted-foreground" />
      <div className="max-w-full truncate text-xs font-medium" title={title}>
        {title}
      </div>
      <div className="text-[11px] text-muted-foreground">Open in fullscreen</div>
      <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onExit}>
        Exit fullscreen
      </Button>
    </div>
  );
}
