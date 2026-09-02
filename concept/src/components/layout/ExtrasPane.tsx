import { Button } from "@/components/ui/button"
import { Layers, Star, Zap, Crown, FlaskConical, GitBranch, Shield, Vote, Timer, Sparkles, ArrowRight } from "lucide-react"
import { useState } from "react"

const EXTRAS = [
  { n: 1, title: "Agent templates marketplace", why: "Clone reviewer/planner in 1 click", how: "bot.json + Registry + Hub", done: true },
  { n: 2, title: "Per-agent budgets (hard 80% alert)", why: "Stop runaway spend", how: "TokenLedger agentId + 80% toast", done: true },
  { n: 3, title: "Eval harness", why: "Score agents on real tasks", how: "20-task suite + Cron weekly-eval", done: false },
  { n: 4, title: "Time-travel fork", why: "Branch from any message", how: "Fork button → new session from checkpoint", done: true },
  { n: 5, title: "Per-agent cron", why: "Autonomous nightly jobs", how: "CronApprovalsPane — 0 3 * * *", done: true },
  { n: 6, title: "Human-in-the-loop approvals", why: "Gate risky tools", how: "permission_request card + Always", done: true },
  { n: 7, title: "Observability trace", why: "Debug N agents", how: "ObservabilityPane timeline + replay", done: true },
  { n: 8, title: "Handoff protocol", why: "Pass session to another agent", how: "drag session → agent card", done: false },
  { n: 9, title: "Auto-scaling maxConcurrent", why: "Load-based", how: "queue depth → scale 5→10", done: false },
  { n: 10, title: "Sandbox per agent (docker|host)", why: "Isolation", how: "worktree + docker flag", done: false },
  { n: 11, title: "Browser per agent", why: "Parallel UI verify", how: "BrowserPane per agentId", done: false },
  { n: 12, title: "Skill sharing across agents", why: "Reuse", how: "VaultPort + skill_view", done: true },
  { n: 13, title: "Voice per agent", why: "Hands-free", how: "Web Speech API per Composer", done: true },
  { n: 14, title: "Agent-vs-agent adversarial review", why: "Verifier vote", how: "2 agents + vote card", done: false },
  { n: 15, title: "Token-tiered delegationModel", why: "Cheap delegation", how: "haiku for sub-tasks", done: false },
  { n: 16, title: "Worktree GC (ttl 7d)", why: "Clean disk", how: ".lokma/worktrees ttl_days", done: false },
  { n: 17, title: "Replay deterministic re-run", why: "Reproduce bug", how: "Observability Replay button", done: true },
  { n: 18, title: "MCP agentTemplate import", why: "Import from MCP", how: "PluginMarketplace + agentTemplate", done: false },
  { n: 19, title: "Affinity + work-stealing", why: "Balance", how: "Coordinator steals idle", done: false },
  { n: 20, title: "Session → agent drag handoff", why: "UX", how: "Sidebar drag → Hub", done: false },
  { n: 21, title: "lokma doctor --agents", why: "Health", how: "SetupWizard doctor 8 checks", done: true },
  { n: 22, title: "Vault graph provenance agentId", why: "Who wrote what", how: "VaultPane provenance pill", done: true },
  { n: 23, title: "Per-agent trace share", why: "Share debug", how: "/share/agent/<id>", done: true },
]

export function ExtrasPane() {
  const [q, setQ] = useState<"all" | "done" | "todo">("all")
  const filtered = EXTRAS.filter(e => q === "all" ? true : q === "done" ? e.done : !e.done)
  const pct = Math.round((EXTRAS.filter(e => e.done).length / EXTRAS.length) * 100)
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Star className="w-3 h-3 text-amber-500" />
        <span className="text-xs font-semibold">Extras — 23 ranked</span>
        <span className="ml-1 hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-400">
          <span className="w-16 h-1.5 rounded-full bg-line overflow-hidden"><span className="h-full block bg-terracotta" style={{ width: `${pct}%` }} /></span>
          {EXTRAS.filter(e => e.done).length}/23 · {pct}%
        </span>
        <span className="ml-auto flex gap-1">
          {(["all", "done", "todo"] as const).map(f => (
            <Button key={f} variant={q === f ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px] capitalize" onClick={() => setQ(f)}>{f}</Button>
          ))}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-1.5 space-y-1">
        {filtered.map(e => (
          <div key={e.n} className={`flex gap-2 p-2 rounded-lg border ${e.done ? "bg-white dark:bg-[#1E1E21] border-line" : "bg-muted/30 border-dashed border-line/60 opacity-90"}`}>
            <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${e.done ? "bg-emerald-500 text-white" : "bg-zinc-300 text-white"}`}>{e.done ? "✓" : e.n}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium flex items-center gap-1">
                {e.title}
                {e.done ? <span className="px-1 py-0 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">done</span> : <span className="px-1 py-0 rounded bg-zinc-100 border border-line text-zinc-500 text-[10px]">todo</span>}
              </div>
              <div className="text-[11px] text-zinc-500 leading-4">{e.why} · <span className="font-mono text-zinc-400">{e.how}</span></div>
            </div>
            <Button variant="ghost" size="sm" className="h-5 text-[11px] shrink-0" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: e.title }))}>
              {e.done ? "Open" : "Plan"} <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-line bg-muted/20 text-[11px] text-zinc-500 flex gap-1 flex-wrap">
        <span className="flex items-center gap-1"><Crown className="w-3 h-3" /> Phase 3 stretch — pick by value for coding harness</span>
        <span className="ml-auto hidden sm:inline">Highest value: #1 templates · #3 eval · #4 fork · #5 cron · #6 approvals · #7 observability</span>
      </div>
    </div>
  )
}
