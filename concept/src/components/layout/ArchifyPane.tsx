import { Button } from "@/components/ui/button"
import { Workflow, Layers, Palette, Monitor, Search, Code2, GitCompare, Share2, Download, Eye, Bug, Check } from "lucide-react"
import { useState } from "react"

const TYPES = [
  { id: "architecture", label: "Architecture", hint: "services · DBs · queues · gateways", icon: Layers },
  { id: "workflow", label: "Workflow", hint: "swimlanes · decisions · parallel", icon: Workflow },
  { id: "sequence", label: "Sequence", hint: "lifelines · alt/opt/loop", icon: Code2 },
  { id: "dataflow", label: "Data Flow", hint: "sources → transforms → sinks", icon: GitCompare },
  { id: "lifecycle", label: "Lifecycle", hint: "states · guards · terminals", icon: Monitor },
] as const
const PRESETS = ["signal-flow", "blueprint", "classic", "minimal"] as const
const ITEMS = [
  { id: "lokma-harness", type: "architecture", preset: "signal-flow", title: "Lokma web harness", theme: "dark", updated: "2h ago" },
  { id: "agent-spawn", type: "workflow", preset: "blueprint", title: "agent spawn lifecycle", theme: "dark", updated: "1d ago" },
  { id: "tool-loop", type: "sequence", preset: "signal-flow", title: "tool call loop", theme: "light", updated: "3d ago" },
  { id: "vault-sync", type: "dataflow", preset: "minimal", title: "vault FTS5 sync pipeline", theme: "light", updated: "5d ago" },
]

