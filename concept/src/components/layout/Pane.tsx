import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X, Plus, Copy } from "lucide-react"
import { Composer } from "./Composer"

export type Tab = { id: string; title: string; content: React.ReactNode }

export function Pane({
  id,
  initialTabs,
  onClosePane,
  isFocused,
  onFocus,
  onSplit,
}: {
  id: string
  initialTabs: Tab[]
  onClosePane: () => void
  isFocused: boolean
  onFocus: () => void
  onSplit: () => void
}) {
  const [tabs, setTabs] = React.useState<Tab[]>(initialTabs)
  const [active, setActive] = React.useState(initialTabs[0]?.id)

  const activeTab = tabs.find(t => t.id === active)

  const addTab = (title: string, content: React.ReactNode) => {
    const newId = `tab-${id}-${Date.now()}`
    const newTab = { id: newId, title, content }
    setTabs(prev => [...prev, newTab])
    setActive(newId)
  }

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      if (next.length === 0) return prev
      if (active === tabId) {
        const newActive = next[Math.max(0, idx - 1)]
        setActive(newActive.id)
      }
      return next
    })
  }

  React.useEffect(() => {
    const el = document.querySelector(`[data-pane="${id}"]`) as HTMLElement
    if (el) (el as unknown as { addTab: typeof addTab }).addTab = addTab
  }, [id])

  return (
    <div
      data-pane={id}
      onClick={onFocus}
      className={cn("flex-1 flex flex-col min-w-[300px] bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden border-r border-line last:border-r-0", isFocused && "ring-1 ring-terracotta/30")}
    >
      <div className="h-7 flex items-center gap-1 px-1 border-b border-line/60 bg-[#FDFCFB] dark:bg-[#161618] shrink-0">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn("inline-flex items-center gap-1.5 px-2.5 h-6 rounded-md text-[11px] font-medium whitespace-nowrap border shrink-0 transition-colors", active === t.id ? "bg-[#262624] text-white border-[#262624] dark:bg-white dark:text-black" : "bg-white dark:bg-[#1E1E21] border-line hover:bg-muted text-zinc-700 dark:text-zinc-200")}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate max-w-[100px]">{t.title}</span>
              <span onClick={e => closeTab(t.id, e)} className="w-3.5 h-3.5 grid place-items-center rounded hover:bg-black/10 dark:hover:bg-white/10 ml-0.5">
                <X className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="iconSm" onClick={() => addTab(`Yeni sekme`, <div className="p-3 text-sm">Boş sekme — pane {id}</div>)}>
            <Plus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={onSplit} title="Yanına pane ekle">
            ⊞
          </Button>
          <Button variant="ghost" size="iconSm" onClick={onClosePane}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#FAF9F5] dark:bg-[#0F0F11]">
        {activeTab ? <div className="p-3">{activeTab.content}</div> : <div className="p-6 text-center text-sm text-zinc-500">Boş pane</div>}
      </div>
      <div className="shrink-0 p-2 border-t border-line bg-white/90 dark:bg-[#161618]/90 backdrop-blur">
        <Composer
          placeholder={`Pane ${id} — Ask Lokma to plan, code, or explain — try “add 60/min rate limit per user”`}
          onSend={(text, files) => {
            const content = (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-white dark:bg-[#1E1E21] border border-line">
                  <div className="text-xs font-semibold">Sen</div>
                  <div className="text-sm mt-1">{text}</div>
                  {files.length > 0 && <div className="mt-2 text-xs text-zinc-500">{files.map(f => f.name).join(", ")}</div>}
                </div>
                <div className="p-3 rounded-xl bg-[#262624] text-white">
                  <div className="text-xs font-semibold">Lokma</div>
                  <div className="text-sm mt-1">Mock yanıt — pane {id} içinde.</div>
                </div>
              </div>
            )
            addTab(`Yeni mesaj`, content)
          }}
        />
      </div>
    </div>
  )
}

export function CodePaneContent() {
  return (
    <div className="rounded-lg overflow-hidden border border-line bg-white dark:bg-[#1E1E21]">
      <div className="flex items-center justify-between px-3 h-7 bg-muted/50 border-b border-line">
        <span className="font-mono text-xs">plugins/auth.ts</span>
        <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" }))}>
          <Copy className="w-3 h-3" /> Copy
        </Button>
      </div>
      <pre className="p-3 text-xs leading-5 font-mono overflow-x-auto">
        <code>
          <span className="text-zinc-400">// Fastify preHandler</span>
          {"\n"}
          <span className="text-amber-700">app</span>.addHook(<span className="text-green-700">'preHandler'</span>, <span className="text-amber-700">async</span> (req, reply) =&gt; {"{"}
          {"\n"}  <span className="text-amber-700">if</span> (!req.routeOptions.config?.auth) <span className="text-amber-700">return</span>
          {"\n"}
          {"}"})
        </code>
      </pre>
    </div>
  )
}
