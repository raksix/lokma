import { Button } from "@/components/ui/button"
import { Paintbrush, Smartphone, Image as ImageIcon, FileText, Film, LayoutTemplate } from "lucide-react"
import { useState } from "react"

const TYPES = [
  { id: "prototype", label: "Prototype", icon: LayoutTemplate, desc: "Single HTML · sandbox iframe" },
  { id: "deck", label: "Deck", icon: FileText, desc: "15×36 themes · PptxGenJS" },
  { id: "mobile", label: "Mobile", icon: Smartphone, desc: "Device preview · RN" },
  { id: "image", label: "Image", icon: ImageIcon, desc: "GPT Image 2.0 · Seedream" },
  { id: "document", label: "Document", icon: FileText, desc: "Markdown → PDF" },
  { id: "hyperframe", label: "HyperFrame", icon: Film, desc: "HTML → MP4" },
] as const

export function DesignStudioPane() {
  const [type, setType] = useState<typeof TYPES[number]["id"]>("prototype")
  const [brief, setBrief] = useState("Build a pricing page for Lokma — dark, 3 tiers, terracotta accent")
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Paintbrush className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Design Studio</span>
        <span className="ml-1 text-[11px] text-zinc-400">.lokma/DESIGN.md · 6 types</span>
        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-terracotta text-white text-[10px]">BYOK</span>
      </div>
      <div className="p-2 space-y-2 border-b border-line/50">
        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={2} placeholder="Brief yaz..." className="w-full rounded-md border border-line bg-white dark:bg-[#1E1E21] p-2 text-xs focus:outline-none focus:border-terracotta/30" />
        <div className="flex gap-1 flex-wrap">
          {TYPES.map(t => (
            <Button key={t.id} variant={type === t.id ? "ink" : "outline"} size="sm" className="h-6 text-[11px] gap-1" onClick={() => setType(t.id)}>
              <t.icon className="w-3 h-3" /> {t.label}
            </Button>
          ))}
          <Button size="sm" className="ml-auto h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Generate ${type}: ${brief.slice(0, 24)}...` }))}>
            Generate
          </Button>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 m-2 rounded-md border border-line bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden relative">
          <iframe srcDoc={`<html><body style="font-family:Inter;padding:24px;background:#FAF9F5;color:#262624"><h2 style="color:#C96442">${type} · Lokma</h2><p>${brief}</p><div style="margin-top:16px;padding:16px;border:1px solid #E8E4DE;border-radius:8px;background:white">Sandbox iframe — agent writes HTML → live preview</div></body></html>`} sandbox="allow-scripts allow-same-origin" className="w-full h-full border-0 bg-white" />
          <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#262624] text-white text-[10px]">sandbox · streaming</div>
        </div>
        <div className="h-7 flex items-center gap-1 px-2 border-t border-line bg-muted/20">
          <span className="text-[11px] text-zinc-500">Export:</span>
          {["HTML", "PDF", "PPTX", "ZIP", "MP4"].map(f => (
            <Button key={f} variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Export ${f}` }))}>
              {f}
            </Button>
          ))}
          <span className="ml-auto text-[11px] text-zinc-400">DESIGN.md brand contract</span>
        </div>
      </div>
    </div>
  )
}
