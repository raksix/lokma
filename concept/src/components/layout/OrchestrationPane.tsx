import { Button } from "@/components/ui/button"
import { Cpu, GitBranch, Zap, Activity, Timer, Lock, Users, Shuffle, Layers, Radio, Crown } from "lucide-react"
import { useState } from "react"

const AGENTS = [
  { id: "builder-1", task: "find files · rg + FTS5", status: "running" as const, elapsed: "1.2s", model: "sonnet", lease: "42s", worktree: "worktrees/builder-1", bus: 3 },
  { id: "reviewer-2", task: "read auth + critique", status: "queued" as const, elapsed: "—", model: "opus", lease: "—", worktree: "worktrees/reviewer-2", bus: 1 },
  { id: "tester-3", task: "edit tests · expectedSha guard", status: "running" as const, elapsed: "2.1s", model: "haiku", lease: "18s", worktree: "worktrees/tester-3", bus: 2 },
  { id: "custodian", task: "vault sync · graph rebuild", status: "idle" as const, elapsed: "—", model: "sonnet", lease: "—", worktree: "main", bus: 0 },
]

const BUS = [
  { from: "builder-1", type: "file.intent", body: "src/api/auth.ts — refactor", age: "1.2s" },
  { from: "coordinator", type: "ownership.grant", body: "auth.ts → builder-1 lease 60s", age: "1.1s" },
  { from: "tester-3", type: "file.claim", body: "src/api/auth.test.ts exclusive", age: "0.9s" },
  { from: "builder-1", type: "merge.request", body: "hunk overlap auth.ts:42-58", age: "0.4s" },
]

export function OrchestrationPane() {
  const [filter, setFilter] = useState<"all" | "running" | "queued">("all")
  const filtered = AGENTS.filter(a => filter === "all" ? true : a.status === filter)
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Cpu className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Orchestration</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">{AGENTS.filter(a=>a.status==="running").length} running · {AGENTS.length} total</span>
        <span className="hidden lg:inline ml-1 text-[11px] text-zinc-400">live tree · bus · coordinator</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-5 text-[11px] hidden sm:inline-flex" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Fan-out — parallel builder + reviewer + tester" }))}><Shuffle className="w-3 h-3"/> Fan-out</Button>
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Tüm ajanlar durduruldu" }))}>Cancel all</Button>
        </span>
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line/50 bg-muted/20 text-[11px] shrink-0 overflow-x-auto">
        <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line flex items-center gap-1"><Crown className="w-3 h-3 text-amber-600"/> caps 20/5/20</span>
        <span className="hidden sm:inline px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line">queue aging + priority</span>
        <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] dark:bg-[#2A1E15]"><Radio className="w-3 h-3"/> heartbeat 30s · lease 60s</span>
        <span className="ml-auto flex gap-1">
          {(["all","running","queued"] as const).map(f => (
            <Button key={f} variant={filter===f?"ink":"ghost"} size="sm" className="h-5 px-2 text-[11px] capitalize" onClick={()=>setFilter(f)}>{f}</Button>
          ))}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        <div className="space-y-1.5">
          {filtered.map(a => (
            <div key={a.id} className="flex gap-2 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition">
              <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.status === "running" ? "bg-emerald-500 animate-pulse" : a.status === "queued" ? "bg-blue-500" : a.status==="idle" ? "bg-zinc-300" : "bg-red-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium flex items-center gap-1.5 truncate">{a.id}
                  <span className="font-normal text-zinc-400 hidden sm:inline">· {a.task}</span>
                  <span className={`ml-1 px-1 py-0 rounded-full border text-[10px] ${a.status==="running"?"bg-emerald-50 border-emerald-200 text-emerald-700":a.status==="queued"?"bg-blue-50 border-blue-200 text-blue-700":"bg-zinc-100 border-line text-zinc-600"}`}>{a.status}</span>
                </div>
                <div className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-1 mt-1">
                  <span className="px-1 py-0 rounded bg-muted border border-line">{a.model}</span>
                  <span className="hidden sm:inline-flex items-center gap-1"><Timer className="w-3 h-3"/> {a.elapsed} · lease {a.lease}</span>
                  <span className="hidden md:inline-flex items-center gap-1"><GitBranch className="w-3 h-3"/> {a.worktree}</span>
                  <span className="hidden lg:inline-flex items-center gap-1"><Activity className="w-3 h-3"/> bus {a.bus} msgs</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[10px] text-center hidden sm:block">{a.model}</span>
                <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${a.id} — coordinator owns ${a.worktree}` }))}>Logs</Button>
              </div>
            </div>
          ))}
        </div>

        {/* Bus */}
        <div className="rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
            <Radio className="w-3 h-3" /> Bus — SQLite WAL + WS · per-project mailbox
            <span className="ml-auto text-[11px] font-normal text-zinc-400 hidden sm:inline">{BUS.length} recent</span>
          </div>
          <div className="divide-y divide-line/50">
            {BUS.map((m,i) => (
              <div key={i} className="flex gap-2 px-3 py-1.5 text-xs hover:bg-muted/20">
                <span className={`px-1 py-0 rounded text-[10px] border shrink-0 ${m.from==="coordinator"?"bg-[#6C5CE7] text-white border-[#6C5CE7]": "bg-white dark:bg-[#1E1E21] border-line"}`}>{m.from}</span>
                <span className="px-1 py-0 rounded bg-[#FDF0E6] border border-[#F2D5C2] text-[10px] shrink-0">{m.type}</span>
                <span className="truncate flex-1 text-zinc-600 dark:text-zinc-300">{m.body}</span>
                <span className="text-[11px] text-zinc-400 hidden sm:inline shrink-0">{m.age}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Coordinator + 3-layer */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Users className="w-3 h-3 text-[#6C5CE7]"/> Coordinator</div>
            <div className="text-[11px] text-zinc-500 mt-1">file-ownership graph — grants/denies · mediates merge.request · affinity + work-stealing</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Lock className="w-3 h-3 text-amber-600"/> 3-layer safe</div>
            <div className="text-[11px] text-zinc-500 mt-1">lease 60s → expectedSha → worktree — HUD green when all pass</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Layers className="w-3 h-3"/> Patterns</div>
            <div className="text-[11px] text-zinc-500 mt-1">single delegate · fan-out · pipeline · map · team + coordinator</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Resume — dequeue high priority → running" }))}><Zap className="w-3 h-3" /> Resume queued</Button>
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Bus broadcast + WS push" }))}><Activity className="w-3 h-3" /> Bus</Button>
        </div>
      </div>
    </div>
  )
}
