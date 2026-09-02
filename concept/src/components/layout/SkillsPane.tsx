import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Sparkles, Puzzle, Layers, History, Zap, BookOpen, ChevronRight } from "lucide-react"
import { useState } from "react"

const SKILLS = [
  { id: "vault-search", name: "Vault Search", file: "vault-search/SKILL.md", useWhen: "Use when the user needs vault/memory search via FTS5", source: "bundled", rank: 0.92, enabled: true },
  { id: "archify", name: "Archify", file: "archify/SKILL.md", useWhen: "Use when the user wants a diagram (flow/sequence/state/er/arch)", source: "user", rank: 0.88, enabled: true },
  { id: "design-canvas", name: "Design Canvas", file: "design-canvas/SKILL.md", useWhen: "Use when the task needs a prototype/deck/mobile design", source: "user", rank: 0.85, enabled: true },
  { id: "test-app", name: "Test App", file: "test-app/SKILL.md", useWhen: "Use when the user asks to test the app (plan→heal)", source: "hub", rank: 0.81, enabled: true },
  { id: "bot-runner", name: "Bot Runner", file: "bots/bot-runner/SKILL.md", useWhen: "Use when running a Lokma Bot via POST /api/bots/:id/run", source: "bundled", rank: 0.78, enabled: false },
  { id: "agent-spawner", name: "Agent Spawner", file: "agent-spawner/SKILL.md", useWhen: "Use when the task needs multiple specialists in parallel", source: "bundled", rank: 0.76, enabled: true },
  { id: "curator", name: "Curator", file: "curator/SKILL.md", useWhen: "Use after skill usage to patch ranking via .usage.json", source: "bundled", rank: 0.70, enabled: true },
]

export function SkillsPane() {
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>("archify")
  const filtered = SKILLS.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.useWhen.toLowerCase().includes(q.toLowerCase()))
  const sel = SKILLS.find(s => s.id === selected)
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Puzzle className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Skills</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">auto-discovery · Use when · skill_view · curator</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "/skills palette — yakında" }))}>
            <Search className="w-3 h-3" /> /skills
          </Button>
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[42%] min-w-[180px] border-r border-line flex flex-col">
          <div className="p-2 border-b border-line/50">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <Input placeholder="Search skills — Use when..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
            </div>
            <div className="mt-1.5 flex gap-1 text-[11px] text-zinc-500">
              <span className="px-1.5 py-0.5 rounded bg-muted border border-line">{filtered.length} skills</span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-line">registry.scan() · trie</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {filtered.map(s => (
              <button key={s.id} onClick={() => setSelected(s.id)} className={`w-full text-left p-2 rounded-md border flex gap-2 transition ${selected === s.id ? "bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]" : "bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20"}`}>
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${s.enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate flex items-center gap-1">
                    {s.name}
                    <span className={`px-1 py-0 rounded text-[10px] border ${s.source === "bundled" ? "bg-zinc-100 border-line text-zinc-600" : s.source === "user" ? "bg-terracotta text-white border-terracotta" : "bg-[#6C5CE7] text-white border-[#6C5CE7]"}`}>{s.source}</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">{s.useWhen}</div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                    <Layers className="w-3 h-3" /> rank {s.rank.toFixed(2)} · {s.file}
                  </div>
                </div>
                <ChevronRight className={`w-3 h-3 mt-1 shrink-0 ${selected === s.id ? "text-terracotta" : "text-zinc-300"}`} />
              </button>
            ))}
            {filtered.length === 0 && <div className="p-4 text-center text-xs text-zinc-400">No match</div>}
          </div>
          <div className="p-2 border-t border-line/50">
            <Button variant="outline" size="sm" className="w-full h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Marketplace — agentskills.io + dsh-market yakında" }))}>
              <BookOpen className="w-3 h-3" /> Marketplace
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50">
          {sel ? (
            <>
              <div className="p-3 border-b border-line/50 bg-white dark:bg-[#1E1E21]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{sel.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted border border-line">{sel.id}</span>
                  <span className={`ml-auto w-2 h-2 rounded-full ${sel.enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <span className="text-[11px] text-zinc-500">{sel.enabled ? "enabled" : "disabled"}</span>
                </div>
                <div className="mt-1 text-[11px] font-mono text-terracotta bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] rounded px-1.5 py-1">{sel.useWhen}</div>
                <div className="text-[11px] text-zinc-400 mt-1">first 57 chars routing · no embeddings in hot path · progressive disclosure via skill_view</div>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `skill_view(${sel.id})` }))}>
                    <BookOpen className="w-3 h-3" /> skill_view
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `PATCH /api/skills/${sel.id}` }))}>Patch</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `linked_files · ${sel.file}` }))}>linked_files ▾</Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-2">
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium flex items-center gap-1"><Sparkles className="w-3 h-3 text-terracotta" /> SKILL.md preview</div>
                  <pre className="mt-2 p-2 rounded bg-muted border border-line text-[11px] leading-5 overflow-auto">
{`---\nname: ${sel.id}\ndescription: "${sel.useWhen}. ..."\n---\n\n# ${sel.name}\n\n## When to Use\n${sel.useWhen}\n\n## Instructions\n1. scan vault...\n2. render...\n`}
                  </pre>
                </div>
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium flex items-center gap-1"><History className="w-3 h-3" /> Telemetry — .usage.json → curator ranking</div>
                  <div className="mt-1 text-[11px] text-zinc-500">invocations: 12 · success 10 · avg latency 1.2s · curator rank {sel.rank.toFixed(2)} → auto-reorders &lt;available_skills&gt;</div>
                </div>
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Injected every turn</div>
                  <div className="mt-1 text-[11px] font-mono bg-[#0F0F11] text-white/90 p-2 rounded border border-white/10 overflow-auto">{`<available_skills>\n  <skill name="${sel.id}">${sel.useWhen}</skill>\n  ...\n</available_skills>`}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-xs text-zinc-400 p-6 text-center">Select a skill → skill_view preview<br /><span className="text-[11px]">&lt;available_skills&gt; + trie + curator patch</span></div>
          )}
        </div>
      </div>
    </div>
  )
}
