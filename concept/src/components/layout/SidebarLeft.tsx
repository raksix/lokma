import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Search, Folder, GitBranch, Clock, Sparkles, LayoutGrid } from "lucide-react"
import { useState } from "react"

type Session = { id: string; title: string; model: string; tokens: string; status: "running" | "idle" | "done"; time: string; group: "Today" | "Yesterday" | "Earlier" }

const SESSIONS: Session[] = [
  { id: "1", title: "Refactor auth middleware", model: "sonnet", tokens: "12k", status: "running", time: "2m ago", group: "Today" },
  { id: "2", title: "API spec — webhooks", model: "opus", tokens: "8k", status: "idle", time: "1h ago", group: "Today" },
  { id: "3", title: "Onboarding flow copy", model: "haiku", tokens: "3k", status: "done", time: "Yesterday", group: "Yesterday" },
  { id: "4", title: "Drizzle schema audit", model: "sonnet", tokens: "5k", status: "idle", time: "2d ago", group: "Earlier" },
]

const PROJECTS = [
  { name: "lokma", path: "/mnt/apopic/lokma", sessions: 4, branch: "main", worktree: "worktree/lokma-482", checkpoints: 12, locks: 0 },
  { name: "bounty-hunter", path: "/mnt/apopic/bounty", sessions: 2, branch: "main", worktree: null as string | null, checkpoints: 3, locks: 1 },
  { name: "Home", path: "~/", sessions: 3, branch: null as string | null, worktree: null as string | null, checkpoints: 0, locks: 0 },
]

export function SidebarLeft({ onOpenTab }: { onOpenTab: (title: string, content: React.ReactNode) => void }) {
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<"sessions" | "projects">("sessions")
  const [groupBy, setGroupBy] = useState<"time" | "project">("time")
  const filteredSessions = SESSIONS.filter(s => !q || s.title.toLowerCase().includes(q.toLowerCase()))
  const grouped = (["Today", "Yesterday", "Earlier"] as const).map(g => ({ group: g, items: filteredSessions.filter(s => s.group === g) })).filter(g => g.items.length > 0)

  return (
    <aside className="w-full flex flex-col overflow-hidden bg-[#FDFCFB] dark:bg-[#161618]">
      {/* TabSet header like flexlayout — Sessions / Projects */}
      <div className="flex items-center gap-1 px-1.5 h-8 border-b border-line/80 shrink-0">
        <Button variant={tab === "sessions" ? "ink" : "ghost"} size="sm" className="h-6 px-2.5 text-[11px] flex-1" onClick={() => setTab("sessions")}>Sessions</Button>
        <Button variant={tab === "projects" ? "ink" : "ghost"} size="sm" className="h-6 px-2.5 text-[11px] flex-1" onClick={() => setTab("projects")}>Projects</Button>
      </div>

      {tab === "sessions" ? (
        <>
          <div className="px-2 py-2 border-b border-line/50 space-y-2">
            <Button variant="default" size="sm" className="w-full h-7 text-xs gap-1.5 justify-center" onClick={() => onOpenTab("Yeni session", <NewSessionPreview />)}>
              <Plus className="w-3 h-3" /> New Session
            </Button>
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                <Input placeholder="Search sessions... (Ctrl+K)" value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
              </div>
              <Button variant="ghost" size="iconSm" className="h-7 w-7" onClick={() => setGroupBy(groupBy === "time" ? "project" : "time")} title="Group by">
                <LayoutGrid className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-zinc-500">
              <Clock className="w-3 h-3" /> {groupBy === "time" ? "Today / Yesterday / Earlier" : "By project"} · {filteredSessions.length} sessions
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <div className="px-1 py-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-400 flex items-center gap-1">
                  {group} <span className="ml-auto text-[10px] font-normal normal-case tracking-normal">{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map(s => (
                    <div key={s.id} draggable onDragStart={e => { e.dataTransfer.setData("text/plain", s.title); (window as unknown as { _dragTitle?: string })._dragTitle = s.title }} className="group flex items-center gap-2 p-2 rounded-md border bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/30 hover:shadow-sm cursor-grab active:cursor-grabbing transition">
                      <span className="drag-handle text-zinc-300 text-[10px]">⋮⋮</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === "running" ? "bg-emerald-500 animate-pulse" : s.status === "done" ? "bg-zinc-300" : "bg-amber-500"}`} />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenTab(s.title, <div className="p-3"><div className="text-xs font-semibold">{s.title}</div><div className="text-xs text-zinc-500 mt-1">model {s.model} · {s.tokens} · {s.time}</div></div>)}>
                        <div className="text-xs font-medium truncate pr-1">{s.title}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="px-1 py-0.5 rounded bg-muted border border-line text-[10px]">{s.model}</span>
                          <span className="text-[11px] text-zinc-400">{s.tokens}</span>
                          <span className="text-[11px] text-zinc-400">· {s.time}</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="iconSm" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `… ${s.title}` }))}>
                        ⋯
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {filteredSessions.length === 0 && <div className="p-4 text-center text-xs text-zinc-400">Eşleşen session yok</div>}
          </div>
        </>
      ) : (
        <>
          <div className="px-2 py-2 border-b border-line/50 flex items-center gap-1">
            <span className="text-[11px] text-zinc-500 flex items-center gap-1"><Folder className="w-3 h-3" /> Projects · {PROJECTS.length}</span>
            <Button variant="outline" size="sm" className="ml-auto h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Add project — cwd picker yakında" }))}>
              <Plus className="w-3 h-3" /> Add project
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {PROJECTS.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).map(p => (
              <button key={p.name} onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Project ${p.name} seçildi — sessions filtrelenecek` }))} className="w-full text-left p-2.5 rounded-md border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/30 hover:bg-terracotta/5 flex gap-2 group transition">
                <Folder className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    {p.name}
                    <span className="text-[11px] font-normal text-zinc-400">{p.sessions} sessions</span>
                    {p.worktree && <span className="px-1 py-0 rounded-full bg-[#6C5CE7] text-white text-[10px] flex items-center gap-1">⎇ {p.worktree.split('/').pop()}</span>}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1">{p.path} <span className="hidden sm:inline">· {p.checkpoints} checkpoints</span> {p.locks > 0 && <span className="px-1 py-0 rounded bg-amber-50 border border-amber-200 text-amber-700">{p.locks} lock</span>}</div>
                </div>
                {p.branch && <span className="self-center px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] flex items-center gap-1"><GitBranch className="w-3 h-3" />{p.branch}</span>}
              </button>
            ))}
            <div className="mt-4 p-2 rounded-md bg-muted/50 border border-dashed border-line text-xs text-zinc-500">
              Click → filters Sessions to that project · Switch project sets cwd context
            </div>
          </div>
          <div className="p-2 border-t border-line/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <Input placeholder="Filter projects..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
            </div>
          </div>
        </>
      )}

      <div className="shrink-0 border-t border-line p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Profiles — yakında" }))}>
          <span className="w-6 h-6 rounded-full bg-white border border-line grid place-items-center">◐</span> Profiles
        </Button>
      </div>
    </aside>
  )
}

function NewSessionPreview() {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl bg-white dark:bg-[#1E1E21] border border-line flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-terracotta" />
        <div>
          <div className="text-xs font-semibold">Yeni session</div>
          <div className="text-xs text-zinc-500">Boş session — cwd: /mnt/apopic/lokma · model: sonnet</div>
        </div>
      </div>
    </div>
  )
}
