import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Globe, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

export function BrowserPane({ initialUrl = "https://lokma-concept.fermag.com.tr/docs.html", onClose }: { initialUrl?: string; onClose?: () => void }) {
  const [url, setUrl] = useState(initialUrl)
  const [src, setSrc] = useState(initialUrl)
  return (
    <div className="flex-1 flex flex-col min-w-[420px] bg-white dark:bg-[#0F0F11] overflow-hidden border-l border-line">
      <div className="h-7 flex items-center gap-1.5 px-2.5 border-b border-line/60 bg-[#FDFCFB] dark:bg-[#161618] shrink-0">
        <span className="w-5 h-5 rounded-md bg-white dark:bg-[#1E1E21] border border-line grid place-items-center">
          <Globe className="w-3 h-3" />
        </span>
        <span className="text-xs font-medium">Browser — harness page</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">AI visible</span>
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="iconSm" onClick={() => setSrc(url)}>
            <RefreshCw className="w-3 h-3" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="iconSm" onClick={onClose}>
              ×
            </Button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-[#FDFCFB] dark:bg-[#161618] border-b border-line shrink-0">
        <Button variant="ghost" size="iconSm">
          <ChevronLeft className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="iconSm">
          <ChevronRight className="w-3 h-3" />
        </Button>
        <div className="flex-1 flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <Input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && setSrc(url)} className="flex-1 h-6 border-0 shadow-none focus-visible:ring-0 text-xs px-0" />
        </div>
      </div>
      <div className="flex-1 bg-zinc-100 dark:bg-[#0F0F11] relative overflow-hidden">
        <iframe src={src} className="w-full h-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms" />
        <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#262624] text-white text-[10px] font-medium shadow">AI görüyor & kontrol ediyor</div>
      </div>
    </div>
  )
}
