import { Button } from "@/components/ui/button"
import { Composer } from "./Composer"

export function MobilePane({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-w-[360px] max-w-[480px] bg-[#FAF9F5] dark:bg-[#0F0F11] border border-line overflow-hidden">
      <div className="h-7 flex items-center gap-1.5 px-2.5 border-b border-line/60 bg-[#FDFCFB] dark:bg-[#161618] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span className="text-xs font-medium">Mobile — iPhone 17 Pro · RN preview</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-zinc-900 text-white text-[9px]">17 Pro</span>
        <span className="ml-auto flex items-center gap-1">
          {onClose && (
            <Button variant="ghost" size="iconSm" onClick={onClose}>
              ×
            </Button>
          )}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3 bg-zinc-100 dark:bg-[#0F0F11] flex justify-center items-start">
        <div className="relative w-[92%] max-w-[340px] aspect-[430/932] bg-black rounded-[52px] p-[10px] shadow-[0_12px_40px_rgba(0,0,0,0.25)] border border-zinc-800 shrink-0" style={{ background: "linear-gradient(180deg,#2A2A2E 0%,#0F0F11 100%)" }}>
          <div className="absolute inset-0 rounded-[52px] border border-white/10 pointer-events-none" />
          <div className="relative w-full h-full bg-white rounded-[40px] overflow-hidden flex flex-col shadow-inner">
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[92px] h-[26px] bg-black rounded-full z-20 flex items-center justify-end pr-2">
              <span className="w-2 h-2 rounded-full bg-[#0A84FF] opacity-80" />
            </div>
            <div className="h-6 bg-white flex items-center justify-between px-6 pt-1 text-[10px] font-medium text-zinc-900 shrink-0">
              <span>09:41</span>
              <span>87%</span>
            </div>
            <div className="flex-1 bg-white p-3 overflow-y-auto">
              <div className="w-full h-8 rounded-full bg-muted border border-line flex items-center px-3 text-xs text-zinc-500">Lokma mobil — web üzerinden RN</div>
              <div className="mt-3 space-y-2">
                <div className="h-[76px] rounded-xl bg-terracotta text-white p-3 flex flex-col justify-center">
                  <div className="text-xs font-semibold">Hoş geldin, Aylin</div>
                  <div className="text-[11px] opacity-90">Mobil harness aynı session ile senkron</div>
                  <div className="mt-1 inline-flex text-[10px] px-1.5 py-0.5 rounded-full bg-white/15">iPhone 17 Pro · 6.3"</div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-line shadow-sm">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Chat #482
                  </div>
                  <div className="text-[11px] text-zinc-500">Pane olarak sürükle · browser ile senkron</div>
                </div>
              </div>
            </div>
            <div className="h-7 bg-white border-t border-line flex items-center justify-around text-[10px] text-zinc-500 shrink-0">
              <span className="text-terracotta font-medium">● Chat</span>
              <span>Sessions</span>
              <span>Profile</span>
            </div>
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-black/80" />
          </div>
          <div className="absolute -left-1 top-20 w-1 h-6 bg-zinc-700 rounded-full" />
          <div className="absolute -left-1 top-28 w-1 h-12 bg-zinc-700 rounded-full" />
          <div className="absolute -right-1 top-32 w-1 h-16 bg-zinc-700 rounded-full" />
          <img
            src="https://shotframe.app/_next/image?url=%2Fframes%2Fiphone-17-pro%2Fsilver.png&w=3840&q=75"
            alt="iPhone 17 Pro frame"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-0"
            onLoad={e => ((e.target as HTMLImageElement).style.opacity = "0.08")}
            onError={e => ((e.target as HTMLImageElement).style.display = "none")}
          />
        </div>
      </div>
      <div className="shrink-0 p-2 border-t border-line bg-white/90 dark:bg-[#161618]/90">
        <Composer placeholder="Mobil pane'e yaz... (resize edilebilir)" />
        <div className="mt-1 text-[10px] text-zinc-400 text-center">Pane’i sürükle taşı · köşeden çek büyüt/küçült</div>
      </div>
    </div>
  )
}
