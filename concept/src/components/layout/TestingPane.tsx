import { Button } from "@/components/ui/button"
import { Beaker, Video, FileSearch, ShieldAlert, Workflow, Play, CheckCircle2, XCircle, AlertTriangle, Clock3 } from "lucide-react"
import { useState } from "react"

const STAGES = [
  { n: 1, title: "Plan", desc: "feature map → TestSprite PRD", icon: FileSearch },
  { n: 2, title: "Inventory", desc: "every button/link → one test", icon: Workflow },
  { n: 3, title: "Codegen", desc: "Playwright .cjs (role/label/text-first)", icon: Beaker },
  { n: 4, title: "Sandbox", desc: "ephemeral + video:'on' + trace", icon: Video },
  { n: 5, title: "Classify", desc: "bug / fragility / env / contract", icon: AlertTriangle },
  { n: 6, title: "Heal", desc: "auto-heal → re-run → report", icon: CheckCircle2 },
] as const

const RUNS = [
  { id: "run-482", plan: "auth preHandler 60/min", tests: 12, pass: 10, fail: 1, flaky: 1, dur: "18s", shannon: "clean", when: "2m ago" },
  { id: "run-481", plan: "vault FTS5 search", tests: 8, pass: 8, fail: 0, flaky: 0, dur: "9s", shannon: "1 secret", when: "1h ago" },
  { id: "run-480", plan: "pane drag → tab", tests: 22, pass: 18, fail: 3, flaky: 1, dur: "31s", shannon: "clean", when: "3h ago" },
]

export function TestingPane() {
  const [active, setActive] = useState(4)
  const [filter, setFilter] = useState<"all" | "fail" | "flaky">("all")
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Beaker className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Testing Lab</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">TestSprite-inspired · 6-stage · video+trace · Shannon</span>
        <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma test — plan only yakında" }))}>
          <Play className="w-3 h-3" /> New run
        </Button>
      </div>

      <div className="shrink-0 p-2 border-b border-line/50 bg-muted/20">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STAGES.map(s => (
            <button key={s.n} onClick={() => setActive(s.n)} className={`flex-1 min-w-[92px] flex flex-col items-center gap-1 p-2 rounded-lg border transition ${active === s.n ? "bg-[#262624] text-white border-[#262624] dark:bg-white dark:text-black" : "bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/30"}`}>
              <s.icon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-semibold">{s.n}. {s.title}</span>
              <span className={`text-[10px] leading-tight text-center ${active === s.n ? "text-white/60" : "text-zinc-500"}`}>{s.desc}</span>
            </button>
          ))}
        </div>
        {active === 4 && <div className="mt-2 text-[11px] text-zinc-500 flex items-center gap-1"><Video className="w-3 h-3" /> sandbox video:'on' + trace.zip + network + DOM snapshot — hardened sandbox · prefers role/label/text-first selectors</div>}
        {active === 6 && <div className="mt-2 text-[11px] text-zinc-500">heal: selector drift → role fallback, timing → network-idle, env → port/key hint — then verify re-run</div>}
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line/50 shrink-0">
        <span className="text-xs font-medium">Runs</span>
        <span className="text-[11px] text-zinc-400">~/.lokma/test-runs/&lt;id&gt;/ (plan.json + tests/*.spec.cjs + videos/*.webm + report.json)</span>
        <span className="ml-auto flex gap-1">
          {(["all", "fail", "flaky"] as const).map(f => (
            <Button key={f} variant={filter === f ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px] capitalize" onClick={() => setFilter(f)}>{f}</Button>
          ))}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        {RUNS.filter(r => filter === "all" ? true : filter === "fail" ? r.fail > 0 : r.flaky > 0).map(r => (
          <div key={r.id} className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <span className={`w-2 h-2 rounded-full ${r.fail === 0 && r.flaky === 0 ? "bg-emerald-500" : r.fail > 0 ? "bg-red-500" : "bg-amber-500"}`} />
              <span className="text-xs font-semibold">{r.plan}</span>
              <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded-full bg-muted border border-line font-mono">{r.id}</span>
              <span className="ml-auto text-[11px] text-zinc-400 flex items-center gap-1"><Clock3 className="w-3 h-3" /> {r.when} · {r.dur}</span>
            </div>
            <div className="px-2.5 pb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {r.pass} pass</span>
              {r.fail > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 flex items-center gap-1"><XCircle className="w-3 h-3" /> {r.fail} fail</span>}
              {r.flaky > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">{r.flaky} flaky</span>}
              <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line">{r.tests} tests</span>
              <span className={`px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${r.shannon === "clean" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                <ShieldAlert className="w-3 h-3" /> Shannon: {r.shannon}
              </span>
            </div>
            <div className="mx-2 mb-2 rounded-md bg-[#0F0F11] border border-white/10 p-2 flex gap-2 overflow-x-auto">
              <div className="w-24 h-14 rounded bg-zinc-800 border border-white/5 grid place-items-center text-[10px] text-white/60 shrink-0">▶ .webm</div>
              <div className="w-24 h-14 rounded bg-zinc-800 border border-white/5 grid place-items-center text-[10px] text-white/60 shrink-0">trace.zip</div>
              <div className="flex-1 min-w-[160px] text-[11px] leading-5 font-mono text-white/80">
                expect(button).toBeVisible() <span className="text-emerald-400">✓</span><br />
                expect(modal).toContainText("Lokma") <span className="text-red-400">✗ healed → ✓</span>
              </div>
              <Button variant="outline" size="sm" className="h-6 text-[11px] shrink-0 bg-white/5 border-white/10 text-white hover:bg-white/10">Open report</Button>
            </div>
          </div>
        ))}
        <div className="p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-xs">
          Element <code className="px-1 py-0.5 rounded bg-white dark:bg-[#1E1E21] border border-line">expect</code> guarantee — every button/link has one test. 6-stage + classify + auto-heal (selector drift / timing / env).
        </div>
      </div>
    </div>
  )
}
