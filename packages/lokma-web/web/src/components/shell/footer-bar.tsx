/**
 * FooterBar — thin status strip ported from the concept `ShellParts`.
 * Left: live harness status dot. Right: static stack credits.
 */
export function FooterBar({ serverUp }: { serverUp: boolean | null }) {
  const dot =
    serverUp === null ? 'bg-zinc-400' : serverUp ? 'bg-emerald-500' : 'bg-red-500';
  const label =
    serverUp === null ? 'Checking harness…' : serverUp ? 'All systems normal' : 'Harness unreachable';
  return (
    <div className="flex h-6 shrink-0 items-center gap-2 border-t border-[#E8E4DE] bg-[#FDFCFB] px-3 text-[11px] text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>
        {label} · <span className="font-mono">[</span> / <span className="font-mono">]</span> panels · Ctrl+K search
      </span>
      <span className="ml-auto hidden sm:block">Lokma harness · Vite + Fastify + WS</span>
    </div>
  );
}
