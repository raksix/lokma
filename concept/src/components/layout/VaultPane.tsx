import { Button } from "@/components/ui/button"
import { Folder, Search, GitBranch } from "lucide-react"
import { useState } from "react"

export function VaultPane() {
  const [q, setQ] = useState("")
  const notes = [
    { path: "vault/lokma/00-KONTEKST.md", title: "LOKMA Kontekst", tags: "memory" },
    { path: "vault/lokma/24-pane.md", title: "Pane System", tags: "pane" },
    { path: "vault/lokma/34-design.md", title: "Design Canvas", tags: "design" },
    { path: "vault/lokma/agents/builder/MEMORY.md", title: "builder/MEMORY", tags: "agent" },
  ].filter(n => !q || n.title.toLowerCase().includes(q.toLowerCase()) || n.path.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Folder className="w-3 h-3 text-amber-600" />
        <span className="text-xs font-semibold">Vault</span>
        <span className="ml-1 text-[11px] text-zinc-400">FTS5 · graph</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-[11px]">Graph</Button>
        </span>
      </div>
      <div className="p-2 border-b border-line/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <input placeholder="Vault ara — FTS5..." value={q} onChange={e => setQ(e.target.value)} className="w-full h-7 pl-7 pr-2 rounded-md bg-white dark:bg-[#1E1E21] border border-line text-xs focus:outline-none focus:border-terracotta/30" />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {notes.map(n => (
          <button key={n.path} onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: n.title }))} className="w-full text-left p-2 rounded-md border border-transparent hover:border-line hover:bg-muted flex gap-2 group">
            <GitBranch className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0 group-hover:text-terracotta" />
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{n.title}</div>
              <div className="text-[11px] text-zinc-400 truncate">{n.path}</div>
            </div>
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-line group-hover:bg-white">{n.tags}</span>
          </button>
        ))}
        <div className="mt-3 p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-xs">
          Force-graph 2D — react-force-graph-2d ile vault graph görselleştirme (stub)
        </div>
      </div>
    </div>
  )
}
