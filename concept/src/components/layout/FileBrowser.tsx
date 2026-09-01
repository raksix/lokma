import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Folder, File, Plus, ChevronDown, Terminal, Globe } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function FileBrowser({ onOpenFile }: { onOpenFile: (name: string) => void }) {
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<"files" | "terminal" | "browser">("files")
  const [openLokma, setOpenLokma] = useState(true)
  const [openPlugins, setOpenPlugins] = useState(true)
  const [openDocs, setOpenDocs] = useState(false)
  const toast = (msg: string) => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: msg }))

  return (
    <aside className="w-full flex flex-col overflow-hidden bg-[#FDFCFB] dark:bg-[#161618]">
      <div className="flex items-center gap-1 px-1 h-7 border-b border-line/80 shrink-0">
        <Button variant={tab === "files" ? "ink" : "ghost"} size="sm" className="h-6 px-2 text-[11px] flex-1" onClick={() => setTab("files")}><Folder className="w-3 h-3" /> Files</Button>
        <Button variant={tab === "terminal" ? "ink" : "ghost"} size="sm" className="h-6 px-2 text-[11px] flex-1" onClick={() => setTab("terminal")}><Terminal className="w-3 h-3" /> Terminal</Button>
        <Button variant={tab === "browser" ? "ink" : "ghost"} size="sm" className="h-6 px-2 text-[11px] flex-1" onClick={() => setTab("browser")}><Globe className="w-3 h-3" /> Browser</Button>
      </div>

      {tab === "files" ? (
        <>
          <div className="h-7 flex items-center justify-between px-3 border-b border-line/70 shrink-0">
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
              <Input placeholder="Dosya ara... (Ctrl+P)" value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
            </div>
          </div>
          <div className="px-3 py-1.5 flex items-center gap-1 text-[11px] text-zinc-500 border-y border-line/50 bg-[#FDFCFB] dark:bg-[#161618]">
            <span className="px-1.5 py-0.5 rounded bg-white dark:bg-[#1E1E21] border border-line">lokma</span> › plugins › <span className="font-medium text-ink dark:text-white">auth.ts</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs">
            <div>
              <Button variant="ghost" size="sm" onClick={() => setOpenLokma(!openLokma)} className="w-full justify-start gap-1.5 px-1.5 h-6 text-xs font-medium cursor-pointer">
                <ChevronDown className={cn("w-3 h-3 transition-transform", !openLokma && "-rotate-90")} />
                <Folder className="w-3 h-3 text-amber-600" /> lokma-web
              </Button>
              {openLokma && (
                <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setOpenPlugins(!openPlugins)} className="w-full justify-start gap-1.5 px-1.5 h-6 text-xs cursor-pointer">
                      <ChevronDown className={cn("w-3 h-3 transition-transform", !openPlugins && "-rotate-90")} />
                      <Folder className="w-3 h-3 text-amber-500" /> plugins
                    </Button>
                    {openPlugins && (
                      <div className="ml-3 pl-2 border-l border-line/40 space-y-0.5">
                        {[
                          { name: "auth.ts", active: true, badge: "●", git: "M" },
                          { name: "rate-limit.ts", badge: "+18", git: "A" },
                          { name: "jwt.ts", git: " " },
                        ]
                          .filter(f => !q || f.name.toLowerCase().includes(q.toLowerCase()))
                          .map(f => (
                            <div key={f.name} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", `@${f.name}`); }} className={cn("group flex items-center gap-1 rounded border px-1 cursor-grab active:cursor-grabbing hover:bg-white dark:hover:bg-[#1E1E21] transition", f.active ? "bg-[#FDF0E6] border-[#F2D5C2] text-terracotta" : "border-transparent hover:border-line")}>
                              <span className="drag-handle text-zinc-300 text-[10px]">⋮⋮</span>
                              <Button variant="ghost" size="sm" onClick={() => onOpenFile(f.name)} className="flex-1 justify-start gap-1.5 px-1 h-6 text-xs font-normal border-0 hover:bg-transparent">
                                <File className="w-3 h-3 shrink-0" />
                                <span className="flex-1 truncate text-left">{f.name}</span>
                                {f.git !== " " && <span className={`text-[10px] px-1 rounded ${f.git==="M"?"bg-amber-500 text-white":f.git==="A"?"bg-emerald-500 text-white":""}`}>{f.git}</span>}
                                {f.badge && <span className="text-[10px]">{f.badge}</span>}
                              </Button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  <div draggable onDragStart={e => e.dataTransfer.setData("text/plain", "@app.ts")} className="group flex items-center gap-1 rounded border border-transparent hover:border-line hover:bg-white dark:hover:bg-[#1E1E21] cursor-grab px-1">
                    <span className="drag-handle text-zinc-300 text-[10px]">⋮⋮</span>
                    <Button variant="ghost" size="sm" onClick={() => onOpenFile("app.ts")} className="flex-1 justify-start gap-2 px-1 h-6 text-xs border-0 hover:bg-transparent">
                      <File className="w-3 h-3" /> app.ts
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setOpenDocs(!openDocs)} className="w-full justify-start gap-1.5 px-1.5 h-6 text-xs text-zinc-600 cursor-pointer">
                <ChevronDown className={cn("w-3 h-3 transition-transform", !openDocs && "-rotate-90")} />
                <Folder className="w-3 h-3" /> Docs
              </Button>
              {openDocs && (
                <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
                  {["00-LOKMA-KONTEKST.md", "21-WEB-HARNESS.md", "36-AUTH.md"]
                    .filter(n => !q || n.toLowerCase().includes(q.toLowerCase()))
                    .map(n => (
                    <div key={n} draggable onDragStart={e => e.dataTransfer.setData("text/plain", n)} className="group flex items-center gap-1 rounded border border-transparent hover:border-line hover:bg-white dark:hover:bg-[#1E1E21] cursor-grab px-1">
                      <span className="drag-handle text-zinc-300 text-[10px]">⋮⋮</span>
                      <Button variant="ghost" size="sm" onClick={() => onOpenFile(n)} className="flex-1 justify-start gap-2 px-1 h-6 text-xs border-0 hover:bg-transparent">
                        <File className="w-3 h-3" /> {n}
                      </Button>
                    </div>
                  ))}
                  {["00-LOKMA-KONTEKST.md", "21-WEB-HARNESS.md", "36-AUTH.md"].filter(n => !q || n.toLowerCase().includes(q.toLowerCase())).length === 0 && (
                    <div className="px-1.5 py-1 text-[11px] text-zinc-400">Eşleşen doküman yok</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-line p-2 bg-[#FDFCFB] dark:bg-[#161618]">
            <div className="rounded-md bg-white dark:bg-[#1E1E21] border border-line p-2 hover:border-terracotta/20 transition-colors">
              <div className="text-[11px] font-mono text-zinc-500">auth.ts — 18 additions · <span className="text-amber-600">M</span> git</div>
              <div className="mt-1 flex gap-1.5">
                <Button size="sm" className="flex-1 h-6 text-xs" onClick={() => onOpenFile("auth.ts")}>
                  Open
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => toast("Reveal in Finder — yakında")}>
                  Reveal
                </Button>
              </div>
              <div className="mt-1.5 flex gap-1 text-[10px] text-zinc-400">
                <button onClick={() => toast("Copy path")} className="hover:text-ink hover:underline">Copy path</button> · <button onClick={() => toast("Copy relative")} className="hover:text-ink hover:underline">Copy relative</button> · <button onClick={() => toast("Open terminal here")} className="hover:text-ink hover:underline">Terminal here</button>
              </div>
            </div>
          </div>
        </>
      ) : tab === "terminal" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 bg-[#0F0F11] text-[#EDE9E2] font-mono text-xs p-3 overflow-auto">
            <div className="text-white">$ npm test</div>
            <div className="text-emerald-400">✓ 12 tests passed (1.2s)</div>
            <div className="text-zinc-400">  ● auth › verifies JWT in preHandler</div>
            <div className="text-zinc-400">  ● rate-limit › 60/min per user</div>
            <div className="mt-2 text-white">$ lokma doctor</div>
            <div className="text-emerald-400">✓ provider hilive · tokens 12k</div>
            <div className="mt-2 flex items-center gap-1"><span className="text-emerald-400">$</span><span className="w-2 h-4 bg-white/80 animate-pulse" /></div>
          </div>
          <div className="h-7 border-t border-white/10 bg-[#1E1E21] flex items-center gap-1 px-2">
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-white/70 hover:text-white hover:bg-white/10" onClick={() => toast("Clear")}>Clear</Button>
            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-white/70 hover:text-white hover:bg-white/10" onClick={() => toast("Copy")}>Copy</Button>
            <span className="ml-auto flex items-center gap-1 text-[11px] text-white/60"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Follow</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#161618]">
          <div className="h-7 flex items-center gap-1 px-2 border-b border-line/60 bg-[#FDFCFB] dark:bg-[#1E1E21]">
            <Globe className="w-3 h-3 text-zinc-500" />
            <span className="text-xs font-medium">Browser</span>
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="p-2 flex gap-1">
            <Input placeholder="https://localhost:3000" defaultValue="https://lokma-concept.fermag.com.tr" className="h-7 text-xs flex-1" />
            <Button size="sm" className="h-7 text-xs" onClick={() => toast("Navigate")}>Go</Button>
          </div>
          <div className="flex-1 m-2 rounded-md border border-line bg-zinc-100 dark:bg-[#0F0F11] grid place-items-center text-xs text-zinc-500">
            iframe preview — harness controls via browser_navigate / click / screenshot
          </div>
          <div className="p-2 border-t border-line flex gap-1">
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => toast("Back")}>Back</Button>
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => toast("Reload")}>Reload</Button>
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => toast("DevTools")}>DevTools</Button>
          </div>
        </div>
      )}
    </aside>
  )
}
