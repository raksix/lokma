import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Paperclip, Mic, Search, Sparkles, X, LifeBuoy, ListTree } from "lucide-react"

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
  const [recording, setRecording] = React.useState(false)
  const [contexts, setContexts] = React.useState<string[]>(["Onboarding flow..."])
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

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files
      if (items && items.length) {
        const arr = Array.from(items)
        if (arr.some(f => f.size > 0)) {
          setFiles(prev => [...prev, ...arr])
          window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${arr.length} dosya yapıştırıldı` }))
        }
      }
    }
    const el = taRef.current
    el?.addEventListener("paste", onPaste as unknown as EventListener)
    return () => el?.removeEventListener("paste", onPaste as unknown as EventListener)
  }, [])

  const toggleMic = () => {
    if (recording) {
      setRecording(false)
      return
    }
    const SR = (window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown }).webkitSpeechRecognition || (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition
    if (SR) {
      try {
        const rec = new (SR as unknown as new () => { lang: string; interimResults: boolean; continuous: boolean; onresult: (e: { results: Array<Array<{ transcript: string }>> }) => void; onend: () => void; start: () => void; stop: () => void })()
        rec.lang = "tr-TR"
        rec.interimResults = true
        rec.continuous = false
        rec.onresult = (e) => {
          const txt = Array.from(e.results).map(r => r[0].transcript).join("")
          setText(txt)
        }
        rec.onend = () => setRecording(false)
        rec.start()
        setRecording(true)
      } catch {
        setRecording(true)
        setTimeout(() => setRecording(false), 1200)
      }
    } else {
      setRecording(true)
      setTimeout(() => setRecording(false), 1200)
      window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Mikrofon tarayıcıda desteklenmiyor" }))
    }
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).dataset.drag = "1" }}
      onDragLeave={e => { delete (e.currentTarget as HTMLDivElement).dataset.drag }}
      onDrop={e => {
        e.preventDefault()
        delete (e.currentTarget as HTMLDivElement).dataset.drag
        const dt = e.dataTransfer.files
        if (dt && dt.length) setFiles(prev => [...prev, ...Array.from(dt)])
      }}
      className="rounded-xl bg-white border border-line shadow-[0_1px_2px_rgba(38,38,36,0.06),0_4px_12px_rgba(38,38,36,0.04)] overflow-hidden data-[drag=1]:ring-2 data-[drag=1]:ring-terracotta/30 data-[drag=1]:border-terracotta/30 transition">
      {/* Top chip row — image gibi Onboarding + Steer/Queue + Muse Spark */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-line/50 bg-[#FDFCFB] dark:bg-[#161618] flex-wrap">
        <div className="flex items-center gap-1 flex-wrap flex-1">
          {contexts.map(c => (
            <span key={c} className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-full bg-[#262624] text-white text-[11px]">
              <span className="w-1 h-1 rounded-full bg-emerald-500" /> {c}
              <button onClick={() => setContexts(prev => prev.filter(x => x !== c))} className="w-3.5 h-3.5 grid place-items-center rounded-full hover:bg-white/10">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="inline-flex p-0.5 rounded-full bg-[#262624] border border-[#262624]">
            <Button variant={mode === "steer" ? "default" : "ghost"} size="iconSm" className={cn("h-6 w-6 rounded-full p-0", mode === "steer" ? "bg-white text-ink hover:bg-white" : "text-white/70 hover:text-white hover:bg-white/10")} onClick={() => setMode("steer")} title="Steer — direksiyon">
              <LifeBuoy className="w-3.5 h-3.5" />
            </Button>
            <Button variant={mode === "queue" ? "default" : "ghost"} size="iconSm" className={cn("h-6 w-6 rounded-full p-0", mode === "queue" ? "bg-white text-ink hover:bg-white" : "text-white/70 hover:text-white hover:bg-white/10")} onClick={() => setMode("queue")} title="Queue">
              <ListTree className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Button variant="outline" size="sm" className="h-6 pl-1.5 pr-2 rounded-full bg-white border-line text-xs gap-1.5 max-w-[140px]" onClick={() => setOpen(!open)}>
              <span className="w-4 h-4 rounded-full bg-[#262624] text-white grid place-items-center text-[9px]">◐</span>
              <span className="truncate">{MODELS.flatMap(g => g.items).find(m => m.id === model)?.label || "Muse Spark"}</span>
            </Button>
            {open && (
              <div className="absolute bottom-[calc(100%+8px)] right-0 w-[340px] max-w-[92vw] z-50 rounded-xl bg-[#111113] border border-[#2A2A2E] shadow-2xl overflow-hidden flex flex-col max-h-[420px]">
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
                        <Button key={m.id} variant="ghost" size="sm" onClick={() => { setModel(m.id); setOpen(false) }} className={cn("w-[calc(100%-8px)] mx-1 justify-between text-[13px] text-white hover:bg-white/10 hover:text-white", model === m.id && "bg-white/10 border border-white/5")}>
                          <span className="flex items-center gap-1.5">
                            {model === m.id && <span className="w-1.5 h-1.5 rounded-full bg-terracotta" />}
                            {m.label}
                          </span>
                          {m.tag && <span className="text-[11px] text-zinc-400">{m.tag}</span>}
                        </Button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-1.5">
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
          className="min-h-[28px] py-1 border-0 focus-visible:ring-0 shadow-none text-[13px]"
        />
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {files.map((f, i) => (
              <Badge key={i} variant="outline" className="bg-[#FDF0E6] border-[#F2D5C2] text-terracotta gap-1 pr-1">
                <Paperclip className="w-3 h-3" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <Button variant="ghost" size="iconSm" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="w-4 h-4 ml-1 p-0 hover:bg-black/5">
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <Button variant="outline" size="iconSm" onClick={() => fileRef.current?.click()} title="Dosya / belge yükle">
            <Paperclip className="w-3.5 h-3.5" />
          </Button>
          <input ref={fileRef} type="file" multiple hidden accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={e => setFiles([...files, ...Array.from(e.target.files || [])])} />
          <Button variant={recording ? "ink" : "outline"} size="iconSm" onClick={toggleMic} title="Mikrofon" className={recording ? "animate-pulse" : ""}>
            <Mic className="w-3.5 h-3.5" />
          </Button>
          {recording && <span className="text-[11px] text-red-600 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Rec</span>}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden sm:inline text-[11px] text-zinc-400">↵ send · shift+↵ new line</span>
            <Button onClick={handleSend} className="h-7 pl-3 pr-1.5 rounded-full gap-1 bg-[#F45D5D] hover:bg-[#E04A4A] text-white">
              Send
              <span className="w-5 h-5 rounded-full bg-white/20 grid place-items-center">
                <Sparkles className="w-3 h-3" />
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom context row — image gibi repeated chips */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-line/50 bg-[#FDFCFB] dark:bg-[#161618] overflow-x-auto">
        {contexts.map(c => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white dark:bg-[#1E1E21] border border-line text-xs whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" /> {c}
          </span>
        ))}
        <button onClick={() => setContexts(prev => [...prev, `Onboarding flow ${prev.length + 1}`])} className="w-6 h-6 grid place-items-center rounded-full border border-dashed border-line text-zinc-400 hover:text-ink hover:border-terracotta/30">+</button>
      </div>
    </div>
  )
}