export function ArchifyPane() {
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string>("lokma-harness")
  const [preset, setPreset] = useState<string>("signal-flow")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [tab, setTab] = useState<"ir" | "receipt" | "export">("ir")
  const [showDelta, setShowDelta] = useState(false)
  const filtered = ITEMS.filter(i => (typeFilter === "all" || i.type === typeFilter) && (!q || i.title.toLowerCase().includes(q.toLowerCase())))
  const sel = ITEMS.find(i => i.id === selected) || ITEMS[0]
  const irPreview = `{\n  "type": "${sel.type}",\n  "preset": "${preset}",\n  "theme": "${theme}",\n  "nodes": [{ "id": "web", "label": "Vite 6 SPA", "kind": "service" }, { "id": "api", "label": "Fastify 5 :3456", "kind": "service" }, { "id": "db", "label": "SQLite WAL", "kind": "db" }],\n  "edges": [{ "from": "web", "to": "api", "label": "REST + WS" }, { "from": "api", "to": "db", "label": "Drizzle" }],\n  "trace": ["web", "api", "db"]\n}`
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Workflow className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Archify</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">typed JSON IR → HTML/SVG · 5 types · 4 presets · viewer</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "archify generate — prompt → IR → validate → build" }))}>+ New Diagram</Button>
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: list */}
        <div className="w-[38%] min-w-[200px] border-r border-line flex flex-col overflow-hidden">
          <div className="p-2 border-b border-line/50 space-y-1.5 shrink-0">
            <div className="flex gap-1 flex-wrap">
              <Button variant={typeFilter === "all" ? "ink" : "ghost"} size="sm" className="h-5 text-[11px]" onClick={() => setTypeFilter("all")}>All</Button>
              {TYPES.map(t => (
                <Button key={t.id} variant={typeFilter === t.id ? "ink" : "ghost"} size="sm" className="h-5 text-[11px] capitalize" onClick={() => setTypeFilter(t.id)}>{t.label.slice(0,4)}</Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <input placeholder="Search diagrams..." value={q} onChange={e => setQ(e.target.value)} className="w-full h-7 pl-7 pr-2 rounded-md bg-white dark:bg-[#1E1E21] border border-line text-xs focus:outline-none focus:border-terracotta/30" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setPreset(p)} className={`px-1.5 py-0.5 rounded-full border text-[10px] ${preset === p ? "bg-terracotta text-white border-terracotta" : "bg-white dark:bg-[#1E1E21] border-line text-zinc-500"}`}>{p}</button>
              ))}
              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} className="ml-auto px-1.5 py-0.5 rounded-full bg-[#262624] text-white text-[10px]">{theme}</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {filtered.map(i => (
              <button key={i.id} onClick={() => setSelected(i.id)} className={`w-full text-left p-2 rounded-lg border flex gap-2 transition ${selected === i.id ? "bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15]" : "bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20"}`}>
                <span className={`w-7 h-7 rounded-md grid place-items-center text-[10px] font-bold shrink-0 ${i.theme === "dark" ? "bg-[#0F0F11] text-white border border-white/10" : "bg-[#FAF9F5] text-[#262624] border border-line"}`}>{i.type.slice(0,2).toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{i.title}</div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1"><span className="px-1 py-0 rounded bg-muted border border-line text-[10px]">{i.type}</span> {i.preset} · {i.theme} · {i.updated}</div>
                </div>
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${selected === i.id ? "bg-terracotta" : "bg-zinc-300"}`} />
              </button>
            ))}
            {filtered.length === 0 && <div className="p-4 text-center text-xs text-zinc-400">No diagrams — generate one</div>}
          </div>
          <div className="p-1.5 border-t border-line/50 flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="flex-1 h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Guide: archify guide "Show API cache miss" → IR` }))}><Code2 className="w-3 h-3" /> Guide</Button>
            <Button variant="ghost" size="sm" className="flex-1 h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${sel.id}/delta.html — Before/Delta/After` }))}><GitCompare className="w-3 h-3" /> Delta</Button>
          </div>
        </div>

        {/* Center: viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5] dark:bg-[#0F0F11]">
          <div className="h-7 flex items-center gap-1 px-2 border-b border-line/50 bg-white/80 dark:bg-[#1E1E21]/80 backdrop-blur text-[11px] shrink-0">
            <Eye className="w-3 h-3" /> Viewer — self-contained HTML
            <span className="hidden sm:inline text-zinc-400">· {sel.id} · ? M F / R L + - 0</span>
            <span className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `#focus=api&reach=downstream — deep link` }))}>#focus</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `#route=web~api → 1200×630 card` }))}>#route</Button>
              <Button variant="ghost" size="sm" className="h-5 text-[10px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `#lens=service~db` }))}>#lens</Button>
            </span>
          </div>
          <div className="flex-1 relative p-2 overflow-hidden">
            {!showDelta ? (
              <div className="w-full h-full rounded-lg bg-white dark:bg-[#1E1E21] border border-line overflow-hidden relative">
                {/* deterministic signal-flow SVG mock */}
                <svg viewBox="0 0 360 200" className="w-full h-full">
                  <defs>
                    <linearGradient id="af1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C96442" stopOpacity="0.9"/><stop offset="100%" stopColor="#6C5CE7" stopOpacity="0.9"/></linearGradient>
                    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#C96442"/></marker>
                  </defs>
                  <rect x="20" y="36" width="88" height="52" rx="10" fill="white" stroke={theme==="dark"?"#2A2A2E":"#E8E4DE"} strokeWidth="1.2"/>
                  <text x="64" y="58" textAnchor="middle" fontSize="7" fontWeight="700" fill="#262624">Vite 6 SPA</text><text x="64" y="68" textAnchor="middle" fontSize="6" fill="#999">:3000 + WS</text>
                  <rect x="136" y="36" width="88" height="52" rx="10" fill="#262624" stroke="#262624"/>
                  <text x="180" y="58" textAnchor="middle" fontSize="7" fontWeight="700" fill="white">Fastify 5</text><text x="180" y="68" textAnchor="middle" fontSize="6" fill="white" opacity="0.6">:3456 · /api + /ws</text>
                  <rect x="252" y="36" width="88" height="52" rx="10" fill="white" stroke="#E8E4DE"/>
                  <text x="296" y="58" textAnchor="middle" fontSize="7" fontWeight="700" fill="#262624">SQLite WAL</text><text x="296" y="68" textAnchor="middle" fontSize="6" fill="#999">state.db + FTS5</text>
                  <rect x="80" y="120" width="88" height="40" rx="8" fill="#FDF0E6" stroke="#F2D5C2"/><text x="124" y="142" textAnchor="middle" fontSize="7" fontWeight="600" fill="#C96442">Agent Bus</text><text x="124" y="150" textAnchor="middle" fontSize="6" fill="#999">SQLite + WS</text>
                  <rect x="192" y="120" width="88" height="40" rx="8" fill="#EEF2FF" stroke="#C7D2FE"/><text x="236" y="142" textAnchor="middle" fontSize="7" fontWeight="600" fill="#6C5CE7">Vault FTS5</text><text x="236" y="150" textAnchor="middle" fontSize="6" fill="#999">memory.fermag</text>
                  <line x1="108" y1="88" x2="136" y2="88" stroke="url(#af1)" strokeWidth="1.4" markerEnd="url(#arr)"/><text x="122" y="84" fontSize="6" fill="#C96442" fontWeight="600">WS</text>
                  <line x1="224" y1="88" x2="252" y2="88" stroke="#262624" strokeWidth="1.2" markerEnd="url(#arr)"/>
                  <line x1="180" y1="88" x2="124" y2="120" stroke="#E8E4DE" strokeWidth="0.9" strokeDasharray="4 3"/>
                  <line x1="220" y1="88" x2="236" y2="120" stroke="#C7D2FE" strokeWidth="0.9" strokeDasharray="4 3"/>
                  {/* trace dots */}
                  <circle cx="122" cy="88" r="2.5" fill="#C96442" opacity="0.9"><animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite"/></circle>
                </svg>
                <div className="absolute bottom-2 left-2 flex gap-1 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded-full bg-[#262624] text-white">{preset}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-white border border-line hidden sm:inline">{sel.type} · {theme}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-white border border-line">trace ▶</span>
                </div>
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#0F0F11] text-white text-[10px] font-mono">? help · R trace · L lens · M minimap</div>
              </div>
            ) : (
              <div className="w-full h-full grid grid-cols-3 gap-1">
                {["Before", "Delta", "After"].map((label, i) => (
                  <div key={label} className={`rounded-lg border p-2 flex flex-col ${i === 1 ? "bg-amber-50 dark:bg-[#241E0F] border-amber-200" : "bg-white dark:bg-[#1E1E21] border-line"}`}>
                    <div className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border w-fit ${i === 1 ? "bg-amber-500 text-white border-amber-500" : "bg-muted border-line"}`}>{label}</div>
                    <div className="flex-1 mt-2 rounded bg-[#FAF9F5] dark:bg-[#0F0F11] border border-dashed border-line grid place-items-center text-[11px] text-zinc-400">
                      {i === 1 ? "added · removed · changed · moved · rerouted" : `${label.toLowerCase()} snapshot`}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 text-center">{i === 1 ? "archify compare head.json" : `ir:${sel.id}`}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-1.5 border-t border-line/50 bg-white/60 dark:bg-[#1E1E21]/60 flex gap-1 flex-wrap text-[11px] shrink-0">
            <Button variant={showDelta ? "ink" : "outline"} size="sm" className="h-6 text-[11px] gap-1" onClick={() => setShowDelta(v => !v)}><GitCompare className="w-3 h-3" /> {showDelta ? "Hide delta" : "Compare"}</Button>
            <span className="hidden sm:inline-flex items-center gap-1 text-zinc-500"><Share2 className="w-3 h-3" /> 1200×630 share card — #route / #reach</span>
            <span className="ml-auto hidden lg:inline text-zinc-400">~/.lokma/archify/{sel.id}/ir.json → index.html</span>
          </div>
        </div>

        {/* Right: IR / receipt / export */}
        <div className="w-[36%] min-w-[200px] border-l border-line flex flex-col overflow-hidden hidden lg:flex">
          <div className="flex gap-1 p-1.5 border-b border-line/50 bg-muted/20 shrink-0">
            {(["ir", "receipt", "export"] as const).map(t => (
              <Button key={t} variant={tab === t ? "ink" : "ghost"} size="sm" className="h-6 text-[11px] capitalize flex-1" onClick={() => setTab(t)}>{t}</Button>
            ))}
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-2">
            {tab === "ir" && (
              <>
                <div className="rounded-lg border border-line bg-[#0F0F11] p-2">
                  <div className="flex items-center gap-1.5 text-xs text-white font-medium"><Code2 className="w-3 h-3 text-emerald-400" /> JSON IR · validate before deliver</div>
                  <pre className="mt-2 p-2 rounded bg-white/5 border border-white/10 text-[11px] leading-5 font-mono text-white/90 overflow-auto max-h-[220px]">{irPreview}</pre>
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" className="flex-1 h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "validate --json → 5 gates (schema/layout/route/label/share)" }))}><Check className="w-3 h-3" /> Validate</Button>
                    <Button variant="outline" size="sm" className="flex-1 h-6 text-[11px] bg-white/5 border-white/10 text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `build ${sel.id} → index.html + share.png` }))}>Build</Button>
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 border border-dashed border-line p-2 text-[11px] text-zinc-500">
                  CLI: <code className="px-1 py-0 rounded bg-white border border-line">archify validate --json</code> · <code className="px-1 py-0 rounded bg-white border border-line">archify build</code> — last-good preview while iterating
                </div>
              </>
            )}
            {tab === "receipt" && (
              <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                <div className="text-xs font-medium flex items-center gap-1"><Bug className="w-3 h-3 text-terracotta" /> Validation receipt</div>
                <table className="mt-2 w-full text-[11px]">
                  <tbody className="divide-y divide-line/50">
                    {[
                      { gate: "schema", status: "pass", msg: "type/preset/nodes valid" },
                      { gate: "layout", status: "pass", msg: "1200×630 fit, no overlap" },
                      { gate: "route", status: "pass", msg: "edges routable" },
                      { gate: "label", status: "pass", msg: "label↔route clearance" },
                      { gate: "share", status: "pass", msg: "1200×630 card OK" },
                    ].map(r => (
                      <tr key={r.gate}>
                        <td className="py-1 font-mono">{r.gate}</td>
                        <td className={`py-1 ${r.status === "pass" ? "text-emerald-600" : "text-red-600"}`}>{r.status}</td>
                        <td className="py-1 text-zinc-500">{r.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 text-[11px] text-zinc-500">repair receipt → <code className="px-1 py-0 rounded bg-muted border border-line">receipt.json</code> · fails closed (no deliver if invalid)</div>
              </div>
            )}
            {tab === "export" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { fmt: "PNG", desc: "headless Chromium" },
                    { fmt: "SVG", desc: "deterministic" },
                    { fmt: "WebM", desc: "trace record" },
                    { fmt: "Card", desc: "1200×630 OG" },
                  ].map(x => (
                    <Button key={x.fmt} variant="outline" size="sm" className="h-auto py-2 flex flex-col gap-0.5" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `export ${x.fmt} — ${sel.id}` }))}>
                      <span className="text-xs font-semibold flex items-center gap-1"><Download className="w-3 h-3" /> {x.fmt}</span><span className="text-[11px] text-zinc-400">{x.desc}</span>
                    </Button>
                  ))}
                </div>
                <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] p-2 text-[11px]">Share card: <code className="px-1 py-0 rounded bg-white border border-line">GET /api/archify/{sel.id}/card?route=web~api</code> · reach & route deep links</div>
                <div className="text-[11px] text-zinc-500">API: <code className="px-1 py-0 rounded bg-muted border border-line">POST /api/archify/generate</code> · validate · list · :id/delta · :id/export</div>
              </div>
            )}
            <div className="rounded-md bg-muted/30 border border-dashed border-line p-2 text-[11px] text-zinc-500">
              <span className="font-medium">Storage:</span> <code className="px-1 py-0 rounded bg-white border border-line">~/.lokma/archify/{sel.id}/ir.json</code> → <code className="px-1 py-0 rounded bg-white border border-line">index.html</code> · share.png · receipt.json · delta.html
            </div>
          </div>
          <div className="p-1.5 border-t border-line flex gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="flex-1 h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Open share card 1200×630" }))}><Share2 className="w-3 h-3" /> Card</Button>
            <Button variant="ghost" size="sm" className="flex-1 h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Docs/diagrams/${sel.id}.html` }))}><Palette className="w-3 h-3" /> Export</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
