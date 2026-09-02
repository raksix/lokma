import { Button } from "@/components/ui/button"
import { Folder, Search, GitBranch, Maximize2, Layers, Link2 } from "lucide-react"
import { useState } from "react"

const NOTES = [
  { path: "vault/lokma/00-KONTEKST.md", title: "LOKMA Kontekst", tags: "memory", links: 8 },
  { path: "vault/lokma/24-pane.md", title: "Pane System", tags: "pane", links: 5 },
  { path: "vault/lokma/34-design.md", title: "Design Canvas", tags: "design", links: 3 },
  { path: "vault/lokma/agents/builder/MEMORY.md", title: "builder/MEMORY", tags: "agent", links: 12 },
  { path: "vault/lokma/28-vault-graph.md", title: "Vault Graph", tags: "graph", links: 6 },
  { path: "vault/lokma/30-agent-system.md", title: "Agent System", tags: "agent", links: 9 },
]

const EDGES = [
  ["00-KONTEKST", "Pane System"],
  ["00-KONTEKST", "Agent System"],
  ["agent/builder", "Pane System"],
  ["Design Canvas", "Pane System"],
  ["Agent System", "Vault Graph"],
]

export function VaultPane() {
  const [q, setQ] = useState("")
  const [mode, setMode] = useState<"2d" | "3d">("2d")
  const [depth, setDepth] = useState(2)
  const [selected, setSelected] = useState<string | null>(null)
  const filtered = NOTES.filter(n => !q || n.title.toLowerCase().includes(q.toLowerCase()) || n.path.toLowerCase().includes(q.toLowerCase())).slice(0, 10 + depth * 5)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Folder className="w-3 h-3 text-amber-600" />
        <span className="text-xs font-semibold">Vault</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">FTS5 · graph · folder=lokma</span>
        <span className="ml-auto flex gap-1">
          <Button variant={mode === "2d" ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setMode("2d")}>2D</Button>
          <Button variant={mode === "3d" ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setMode("3d")}>3D ★</Button>
        </span>
      </div>

      <div className="p-2 border-b border-line/50 flex gap-1 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <input placeholder="Vault ara — FTS5 + wikilink..." value={q} onChange={e => setQ(e.target.value)} className="w-full h-7 pl-7 pr-2 rounded-md bg-white dark:bg-[#1E1E21] border border-line text-xs focus:outline-none focus:border-terracotta/30" />
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-500">
          depth
          <input type="range" min={1} max={3} value={depth} onChange={e => setDepth(parseInt(e.target.value))} className="w-16 accent-[#C96442]" />
          {depth}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-[46%] min-w-[160px] border-r border-line flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {filtered.map(n => (
              <button key={n.path} onClick={() => { setSelected(n.path); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Open ${n.title} — [[wikilink]] → pane` })) }} className={`w-full text-left p-2 rounded-md border flex gap-2 group transition ${selected === n.path ? "bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15]" : "border-transparent hover:border-line hover:bg-muted"}`}>
                <GitBranch className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0 group-hover:text-terracotta" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate flex items-center gap-1">
                    {n.title}
                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-zinc-400"><Link2 className="w-3 h-3" /> {n.links}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate">{n.path}</div>
                </div>
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-line group-hover:bg-white shrink-0">{n.tags}</span>
              </button>
            ))}
            <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
              <span className="font-medium">VaultPort:</span> lokma-vault / memory.fermag.com.tr/lokma · <code className="px-1 py-0 rounded bg-white border border-line">GET /api/vault/graph?folder=lokma&depth={depth}</code> · <code className="px-1 py-0 rounded bg-white border border-line">lokma mcp serve --vault</code>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5] dark:bg-[#0F0F11] relative overflow-hidden">
          <div className="h-7 flex items-center gap-1 px-2 border-b border-line/50 bg-white/60 dark:bg-[#1E1E21]/60 backdrop-blur text-[11px]">
            <Layers className="w-3 h-3" /> Graph — {mode === "2d" ? "react-force-graph-2d" : "react-force-graph-3d star-map"} · {filtered.length} nodes · folder=lokma
            <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Graph ${mode} — depth ${depth} — Hermes /journey gibi` }))}>
              <Maximize2 className="w-3 h-3" /> Full
            </Button>
          </div>
          <div className="flex-1 relative p-2 overflow-hidden">
            <svg viewBox="0 0 300 200" className="w-full h-full rounded-lg bg-white dark:bg-[#1E1E21] border border-line">
              {/* mock barnesHut graph */}
              <defs>
                <radialGradient id="g1" cx="50%" cy="50%"><stop offset="0%" stopColor="#C96442" stopOpacity="0.9" /><stop offset="100%" stopColor="#C96442" stopOpacity="0.2" /></radialGradient>
              </defs>
              <line x1="80" y1="60" x2="150" y2="90" stroke="#E8E4DE" strokeWidth="1.2" />
              <line x1="150" y1="90" x2="220" y2="60" stroke="#E8E4DE" strokeWidth="1.2" />
              <line x1="150" y1="90" x2="150" y2="150" stroke="#E8E4DE" strokeWidth="1.2" />
              <line x1="80" y1="60" x2="60" y2="140" stroke="#E8E4DE" strokeWidth="0.8" strokeDasharray="3 3" />
              <line x1="220" y1="60" x2="240" y2="130" stroke="#E8E4DE" strokeWidth="0.8" strokeDasharray="3 3" />
              {[
                { x: 80, y: 60, r: 10, label: "00-KONTEKST", c: "#C96442" },
                { x: 150, y: 90, r: 14, label: "Pane", c: "#262624" },
                { x: 220, y: 60, r: 9, label: "Design", c: "#6C5CE7" },
                { x: 150, y: 150, r: 11, label: "Agent", c: "#0EA5E9" },
                { x: 60, y: 140, r: 7, label: "Auth", c: "#10B981" },
                { x: 240, y: 130, r: 7, label: "Vault", c: "#F59E0B" },
              ].map(n => (
                <g key={n.label}>
                  <circle cx={n.x} cy={n.y} r={n.r + 6} fill={n.c} opacity="0.08" />
                  <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} stroke="white" strokeWidth="1.5" className="hover:opacity-80 cursor-pointer" />
                  <text x={n.x} y={n.y + n.r + 12} textAnchor="middle" fontSize="7" fill="#6B7280" fontFamily="Inter, sans-serif">{n.label}</text>
                </g>
              ))}
            </svg>
            <div className="absolute bottom-2 left-2 right-2 flex gap-1 text-[10px]">
              <span className="px-1.5 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line">gravitationalConstant -26000 · springLength 285</span>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded-full bg-[#262624] text-white">[{mode}] {EDGES.length} edges</span>
            </div>
            {mode === "3d" && <div className="absolute inset-2 rounded-lg bg-[#0F0F11]/80 grid place-items-center text-xs text-white/80 border border-white/10">★ 3D star-map — react-force-graph-3d · Hermes /journey gibi</div>}
          </div>
          <div className="p-1.5 border-t border-line/50 bg-white/60 dark:bg-[#1E1E21]/60 text-[11px] text-zinc-500 flex gap-1 flex-wrap">
            <span className="px-1.5 py-0.5 rounded bg-white border border-line">[[wikilink]] click → pane</span>
            <span className="px-1.5 py-0.5 rounded bg-white border border-line">provenance: agentId</span>
            <span className="ml-auto hidden sm:inline">depth {depth} · wikilink → open in pane</span>
          </div>
        </div>
      </div>
    </div>
  )
}
