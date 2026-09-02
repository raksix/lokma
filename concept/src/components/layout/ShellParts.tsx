export function FooterBar() {
  return (
    <div className="h-6 border-t border-line bg-[#FDFCFB] dark:bg-[#161618] flex items-center px-3 text-[11px] text-zinc-500">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> All systems normal · window pane · row/col split · [ / ] · ⌘K
      <span className="ml-auto">UI Kit — Button, Card, Input, Composer, Pane, FileBrowser · Vite 6 · Tailwind v4</span>
    </div>
  )
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-[#262624] text-white text-xs shadow-lg border border-white/10 animate-pulse">{msg}</div>
}

export function CollapseButton({ side, onOpen }: { side: "left" | "right"; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className={`w-6 shrink-0 hidden xl:grid place-items-center bg-[#FDFCFB] dark:bg-[#161618] border-${side === "left" ? "r" : "l"} border-line hover:bg-muted text-zinc-400`} title={side === "left" ? "Sol paneli aç [" : "Sağ paneli aç ]"}>
      {side === "left" ? "›" : "‹"}
    </button>
  )
}

export function ResizeHandle({ side, onMouseDown, onDoubleClick }: { side: "left" | "right"; onMouseDown: (e: React.MouseEvent) => void; onDoubleClick: () => void }) {
  return (
    <div onMouseDown={onMouseDown} onDoubleClick={onDoubleClick} className="w-1 bg-line hover:bg-[#CFC9BF] dark:bg-[#232326] dark:hover:bg-[#3A3A3E] cursor-col-resize shrink-0 hidden xl:flex items-center justify-center group" title="Sürükle yeniden boyutlandır · çift tık gizle">
      <span className="w-0.5 h-7 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100 transition" />
    </div>
  )
}
