import { Button } from "@/components/ui/button"
import { BarChart3, DollarSign, Zap, Activity, Download, TrendingUp } from "lucide-react"
import { useState } from "react"

const KPI = [
  { label: "Total tokens (7d)", value: "187.4k", delta: "+12%", icon: Zap, hint: "prompt 142k · completion 45k" },
  { label: "Total cost (7d)", value: "$3.82", delta: "+8%", icon: DollarSign, hint: "$0.020 / 1k avg" },
  { label: "Avg / session", value: "9.3k", delta: "-3%", icon: Activity, hint: "20 sessions" },
  { label: "Top model", value: "sonnet", delta: "61%", icon: BarChart3, hint: "114k tokens" },
]

const CHART = [
  { d: "Mon", sonnet: 18, opus: 6, haiku: 2 },
  { d: "Tue", sonnet: 22, opus: 4, haiku: 5 },
  { d: "Wed", sonnet: 15, opus: 10, haiku: 1 },
  { d: "Thu", sonnet: 28, opus: 3, haiku: 4 },
  { d: "Fri", sonnet: 19, opus: 7, haiku: 3 },
  { d: "Sat", sonnet: 11, opus: 2, haiku: 6 },
  { d: "Sun", sonnet: 24, opus: 5, haiku: 2 },
]

const SESSIONS = [
  { name: "Refactor auth middleware", model: "sonnet", tokens: "12.4k", cost: "$0.04", date: "Today 14:31", status: "running" },
  { name: "API spec — webhooks", model: "opus", tokens: "8.1k", cost: "$0.18", date: "Today 10:02", status: "idle" },
  { name: "Drizzle schema audit", model: "sonnet", tokens: "5.2k", cost: "$0.02", date: "Yesterday", status: "done" },
  { name: "Onboarding flow copy", model: "haiku", tokens: "3.0k", cost: "$0.01", date: "Yesterday", status: "done" },
  { name: "Vault graph spikes", model: "deepseek-v4", tokens: "14.7k", cost: "$0.03", date: "2d ago", status: "done" },
]

export function UsagePane() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("7d")
  const max = Math.max(...CHART.map(c => c.sonnet + c.opus + c.haiku))
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <BarChart3 className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Usage</span>
        <span className="ml-1 text-[11px] text-zinc-400">tokens · cost · by model</span>
        <span className="ml-auto flex items-center gap-1">
          {(["7d", "30d", "90d"] as const).map(r => (
            <Button key={r} variant={range === r ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setRange(r)}>{r}</Button>
          ))}
          <Button variant="outline" size="sm" className="h-5 text-[11px] gap-1 ml-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Export CSV (${range}) — yakında` }))}>
            <Download className="w-3 h-3" /> CSV
          </Button>
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "JSONL export" }))}>JSONL</Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-2">
          {KPI.map(k => (
            <div key={k.label} className="rounded-lg bg-[#FDFCFB] dark:bg-[#1E1E21] border border-line p-2.5 hover:border-terracotta/20 transition">
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <k.icon className="w-3 h-3" /> {k.label}
                <span className={`ml-auto text-[11px] px-1 py-0 rounded ${k.delta.startsWith("+") ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-[#0F241A] dark:text-emerald-400 dark:border-[#1E3A2A]" : k.delta.startsWith("-") ? "bg-zinc-100 text-zinc-600 border border-line" : "bg-terracotta text-white"}`}>{k.delta}</span>
              </div>
              <div className="mt-1 text-[18px] font-semibold tracking-tight flex items-baseline gap-1">
                {k.value} <TrendingUp className="w-3 h-3 text-emerald-500 hidden sm:block" />
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{k.hint} · {range}</div>
            </div>
          ))}
        </div>

        <div className="mx-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            Tokens / day <span className="text-[11px] text-zinc-400 font-normal">stacked by model · {range}</span>
            <span className="ml-auto flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#C96442]" /> sonnet</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#6C5CE7]" /> opus</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#10B981]" /> haiku</span>
            </span>
          </div>
          <div className="mt-3 flex items-end gap-1.5 h-[96px]">
            {CHART.map(c => {
              const total = c.sonnet + c.opus + c.haiku
              const hS = Math.round((c.sonnet / max) * 96)
              const hO = Math.round((c.opus / max) * 96)
              const hH = Math.round((c.haiku / max) * 96)
              return (
                <div key={c.d} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end items-center gap-px h-[96px]">
                    <div className="w-full rounded-t bg-[#10B981]" style={{ height: hH }} title={`haiku ${c.haiku}k`} />
                    <div className="w-full bg-[#6C5CE7]" style={{ height: hO }} title={`opus ${c.opus}k`} />
                    <div className="w-full rounded-b bg-[#C96442]" style={{ height: hS }} title={`sonnet ${c.sonnet}k`} />
                  </div>
                  <span className="text-[11px] text-zinc-400">{c.d}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-[11px] text-zinc-400 flex justify-between">
            <span>{CHART.reduce((a, c) => a + c.sonnet + c.opus + c.haiku, 0)}k total · {range}</span>
            <span>recharts AreaChart (stub — stacked bars)</span>
          </div>
        </div>

        <div className="m-2 rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
            Recent sessions <span className="ml-2 text-[11px] text-zinc-400 font-normal">{SESSIONS.length} · click → session</span>
            <span className="ml-auto text-[11px] text-zinc-400 hidden sm:inline">agentId · model · cost</span>
          </div>
          <div className="divide-y divide-line/60">
            {SESSIONS.map(s => (
              <button key={s.name} onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Open ${s.name}` }))} className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === "running" ? "bg-emerald-500 animate-pulse" : s.status === "done" ? "bg-zinc-300" : "bg-amber-500"}`} />
                <span className="text-xs font-medium truncate flex-1">{s.name}</span>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full bg-muted border border-line text-[10px]">{s.model}</span>
                <span className="text-[11px] text-zinc-500 hidden md:inline">{s.tokens}</span>
                <span className="text-[11px] font-medium">{s.cost}</span>
                <span className="text-[11px] text-zinc-400 hidden lg:inline">{s.date}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="m-2 p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] dark:border-[#3A2A1A] text-xs flex items-center gap-2">
          <DollarSign className="w-3 h-3 text-terracotta" />
          Header badge: <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line text-[11px]">12.3k · $0.04</span> — click → detail popover by turn · pricing snapshot at write time
        </div>
      </div>
    </div>
  )
}
