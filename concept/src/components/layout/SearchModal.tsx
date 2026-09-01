import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, FileText, Sparkles } from "lucide-react"

const DOCS = [
  { id: "00", title: "00-LOKMA-KONTEKST.md", summary: "Proje hafızası, kurallar, Docs tek kaynak" },
  { id: "21", title: "21-WEB-HARNESS.md", summary: "Web harness mimari, stack, deployment" },
  { id: "24", title: "24-WEB-PANE-SYSTEM.md", summary: "Pane sistemi, tiling/windowed, drag-to-pane" },
  { id: "36", title: "36-AUTH.md", summary: "RBAC, project-scoped, can() helper" },
  { id: "30", title: "30-AGENT-SYSTEM.md", summary: "Agent kişilikleri, memory, orchestration" },
  { id: "34", title: "34-DESIGN.md", summary: "Stripe/Linear minimal, krem+terracotta" },
]

export function SearchModal({ open, onClose, onOpenDoc }: { open: boolean; onClose: () => void; onOpenDoc: (name: string) => void }) {
  const [q, setQ] = useState("")
  const [ask, setAsk] = useState("")

  useEffect(() => {
    if (open) setQ("")
  }, [open])

  if (!open) return null
  const filtered = DOCS.filter(d => !q || d.title.toLowerCase().includes(q.toLowerCase()) || d.summary.toLowerCase().includes(q.toLowerCase()))
  const rag = ask.trim() ? DOCS.filter(d => d.summary.toLowerCase().includes(ask.toLowerCase().slice(0, 8)) || d.title.toLowerCase().includes(ask.toLowerCase().slice(0, 8))).slice(0, 2) : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[640px] rounded-xl bg-white dark:bg-[#1E1E21] border border-line shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="p-3 border-b border-line space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <Input placeholder="Dokümanlarda ara — örn: pane system, auth, RBAC..." value={q} onChange={e => setQ(e.target.value)} className="pl-8 h-8 text-sm" autoFocus />
          </div>
          <div className="flex gap-1.5">
            <Input placeholder="Ask Docs — RAG sor (mock)..." value={ask} onChange={e => setAsk(e.target.value)} className="flex-1 h-7 text-xs" />
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setAsk(ask)}>
              <Sparkles className="w-3 h-3" /> Sor
            </Button>
          </div>
          {rag.length > 0 && (
            <div className="rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] dark:border-[#3A2A1A] p-2 text-xs">
              <div className="font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3 text-terracotta" /> En alakalı</div>
              <div className="mt-1 space-y-1">
                {rag.map(r => (
                  <button key={r.id} onClick={() => { onOpenDoc(r.title); onClose() }} className="text-left hover:underline text-terracotta">• {r.title} — {r.summary}</button>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">vault + FTS5 + embeddings (mock)</div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">Sonuç yok</div>
          ) : (
            filtered.map(d => (
              <button key={d.id} onClick={() => { onOpenDoc(d.title); onClose() }} className="w-full text-left flex gap-2 p-2 rounded-md hover:bg-muted dark:hover:bg-[#232326] border border-transparent hover:border-line">
                <FileText className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-medium">{d.title}</div>
                  <div className="text-xs text-zinc-500">{d.summary}</div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t border-line text-[11px] text-zinc-400 flex justify-between">
          <span>↵ aç · esc kapat</span>
          <span>{filtered.length} doküman</span>
        </div>
      </div>
    </div>
  )
}
