import { Button } from "@/components/ui/button"
import { Users, Pause, Play, Square, GitFork, Copy, Brain, Coins, Cpu, ShieldAlert, Crown } from "lucide-react"
import { useState } from "react"

const AGENTS = [
  { id: "builder-1", name: "Builder", persona: "builder", model: "sonnet", state: "running" as const, tokens: "8.2k", cost: "$0.03", cwd: "/mnt/apopic/lokma", createdBy: "user", souls: 2 },
  { id: "reviewer-2", name: "Reviewer", persona: "reviewer", model: "opus", state: "idle" as const, tokens: "14.1k", cost: "$0.12", cwd: "/mnt/apopic/lokma/packages/lokma-web", createdBy: "ai:builder-1", souls: 1 },
  { id: "tester-3", name: "Tester", persona: "tester", model: "haiku", state: "paused" as const, tokens: "3.4k", cost: "$0.01", cwd: "/mnt/apopic/lokma", createdBy: "user", souls: 1 },
  { id: "researcher-4", name: "Researcher", persona: "researcher", model: "sonnet", state: "queued" as const, tokens: "0", cost: "$0.00", cwd: "/mnt/apopic/lokma/Docs", createdBy: "user", souls: 1 },
]

export function AgentHubPane() {
  const [selected, setSelected] = useState("builder-1")
  const sel = AGENTS.find(a => a.id === selected) || AGENTS[0]
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Users className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Agent Hub</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">{AGENTS.filter(a => a.state === "running").length} running · {AGENTS.length} total</span>
        <span className="hidden sm:inline ml-1 text-[11px] text-zinc-400">SOUL · MEMORY · model · caps · queue</span>
        <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma agent create <name> --persona builder --model anthropic/sonnet" }))}>
          + Create
        </Button>
      </div>

      <div className="px-2 py-1.5 flex flex-wrap gap-1 border-b border-line/50 bg-muted/20 text-[11px] shrink-0">
        <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line flex items-center gap-1"><Crown className="w-3 h-3 text-amber-600" /> caps: maxAgents 20 · maxConcurrent 5 · maxQueue 20</span>
        <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line">priority: interactive › high › normal › low + aging</span>
        <span className="px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] dark:bg-[#2A1E15]">maxSpawnDepth 3 · AUDIT.md</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[46%] min-w-[200px] border-r border-line flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-1.5 space-y-1.5">
            {AGENTS.map(a => (
              <button key={a.id} onClick={() => setSelected(a.id)} className={`w-full text-left p-2.5 rounded-lg border flex gap-2.5 transition ${selected === a.id ? "bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]" : "bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20"}`}>
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.state === "running" ? "bg-emerald-500 animate-pulse" : a.state === "idle" ? "bg-zinc-300" : a.state === "paused" ? "bg-amber-500" : "bg-blue-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    {a.name} <span className="text-[11px] font-normal text-zinc-400">· {a.id}</span>
                    {a.createdBy.startsWith("ai:") && <span className="px-1 py-0 rounded bg-[#6C5CE7] text-white text-[10px]">ai</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className="px-1 py-0 rounded bg-muted border border-line text-[10px]">{a.persona}</span>
                    <span className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line text-[10px]">{a.model}</span>
                    <span className={`px-1 py-0 rounded-full border text-[10px] ${a.state === "running" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : a.state === "queued" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-zinc-100 border-line text-zinc-600"}`}>{a.state}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1"><Coins className="w-3 h-3" /> {a.tokens} · {a.cost}</span>
                    <span className="truncate hidden sm:inline">{a.cwd}</span>
                  </div>
                </div>
                <span className="text-[11px] px-1 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line shrink-0 hidden sm:inline">{a.souls} SOUL</span>
              </button>
            ))}
            <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
              Drag session → agent card = handoff · agent card → agent card = merge.request · Orchestration shows live tree, Hub shows registry + budgets
            </div>
          </div>
          <div className="p-1.5 border-t border-line/50 flex gap-1">
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Agent Hub full CRUD — clone/fork yakında" }))}>
              <Copy className="w-3 h-3" /> Clone
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Import / Export — agentTemplate MCP" }))}>
              Import
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50 overflow-auto">
          <div className="p-3 border-b border-line/50 bg-white dark:bg-[#1E1E21]">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-xs font-bold">{sel.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  {sel.name} <span className="text-[11px] font-normal text-zinc-400">· {sel.id} · {sel.persona}</span>
                  <span className={`w-2 h-2 rounded-full ${sel.state === "running" ? "bg-emerald-500 animate-pulse" : sel.state === "idle" ? "bg-zinc-300" : sel.state === "paused" ? "bg-amber-500" : "bg-blue-500"}`} />
                </div>
                <div className="text-[11px] text-zinc-500">cwd: {sel.cwd} · createdBy: {sel.createdBy} · model {sel.model} · {sel.tokens} · {sel.cost}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Run ${sel.id}` }))}><Play className="w-3 h-3" /> Run</Button>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Pause ${sel.id}` }))}><Pause className="w-3 h-3" /> Pause</Button>
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Kill ${sel.id}` }))}><Square className="w-3 h-3" /> Kill</Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Fork ${sel.id}` }))}><GitFork className="w-3 h-3" /> Fork</Button>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `SOUL.md edit — ${sel.persona}` }))}><Brain className="w-3 h-3" /> SOUL</Button>
            </div>
          </div>

          <div className="p-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                <div className="text-xs font-medium flex items-center gap-1"><Brain className="w-3 h-3 text-terracotta" /> SOUL.md</div>
                <pre className="mt-1 p-1.5 rounded bg-muted border border-line text-[11px] leading-5 overflow-auto">{`# ${sel.persona} — SOUL\nYou are a ${sel.persona}. Concise, careful.\nEnforce DRY, small functions.\n`}</pre>
                <Button variant="ghost" size="sm" className="mt-1 h-5 text-[11px] w-full">Edit SOUL.md</Button>
              </div>
              <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                <div className="text-xs font-medium flex items-center gap-1"><Cpu className="w-3 h-3" /> MEMORY.md · budgets</div>
                <div className="mt-1 text-[11px] leading-5 p-1.5 rounded bg-muted border border-line">
                  per-agent MEMORY (FTS5 agentId scoped)<br />
                  budgets: {`{ tokens: 50000, usd: 2.00 }`} — hard stop at 100%
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden">
                  <div className="h-full bg-terracotta" style={{ width: sel.tokens === "0" ? "0%" : "42%" }} />
                </div>
                <div className="text-[11px] text-zinc-400 mt-1 flex justify-between"><span>{sel.tokens} / 50k</span><span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> 80% alert</span></div>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
              <div className="text-xs font-medium flex items-center gap-1"><Users className="w-3 h-3" /> caps + queue</div>
              <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line">queue: 2 waiting (aging +2)</span>
                <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line">lease 60s · heartbeat 30s</span>
                <span className="px-1.5 py-0.5 rounded-full bg-white border border-line">TokenLedger agentId → Usage filter</span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">Orchestration Pane = live tree (running/done). Hub = registry (create/config/run/pause/resume/kill/fork/clone/delete/import/export) + bus (mailbox+broadcast) + coordinator (file-ownership graph).</div>
            </div>

            <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] p-2 text-[11px] text-zinc-600 dark:text-zinc-300">
              Self-spawn: <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">create_agent</code> tool gated by agent-spawner skill — createdBy ai:parentId + AUDIT.md + maxSpawnDepth 3
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
