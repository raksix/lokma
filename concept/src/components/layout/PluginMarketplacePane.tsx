import { Button } from "@/components/ui/button"
import { Puzzle, Download, Star, Search, Plug2, Layers, Sparkles } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"

const PLUGINS = [
  { id: "@lokma/plugin-pane", name: "Pane System", ver: "0.2.1", author: "lokma", downloads: "12.4k", stars: 42, desc: "flexlayout-react + tiling/windowed + drag handles", installed: true, enabled: true, cat: "core" },
  { id: "@lokma/plugin-archify", name: "Archify", ver: "0.1.8", author: "lokma", downloads: "3.2k", stars: 28, desc: "typed JSON IR → HTML/SVG, 5 types, viewer #focus", installed: true, enabled: true, cat: "diagram" },
  { id: "agentskills/reviewer", name: "Reviewer Skill", ver: "1.0.4", author: "agentskills.io", downloads: "8.1k", stars: 67, desc: "SOUL reviewer — security/types/tests critique", installed: false, enabled: false, cat: "skill" },
  { id: "dsh-market/browser", name: "Browser Control", ver: "0.4.2", author: "dsh-market", downloads: "5.6k", stars: 31, desc: "playwright + cdp — harness browser per agent", installed: false, enabled: false, cat: "tool" },
  { id: "@lokma/plugin-vault", name: "Vault Sync", ver: "0.1.5", author: "lokma", downloads: "2.9k", stars: 19, desc: "FTS5 + memory.fermag.com.tr/lokma + graph", installed: true, enabled: false, cat: "core" },
]

export function PluginMarketplacePane() {
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<"installed" | "marketplace">("marketplace")
  const [plugins, setPlugins] = useState(PLUGINS)
  const filtered = plugins.filter(p => {
    const byTab = tab === "installed" ? p.installed : true
    const byQ = !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.desc.toLowerCase().includes(q.toLowerCase())
    return byTab && byQ
  })
  const toggle = (id: string) => setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled, installed: true } : p))
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Puzzle className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Plugins</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">Cordis lightweight kernel · marketplace · no restart</span>
        <span className="ml-auto flex gap-1">
          <Button variant={tab === "installed" ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setTab("installed")}>Installed {plugins.filter(p => p.installed).length}</Button>
          <Button variant={tab === "marketplace" ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setTab("marketplace")}>Marketplace</Button>
        </span>
      </div>

      <div className="p-2 border-b border-line/50 flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <Input placeholder="Search — agentskills.io + dsh-market..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Add from URL — plugin tarball / git" }))}>
          <Download className="w-3 h-3" /> Add from URL
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-1.5">
        {filtered.map(p => (
          <div key={p.id} className="flex gap-3 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition">
            <span className="w-8 h-8 rounded-lg bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[10px] font-bold shrink-0">
              {p.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                {p.name} <span className="text-[11px] font-normal text-zinc-400">· {p.ver}</span>
                <span className={`hidden sm:inline px-1 py-0 rounded border text-[10px] ${p.cat === "core" ? "bg-terracotta text-white border-terracotta" : p.cat === "skill" ? "bg-[#6C5CE7] text-white border-[#6C5CE7]" : "bg-muted border-line"}`}>{p.cat}</span>
                {p.installed && <span className={`w-2 h-2 rounded-full ${p.enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />}
              </div>
              <div className="text-xs text-zinc-500 leading-4 line-clamp-2">{p.desc}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {p.downloads}</span>
                <span className="flex items-center gap-1"><Star className="w-3 h-3" /> {p.stars}</span>
                <span className="hidden sm:inline">{p.author} · {p.id}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {p.installed ? (
                <>
                  <Button variant={p.enabled ? "ink" : "outline"} size="sm" className="h-6 text-xs px-2" onClick={() => toggle(p.id)}>{p.enabled ? "Enabled" : "Enable"}</Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `ctx.tools/llm/sessions · ${p.id}` }))}>Kernel</Button>
                </>
              ) : (
                <Button size="sm" className="h-6 text-xs gap-1" onClick={() => toggle(p.id)}>
                  <Download className="w-3 h-3" /> Install
                </Button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-6 text-center text-xs text-zinc-400">No plugins — try marketplace</div>}
      </div>

      <div className="p-2 border-t border-line bg-muted/20 text-[11px] text-zinc-500 flex gap-1 flex-wrap">
        <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> Cordis kernel: ctx.tools / llm / sessions — emit/waterfall/bail</span>
        <span className="ml-auto hidden sm:inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> enable/disable without restart — lightweight</span>
      </div>
    </div>
  )
}
