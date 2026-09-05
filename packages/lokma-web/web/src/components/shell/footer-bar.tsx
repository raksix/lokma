/**
 * FooterBar — thin status strip ported from the concept `ShellParts`.
 * Left: live harness status dot. Right: static stack credits.
 */
import { requestShortcutsDialog } from './shortcuts';

export function FooterBar({ serverUp }: { serverUp: boolean | null }) {
  const dot =
    serverUp === null ? 'bg-zinc-400' : serverUp ? 'bg-emerald-500' : 'bg-red-500';
  const label =
    serverUp === null ? 'Checking harness…' : serverUp ? 'All systems normal' : 'Harness unreachable';
  return (
    <div className="flex h-6 shrink-0 items-center gap-2 border-t border-[#E8E4DE] bg-[#FDFCFB] px-3 text-[11px] text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>
        {label} · <span className="font-mono">[</span> / <span className="font-mono">]</span> panels · Ctrl+K search ·{' '}
        <button
          type="button"
          onClick={requestShortcutsDialog}
          aria-label="Open keyboard shortcuts"
          className="rounded px-0.5 font-mono underline decoration-dotted underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ?
        </button>{' '}
        shortcuts
      </span>
      <span className="ml-auto hidden sm:block">Lokma harness · Vite + Fastify + WS</span>
    </div>
  );
}
