import { Button } from "@/components/ui/button"
import { GitBranch, GitCommit, FileDiff, GitMerge, Lock, Unlock, Clock3, FolderGit2, AlertTriangle } from "lucide-react"
import { useState } from "react"

const FILES = [
  { path: "src/api/auth.ts", status: "M" as const, owner: "builder-1", lock: "exclusive" as const, sha: "a1b2c3", worktree: "main" },
  { path: "src/api/auth.test.ts", status: "A" as const, owner: "tester-3", lock: "exclusive" as const, sha: "d4e5f6", worktree: "worktrees/tester-3" },
  { path: "concept/src/components/layout/Pane.tsx", status: "M" as const, owner: "—", lock: null, sha: "9c8d7e", worktree: "main" },
  { path: "Docs/30-AGENT-SYSTEM.md", status: "M" as const, owner: "reviewer-2", lock: "exclusive" as const, sha: "112233", worktree: "worktrees/reviewer-2" },
]

const COMMITS = [
  { hash: "11cc24c", msg: "docs: update 00-KONTEKST devam 11-15 (05e1f0e)", ago: "2m ago", branch: "main" },
  { hash: "05e1f0e", msg: "feat(concept): devam — extras phase 3 polish", ago: "8m ago", branch: "main" },
  { hash: "7378fe0", msg: "feat(bots): add Lokma CEO bot (lokma-ceo)", ago: "1h ago", branch: "main" },
  { hash: "d47eaa2", msg: "feat(concept): 10-loop polish — Auth, Setup, Vault graph", ago: "3h ago", branch: "main" },
]

export function GitPane() {
  const [filter, setFilter] = useState<"all" | "locked" | "worktree">("all")
  const filtered = FILES.filter(f => filter === "all" ? true : filter === "locked" ? !!f.lock : f.worktree !== "main")
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <GitBranch className="w-3 h-3 text-zinc-500" />
        <span className="text-xs font-semibold">Git</span>
        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">main</span>
        <span className="ml-1 hidden sm:inline text-[11px] text-zinc-400">{FILES.length} changed · {FILES.filter(f=>f.lock).length} locked · {FILES.filter(f=>f.worktree!=="main").length} worktree</span>
        <span className="ml-auto flex gap-1">
          <Button variant={filter==="all"?"ink":"ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={()=>setFilter("all")}>all</Button>
          <Button variant={filter==="locked"?"ink":"ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={()=>setFilter("locked")}>locked</Button>
          <Button variant={filter==="worktree"?"ink":"ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={()=>setFilter("worktree")}>worktree</Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-2 space-y-1.5">
          {filtered.map(f => (
            <div key={f.path} className="flex items-center gap-2 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition group">
              <FileDiff className={`w-3 h-3 shrink-0 ${f.status==="M"?"text-amber-600":f.status==="A"?"text-emerald-600":"text-zinc-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono truncate flex items-center gap-1.5">{f.path}
                  <span className={`w-1.5 h-1.5 rounded-full ${f.lock?"bg-amber-500":"bg-zinc-300"}`} title={f.lock?"locked":"unlocked"}/>
                  <span className={`hidden sm:inline px-1 py-0 rounded text-[10px] border ${f.worktree==="main"?"bg-zinc-100 border-line text-zinc-600":"bg-[#EEF2FF] border-[#C7D2FE] text-[#4F46E5]"}`}>{f.worktree}</span>
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                  {f.lock ? <Lock className="w-3 h-3 text-amber-600"/> : <Unlock className="w-3 h-3 text-zinc-300"/>}
                  {f.lock ? `${f.owner} · .agentlocks/${f.sha}.json · lease 60s` : "no lock · shared cwd — 3-way merge on sha mismatch"}
                  <span className="hidden md:inline ml-1 font-mono">sha {f.sha}</span>
                </div>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${f.status==="M"?"bg-amber-500 text-white border-amber-500":f.status==="A"?"bg-emerald-500 text-white border-emerald-500":"bg-zinc-100 border-line"}`}>{f.status}</span>
            </div>
          ))}
          <div className="p-2 rounded-md bg-muted/30 border border-dashed border-line text-[11px] text-zinc-500">
            <span className="font-medium">3-layer safe:</span> lease (60s heartbeat) → expectedSha guard → worktree isolation — <code className="px-1 py-0 rounded bg-white border border-line">.lokma/worktrees/&lt;agentId&gt; → squash merge</code>
          </div>
        </div>

        <div className="mx-2 rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center gap-1.5 px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
            <GitCommit className="w-3 h-3" /> Log — git worktree per agent
            <span className="ml-auto hidden sm:inline text-[11px] font-normal text-zinc-400"><FolderGit2 className="w-3 h-3 inline" /> squash per-agent branch</span>
          </div>
          <div className="divide-y divide-line/50">
            {COMMITS.map(c => (
              <div key={c.hash} className="flex gap-2 px-3 py-2 hover:bg-muted/30 transition">
                <GitCommit className="w-3 h-3 text-zinc-400 mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.msg}</div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1"><span className="font-mono">{c.hash}</span> · <Clock3 className="w-3 h-3"/>{c.ago} · {c.branch}</div>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[11px] hidden sm:inline-flex" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Show ${c.hash}` }))}>Show</Button>
              </div>
            ))}
          </div>
        </div>

        <div className="m-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><GitMerge className="w-3 h-3 text-terracotta"/> Merge — coordinator</div>
            <div className="text-[11px] text-zinc-500 mt-1">coordinator mediates <code className="px-1 py-0 rounded bg-muted border border-line">merge.request</code> when hunks overlap → diff3/AST driver</div>
          </div>
          <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
            <div className="text-xs font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-600"/> expectedSha guard</div>
            <div className="text-[11px] text-zinc-500 mt-1"><code className="px-1 py-0 rounded bg-muted border border-line">edit_file expectedSha</code> rejects stale → re-read → 3-way merge</div>
          </div>
        </div>

        <div className="m-2 flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-xs" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Commit — advisory locks checked + worktree merge" }))}>Commit</Button>
          <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Push → origin/main · lokma git sync" }))}>Push</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={()=>window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Worktree GC — ttl 7d" }))}>GC</Button>
        </div>
      </div>
    </div>
  )
}
