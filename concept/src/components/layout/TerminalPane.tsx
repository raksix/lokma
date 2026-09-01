import { Button } from "@/components/ui/button"
import { Terminal, Trash2, Copy } from "lucide-react"

export function TerminalPane() {
  const lines = [
    "$ npm test",
    "✓ 12 tests passed (1.2s)",
    "  ● auth › verifies JWT in preHandler",
    "  ● rate-limit › 60/min per user",
    "$ lokma doctor",
    "✓ provider hilive · tokens 12k · $0.04",
  ]
  return (
    <div className="h-full flex flex-col bg-[#0F0F11] text-[#EDE9E2] font-mono text-xs rounded-lg overflow-hidden border border-[#232326]">
      <div className="h-7 flex items-center gap-1 px-2 border-b border-white/10 bg-[#1E1E21] shrink-0">
        <Terminal className="w-3 h-3 text-emerald-400" />
        <span className="text-xs font-medium">Terminal — harness logs</span>
        <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="iconSm" className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Terminal kopyalandı" }))}>
            <Copy className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Temizlendi" }))}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-1 leading-5">
        {lines.map((l, i) => (
          <div key={i} className={l.startsWith("$") ? "text-white" : l.startsWith("✓") ? "text-emerald-400" : "text-zinc-400"}>
            {l}
          </div>
        ))}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-emerald-400">$</span>
          <span className="w-2 h-4 bg-white/80 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
