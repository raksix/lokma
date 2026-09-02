import { Button } from "@/components/ui/button"
import { Terminal, Trash2, Copy, Cpu, Play, Square, Maximize2, Layers, Search, Bug } from "lucide-react"
import { useState } from "react"

const AGENT_TERMS = [
  { id: "harness", label: "Harness", cwd: "lokma/harness", status: "live" as const },
  { id: "builder-1", label: "builder-1", cwd: "lokma · .lokma/worktrees/builder-1", status: "pty" as const },
  { id: "reviewer-2", label: "reviewer-2", cwd: "lokma/packages/lokma-web", status: "idle" as const },
  { id: "tester-3", label: "tester-3", cwd: "lokma · .lokma/worktrees/tester-3", status: "pty" as const },
]

const LOGS: Record<string, string[]> = {
  harness: [
    "[14:31:02] lokma web :3000 — harness loop ready (Vite 6 + Fastify :3456)",
    "[14:31:03] ws /ws/session-482 — connected (builder-1 · anthropic/sonnet)",
    "[14:31:04] bus → file.intent builder-1 → src/api/auth.ts (lease 60s)",
    "[14:31:05] locks/acquire src/api/auth.ts → ok · sha a1b2c3 · coordinator grant",
    "[14:31:07] tool edit_file src/api/auth.ts expectedSha a1b2c3 → ok",
    "[14:31:08] token 12.3k · $0.04 · 1.2s · done — broadcast agent.done",
  ],
  "builder-1": [
    "$ npm test -- src/api/auth.test.ts",
    "  ● auth › verifies JWT in preHandler",
    "  ● auth › rate-limit 60/min per user",
    "  ● locks › heartbeat extends lease",
    "✓ 12 tests passed (1.2s) — 0 failed",
    "$ lokma doctor",
    "✓ provider hilive · tokens 12k · $0.04 · locks ok · worktree ok",
    "$",
  ],
  "reviewer-2": [
    "$ cat ~/.lokma/agents/reviewer-2/SOUL.md | head -n 20",
    "# reviewer — SOUL",
    "You are a senior reviewer. Direct, cites lines.",
    "...",
    "(idle — awaiting task assign via run_agent)",
  ],
  "tester-3": [
    "$ lokma test --run run-482",
    "  plan → inventory (22 tests) → codegen → sandbox video:on",
    "  classify: 1 fail (selector drift), 1 flaky (timing)",
    "  heal: role/label fallback → re-run → ✓",
    "  report → ~/.lokma/test-runs/run-482/report.json",
  ],
}

export function TerminalPane() {
  const [tab, setTab] = useState<string>("builder-1")
  const [search, setSearch] = useState("")
  const lines = LOGS[tab] || LOGS["builder-1"]
  const filtered = search ? lines.filter(l => l.toLowerCase().includes(search.toLowerCase())) : lines
  return (
    <div className="h-full flex flex-col bg-[#0F0F11] text-[#EDE9E2] rounded-lg overflow-hidden border border-[#232326]">
      <div className="h-7 flex items-center gap-1 px-2 border-b border-white/10 bg-[#1E1E21] shrink-0 overflow-x-auto">
        <Terminal className="w-3 h-3 text-emerald-400 shrink-0" />
        <span className="text-xs font-medium whitespace-nowrap">Terminal</span>
        <span className="hidden sm:inline text-[11px] text-white/40 whitespace-nowrap">· harness logs · per-agent PTY · xterm</span>
        <span className="ml-2 flex gap-1 shrink-0">
          {AGENT_TERMS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-2 py-0.5 rounded-full border text-[11px] flex items-center gap-1 ${tab === t.id ? "bg-white text-black border-white" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${t.status === "live" ? "bg-emerald-500 animate-pulse" : t.status === "pty" ? "bg-terracotta" : "bg-zinc-500"}`} /> {t.label}
            </button>
          ))}
        </span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <div className="relative hidden md:flex items-center">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30" />
            <input placeholder="Filter..." value={search} onChange={e => setSearch(e.target.value)} className="w-[120px] h-6 pl-6 pr-2 rounded-full bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-white/20" />
          </div>
          <Button variant="ghost" size="iconSm" className="h-6 w-6 text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Terminal ${tab} kopyalandı — ${filtered.length} lines` }))}>
            <Copy className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" className="h-6 w-6 text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Clear ${tab} — PTY buffer` }))}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </span>
      </div>

      <div className="h-6 flex items-center gap-1.5 px-2 border-b border-white/5 bg-[#161618] text-[11px] shrink-0 overflow-x-auto">
        <span className="flex items-center gap-1 text-white/50"><Cpu className="w-3 h-3" /> cwd</span>
        <span className="font-mono text-white/90 truncate">{AGENT_TERMS.find(t => t.id === tab)?.cwd}</span>
        <span className="ml-auto hidden sm:flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1 text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Run in ${tab}` }))}><Play className="w-3 h-3" /> Run</Button>
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1 text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Kill ${tab} PTY` }))}><Square className="w-3 h-3" /> Kill</Button>
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1 text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Maximize ${tab}` }))}><Maximize2 className="w-3 h-3" /></Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-1 leading-5 font-mono text-xs">
        {filtered.map((l, i) => {
          const isCmd = l.startsWith("$")
          const isOk = l.startsWith("✓") || l.includes("✓")
          const isErr = l.startsWith("✗") || l.includes("failed")
          const isInfo = l.startsWith("[")
          return (
            <div key={i} className={`${isCmd ? "text-white font-semibold" : isOk ? "text-emerald-400" : isErr ? "text-red-400" : isInfo ? "text-white/50" : "text-zinc-400"}`}>
              {isCmd ? <span className="text-emerald-400 mr-1">$</span> : null}{isCmd ? l.slice(2) : l}
            </div>
          )
        })}
        <div className="flex items-center gap-1 mt-2 text-white">
          <span className="text-emerald-400">$</span>
          <span className="w-2 h-4 bg-white/80 animate-pulse" />
          <span className="ml-2 text-[11px] text-white/30">PTY per agent · shell multiplexed via WS /ws/:sessionId · resize + scroll + copy</span>
        </div>
      </div>

      <div className="h-6 flex items-center gap-1 px-2 border-t border-white/5 bg-[#161618] text-[10px] shrink-0 overflow-x-auto">
        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 flex items-center gap-1"><Layers className="w-3 h-3" /> xterm · PTY</span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hidden sm:inline-flex items-center gap-1"><Bug className="w-3 h-3" /> live harness logs</span>
        <span className="ml-auto hidden lg:inline text-white/30">resize: drag pane · clear: trash · copy: clipboard — per-agent isolated</span>
      </div>
    </div>
  )
}
