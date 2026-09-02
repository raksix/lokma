import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { X, Plus, Copy, Columns2, Rows2, GripVertical } from "lucide-react"
import { Composer } from "./Composer"

export type Tab = { id: string; title: string; content: React.ReactNode }

function createDragPreview(title: string, subtitle?: string) {
  let el = document.getElementById("pane-drag-preview") as HTMLDivElement | null
  if (!el) {
    el = document.createElement("div")
    el.id = "pane-drag-preview"
    el.style.position = "fixed"
    el.style.top = "-1000px"
    el.style.left = "-1000px"
    el.style.pointerEvents = "none"
    el.style.zIndex = "9999"
    document.body.appendChild(el)
  }
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#262624;color:#FAF9F5;border:1px solid #3A3A3E;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.3);font-family:Inter,sans-serif;min-width:160px;max-width:240px">
      <span style="width:6px;height:6px;border-radius:999px;background:#C96442;flex-shrink:0"></span>
      <span style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</span>
      ${subtitle ? `<span style="font-size:11px;color:rgba(255,255,255,0.6);white-space:nowrap">${subtitle}</span>` : ""}
    </div>
  `
  return el
}

export function Pane({
  id,
  initialTabs,
  onClosePane,
  isFocused,
  onFocus,
  onSplit,
}: {
  id: string
  initialTabs: Tab[]
  onClosePane: () => void
  isFocused: boolean
  onFocus: () => void
  onSplit: (dir: "row" | "col", pos?: "before" | "after") => void
}) {
  const [tabs, setTabs] = React.useState<Tab[]>(initialTabs)
  const [active, setActive] = React.useState(initialTabs[0]?.id)
  const [dragOver, setDragOver] = React.useState(false)
  const [dropZone, setDropZone] = React.useState<"center" | "left" | "right" | "top" | "bottom">("center")
  const paneRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const activeTab = tabs.find(t => t.id === active)

  const addTab = (title: string, content: React.ReactNode) => {
    const newId = `tab-${id}-${Date.now()}`
    const newTab = { id: newId, title, content }
    setTabs(prev => [...prev, newTab])
    setActive(newId)
  }

  const closeTab = (tabId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      if (next.length === 0) return prev
      if (active === tabId) {
        const newActive = next[Math.max(0, idx - 1)]
        setActive(newActive.id)
      }
      return next
    })
  }

  const [tabBarOver, setTabBarOver] = React.useState(false)

  const handleTabBarDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setTabBarOver(false)
    const text = e.dataTransfer.getData("text/plain") || (window as unknown as { _dragTitle?: string })._dragTitle || ""
    const dragPaneId = (window as unknown as { _dragPaneId?: string })._dragPaneId
    // pane → tab bar: whole pane becomes a tab
    if (text.startsWith("Pane ") && dragPaneId && dragPaneId !== id) {
      const title = text
      const content = <div className="p-3 text-xs">Pane <b>{dragPaneId}</b> tab olarak eklendi — tab → pane ters işlem</div>
      addTab(title, content)
      // close source pane via App handler if available
      const srcEl = document.querySelector(`[data-pane="${dragPaneId}"]`) as HTMLElement | null
      if (srcEl) {
        // find close button and click, or dispatch event
        window.dispatchEvent(new CustomEvent("lokma-close-pane", { detail: dragPaneId }))
      }
      window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Pane tab oldu: ${title} → ${id}` }))
      return
    }
    // tab → tab bar: move tab
    const dragTab = (window as unknown as { _dragTab?: { paneId: string; tabId: string; title: string } })._dragTab
    if (dragTab && dragTab.paneId !== id) {
      addTab(dragTab.title, <div className="p-3 text-xs">Tab <b>{dragTab.title}</b> taşındı — {dragTab.paneId} → {id}</div>)
      window.dispatchEvent(new CustomEvent("lokma-move-tab", { detail: { fromPane: dragTab.paneId, tabId: dragTab.tabId } }))
      window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Tab taşındı: ${dragTab.title} → ${id}` }))
      return
    }
    // fallback: normal file/session drop onto tab bar → add tab
    if (text) {
      const title = text.slice(0, 40)
      addTab(title, <div className="p-3 text-xs">“{title}” tab bar’a bırakıldı</div>)
    }
  }

  React.useEffect(() => {
    const el = document.querySelector(`[data-pane="${id}"]`) as HTMLElement
    if (el) (el as unknown as { addTab: typeof addTab }).addTab = addTab
  }, [id])

  React.useEffect(() => {
    const onMoveTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as { fromPane: string; tabId: string }
      if (detail.fromPane === id && detail.tabId) {
        setTabs(prev => {
          const next = prev.filter(t => t.id !== detail.tabId)
          if (next.length === 0) return prev
          // keep active valid
          if (active === detail.tabId) setActive(next[0].id)
          return next
        })
      }
    }
    window.addEventListener("lokma-move-tab", onMoveTab as EventListener)
    return () => window.removeEventListener("lokma-move-tab", onMoveTab as EventListener)
  }, [id, active])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sticky = document.getElementById(`${id}-sticky`) as HTMLElement | null
    if (!sticky) return
    const onScroll = () => {
      const show = el.scrollTop > 80
      sticky.style.display = show ? "flex" : "none"
    }
    el.addEventListener("scroll", onScroll)
    return () => el.removeEventListener("scroll", onScroll)
  }, [id, tabs, active])

  const startResize = (e: React.MouseEvent, dir: "e" | "s" | "se") => {
    e.preventDefault()
    e.stopPropagation()
    const el = paneRef.current
    if (!el) return
    const startX = e.clientX, startY = e.clientY
    const startW = el.getBoundingClientRect().width
    const startH = el.getBoundingClientRect().height
    el.style.flex = "0 0 auto"
    document.body.classList.add("resizing")
    const onMove = (ev: MouseEvent) => {
      const dw = ev.clientX - startX
      const dh = ev.clientY - startY
      if (dir === "e" || dir === "se") {
        const nw = Math.max(280, Math.min(900, startW + dw))
        el.style.width = nw + "px"
      }
      if (dir === "s" || dir === "se") {
        const nh = Math.max(200, Math.min(800, startH + dh))
        el.style.height = nh + "px"
      }
    }
    const onUp = () => {
      document.body.classList.remove("resizing")
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const text = e.dataTransfer.getData("text/plain") || (window as unknown as { _dragTitle?: string })._dragTitle || ""
    const title = text ? text.slice(0, 40) : "Dropped"
    const isFile = text.startsWith("@") || text.endsWith(".ts") || text.endsWith(".md")
    if (dropZone !== "center") {
      const dir = dropZone === "left" || dropZone === "right" ? "row" : "col"
      const pos = dropZone === "left" || dropZone === "top" ? "before" : "after"
      const content = isFile ? (
        <div className="font-mono text-xs p-3">File dropped: <span className="text-terracotta">{text}</span><pre className="mt-2 p-2 bg-muted rounded border border-line">export const dropped = true;</pre></div>
      ) : (
        <div className="p-3"><div className="text-xs font-semibold">{title}</div><div className="text-sm mt-1">Sürükle-bırak ile {dropZone} bölgesine bölündü — Windows snap gibi</div></div>
      )
      ;(window as unknown as { _pendingSplit?: { title: string; content: React.ReactNode } })._pendingSplit = { title, content }
      onSplit(dir as "row" | "col", pos as "before" | "after")
      window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${dropZone === "left" ? "Sola" : dropZone === "right" ? "Sağa" : dropZone === "top" ? "Üste" : "Alta"} bölündü: ${title}` }))
      return
    }
    const content = isFile ? (
      <div className="font-mono text-xs p-3">File dropped: <span className="text-terracotta">{text}</span><pre className="mt-2 p-2 bg-muted rounded border border-line">export const dropped = true; // from drag</pre></div>
    ) : (
      <div className="p-3"><div className="text-xs font-semibold">Sürükle-bırak</div><div className="text-sm mt-1">“{title}” pane’e tab olarak eklendi</div></div>
    )
    addTab(title, content)
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Tab eklendi: ${title}` }))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width, h = rect.height
    const edge = 0.24
    if (x < w * edge) setDropZone("left")
    else if (x > w * (1 - edge)) setDropZone("right")
    else if (y < h * edge) setDropZone("top")
    else if (y > h * (1 - edge)) setDropZone("bottom")
    else setDropZone("center")
  }

  const onTabDragStart = (e: React.DragEvent, title: string) => {
    e.dataTransfer.setData("text/plain", title)
    e.dataTransfer.effectAllowed = "move"
    const preview = createDragPreview(title, "tab → pane")
    e.dataTransfer.setDragImage(preview, 20, 20)
    ;(window as unknown as { _dragTitle?: string })._dragTitle = title
    ;(window as unknown as { _dragTab?: { paneId: string; tabId: string; title: string } })._dragTab = { paneId: id, tabId: tabs.find(t => t.title === title)?.id || "", title }
  }

  const onPaneDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", `Pane ${id}`)
    e.dataTransfer.effectAllowed = "move"
    const preview = createDragPreview(`Pane ${id}`, "sürükle → tab yap")
    e.dataTransfer.setDragImage(preview, 20, 20)
    ;(window as unknown as { _dragPaneId?: string })._dragPaneId = id
  }

  return (
    <div
      ref={paneRef}
      data-pane={id}
      onClick={onFocus}
      onDoubleClick={() => {
        if (paneRef.current) {
          const el = paneRef.current
          if (el.style.width === "100%") {
            el.style.width = ""; el.style.height = ""; el.style.flex = ""
          } else {
            el.style.width = "100%"; el.style.height = "100%"
            window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Pane ${id} maximize` }))
          }
        }
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => { setDragOver(false); setDropZone("center") }}
      onDrop={handleDrop}
      className={cn("relative flex-1 flex flex-col min-w-[280px] bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden border-r border-line last:border-r-0", isFocused && "ring-1 ring-terracotta/30", dragOver && "pane-drop-ring")}
      title="Sürükle bırak: soldan session/file sürükle · pane’i header’dan sürükle · çift tık maximize · köşeden resize"
    >
      <div
        onDragOver={e => { e.preventDefault(); setTabBarOver(true) }}
        onDragLeave={() => setTabBarOver(false)}
        onDrop={handleTabBarDrop}
        className={`h-7 flex items-center gap-1 px-1 border-b border-line/60 shrink-0 ${tabBarOver ? "bg-terracotta/10 border-terracotta/30" : "bg-[#FDFCFB] dark:bg-[#161618]"}`}>
        <div
          draggable
          onDragStart={onPaneDragStart}
          className="w-6 h-6 grid place-items-center rounded hover:bg-muted cursor-grab active:cursor-grabbing shrink-0"
          title="Pane’i tut sürükle — tab bar’a bırak tab yap"
        >
          <GripVertical className="w-3 h-3 text-zinc-400" />
        </div>
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.id}
              draggable
              onDragStart={e => onTabDragStart(e, t.title)}
              onClick={() => setActive(t.id)}
              className={cn("inline-flex items-center gap-1.5 px-2.5 h-6 rounded-md text-[11px] font-medium whitespace-nowrap border shrink-0 transition-colors cursor-grab active:cursor-grabbing hover:border-terracotta/20", active === t.id ? "bg-[#262624] text-white border-[#262624] dark:bg-white dark:text-black" : "bg-white dark:bg-[#1E1E21] border-line hover:bg-muted text-zinc-700 dark:text-zinc-200")}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate max-w-[100px]">{t.title}</span>
              <span onClick={e => closeTab(t.id, e)} className="w-3.5 h-3.5 grid place-items-center rounded hover:bg-black/10 dark:hover:bg-white/10 ml-0.5">
                <X className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="iconSm" onClick={() => addTab(`Yeni sekme`, <div className="p-3 text-sm">Boş sekme — pane {id}</div>)}>
            <Plus className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={() => onSplit("row")} title="Yatay böl (yan yana)">
            <Columns2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={() => onSplit("col")} title="Dikey böl (alt alta)">
            <Rows2 className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="iconSm" onClick={onClosePane}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#FAF9F5] dark:bg-[#0F0F11] relative">
        {activeTab ? <div className="p-3">{activeTab.content}</div> : <div className="p-6 text-center text-sm text-zinc-500">Boş pane — sürükle bırak ile doldur</div>}
      </div>
      <div className="shrink-0 p-2 border-t border-line bg-white/90 dark:bg-[#161618]/90 backdrop-blur">
        <Composer
          placeholder={`Pane ${id} — sürükle bırak · profil chat · Ask Lokma`}
          onSend={(text, files) => {
            const userText = text
            const content = (
              <div className="space-y-4">
                <div className="flex gap-2.5 group">
                  <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-7 h-7 rounded-full object-cover border border-line shrink-0 mt-0.5 shadow-sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold">Aylin</span>
                      <span className="text-[11px] text-zinc-400">{new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="mt-1 rounded-2xl rounded-tl-sm bg-white dark:bg-[#1E1E21] border border-line shadow-sm p-3 group-hover:border-line-strong transition">
                      <div className="text-[13px] leading-[1.6]">{userText}</div>
                      {files.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{files.map(f => <span key={f.name} className="px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] text-terracotta text-[11px]">{f.name}</span>)}</div>}
                    </div>
                    <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition flex-wrap">
                      <button onClick={() => { navigator.clipboard.writeText(userText); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" })) }} className="text-[11px] px-2 py-0.5 rounded-full hover:bg-muted border border-transparent hover:border-line">⎙ Copy</button>
                      <button onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Edit — yakında (inline edit)" }))} className="text-[11px] px-2 py-0.5 rounded-full hover:bg-muted border border-transparent hover:border-line">✎ Edit</button>
                      <button onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Rewind — bu mesaja sarıldı" }))} className="text-[11px] px-2 py-0.5 rounded-full hover:bg-muted border border-transparent hover:border-line">↩ Rewind</button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5 group">
                  <div className="w-7 h-7 rounded-full bg-[#6C5CE7] text-white grid place-items-center text-[11px] font-bold border border-line shrink-0 mt-0.5 shadow-sm">◐</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold">Lokma.AI</span>
                      <span className="px-1 py-0.5 rounded-full bg-[#6C5CE7] text-white text-[10px]">Thought ▸</span>
                      <span className="text-[11px] text-zinc-400">· 0.9s</span>
                    </div>
                    <details open className="mt-2 rounded-lg border border-line bg-muted/30 dark:bg-[#1E1E21]/50 overflow-hidden">
                      <summary className="px-3 py-1.5 text-xs font-medium cursor-pointer hover:bg-muted/50 list-none flex items-center gap-1.5"><span className="text-[10px]">▸</span> Thought <span className="ml-auto text-[11px] text-zinc-400">Ran cat · tail</span></summary>
                      <div className="px-3 py-2 border-t border-line text-xs leading-[1.6]">Verifying pane onSend — edit/rewind/fork eklendi.</div>
                    </details>
                    <div className="mt-2 text-[13px] leading-[1.6]">Alındı — pane <b>{id}</b> içinde işliyorum. <span className="text-zinc-500">Mock yanıt, image gibi.</span></div>
                    <div className="mt-2 rounded-lg overflow-hidden border border-line bg-[#0F0F11] dark:bg-[#161618]">
                      <div className="flex items-center gap-2 px-3 h-7 bg-[#1E1E21] border-b border-white/10 text-xs"><span className="font-mono text-white">Pane.tsx</span><span className="text-emerald-400 text-[11px]">+12</span><span className="text-red-400 text-[11px]">-1</span><span className="ml-auto w-5 h-5 grid place-items-center rounded hover:bg-white/10 text-white/60">×</span></div>
                      <pre className="p-3 text-xs leading-5 font-mono overflow-x-auto text-white/90"><code><span className="text-[#8BE9FD]">const</span> Composer <span className="text-[#FF79C6]">=</span> () <span className="text-[#FF79C6]">=&gt;</span> {"{"} <span className="text-[#6272A4]">// edit/rewind/fork</span> {"}"}</code></pre>
                    </div>
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      <button onClick={() => { navigator.clipboard.writeText(`Alındı — pane ${id} içinde işliyorum.`); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" })) }} className="text-[11px] px-2 py-0.5 rounded-full hover:bg-muted border border-transparent hover:border-line">⎙ Copy</button>
                      <button onClick={() => { const forkTitle = `Fork · ${userText.slice(0, 20)}`; const forkContent = <div className="p-3 text-xs">Forked from pane {id} — “{userText.slice(0, 30)}...”<div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-[11px]">Yeni dal — buradan devam</div></div>; addTab(forkTitle, forkContent); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Fork: ${forkTitle}` })) }} className="text-[11px] px-2 py-0.5 rounded-full hover:bg-muted border border-transparent hover:border-line">⎇ Fork</button>
                      <button onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Regenerate" }))} className="text-[11px] px-2 py-0.5 rounded-full hover:bg-muted border border-transparent hover:border-line">↻ Regenerate</button>
                      <a href="https://lokma-concept.fermag.com.tr" target="_blank" className="ml-auto text-[11px] text-terracotta hover:underline">Canlı</a>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-400">✓ 1 tool · profil chat senkron</div>
                  </div>
                </div>
              </div>
            )
            addTab(`Yeni mesaj`, content)
          }}
        />
      </div>
      {/* all-panels resize handles */}
      <div onMouseDown={e => startResize(e, "e")} className="pane-handle pane-handle-e" title="Sağa sürükle genişlet" />
      <div onMouseDown={e => startResize(e, "s")} className="pane-handle pane-handle-s" title="Aşağı sürükle uzat" />
      <div onMouseDown={e => startResize(e, "se")} className="pane-handle pane-handle-se" title="Çapraz sürükle">◢</div>
      {dragOver && (
        <div className="absolute inset-0 pointer-events-none p-1">
          {/* Windows snap preview — where drop will land */}
          {dropZone === "left" && <div className="absolute inset-y-1 left-1 w-[50%] rounded-lg border-2 border-terracotta bg-terracotta/10 shadow-[0_8px_24px_rgba(201,100,66,0.15)] flex items-center justify-center text-xs font-semibold text-terracotta">◀ Sola böl — 50%</div>}
          {dropZone === "right" && <div className="absolute inset-y-1 right-1 w-[50%] rounded-lg border-2 border-terracotta bg-terracotta/10 shadow-[0_8px_24px_rgba(201,100,66,0.15)] flex items-center justify-center text-xs font-semibold text-terracotta">Sağa böl ▶ — 50%</div>}
          {dropZone === "top" && <div className="absolute inset-x-1 top-1 h-[50%] rounded-lg border-2 border-terracotta bg-terracotta/10 shadow-[0_8px_24px_rgba(201,100,66,0.15)] flex items-center justify-center text-xs font-semibold text-terracotta">▲ Üste böl — 50%</div>}
          {dropZone === "bottom" && <div className="absolute inset-x-1 bottom-1 h-[50%] rounded-lg border-2 border-terracotta bg-terracotta/10 shadow-[0_8px_24px_rgba(201,100,66,0.15)] flex items-center justify-center text-xs font-semibold text-terracotta">▼ Alta böl — 50%</div>}
          {dropZone === "center" && <div className="absolute inset-0 rounded-lg border-2 border-terracotta bg-terracotta/5 flex items-center justify-center text-xs font-medium text-terracotta">Bırak → tab olarak ekle</div>}
          <div className="absolute inset-0 rounded-lg border border-terracotta/20 pointer-events-none" />
        </div>
      )}
    </div>
  )
}

export function CodePaneContent() {
  return (
    <div className="rounded-lg overflow-hidden border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition-colors">
      <div className="flex items-center justify-between px-3 h-7 bg-muted/50 border-b border-line">
        <span className="font-mono text-xs">plugins/auth.ts</span>
        <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" }))}>
          <Copy className="w-3 h-3" /> Copy
        </Button>
      </div>
      <pre className="p-3 text-xs leading-5 font-mono overflow-x-auto">
        <code>
          <span className="text-zinc-400">// Fastify preHandler</span>
          {"\n"}
          <span className="text-amber-700">app</span>.addHook(<span className="text-green-700">'preHandler'</span>, <span className="text-amber-700">async</span> (req, reply) =&gt; {"{"}
          {"\n"}  <span className="text-amber-700">if</span> (!req.routeOptions.config?.auth) <span className="text-amber-700">return</span>
          {"\n"}
          {"}"})
        </code>
      </pre>
    </div>
  )
}
