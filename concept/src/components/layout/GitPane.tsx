import { Button } from "@/components/ui/button"
import { GitBranch, GitCommit, FileDiff } from "lucide-react"

export function GitPane() {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <GitBranch className="w-3 h-3 text-zinc-500" />
        <span className="text-xs font-semibold">Git</span>
        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">main</span>
        <span className="ml-auto text-[11px] text-zinc-400">3 files changed</span>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        <div className="flex items-center gap-1.5 p-1.5 rounded-md hover:bg-muted cursor-pointer border border-transparent hover:border-line">
          <FileDiff className="w-3 h-3 text-amber-600" />
          <span className="text-xs font-mono">src/api/auth.ts</span>
          <span className="ml-auto text-[11px] px-1 py-0.5 rounded bg-amber-500 text-white">M</span>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-md hover:bg-muted cursor-pointer border border-transparent hover:border-line">
          <FileDiff className="w-3 h-3 text-emerald-600" />
          <span className="text-xs font-mono">src/api/auth.test.ts</span>
          <span className="ml-auto text-[11px] px-1 py-0.5 rounded bg-emerald-500 text-white">A</span>
        </div>
        <div className="border-t border-line my-2" />
        <div className="space-y-1.5">
          <div className="flex gap-1.5 text-xs">
            <GitCommit className="w-3 h-3 text-zinc-400 mt-0.5" />
            <div>
              <div className="font-medium">feat(auth): preHandler hook</div>
              <div className="text-zinc-500 text-[11px]">1c56c0e · 2m ago</div>
            </div>
          </div>
          <div className="flex gap-1.5 text-xs opacity-60">
            <GitCommit className="w-3 h-3 text-zinc-400 mt-0.5" />
            <div>
              <div className="font-medium">fix(web): vite migrate</div>
              <div className="text-zinc-500 text-[11px]">215fa82 · 1h ago</div>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3">
          <Button size="sm" className="flex-1 h-6 text-xs">Commit</Button>
          <Button variant="outline" size="sm" className="flex-1 h-6 text-xs">Push</Button>
        </div>
      </div>
    </div>
  )
}
