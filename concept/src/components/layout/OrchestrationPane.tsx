import { Button } from "@/components/ui/button"
import { Cpu, GitBranch, Zap, Activity } from "lucide-react"

export function OrchestrationPane() {
  const agents = [
    { id: "agent-1", task: "find files", status: "running", elapsed: "1.2s", model: "sonnet" },
    { id: "agent-2", task: "read auth", status: "done", elapsed: "0.8s", model: "haiku" },
    { id: "agent-3", task: "edit tests", status: "running", elapsed: "2.1s", model: "sonnet" },
  ]
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Cpu className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Orchestration</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">3 agents</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Tüm ajanlar durduruldu" }))}>
            Cancel all
          </Button>
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {agents.map(a => (
          <div key={a.id} className="flex items-center gap-2 p-2 rounded-md border border-line hover:border-terracotta/30 hover:bg-terracotta/5 cursor-pointer transition group">
            <span className={`w-2 h-2 rounded-full shrink-0 ${a.status === "running" ? "bg-emerald-500 animate-pulse" : a.status === "done" ? "bg-zinc-400" : "bg-red-500"}`} />
            <span className="text-xs font-medium">{a.id}</span>
            <span className="text-xs text-zinc-500">{a.task}</span>
            <span className="ml-auto text-[11px] text-zinc-400">{a.elapsed}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[10px] group-hover:bg-white">{a.model}</span>
          </div>
        ))}
        <div className="mt-3 p-2 rounded-md bg-muted/50 border border-line/50">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <GitBranch className="w-3 h-3" /> Task fan-out
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden">
              <div className="h-full w-[60%] bg-terracotta rounded-full" />
            </div>
            <span className="text-[11px] text-zinc-500">3/5 done</span>
          </div>
        </div>
        <div className="flex gap-1.5 mt-2">
          <Button size="sm" className="flex-1 h-6 text-xs gap-1">
            <Zap className="w-3 h-3" /> Resume
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-6 text-xs gap-1">
            <Activity className="w-3 h-3" /> Logs
          </Button>
        </div>
      </div>
    </div>
  )
}
