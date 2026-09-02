import { useState } from "react"

export type LayoutNode =
  | { type: "pane"; id: string }
  | { type: "split"; id: string; dir: "row" | "col"; sizes: number[]; children: LayoutNode[] }

export function SplitTree({ node, renderPane, onResize }: { node: LayoutNode; renderPane: (id: string) => React.ReactNode; onResize: (nodeId: string, sizes: number[]) => void }) {
  if (node.type === "pane") return <div className="flex-1 min-w-0 min-h-0 flex">{renderPane(node.id)}</div>
  const isRow = node.dir === "row"
  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${isRow ? "flex-row" : "flex-col"} overflow-hidden`}>
      {node.children.map((child, i) => (
        <div key={child.type === "pane" ? child.id : child.id} className="flex min-h-0 min-w-0" style={{ flex: `1 1 ${node.sizes[i] ?? 100 / node.children.length}%` }}>
          <SplitTree node={child} renderPane={renderPane} onResize={onResize} />
          {i < node.children.length - 1 && (
            <div
              onMouseDown={e => {
                e.preventDefault()
                const start = isRow ? e.clientX : e.clientY
                const startSizes = [...node.sizes]
                const onMove = (ev: MouseEvent) => {
                  const cur = isRow ? ev.clientX : ev.clientY
                  const deltaPx = cur - start
                  const container = (e.target as HTMLElement).parentElement?.parentElement
                  const totalPx = isRow ? container?.getBoundingClientRect().width ?? 800 : container?.getBoundingClientRect().height ?? 600
                  const deltaPct = (deltaPx / totalPx) * 100
                  const left = Math.max(15, Math.min(85, startSizes[i] + deltaPct))
                  const right = Math.max(15, Math.min(85, startSizes[i + 1] - deltaPct))
                  if (left + right > 0) {
                    const newSizes = [...startSizes]
                    newSizes[i] = left
                    newSizes[i + 1] = right
                    onResize(node.id, newSizes)
                  }
                }
                const onUp = () => { document.body.classList.remove("resizing"); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
                document.body.classList.add("resizing")
                window.addEventListener("mousemove", onMove)
                window.addEventListener("mouseup", onUp)
              }}
              className={`${isRow ? "w-1 cursor-col-resize hover:w-1.5 hover:bg-[#CFC9BF] dark:hover:bg-[#3A3A3E]" : "h-1 cursor-row-resize hover:h-1.5 hover:bg-[#CFC9BF] dark:hover:bg-[#3A3A3E]"} bg-line dark:bg-[#232326] shrink-0 group flex items-center justify-center`}
              title={isRow ? "Sağa sürükle" : "Aşağı sürükle"}
            >
              <span className={`${isRow ? "w-0.5 h-6" : "w-6 h-0.5"} bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100`} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function useLayoutTree(initial: LayoutNode) {
  const [layout, setLayout] = useState<LayoutNode>(initial)
  const updateSizes = (nodeId: string, sizes: number[]) => {
    setLayout(prev => {
      const update = (n: LayoutNode): LayoutNode => {
        if (n.type === "pane") return n
        if (n.id === nodeId) return { ...n, sizes }
        return { ...n, children: n.children.map(update) }
      }
      return update(prev)
    })
  }
  return { layout, setLayout, updateSizes }
}
