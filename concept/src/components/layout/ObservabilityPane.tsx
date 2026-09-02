import { Button } from "@/components/ui/button"
import { Activity, Clock3, Zap, Eye, GitBranch, Cpu, Layers } from "lucide-react"
import { useState } from "react"

const TRACES = [
  { t: "0.0s", agent: "builder-1", ev: "query start", detail: "Let's refactor auth middleware", cost: "—" },
  { t: "0.4s", agent: "builder-1", ev: "tool_start", detail: "Read src/api/auth.ts (expectedSha a1b2…)", cost: "—" },
  { t: "0.9s", agent: "builder-1", ev: "tool_result", detail: "✓ 42 lines · 1.2k tokens", cost: "$0.002" },
  { t: "1.2s", agent: "reviewer-2", ev: "agent/start", detail: "spawned via create_agent (ai:builder-1) · reviewer SOUL", cost: "—" },
  { t: "2.1s", agent: "reviewer-2", ev: "tool_start", detail: "Edit src/api/auth.ts — preHandler hook", cost: "—" },
  { t: "2.8s", agent: "tester-3", ev: "permission_request", detail: "Bash: npm test — ask", cost: "—" },
  { t: "3.4s", agent: "builder-1", ev: "text_delta", detail: "Perfect — one hook, zero magic...", cost: "$0.018" },
  { t: "3.9s", agent: "—", ev: "done", detail: "total 12.3k · $0.04 · 3 agents · 1.2s", cost: "$0.04" },
]

export function ObservabilityPane() {
  const [filter, setFilter] = useState<"all" | "agent" | "tool">("all")
  const filtered = TRACES.filter(t => filter === "all" ? true : filter === "agent" ? t.ev.startsWith("agent") : t.ev.startsWith("tool"))
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Activity className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Observability</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">trace timeline · #7 · per-agent · replay</span>
        <span className="ml-auto flex gap-1">
          {(["all", "agent", "tool"] as const).map(f => (
            <Button key={f} variant={filter === f ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px] capitalize" onClick={() => setFilter(f)}>{f}</Button>
          ))}
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Replay deterministic — re-run with same SOUL + seed" }))}>
            <Zap className="w-3 h-3" /> Replay
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        <div className="rounded-lg border border-line bg-[#0F0F11] p-2.5 font-mono text-xs">
          <div className="flex items-center gap-2 text-white/60">
            <Clock3 className="w-3 h-3" /> timeline — 0.0s → 3.9s · 8 events · 3 agents
            <span className="ml-auto flex items-center gap-1 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> live
            </span>
          </div>
          <div className="mt-2 relative pl-4 border-l border-white/10 space-y-2">
            {filtered.map((tr, i) => (
              <div key={i} className="relative flex gap-2">
                <span className={`absolute -left-[9px] top-1 w-2 h-2 rounded-full ${tr.ev === "done" ? "bg-emerald-500" : tr.ev.includes("agent") ? "bg-[#6C5CE7]" : tr.ev === "text_delta" ? "bg-terracotta" : "bg-zinc-500"}`} />
                <span className="text-white/40 w-10 shrink-0">{tr.t}</span>
                <span className={`px-1 py-0 rounded text-[10px] border shrink-0 ${tr.agent === "builder-1" ? "bg-terracotta text-white border-terracotta" : tr.agent === "reviewer-2" ? "bg-[#6C5CE7] text-white border-[#6C5CE7]" : tr.agent === "tester-3" ? "bg-emerald-600 text-white border-emerald-600" : "bg-zinc-800 text-zinc-400 border-white/10"}`}>{tr.agent}</span>
                <span className="px-1 py-0 rounded bg-white/5 border border-white/10 text-white/80">{tr.ev}</span>
                <span className="text-white/60 truncate flex-1 hidden sm:inline">{tr.detail}</span>
                <span className="ml-auto text-emerald-400 hidden md:inline">{tr.cost}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Cpu className="w-3 h-3" /> TokenLedger</div>
            <div className="mt-1 text-[11px] text-zinc-500">per-agent · builder-1 8.2k · reviewer-2 14.1k · tester-3 3.4k — UsagePane filter by agentId</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><GitBranch className="w-3 h-3" /> Bus + Coordinator</div>
            <div className="mt-1 text-[11px] text-zinc-500">file.intent/claim/release → bus (SQLite WAL + WS) → coordinator mediates merge.request</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><Layers className="w-3 h-3" /> 3-layer safe</div>
            <div className="mt-1 text-[11px] text-zinc-500">lease (60s) → expectedSha → worktree — HUD green when all 3 pass</div>
          </div>
        </div>

        <div className="p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-xs flex items-center gap-2">
          <Eye className="w-3 h-3 text-terracotta" />
          Trace share: <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">/share/agent/&lt;id&gt;</code> + <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">/share/session/&lt;id&gt;</code> — read-only timeline
          <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Trace share — public link" }))}>Share</Button>
        </div>
      </div>
    </div>
  )
}
