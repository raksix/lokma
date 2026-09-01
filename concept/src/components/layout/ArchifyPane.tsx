import { Button } from "@/components/ui/button"
import { Workflow, Layers, Palette, Monitor } from "lucide-react"

export function ArchifyPane() {
  const types = ["flow", "sequence", "state", "er", "arch"] as const
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Workflow className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Archify</span>
        <span className="ml-1 text-[11px] text-zinc-400">diagrams · viewer</span>
      </div>
      <div className="p-2 flex gap-1 flex-wrap">
        {types.map(t => (
          <Button key={t} variant="outline" size="sm" className="h-6 text-[11px] capitalize hover:border-terracotta/30 hover:text-terracotta" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Archify ${t}` }))}>
            {t}
          </Button>
        ))}
        <span className="ml-auto flex gap-1">
          <Button size="sm" className="h-6 text-[11px] gap-1"><Layers className="w-3 h-3" /> Generate</Button>
        </span>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2 p-2 bg-muted/20 overflow-auto">
        <div className="rounded-md bg-white dark:bg-[#1E1E21] border border-line p-2 hover:border-terracotta/30 cursor-pointer">
          <div className="h-20 rounded bg-gradient-to-br from-terracotta/10 to-terracotta/5 border border-dashed border-line flex items-center justify-center text-zinc-400 text-xs">Preview</div>
          <div className="mt-1 text-xs font-medium">flow · before</div>
          <div className="text-[11px] text-zinc-400">delta view</div>
        </div>
        <div className="rounded-md bg-white dark:bg-[#1E1E21] border border-line p-2 hover:border-terracotta/30 cursor-pointer">
          <div className="h-20 rounded bg-[#0F0F11] border border-white/5 flex items-center justify-center text-white/60 text-xs">#focus · #reach</div>
          <div className="mt-1 text-xs font-medium">arch · after</div>
          <div className="text-[11px] text-zinc-400">viewer #lens</div>
        </div>
      </div>
      <div className="p-2 border-t border-line flex gap-1">
        <Button variant="ghost" size="sm" className="flex-1 h-6 text-xs gap-1"><Palette className="w-3 h-3" /> Tokens</Button>
        <Button variant="ghost" size="sm" className="flex-1 h-6 text-xs gap-1"><Monitor className="w-3 h-3" /> Studio</Button>
      </div>
    </div>
  )
}
