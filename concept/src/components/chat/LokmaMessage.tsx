import { Button } from "@/components/ui/button"

export function LokmaMessage({
  onOpenTab,
  onFork,
  CodePane,
}: {
  onOpenTab: (title: string, content: React.ReactNode) => void
  onFork: (title: string) => void
  CodePane: React.ReactNode
}) {
  return (
    <div id="single-msg-lokma" className="flex gap-3 group scroll-mt-16">
      <div className="w-8 h-8 rounded-full bg-[#6C5CE7] text-white grid place-items-center text-xs font-bold border border-line shrink-0 mt-0.5 shadow-sm">◐</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold">Lokma.AI</span>
          <span className="px-1.5 py-0.5 rounded-full bg-[#6C5CE7] text-white text-[10px]">Thought ▸</span>
          <span className="text-[11px] text-zinc-400">14:31 · 1.2s</span>
        </div>
        <details open className="mt-2 rounded-lg border border-line bg-muted/30 dark:bg-[#1E1E21]/50 overflow-hidden">
          <summary className="px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-muted/50 list-none flex items-center gap-1.5">
            <span className="text-[10px]">▸</span> Thought
            <span className="ml-auto text-[11px] text-zinc-400">Ran cat · tail -n 60</span>
          </summary>
          <div className="px-3 py-2 border-t border-line text-xs leading-[1.6] space-y-1">
            <div className="font-mono text-[11px] text-zinc-500">
              Ran <code className="px-1 py-0.5 rounded bg-white dark:bg-[#0F0F11] border border-line">cat /mnt/apopic/lokma/concept/src/components/layout/Pane.tsx | tail -n 60</code>
            </div>
            <div>
              Verifying <code className="px-1 py-0.5 rounded bg-white dark:bg-[#0F0F11] border border-line text-[11px]">Pane onSend</code> implementation and noting missing edit/rewind buttons — reconciling a partial write that reverted Pane's onSend.
            </div>
          </div>
        </details>
        <div className="mt-2 text-[13.5px] leading-[1.6]">
          Perfect — one hook, one decorator, <span className="underline decoration-terracotta/50 underline-offset-4">zero magic.</span>
        </div>
        <div className="mt-3 rounded-lg overflow-hidden border border-line bg-[#0F0F11] dark:bg-[#161618]">
          <div className="flex items-center gap-2 px-3 h-7 bg-[#1E1E21] border-b border-white/10 text-xs">
            <span className="font-mono text-white">Pane.tsx</span>
            <span className="text-emerald-400 text-[11px]">+12</span>
            <span className="text-red-400 text-[11px]">-1</span>
            <span className="ml-auto w-5 h-5 grid place-items-center rounded hover:bg-white/10 text-white/60 cursor-pointer">×</span>
          </div>
          <pre className="p-3 text-xs leading-5 font-mono overflow-x-auto text-white/90">
            <code>
              <span className="text-[#8BE9FD]">const</span> <span className="text-white">Composer</span> <span className="text-[#FF79C6]">=</span> <span className="text-[#8BE9FD]">()</span> <span className="text-[#FF79C6]">=&gt;</span> {"{"}
              {"\n"} <span className="text-[#6272A4]">// placeholder + onSend + edit/rewind/fork</span>
              {"\n"}
              {"}"}
            </code>
          </pre>
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          Ran 2 commands · <span className="text-emerald-600">✓ built</span>
        </div>
        <div className="mt-2 flex gap-1.5 flex-wrap">
          <Button variant="secondary" size="sm" className="h-6 text-[11px] gap-1 bg-white text-ink hover:bg-white/90 border border-line" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Diff kopyalandı" }))}>
            Copy diff
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => onOpenTab("auth.ts", CodePane)}>
            Open in pane
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => onFork("Perfect — one hook, one decorator")}>
            ⎇ Fork
          </Button>
          <a href="https://lokma-concept.fermag.com.tr" target="_blank" className="ml-auto text-xs text-terracotta hover:underline">
            Canlı: https://lokma-concept.fermag.com.tr
          </a>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-400">
          <span>✓ 1 tool · 12k tokens · $0.04</span>
          <span className="mx-1">·</span>
          <button onClick={() => { navigator.clipboard.writeText("Perfect — one hook, one decorator, zero magic."); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" })) }} className="hover:text-ink hover:underline">
            ⎙ Copy
          </button>
          <span className="mx-1">·</span>
          <button onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Regenerate" }))} className="hover:text-ink hover:underline">
            ↻ Regenerate
          </button>
        </div>
      </div>
    </div>
  )
}
