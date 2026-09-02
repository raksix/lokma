import { Button } from "@/components/ui/button"
import { Bot, Sparkles, Play, Copy, Share2, GitFork, Layers, Cpu, Search } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"

const BOTS = [
  { id: "vault-scout", name: "Vault Scout", persona: "researcher", model: "sonnet", desc: "Scans vault graph, finds related notes, proposes links", featured: true, runs: 42, owner: "lokma" },
  { id: "archify-pro", name: "Archify Pro", persona: "builder", model: "opus", desc: "Generates arch diagrams from codebase → typed IR → SVG", featured: true, runs: 31, owner: "lokma" },
  { id: "test-healer", name: "Test Healer", persona: "tester", model: "haiku", desc: "Reads failing test video+trace, patches selector/timing", featured: false, runs: 18, owner: "furkan" },
  { id: "design-critic", name: "Design Critic", persona: "reviewer", model: "sonnet", desc: "5D critique pass over Design Studio artifacts", featured: false, runs: 9, owner: "furkan" },
  { id: "custodian", name: "Custodian", persona: "custodian", model: "sonnet", desc: "Nightly vault sync + graph rebuild + FTS5 reindex", featured: false, runs: 27, owner: "shared" },
]

const TABS = ["Featured", "Mine", "Shared"] as const

export function BotsPane() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Featured")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string>("vault-scout")
  const sel = BOTS.find(b => b.id === selected) || BOTS[0]
  const filtered = BOTS.filter(b => {
    const byTab = tab === "Featured" ? b.featured : tab === "Mine" ? b.owner === "furkan" : b.owner === "shared" || b.owner === "lokma"
    const byQ = !q || b.name.toLowerCase().includes(q.toLowerCase()) || b.desc.toLowerCase().includes(q.toLowerCase())
    return byTab && byQ
  })
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Bot className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Bots</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">bot.json · persona→bot→agent · Gallery</span>
        <Button size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Create Bot — bot.json wizard yakında" }))}>
          <Sparkles className="w-3 h-3" /> Create Bot
        </Button>
      </div>

      <div className="flex items-center gap-1 p-1.5 border-b border-line/60 bg-muted/20 shrink-0">
        {TABS.map(t => (
          <Button key={t} variant={tab === t ? "ink" : "ghost"} size="sm" className="h-6 text-[11px]" onClick={() => setTab(t)}>{t}</Button>
        ))}
        <div className="relative ml-auto w-[160px] hidden sm:block">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <Input placeholder="Search bots..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-6 text-xs" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[44%] min-w-[180px] border-r border-line flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-1.5 space-y-1.5">
            {filtered.map(b => (
              <button key={b.id} onClick={() => setSelected(b.id)} className={`w-full text-left p-2.5 rounded-lg border flex gap-2.5 transition ${selected === b.id ? "bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]" : "bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20"}`}>
                <span className="w-8 h-8 rounded-lg bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-xs font-bold shrink-0">{b.name.slice(0, 2).toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1">
                    {b.name}
                    {b.featured && <span className="px-1 py-0 rounded-full bg-terracotta text-white text-[10px]">Featured</span>}
                  </div>
                  <div className="text-[11px] text-zinc-500 line-clamp-2 leading-4">{b.desc}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-zinc-400">
                    <span className="px-1 py-0 rounded bg-muted border border-line">{b.persona}</span>
                    <span className="px-1 py-0 rounded bg-muted border border-line">{b.model}</span>
                    <span className="ml-auto">{b.runs} runs</span>
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div className="p-6 text-center text-xs text-zinc-400">No bots in {tab}</div>}
            <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1 mt-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Hub / Marketplace — publish/fork yakında" }))}>
              <Layers className="w-3 h-3" /> Hub & Marketplace
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50 overflow-auto">
          <div className="p-3 border-b border-line/50 bg-white dark:bg-[#1E1E21]">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-sm font-bold shrink-0">{sel.name.slice(0, 2).toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  {sel.name} <span className="text-[11px] font-normal text-zinc-400">· {sel.id}</span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300 mt-0.5">{sel.desc}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[11px] flex items-center gap-1"><Cpu className="w-3 h-3" /> persona: {sel.persona}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[11px]">model: {sel.model}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-white border border-line text-[11px]"> {sel.runs} runs</span>
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `POST /api/bots/${sel.id}/run → agent` }))}>
                <Play className="w-3 h-3" /> Run
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Fork ${sel.id}` }))}>
                <GitFork className="w-3 h-3" /> Fork
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Publish ${sel.id}` }))}>
                <Share2 className="w-3 h-3" /> Publish
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(JSON.stringify({ name: sel.name, persona: sel.persona, model: sel.model }, null, 2)); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "bot.json kopyalandı" })) }}>
                <Copy className="w-3 h-3" /> bot.json
              </Button>
            </div>
          </div>

          <div className="p-2 space-y-2">
            <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
              <div className="text-xs font-medium">Lifecycle — create → playground → publish → fork → run</div>
              <div className="mt-2 flex items-center gap-1 overflow-x-auto">
                {["Create", "Playground", "Publish", "Fork", "Run → Agent"].map((step, i) => (
                  <span key={step} className="flex items-center gap-1 shrink-0">
                    <span className={`px-2 py-1 rounded-full border text-[11px] ${i === 4 ? "bg-terracotta text-white border-terracotta" : "bg-muted border-line"}`}>{i + 1}. {step}</span>
                    {i < 4 && <span className="text-zinc-300">→</span>}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">POST /api/bots/:id/run spawns a real agent (persona SOUL + model + memory) — same as lokma agent create but from a shared template.</div>
            </div>

            <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
              <div className="text-xs font-medium">bot.json — Zod BotSchema</div>
              <pre className="mt-2 p-2 rounded bg-[#0F0F11] text-white/90 border border-white/10 text-[11px] leading-5 overflow-auto">
{`{
  "id": "${sel.id}",
  "name": "${sel.name}",
  "persona": "${sel.persona}",
  "model": "${sel.model}",
  "SOUL": "skills/lokma-personas/${sel.persona}/SOUL.md",
  "caps": { "maxAgents": 20, "tools": ["read","edit","bash"] }
}`}
              </pre>
              <div className="mt-1 text-[11px] text-zinc-500">persona → bot → agent mapping · Bot Gallery = template hub · sharing/marketplace = forkable</div>
            </div>

            <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] p-2 text-[11px] text-zinc-600 dark:text-zinc-300">
              Playground: chat with the bot before publishing — streams like a normal session, but tagged botId. Try before you publish.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
