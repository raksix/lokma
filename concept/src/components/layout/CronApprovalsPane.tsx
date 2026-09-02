import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Clock3, ShieldAlert, Check, X, Timer, Users, Zap } from "lucide-react"
import { useState } from "react"

const CRONS = [
  { id: "nightly-vault", agent: "custodian", sched: "0 3 * * *", desc: "vault sync + graph rebuild + FTS5 reindex", enabled: true, last: "Today 03:00 ✓" },
  { id: "hourly-tests", agent: "tester-3", sched: "0 * * * *", desc: "lokma test --run · heal if flaky", enabled: false, last: "—" },
  { id: "weekly-eval", agent: "reviewer-2", sched: "0 9 * * 1", desc: "eval harness · 20 tasks · adversarial vote", enabled: true, last: "Mon 09:00 ✓" },
]

const APPROVALS = [
  { from: "builder-1", action: "Bash: rm -rf /tmp", status: "pending" as const, age: "12s ago", risk: "high" },
  { from: "reviewer-2", action: "Write: src/api/auth.ts (12 lines)", status: "pending" as const, age: "4s ago", risk: "mid" },
  { from: "tester-3", action: "Bash: npm test", status: "approved" as const, age: "1m ago", risk: "low" },
]

export function CronApprovalsPane() {
  const [crons, setCrons] = useState(CRONS)
  const [approvals, setApprovals] = useState(APPROVALS)
  const toggle = (id: string) => setCrons(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c))
  const decide = (idx: number, ok: boolean) => setApprovals(prev => prev.map((a, i) => i === idx ? ({ ...a, status: ok ? "approved" : "denied" } as typeof a) : a))
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Clock3 className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Cron & Approvals</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">#5 per-agent cron · #6 human-in-the-loop</span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium">
            <Timer className="w-3 h-3" /> Per-agent cron
            <span className="text-[11px] font-normal text-zinc-400">· {crons.filter(c => c.enabled).length}/{crons.length} enabled</span>
            <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "cron add — agent + schedule + command" }))}>+ Cron</Button>
          </div>
          <div className="mt-1.5 space-y-1.5">
            {crons.map(c => (
              <div key={c.id} className="flex gap-2 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono font-medium flex items-center gap-1.5">
                    {c.sched} <span className="px-1 py-0 rounded bg-muted border border-line text-[11px] font-sans">{c.agent}</span>
                    <span className="text-[11px] font-normal text-zinc-400 hidden sm:inline">{c.last}</span>
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{c.desc} · id: {c.id}</div>
                </div>
                <Button variant={c.enabled ? "ink" : "outline"} size="sm" className="h-6 text-xs shrink-0" onClick={() => toggle(c.id)}>{c.enabled ? "On" : "Off"}</Button>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 px-1">cron per agent → SQLite + WS push — same as system cron but scoped to agentId + AUDIT.md</div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-xs font-medium">
            <ShieldAlert className="w-3 h-3 text-amber-600" /> Approvals — human-in-the-loop
            <span className="ml-auto text-[11px] font-normal text-zinc-400">{approvals.filter(a => a.status === "pending").length} pending</span>
          </div>
          <div className="mt-1.5 space-y-1.5">
            {approvals.map((a, i) => (
              <div key={i} className={`flex gap-2 p-2.5 rounded-lg border ${a.status === "pending" ? "bg-amber-50 dark:bg-[#241E0F] border-amber-200 dark:border-[#3A2E1A]" : a.status === "approved" ? "bg-emerald-50 dark:bg-[#0F241A] border-emerald-200" : "bg-red-50 border-red-200"}`}>
                <span className={`w-7 h-7 rounded-md grid place-items-center text-xs shrink-0 ${a.risk === "high" ? "bg-red-500 text-white" : a.risk === "mid" ? "bg-amber-500 text-white" : "bg-zinc-500 text-white"}`}>{a.risk === "high" ? "!" : a.risk === "mid" ? "~" : "·"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1">
                    {a.from} → {a.action}
                    <span className={`ml-1 px-1 py-0 rounded-full border text-[10px] ${a.status === "pending" ? "bg-white border-amber-200 text-amber-700" : a.status === "approved" ? "bg-emerald-600 text-white border-emerald-600" : "bg-red-600 text-white border-red-600"}`}>{a.status}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">{a.age} · risk {a.risk} · auto-classifier suggests {a.risk === "high" ? "ask" : "allow"}</div>
                </div>
                {a.status === "pending" ? (
                  <span className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => decide(i, true)}><Check className="w-3 h-3" /> Allow</Button>
                    <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => decide(i, false)}><X className="w-3 h-3" /> Deny</Button>
                  </span>
                ) : (
                  <span className="text-[11px] text-zinc-400 shrink-0">{a.status === "approved" ? "✓" : "✗"}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
            Per-agent approvals — every tool call can require human. WS `permission_request` → card → Allow/Deny/Always. Auto-tier: delegationModel by token tier.
          </div>
        </div>

        <div className="flex gap-1">
          <Input placeholder="Quick: /approve builder-1 — yakında" className="flex-1 h-7 text-xs" />
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Approve all pending" }))}>
            <Zap className="w-3 h-3" /> Approve all
          </Button>
        </div>
      </div>
    </div>
  )
}
