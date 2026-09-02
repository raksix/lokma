import { Button } from "@/components/ui/button"
import { Paintbrush, Smartphone, Image as ImageIcon, FileText, Film, LayoutTemplate, Palette, Sparkles, Download, Eye, Code2 } from "lucide-react"
import { useState } from "react"

const TYPES = [
  { id: "prototype", label: "Prototype", icon: LayoutTemplate, desc: "Single HTML · sandbox iframe · mobile/desktop", cat: "build" },
  { id: "deck", label: "Deck", icon: FileText, desc: "15×36 themes · PptxGenJS · html-ppt", cat: "present" },
  { id: "mobile", label: "Mobile", icon: Smartphone, desc: "Device preview · RN · responsive", cat: "build" },
  { id: "image", label: "Image", icon: ImageIcon, desc: "GPT Image 2.0 · Seedream · FAL", cat: "media" },
  { id: "document", label: "Document", icon: FileText, desc: "Markdown → PDF · Typography", cat: "present" },
  { id: "hyperframe", label: "HyperFrame", icon: Film, desc: "HTML → MP4 · GSAP · HyperFrames", cat: "media" },
] as const

const DESIGN_SYSTEMS = [
  { id: "stripe-linear", name: "Stripe/Linear", tokens: "cream #FAF9F5 + terracotta #C96442 · tight", preset: "A1" },
  { id: "omp-dark", name: "OMP Midnight", tokens: "near-black · indigo #6366F1 · zinc", preset: "A2" },
  { id: "paper-ink", name: "Paper Ink", tokens: "warm paper #FFFBF5 · ink #1A1A1A", preset: "B" },
  { id: "minimal-geo", name: "Minimal Geo", tokens: "geometric · spacious", preset: "C" },
]

export function DesignStudioPane() {
  const [type, setType] = useState<typeof TYPES[number]["id"]>("prototype")
  const [brief, setBrief] = useState("Build a pricing page for Lokma — dark, 3 tiers, terracotta accent, Stripe polish")
  const [system, setSystem] = useState("stripe-linear")
  const t = TYPES.find(x => x.id === type) || TYPES[0]
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Paintbrush className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Design Studio</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">.lokma/DESIGN.md · 6 types · design-systems/ · 26 runtimes</span>
        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">BYOK</span>
      </div>

      <div className="p-2 space-y-2 border-b border-line/50">
        <div className="flex gap-1 flex-wrap">
          {TYPES.map(x => (
            <Button key={x.id} variant={type === x.id ? "ink" : "outline"} size="sm" className="h-6 text-[11px] gap-1" onClick={() => setType(x.id)}>
              <x.icon className="w-3 h-3" /> {x.label}
            </Button>
          ))}
          <Button size="sm" className="ml-auto h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Generate ${type}: ${brief.slice(0, 24)}... · ${system}` }))}>
            <Sparkles className="w-3 h-3" /> Generate
          </Button>
        </div>
        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={2} placeholder="Brief yaz — e.g. pricing page, 3 tiers, terracotta, Stripe/linear polish..." className="w-full rounded-md border border-line bg-white dark:bg-[#1E1E21] p-2.5 text-xs leading-5 focus:outline-none focus:border-terracotta/30" />
        <div className="flex gap-1 flex-wrap items-center">
          <span className="text-[11px] text-zinc-500 hidden sm:inline-flex items-center gap-1"><Palette className="w-3 h-3" /> DESIGN.md →</span>
          <select value={system} onChange={e => setSystem(e.target.value)} className="h-6 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-2">
            {DESIGN_SYSTEMS.map(ds => (
              <option key={ds.id} value={ds.id}>{ds.name} · {ds.preset}</option>
            ))}
          </select>
          <span className="text-[11px] text-zinc-400 hidden md:inline">· {DESIGN_SYSTEMS.find(d=>d.id===system)?.tokens}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `DESIGN.md — ${system} tokens → Open Design artifact` }))}><Eye className="w-3 h-3" /> Preview</Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 m-2 rounded-lg border border-line bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden relative flex flex-col">
          <div className="h-6 flex items-center gap-1 px-2 border-b border-line/50 bg-white/80 dark:bg-[#1E1E21]/80 text-[11px] shrink-0">
            <Code2 className="w-3 h-3" /> {t.label} · {system} · {t.desc}
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-zinc-400">sandbox iframe — agent writes HTML → live preview · 5D critique</span>
          </div>
          <div className="flex-1 relative overflow-hidden bg-white">
            <iframe
              srcDoc={`<html><head><style>body{font-family:Inter,system-ui;padding:24px;background:#FAF9F5;color:#262624}h2{color:#C96442;font-size:16px;margin:0 0 8px}p{color:#6B7280;font-size:12px;line-height:1.6}.card{margin-top:16px;padding:16px;border:1px solid #E8E4DE;border-radius:10px;background:white}.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#FDF0E6;border:1px solid #F2D5C2;color:#C96442;font-size:11px}</style></head><body><span class="pill">${type} · ${system}</span><h2>${t.label} · Lokma</h2><p>${brief}</p><div class="card"><strong style="font-size:13px">Sandbox iframe — agent writes HTML → live preview</strong><br/><span style="font-size:11px;color:#999">DESIGN.md brand contract + ${system} tokens · export HTML/PDF/PPTX/MP4 · HyperFrame timeline</span></div></body></html>`}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full border-0 bg-white"
              title="Design preview"
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <span className="px-2 py-1 rounded-full bg-[#262624] text-white text-[10px] font-mono">sandbox · streaming</span>
              <span className="hidden sm:inline px-2 py-1 rounded-full bg-white border border-line text-[10px]">{t.cat}</span>
            </div>
          </div>
          <div className="h-7 flex items-center gap-1 px-2 border-t border-line bg-muted/20 shrink-0 overflow-x-auto">
            <span className="text-[11px] text-zinc-500 whitespace-nowrap">Export:</span>
            {[
              { f: "HTML", hint: "single file" },
              { f: "PDF", hint: "print" },
              { f: "PPTX", hint: "15×36" },
              { f: "ZIP", hint: "bundle" },
              { f: "MP4", hint: "HyperFrame" },
            ].map(x => (
              <Button key={x.f} variant="ghost" size="sm" className="h-6 text-[11px] px-2 gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Export ${x.f} — ${type} → ${x.hint}` }))}>
                <Download className="w-3 h-3" /> {x.f}
              </Button>
            ))}
            <span className="ml-auto hidden lg:inline text-[11px] text-zinc-400">design-systems/{system} · html-ppt · 5D critique → back to Composer</span>
          </div>
        </div>

        <div className="px-2 pb-2 flex gap-1.5 flex-wrap">
          <div className="flex-1 min-w-[160px] rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2">
            <div className="text-xs font-medium flex items-center gap-1"><Palette className="w-3 h-3 text-terracotta" /> DESIGN.md — 9 sections</div>
            <div className="text-[11px] text-zinc-500 mt-1">tokens → brand marks · typography · spacing · motion (finite trace) — Archify + Design share it</div>
          </div>
          <div className="flex-1 min-w-[160px] rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2">
            <div className="text-xs font-medium flex items-center gap-1"><Sparkles className="w-3 h-3" /> 6 artifacts · 26 runtimes</div>
            <div className="text-[11px] text-zinc-500 mt-1">Prototype/Deck/Mobile/Image/Document/HyperFrame — hermes + opencode + cursor</div>
          </div>
        </div>
      </div>
    </div>
  )
}
