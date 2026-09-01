import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Folder, File, Plus } from "lucide-react"
import { useState } from "react"

export function FileBrowser({ onOpenFile }: { onOpenFile: (name: string) => void }) {
  const [q, setQ] = useState("")
  const [openLokma, setOpenLokma] = useState(true)
  const [openPlugins, setOpenPlugins] = useState(true)
  const [openDocs, setOpenDocs] = useState(false)

  return (
    <aside className="w-[300px] shrink-0 border-l border-line bg-[#FDFCFB] dark:bg-[#161618] flex flex-col overflow-hidden">
      <div className="h-8 flex items-center justify-between px-3 border-b border-line/70 shrink-0">
        <span className="font-serif text-xs flex items-center gap-1.5">
          <Folder className="w-3 h-3 text-zinc-500" /> Explorer
        </span>
        <Button variant="ghost" size="iconSm">
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      <div className="p-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <Input placeholder="Dosya ara..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
        </div>
      </div>
      <div className="px-3 py-1.5 flex items-center gap-1 text-[11px] text-zinc-500 border-y border-line/50 bg-[#FDFCFB] dark:bg-[#161618]">
        <span className="px-1.5 py-0.5 rounded bg-white dark:bg-[#1E1E21] border border-line">lokma</span> › plugins › <span className="font-medium text-ink dark:text-white">auth.ts</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs">
        <div>
          <button onClick={() => setOpenLokma(!openLokma)} className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white dark:hover:bg-[#1E1E21] font-medium">
            <span className={openLokma ? "" : "-rotate-90"}>▾</span>
            <Folder className="w-3 h-3 text-amber-600" /> lokma-web
          </button>
          {openLokma && (
            <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
              <div>
                <button onClick={() => setOpenPlugins(!openPlugins)} className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white dark:hover:bg-[#1E1E21]">
                  <span className={openPlugins ? "" : "-rotate-90"}>▾</span>
                  <Folder className="w-3 h-3 text-amber-500" /> plugins
                </button>
                {openPlugins && (
                  <div className="ml-3 pl-2 border-l border-line/40 space-y-0.5">
                    {[
                      { name: "auth.ts", active: true, badge: "●" },
                      { name: "rate-limit.ts", badge: "+18" },
                      { name: "jwt.ts" },
                    ]
                      .filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()))
                      .map(f => (
                        <button key={f.name} onClick={() => onOpenFile(f.name)} className={`w-full flex items-center gap-2 px-1.5 py-1 rounded text-xs text-left ${f.active ? "bg-[#FDF0E6] border border-[#F2D5C2] text-terracotta" : "hover:bg-white dark:hover:bg-[#1E1E21] border border-transparent"}`}>
                          <File className="w-3 h-3" />
                          <span className="flex-1 truncate">{f.name}</span>
                          {f.badge && <span className="text-[10px]">{f.badge}</span>}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <button onClick={() => onOpenFile("app.ts")} className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white dark:hover:bg-[#1E1E21] text-left">
                <File className="w-3 h-3" /> app.ts
              </button>
            </div>
          )}
        </div>
        <div>
          <button onClick={() => setOpenDocs(!openDocs)} className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-white dark:hover:bg-[#1E1E21] text-zinc-600">
            <span className={openDocs ? "" : "-rotate-90"}>▾</span>
            <Folder className="w-3 h-3" /> Docs
          </button>
          {openDocs && (
            <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
              {["00-LOKMA-KONTEKST.md", "21-WEB-HARNESS.md", "36-AUTH.md"].map(n => (
                <button key={n} onClick={() => onOpenFile(n)} className="w-full flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white dark:hover:bg-[#1E1E21] text-xs text-left">
                  <File className="w-3 h-3" /> {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-2 bg-[#FDFCFB] dark:bg-[#161618]">
        <div className="rounded-md bg-white dark:bg-[#1E1E21] border border-line p-2">
          <div className="text-[11px] font-mono text-zinc-500">auth.ts — 18 additions</div>
          <div className="mt-1 flex gap-1.5">
            <Button size="sm" className="flex-1 h-6 text-xs">
              Open
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs">
              Reveal
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
