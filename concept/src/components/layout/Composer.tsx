import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Paperclip, Mic, Search, Sparkles } from "lucide-react"

type Model = { id: string; label: string; tag?: string }

const MODELS: { group: string; items: Model[] }[] = [
  { group: "Anthropic", items: [{ id: "claude-4-sonnet", label: "Claude 4 Sonnet", tag: "High" }, { id: "claude-4-opus", label: "Claude 4 Opus", tag: "High" }] },
  { group: "AIHUBMIX", items: [{ id: "deepseek-v4-flash", label: "Deepseek V4 Flash", tag: "Free" }, { id: "mimo-v2.5", label: "Mimo V2.5", tag: "Free" }] },
  { group: "CMD-ROUTER-SE", items: [{ id: "muse-spark-1.2-contributor", label: "Muse Spark 1.2 Contributor", tag: "High" }, { id: "big-pickle", label: "Big Pickle Ultra", tag: "Ultra" }] },
]

export function Composer({ placeholder = "Ask Lokma to plan, code, or explain — try “add 60/min rate limit per user”", onSend }: { placeholder?: string; onSend?: (text: string, files: File[], mode: string, model: string) => void }) {
  const [text, setText] = React.useState("")
  const [files, setFiles] = React.useState<File[]>([])
  const [mode, setMode] = React.useState<"steer" | "queue">("steer")
  const [model, setModel] = React.useState("muse-spark-1.2-contributor")
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const fileRef = React.useRef<HTMLInputElement>(null)
  const taRef = React.useRef<HTMLTextAreaElement>(null)

  const filtered = MODELS.map(g => ({ ...g, items: g.items.filter(m => m.label.toLowerCase().includes(query.toLowerCase())) })).filter(g => g.items.length)

  const handleSend = () => {
    if (!text.trim() && files.length === 0) return
    onSend?.(text, files, mode, model)
    setText("")
    setFiles([])
    if (taRef.current) taRef.current.style.height = "auto"
  }

  return (
    <div className="rounded-lg bg-white border border-line shadow-sm overflow-hidden">
      <div className="p-2">
        <Textarea
          ref={taRef}
          rows={1}
          placeholder={placeholder}
          value={text}
          onChange={e => {
            setText(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          className="min-h-[28px] py-1 border-0 focus-visible:ring-0 shadow-none"
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {files.map((f, i) => (
              <Badge key={i} variant="outline" className="bg-[#FDF0E6] border-[#F2D5C2] text-terracotta gap-1 pr-1">
                <Paperclip className="w-3 h-3" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="w-4 h-4 grid place-items-center rounded hover:bg-black/5 ml-1">
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap relative">
          <Button variant="outline" size="iconSm" onClick={() => fileRef.current?.click()} title="Dosya / belge yükle">
            <Paperclip className="w-3.5 h-3.5" />
          </Button>
          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
          <Button variant="outline" size="iconSm" title="Mikrofon">
            <Mic className="w-3.5 h-3.5" />
          </Button>
          <div className="w-px h-4 bg-line mx-0.5 hidden sm:block" />
          <div className="inline-flex p-0.5 rounded-full bg-muted border border-line">
            <Button variant={mode === "steer" ? "ink" : "ghost"} size="sm" className={cn("h-6 px-2.5 rounded-full text-[11px]", mode === "steer" ? "" : "hover:bg-white")} onClick={() => setMode("steer")}>
              Steer
            </Button>
            <Button variant={mode === "queue" ? "ink" : "ghost"} size="sm" className={cn("h-6 px-2.5 rounded-full text-[11px]", mode === "queue" ? "" : "hover:bg-white")} onClick={() => setMode("queue")}>
              Queue
            </Button>
          </div>
          <div className="relative">
            <Button variant="outline" size="sm" className="h-6 pl-1.5 pr-2 rounded-full bg-[#1E1E20] border-[#2A2A2E] text-white hover:bg-[#252529] hover:text-white text-[11px] gap-1.5" onClick={() => setOpen(!open)}>
              <span className="w-4 h-4 rounded-full bg-white/10 grid place-items-center text-[9px]">◐</span>
              <span className="max-w-[120px] truncate">{MODELS.flatMap(g => g.items).find(m => m.id === model)?.label || "Muse Spark"}</span>
            </Button>
            {open && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 w-[340px] max-w-[92vw] z-50 rounded-xl bg-[#111113] border border-[#2A2A2E] shadow-2xl overflow-hidden flex flex-col max-h-[420px]">
                <div className="p-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input placeholder="Search models" value={query} onChange={e => setQuery(e.target.value)} className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#1E1E20] border border-white/10 text-[13px] text-white placeholder:text-zinc-500 focus:outline-none" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {filtered.map(g => (
                    <div key={g.group}>
                      <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-widest uppercase text-zinc-500">{g.group}</div>
                      {g.items.map(m => (
                        <button key={m.id} onClick={() => { setModel(m.id); setOpen(false) }} className={cn("w-full text-left px-2.5 py-1.5 rounded-md mx-1 flex items-center justify-between hover:bg-white/10 text-[13px] text-white", model === m.id && "bg-white/10 border border-white/5")}>
                          <span className="flex items-center gap-1.5">
                            {model === m.id && <span className="w-1.5 h-1.5 rounded-full bg-terracotta" />}
                            {m.label}
                          </span>
                          {m.tag && <span className="text-[11px] text-zinc-400">{m.tag}</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden lg:inline text-[10px] text-zinc-400">↵ send</span>
            <Button onClick={handleSend} className="h-7 pl-3 pr-1.5 rounded-full gap-1">
              Send
              <span className="w-5 h-5 rounded-full bg-white/15 grid place-items-center">
                <Sparkles className="w-3 h-3" />
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
