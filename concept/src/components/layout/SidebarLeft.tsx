import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Search, MessageSquare, FileText, Clock, LayoutGrid, Settings } from "lucide-react"
import { useState } from "react"

export function SidebarLeft({ onOpenTab }: { onOpenTab: (title: string, content: React.ReactNode) => void }) {
  const [q, setQ] = useState("")
  const [openHome, setOpenHome] = useState(true)
  const [openLokma, setOpenLokma] = useState(true)
  const [openBounty, setOpenBounty] = useState(false)

  const filtered = (text: string) => !q || text.toLowerCase().includes(q.toLowerCase())

  return (
    <aside className="w-[268px] shrink-0 border-r border-line bg-[#FDFCFB] dark:bg-[#161618] flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-2 h-8 border-b border-line/80 shrink-0">
        <Button variant="ink" size="sm" className="h-6 px-2.5 text-[11px]">SESSIONS</Button>
        <Button variant="ghost" size="sm" className="h-6 px-2.5 text-[11px] text-zinc-500">BOTS</Button>
        <Button variant="ghost" size="sm" className="h-6 px-2.5 text-[11px] text-zinc-500">TERMINAL</Button>
      </div>
      <div className="px-2 py-2 space-y-0.5 border-b border-line/50">
        {[
          { icon: Plus, label: "New session", action: () => onOpenTab("Yeni session", <NewSessionPreview />) },
          { icon: Settings, label: "Capabilities" },
          { icon: MessageSquare, label: "Messaging" },
          { icon: FileText, label: "Artifacts" },
          { icon: Clock, label: "Scheduled jobs" },
          { icon: LayoutGrid, label: "Kanban" },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-white hover:border hover:border-line border border-transparent text-[12.5px] text-zinc-700 dark:text-zinc-300 dark:hover:bg-[#1E1E21] text-left">
            <span className="w-5 h-5 rounded-md bg-white dark:bg-[#1E1E21] border border-line grid place-items-center">
              <Icon className="w-3 h-3" />
            </span>
            {label}
          </button>
        ))}
      </div>
      <div className="px-2.5 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <Input placeholder="Search sessions..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-4">
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-500">PINNED</div>
          <div className="space-y-0.5 mt-1">
            {[
              { title: "Kur deeplink-harness depo...", time: "20", active: true },
              { title: "deeplink-harness test", time: "2d" },
            ]
              .filter(s => filtered(s.title))
              .map(s => (
                <button key={s.title} onClick={() => onOpenTab(s.title, <div className="p-3 text-sm">Pinned: {s.title}</div>)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left", s.active ? "bg-white border border-line shadow-sm dark:bg-[#1E1E21]" : "hover:bg-white dark:hover:bg-[#1E1E21] border border-transparent")}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="flex-1 truncate text-xs font-medium">{s.title}</span>
                  <span className="text-[11px] text-zinc-400">{s.time}</span>
                </button>
              ))}
          </div>
        </div>
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-500">PROJECTS</div>
          <div className="space-y-2 mt-1">
            <ProjectGroup title="Home" count={3} open={openHome} onToggle={() => setOpenHome(!openHome)} q={q} onOpenTab={onOpenTab} items={["Openaiad telegram bot to...", "Randevona deploy check", "sooliva-v4 hotfix"]} />
            <ProjectGroup title="lokma" count={4} open={openLokma} onToggle={() => setOpenLokma(!openLokma)} q={q} onOpenTab={onOpenTab} items={["lokma-web · #482", "harness core refactor", "Docs sync 00 context", "concept pane design"]} activeItem="lokma-web · #482" />
            <ProjectGroup title="bounty-hunter" count={2} open={openBounty} onToggle={() => setOpenBounty(!openBounty)} q={q} onOpenTab={onOpenTab} items={["HackerOne sync cron", "bounty hunter AI model"]} />
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
          <span className="w-6 h-6 rounded-full bg-white border border-line grid place-items-center">◐</span> Profiles
        </Button>
      </div>
    </aside>
  )
}

function ProjectGroup({ title, count, open, onToggle, q, items, activeItem, onOpenTab }: { title: string; count: number; open: boolean; onToggle: () => void; q: string; items: string[]; activeItem?: string; onOpenTab: (t: string, c: React.ReactNode) => void }) {
  return (
    <div>
      <button onClick={onToggle} className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white dark:hover:bg-[#1E1E21] text-xs font-medium">
        <span className={cn("w-3 h-3 grid place-items-center transition-transform", open ? "" : "-rotate-90")}>▾</span>
        {title} <span className="ml-auto text-[11px] text-zinc-400 bg-muted px-1.5 py-0.5 rounded-full">{count}</span>
      </button>
      {open && (
        <div className="ml-2 pl-3 border-l border-line/40 space-y-0.5 mt-0.5">
          {items
            .filter(t => !q || t.toLowerCase().includes(q.toLowerCase()))
            .map(t => (
              <button key={t} onClick={() => onOpenTab(t, <div className="p-3 text-sm">Project {title} — {t}</div>)} className={cn("w-full flex items-center gap-2 px-2 py-1 rounded text-xs text-left hover:bg-white dark:hover:bg-[#1E1E21] border border-transparent", t === activeItem && "bg-terracotta/5 border-terracotta/20 text-terracotta")}>
                {t === activeItem && <span className="w-1.5 h-1.5 rounded-full bg-terracotta" />}
                <span className="truncate">{t}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function NewSessionPreview() {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-white dark:bg-[#1E1E21] border border-line">
        <div className="text-xs font-semibold">Yeni session</div>
        <div className="text-sm mt-1">Boş session — buradan başla. Komut yaz, pane olarak sürükle.</div>
      </div>
    </div>
  )
}
