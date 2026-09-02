export function WindowedCanvas({
  panes,
  windowPos,
  focusedPane,
  onDragStart,
  onResize,
  onMaximize,
  onClose,
}: {
  panes: { id: string; node: React.ReactNode }[]
  windowPos: Record<string, { x: number; y: number; w: number; h: number }>
  focusedPane: string
  onDragStart: (e: React.MouseEvent, id: string) => void
  onResize: (id: string, w: number, h: number) => void
  onMaximize: (id: string) => void
  onClose: (id: string) => void
}) {
  return (
    <div className="relative w-full h-full min-h-[520px]">
      {panes.map(({ id, node }) => {
        const pos = windowPos[id] || { x: 8, y: 8, w: 420, h: 380 }
        return (
          <div key={id} style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }} className={`absolute bg-white dark:bg-[#161618] border border-line rounded-lg shadow-lg overflow-hidden flex flex-col ${focusedPane === id ? "ring-1 ring-terracotta/30 z-10" : "z-0"}`}>
            <div onMouseDown={e => onDragStart(e, id)} className="h-7 shrink-0 flex items-center px-2 gap-1 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line cursor-grab active:cursor-grabbing text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-terracotta" /> {id}
              <span className="ml-auto flex gap-1">
                <button onClick={() => onMaximize(id)} className="w-5 h-5 grid place-items-center rounded hover:bg-black/5">□</button>
                <button onClick={() => onClose(id)} className="w-5 h-5 grid place-items-center rounded hover:bg-black/5">×</button>
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden flex">{node}</div>
            <div
              onMouseDown={e => {
                e.preventDefault()
                const startX = e.clientX, startY = e.clientY, startW = pos.w, startH = pos.h
                const onMove = (ev: MouseEvent) => {
                  const dw = Math.max(320, Math.min(900, startW + (ev.clientX - startX)))
                  const dh = Math.max(240, Math.min(700, startH + (ev.clientY - startY)))
                  onResize(id, dw, dh)
                }
                const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
                window.addEventListener("mousemove", onMove)
                window.addEventListener("mouseup", onUp)
              }}
              className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize grid place-items-center text-zinc-300"
            >
              ◢
            </div>
          </div>
        )
      })}
    </div>
  )
}
