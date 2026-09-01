import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Folder, File, Plus, ChevronDown } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function FileBrowser({ onOpenFile }: { onOpenFile: (name: string) => void }) {
  const [q, setQ] = useState("")
  const [openLokma, setOpenLokma] = useState(true)
  const [openPlugins, setOpenPlugins] = useState(true)
  const [openDocs, setOpenDocs] = useState(false)
  const toast = (msg: string) => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: msg }))

  return (
    <aside className="w-full border-l border-line bg-[#FDFCFB] dark:bg-[#161618] flex flex-col overflow-hidden">
      <div className="h-8 flex items-center justify-between px-3 border-b border-line/70 shrink-0">
        <span className="font-serif text-xs flex items-center gap-1.5">
          <Folder className="w-3 h-3 text-zinc-500" /> Explorer
        </span>
        <Button variant="ghost" size="iconSm" onClick={() => toast("Yeni dosya — yakında")}>
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
          <Button variant="ghost" size="sm" onClick={() => setOpenLokma(!openLokma)} className="w-full justify-start gap-1.5 px-1.5 h-6 text-xs font-medium">
            <ChevronDown className={cn("w-3 h-3 transition-transform", !openLokma && "-rotate-90")} />
            <Folder className="w-3 h-3 text-amber-600" /> lokma-web
          </Button>
          {openLokma && (
            <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
              <div>
                <Button variant="ghost" size="sm" onClick={() => setOpenPlugins(!openPlugins)} className="w-full justify-start gap-1.5 px-1.5 h-6 text-xs">
                  <ChevronDown className={cn("w-3 h-3 transition-transform", !openPlugins && "-rotate-90")} />
                  <Folder className="w-3 h-3 text-amber-500" /> plugins
                </Button>
                {openPlugins && (
                  <div className="ml-3 pl-2 border-l border-line/40 space-y-0.5">
                    {[
                      { name: "auth.ts", active: true, badge: "●" },
                      { name: "rate-limit.ts", badge: "+18" },
                      { name: "jwt.ts" },
                    ]
                      .filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()))
                      .map(f => (
                        <Button key={f.name} variant="ghost" size="sm" onClick={() => onOpenFile(f.name)} className={cn("w-full justify-start gap-2 px-1.5 h-6 text-xs font-normal border", f.active ? "bg-[#FDF0E6] border-[#F2D5C2] text-terracotta" : "border-transparent hover:bg-white dark:hover:bg-[#1E1E21]")}>
                          <File className="w-3 h-3 shrink-0" />
                          <span className="flex-1 truncate text-left">{f.name}</span>
                          {f.badge && <span className="text-[10px]">{f.badge}</span>}
                        </Button>
                      ))}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => onOpenFile("app.ts")} className="w-full justify-start gap-2 px-1.5 h-6 text-xs">
                <File className="w-3 h-3" /> app.ts
              </Button>
            </div>
          )}
        </div>
        <div>
          <Button variant="ghost" size="sm" onClick={() => setOpenDocs(!openDocs)} className="w-full justify-start gap-1.5 px-1.5 h-6 text-xs text-zinc-600">
            <ChevronDown className={cn("w-3 h-3 transition-transform", !openDocs && "-rotate-90")} />
            <Folder className="w-3 h-3" /> Docs
          </Button>
          {openDocs && (
            <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
              {["00-LOKMA-KONTEKST.md", "21-WEB-HARNESS.md", "36-AUTH.md"]
                .filter(n => !q || n.toLowerCase().includes(q.toLowerCase()))
                .map(n => (
                <Button key={n} variant="ghost" size="sm" onClick={() => onOpenFile(n)} className="w-full justify-start gap-2 px-1.5 h-6 text-xs">
                  <File className="w-3 h-3" /> {n}
                </Button>
              ))}
              {["00-LOKMA-KONTEKST.md", "21-WEB-HARNESS.md", "36-AUTH.md"].filter(n => !q || n.toLowerCase().includes(q.toLowerCase())).length === 0 && (
                <div className="px-1.5 py-1 text-[11px] text-zinc-400">Eşleşen doküman yok</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-2 bg-[#FDFCFB] dark:bg-[#161618]">
        <div className="rounded-md bg-white dark:bg-[#1E1E21] border border-line p-2">
          <div className="text-[11px] font-mono text-zinc-500">auth.ts — 18 additions</div>
          <div className="mt-1 flex gap-1.5">
            <Button size="sm" className="flex-1 h-6 text-xs" onClick={() => onOpenFile("auth.ts")}>
              Open
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => toast("Reveal — yakında")}>
              Reveal
            </Button>
          </div>
        </div>
      </div>
    </aside>
  )
}
