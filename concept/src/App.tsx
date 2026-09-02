import { useState, useEffect, useRef } from "react"
import { Header } from "@/components/layout/Header"
import { SidebarLeft } from "@/components/layout/SidebarLeft"
import { FileBrowser } from "@/components/layout/FileBrowser"
import { Pane, CodePaneContent } from "@/components/layout/Pane"
import { BrowserPane } from "@/components/layout/BrowserPane"
import { MobilePane } from "@/components/layout/MobilePane"
import { SearchModal } from "@/components/layout/SearchModal"
import { TerminalPane } from "@/components/layout/TerminalPane"
import { OrchestrationPane } from "@/components/layout/OrchestrationPane"
import { GitPane } from "@/components/layout/GitPane"
import { VaultPane } from "@/components/layout/VaultPane"
import { ArchifyPane } from "@/components/layout/ArchifyPane"
import { DesignStudioPane } from "@/components/layout/DesignStudioPane"
import { Composer } from "@/components/layout/Composer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type PaneData = { id: string; title: string; content: React.ReactNode }
type LayoutNode =
  | { type: "pane"; id: string }
  | { type: "split"; id: string; dir: "row" | "col"; sizes: number[]; children: LayoutNode[] }

const genId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`

export default function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [leftW, setLeftW] = useState(() => {
    const v = localStorage.getItem("lokma-pane-left")
    return v ? parseInt(v, 10) : 268
  })
  const [rightW, setRightW] = useState(() => {
    const v = localStorage.getItem("lokma-pane-right")
    return v ? parseInt(v, 10) : 300
  })
  const [tiling, setTiling] = useState(false)
  const [windowed, setWindowed] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMobile, setShowMobile] = useState(false)
  const [focusedPane, setFocusedPane] = useState<string>("a")
  const [extraPanes, setExtraPanes] = useState<PaneData[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [windowPos, setWindowPos] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({
    a: { x: 8, y: 8, w: 480, h: 520 },
    b: { x: 504, y: 8, w: 480, h: 520 },
  })
  const [layout, setLayout] = useState<LayoutNode>({
    type: "split",
    id: "root",
    dir: "row",
    sizes: [50, 50],
    children: [
      { type: "pane", id: "a" },
      { type: "pane", id: "b" },
    ],
  })
  const singleScrollRef = useRef<HTMLDivElement>(null)
  const [singleAylinText, setSingleAylinText] = useState("Let's refactor the auth middleware. Move JWT verification into a Fastify preHandler hook.")
  const [editingSingle, setEditingSingle] = useState(false)
  const [singleAylinDraft, setSingleAylinDraft] = useState(singleAylinText)
  const dragRef = useRef<{ startX: number; startW: number; side: "left" | "right" } | null>(null)
  const winDragRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("lokma:layout:v1")
    if (saved) {
      try {
        const j = JSON.parse(saved)
        if (j.leftW) setLeftW(j.leftW)
        if (j.rightW) setRightW(j.rightW)
        if (typeof j.tiling === "boolean") setTiling(j.tiling)
        if (typeof j.windowed === "boolean") setWindowed(j.windowed)
        if (j.layout) setLayout(j.layout)
      } catch {}
    }
  }, [])

  const saveLayout = () => {
    localStorage.setItem("lokma:layout:v1", JSON.stringify({ leftW, rightW, tiling, windowed, layout, ts: Date.now() }))
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Layout kaydedildi — row/col split korundu" }))
  }
  const resetLayout = () => {
    localStorage.removeItem("lokma:layout:v1")
    setLeftW(268); setRightW(300); setTiling(false); setWindowed(false)
    setLayout({ type: "split", id: "root", dir: "row", sizes: [50, 50], children: [{ type: "pane", id: "a" }, { type: "pane", id: "b" }] })
    setExtraPanes([])
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Layout sıfırlandı — dikey/yatay split reset" }))
  }

  useEffect(() => {
    const h = (e: Event) => {
      const msg = (e as CustomEvent).detail as string
      setToast(msg)
      setTimeout(() => setToast(null), 1600)
    }
    window.addEventListener("lokma-toast", h as EventListener)
    return () => window.removeEventListener("lokma-toast", h as EventListener)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen(v => !v)
        return
      }
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) setLeftCollapsed(v => !v)
      if (e.key === "]" && !e.metaKey && !e.ctrlKey) setRightCollapsed(v => !v)
      if (e.key === "Escape" && searchOpen) setSearchOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [searchOpen])

  useEffect(() => {
    const el = singleScrollRef.current
    if (!el) return
    const sticky = document.getElementById("single-sticky")
    const onScroll = () => {
      const show = el.scrollTop > 140
      if (sticky) sticky.style.display = show ? "flex" : "none"
    }
    el.addEventListener("scroll", onScroll)
    return () => el.removeEventListener("scroll", onScroll)
  }, [tiling])

  const startDrag = (e: React.MouseEvent, side: "left" | "right") => {
    e.preventDefault()
    const startW = side === "left" ? leftW : rightW
    dragRef.current = { startX: e.clientX, startW, side }
    document.body.classList.add("resizing")
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      if (dragRef.current.side === "left") {
        const nw = Math.max(180, Math.min(380, dragRef.current.startW + dx))
        setLeftW(nw)
      } else {
        const nw = Math.max(240, Math.min(480, dragRef.current.startW - dx))
        setRightW(nw)
      }
    }
    const onUp = () => {
      document.body.classList.remove("resizing")
      if (dragRef.current) {
        setTimeout(() => {
          const lw = document.getElementById("pane-left-wrap")?.getBoundingClientRect().width
          const rw = document.getElementById("pane-right-wrap")?.getBoundingClientRect().width
          if (lw) localStorage.setItem("lokma-pane-left", String(Math.round(lw)))
          if (rw) localStorage.setItem("lokma-pane-right", String(Math.round(rw)))
        }, 50)
      }
      dragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const startWindowDrag = (e: React.MouseEvent, id: string) => {
    const pos = windowPos[id]
    if (!pos) return
    e.preventDefault()
    winDragRef.current = { id, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!winDragRef.current) return
      const dx = ev.clientX - winDragRef.current.sx
      const dy = ev.clientY - winDragRef.current.sy
      setWindowPos(prev => ({ ...prev, [id]: { ...prev[id], x: Math.max(0, winDragRef.current!.ox + dx), y: Math.max(0, winDragRef.current!.oy + dy) } }))
    }
    const onUp = () => {
      winDragRef.current = null
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  const ensureWindowPos = (id: string) => {
    if (windowPos[id]) return
    const n = Object.keys(windowPos).length
    setWindowPos(prev => ({ ...prev, [id]: { x: 8 + (n % 3) * 28, y: 8 + (n % 3) * 28, w: 420, h: 380 } }))
  }

  // ——— layout tree helpers ———
  const splitPane = (targetId: string, dir: "row" | "col", pos: "before" | "after" = "after") => {
    const newId = genId()
    ensureWindowPos(newId)
    const pending = (window as unknown as { _pendingSplit?: { title: string; content: React.ReactNode } })._pendingSplit
    const title = pending?.title || `Pane ${newId.slice(2, 6)}`
    const content = pending?.content || <div className="p-3 text-sm">{dir === "row" ? "Yatay bölme" : "Dikey bölme"} — {newId} · {pos === "before" ? "önüne" : "arkasına"} eklendi</div>
    if (pending) delete (window as unknown as { _pendingSplit?: unknown })._pendingSplit
    const newPane: LayoutNode = { type: "pane", id: newId }
    setExtraPanes(prev => [...prev, { id: newId, title, content }])
    const recur = (node: LayoutNode): LayoutNode => {
      if (node.type === "pane") {
        if (node.id === targetId) {
          const children = pos === "before" ? [newPane, node] : [node, newPane]
          return { type: "split", id: `s-${Date.now()}`, dir, sizes: [50, 50], children }
        }
        return node
      }
      return { ...node, children: node.children.map(recur) }
    }
    setLayout(prev => recur(prev))
    setFocusedPane(newId)
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${dir === "row" ? "Yatay" : "Dikey"} bölündü (${pos}): ${targetId} → ${title}` }))
  }

  const closePane = (targetId: string) => {
    if (targetId === "a" || targetId === "b") {
      window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Ana pane kapatılamaz — tab kapat" }))
      return
    }
    const recur = (node: LayoutNode): LayoutNode | null => {
      if (node.type === "pane") return node.id === targetId ? null : node
      const children = node.children.map(recur).filter(Boolean) as LayoutNode[]
      if (children.length === 0) return null
      if (children.length === 1) return children[0]
      // normalize sizes
      const sizes = node.sizes.slice(0, children.length)
      while (sizes.length < children.length) sizes.push(100 / children.length)
      const sum = sizes.reduce((a, b) => a + b, 0)
      return { ...node, children, sizes: sizes.map(s => (s / sum) * 100) }
    }
    setLayout(prev => {
      const next = recur(prev)
      return (next as LayoutNode) || { type: "split", id: "root", dir: "row", sizes: [50, 50], children: [{ type: "pane", id: "a" }, { type: "pane", id: "b" }] }
    })
    setExtraPanes(prev => prev.filter(p => p.id !== targetId))
  }

  const handleOpenTab = (title: string, content: React.ReactNode) => {
    if (!tiling) setTiling(true)
    const id = genId()
    ensureWindowPos(id)
    setExtraPanes(prev => [...prev, { id, title, content }])
    // add as new pane in layout (append to root)
    setLayout(prev => {
      if (prev.type === "split") {
        return { ...prev, children: [...prev.children, { type: "pane", id }], sizes: [...prev.sizes, 50].map((s, i, arr) => (s / arr.reduce((a, b) => a + b, 0)) * 100) }
      }
      return { type: "split", id: "root", dir: "row", sizes: [50, 50], children: [prev, { type: "pane", id }] }
    })
    setFocusedPane(id)
  }

  const handleOpenFile = (name: string) => {
    handleOpenTab(name, <div className="font-mono text-xs p-3">File preview: {name}<pre className="mt-2 p-2 bg-muted rounded border border-line">export const demo = true;</pre></div>)
  }

  const handleForkFrom = (fromTitle: string) => {
    const forkTitle = `Fork · ${fromTitle.slice(0, 24)}`
    const content = (
      <div className="space-y-4">
        <div className="p-2 rounded-md bg-amber-50 dark:bg-[#241E0F] border border-amber-200 dark:border-[#3A2E1A] text-xs flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Forked from “{fromTitle}” — yeni dal, bu mesajdan itibaren ayrı session’da devam
        </div>
        <div className="flex gap-3">
          <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-7 h-7 rounded-full object-cover border border-line shrink-0" />
          <div className="flex-1 rounded-2xl bg-white dark:bg-[#1E1E21] border border-line p-3 text-[13px] leading-[1.6]">{singleAylinText}</div>
        </div>
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[11px] font-bold border border-line shrink-0">◐</div>
          <div className="flex-1 text-[13px] leading-[1.6]">Perfect — one hook, one decorator, zero magic. <span className="text-zinc-500">(forked)</span></div>
        </div>
        <div className="p-2 rounded-md bg-muted border border-line text-xs">Yeni dal — buradan devam et. Composer ile yaz.</div>
      </div>
    )
    handleOpenTab(forkTitle, content)
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Fork açıldı: ${forkTitle}` }))
  }

  // render helpers for tiling tree
  const renderPaneById = (id: string) => {
    if (id === "a") return <Pane key={id} id={id} initialTabs={[{ id: "tab-a-1", title: "Chat #482", content: <div className="space-y-4">
      <div id="pane-a-sticky" className="hidden sticky top-0 z-10 -mx-1 mb-2 px-2 py-1.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line shadow-sm items-center gap-2 cursor-pointer hover:border-terracotta/30 text-xs" onClick={() => document.getElementById("pane-a-aylin")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
        <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-5 h-5 rounded-full object-cover border border-line" />
        <span className="font-medium truncate">Aylin — “Refactor auth…”</span>
        <span className="ml-auto text-terracotta">↥ git</span>
      </div>
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[11px] font-bold border border-line shrink-0 mt-0.5 shadow-sm">◐</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5"><span className="text-xs font-semibold">Lokma</span><span className="px-1 py-0.5 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black text-[10px]">Sonnet</span><span className="text-[11px] text-zinc-400">14:31 · 0.8s</span></div>
          <div className="mt-1 text-[13px] leading-[1.6]">One hook, one decorator — profil chat pane’de de bubble’sız.</div>
        </div>
      </div>
      <div id="pane-a-aylin" className="flex gap-2.5 scroll-mt-16">
        <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-7 h-7 rounded-full object-cover border border-line shrink-0 mt-0.5 shadow-sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5"><span className="text-xs font-semibold">Aylin</span><span className="text-[11px] text-zinc-400">14:31</span></div>
          <div className="mt-1 rounded-2xl rounded-tl-sm bg-white dark:bg-[#1E1E21] border border-line shadow-sm p-3 text-[13px] leading-[1.6]">Refactor auth middleware</div>
        </div>
      </div>
      <div className="flex gap-2.5">
        <div className="w-7 h-7 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[11px] font-bold border border-line shrink-0 mt-0.5 shadow-sm">◐</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5"><span className="text-xs font-semibold">Lokma</span><span className="px-1 py-0.5 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black text-[10px]">Sonnet</span></div>
          <div className="mt-1 text-[13px] leading-[1.6]">One hook, one decorator.</div>
        </div>
      </div>
    </div> }]} isFocused={focusedPane === id} onFocus={() => setFocusedPane(id)} onClosePane={() => closePane(id)} onSplit={(dir, pos) => splitPane(id, dir, pos)} />
    if (id === "b") return <Pane key={id} id={id} initialTabs={[{ id: "tab-b-1", title: "auth.ts", content: <CodePaneContent /> }]} isFocused={focusedPane === id} onFocus={() => setFocusedPane(id)} onClosePane={() => closePane(id)} onSplit={(dir, pos) => splitPane(id, dir, pos)} />
    const extra = extraPanes.find(p => p.id === id)
    if (extra) return <Pane key={id} id={id} initialTabs={[{ id: `tab-${id}-1`, title: extra.title, content: extra.content }]} isFocused={focusedPane === id} onFocus={() => setFocusedPane(id)} onClosePane={() => closePane(id)} onSplit={(dir, pos) => splitPane(id, dir, pos)} />
    if (id === "browser") return <BrowserPane key={id} onClose={() => setShowBrowser(false)} />
    if (id === "mobile") return <MobilePane key={id} onClose={() => setShowMobile(false)} />
    return <div key={id} className="p-3 text-xs">Pane {id} not found</div>
  }

  const RenderSplit = ({ node }: { node: LayoutNode }) => {
    if (node.type === "pane") return <div className="flex-1 min-w-0 min-h-0 flex">{renderPaneById(node.id)}</div>
    const isRow = node.dir === "row"
    return (
      <div className={`flex flex-1 min-h-0 min-w-0 ${isRow ? "flex-row" : "flex-col"} overflow-hidden`}>
        {node.children.map((child, i) => (
          <div key={child.type === "pane" ? child.id : child.id} className="flex min-h-0 min-w-0" style={{ flex: `1 1 ${node.sizes[i] ?? 100 / node.children.length}%` }}>
            <RenderSplit node={child} />
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
                      setLayout(prev => {
                        const update = (n: LayoutNode): LayoutNode => {
                          if (n.type === "pane") return n
                          if (n.id === node.id) return { ...n, sizes: newSizes }
                          return { ...n, children: n.children.map(update) }
                        }
                        return update(prev)
                      })
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

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#FAF9F5] dark:bg-[#0F0F11] text-ink dark:text-white">
      <Header
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        onOpenBrowser={() => {
          if (!tiling) setTiling(true)
          setShowBrowser(true)
          ensureWindowPos("browser")
        }}
        onOpenMobile={() => {
          if (!tiling) setTiling(true)
          setShowMobile(true)
          ensureWindowPos("mobile")
        }}
        onSearch={() => setSearchOpen(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!leftCollapsed && (
          <div id="pane-left-wrap" style={{ width: leftW }} className="shrink-0 flex">
            <SidebarLeft onOpenTab={handleOpenTab} />
          </div>
        )}
        {!leftCollapsed && (
          <div
            onMouseDown={e => startDrag(e, "left")}
            onDoubleClick={() => setLeftCollapsed(true)}
            className="w-1 bg-line hover:bg-[#CFC9BF] dark:bg-[#232326] dark:hover:bg-[#3A3A3E] cursor-col-resize shrink-0 hidden xl:flex items-center justify-center group"
            title="Sürükle yeniden boyutlandır · çift tık gizle"
          >
            <span className="w-0.5 h-7 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100 transition" />
          </div>
        )}
        {leftCollapsed && (
          <button onClick={() => setLeftCollapsed(false)} className="w-6 shrink-0 hidden xl:grid place-items-center bg-[#FDFCFB] dark:bg-[#161618] border-r border-line hover:bg-muted text-zinc-400" title="Sol paneli aç [">
            ›
          </button>
        )}

        <main className="flex-1 min-w-0 flex flex-col bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden">
          {!tiling ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div ref={singleScrollRef} className="flex-1 overflow-y-auto">
                <div className="max-w-[820px] mx-auto w-full px-4 sm:px-5 py-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white dark:bg-[#1E1E21] border border-line text-[10.5px] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-terracotta" /> Lokma Harness · #482
                    </span>
                    <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-xs" onClick={() => setTiling(true)}>
                      Pane olarak aç
                    </Button>
                  </div>
                  <h1 className="font-serif text-[30px] leading-[1.08] tracking-tight">
                    Good afternoon, Aylin.<br />
                    <span className="italic font-normal text-zinc-500">What are we building today?</span>
                  </h1>
                  <p className="mt-2 text-[13px] text-zinc-500">Start with a brief. Lokma will scaffold the plan, run tools, and keep an inspectable trail. Dikey/yatay böl, windowed ile serbest taşı.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-6">
                    {[
                      { title: "Scaffold a new API", desc: "Fastify + Drizzle + auth" },
                      { title: "Review this PR", desc: "Security, types, tests" },
                      { title: "Design a landing", desc: "Figma → code" },
                    ].map(c => (
                      <Card key={c.title} className="p-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenTab(c.title, <div className="p-3">{c.title} — new tab in focused pane</div>)}>
                        <div className="text-xs font-semibold">{c.title}</div>
                        <div className="text-xs text-zinc-500">{c.desc}</div>
                      </Card>
                    ))}
                  </div>

                  <div className="mt-6">
                    {/* Sticky: en üstte senin mesajın parçası */}
                    <div id="single-sticky" className="hidden sticky top-0 z-10 -mx-1 mb-3 px-2 py-1.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line shadow-sm items-center gap-2 cursor-pointer hover:border-terracotta/30" onClick={() => document.getElementById("single-msg-aylin")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                      <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-5 h-5 rounded-full object-cover border border-line" />
                      <span className="text-xs font-medium truncate">Aylin — “Let's refactor the auth…”</span>
                      <span className="ml-auto text-[11px] text-terracotta">↥ git</span>
                    </div>

                    {/* Scrollbar ortasında mesajlara git — dikey noktalar */}
                    <div className="relative flex gap-3">
                      <div className="flex-1 space-y-5 pr-2">
                        {/* Today separator */}
                        <div className="flex items-center gap-3 py-1">
                          <div className="h-px flex-1 bg-line" />
                          <span className="text-[11px] tracking-widest uppercase text-zinc-400 bg-muted px-2 py-0.5 rounded-full border border-line">Today · 14:31</span>
                          <div className="h-px flex-1 bg-line" />
                        </div>

                        {/* Aylin — user bubble KALSIN */}
                        <div id="single-msg-aylin" className="flex gap-3 group scroll-mt-16">
                          <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-8 h-8 rounded-full object-cover border border-line shrink-0 mt-0.5 shadow-sm" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-semibold">Aylin</span>
                              <span className="text-[11px] text-zinc-400">14:31</span>
                              <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-400"><span className="w-1 h-1 rounded-full bg-emerald-500" /> you</span>
                            </div>
                            {editingSingle ? (
                              <div className="mt-1.5 rounded-2xl bg-white dark:bg-[#1E1E21] border border-terracotta/30 shadow-sm p-2">
                                <textarea value={singleAylinDraft} onChange={e => setSingleAylinDraft(e.target.value)} rows={3} className="w-full rounded-md border border-line bg-white dark:bg-[#0F0F11] p-2 text-[13px] focus:outline-none focus:border-terracotta/30" />
                                <div className="mt-2 flex gap-1.5 justify-end">
                                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => { setEditingSingle(false); setSingleAylinDraft(singleAylinText) }}>Cancel</Button>
                                  <Button size="sm" className="h-6 text-[11px]" onClick={() => { setSingleAylinText(singleAylinDraft); setEditingSingle(false); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Prompt güncellendi — rewind ile yeniden gönder" })) }}>Save & rewind</Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="mt-1.5 rounded-2xl rounded-tl-sm bg-white dark:bg-[#1E1E21] border border-line shadow-sm p-3.5 group-hover:border-line-strong group-hover:shadow-md transition">
                                  <div className="text-[13.5px] leading-[1.6]">{singleAylinText}</div>
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded-full bg-[#FDF0E6] border border-[#F2D5C2] text-terracotta text-[11px]">auth.ts</span>
                                    <span className="px-1.5 py-0.5 rounded-full bg-muted border border-line text-[11px]">+18 lines</span>
                                  </div>
                                </div>
                                <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition flex-wrap">
                                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { setSingleAylinDraft(singleAylinText); setEditingSingle(true) }}>✎ Edit</Button>
                                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { document.getElementById("single-msg-lokma")?.scrollIntoView({ behavior: "smooth" }); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Rewind: bu mesaja sarıldı — sonraki mesajlar gizlendi" })) }}>↩ Rewind</Button>
                                  <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => { navigator.clipboard.writeText(singleAylinText); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" })) }}>Copy</Button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Lokma — BUBBLE YOK, düz metin */}
                        <div id="single-msg-lokma" className="flex gap-3 group scroll-mt-16">
                          <div className="w-8 h-8 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-xs font-bold border border-line shrink-0 mt-0.5 shadow-sm">◐</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-xs font-semibold">Lokma</span>
                              <span className="px-1.5 py-0.5 rounded-full bg-[#262624] dark:bg-white text-white dark:text-black text-[10px]">Claude 4 Sonnet</span>
                              <span className="text-[11px] text-zinc-400">14:31 · 1.2s</span>
                              <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-600"><span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" /> streaming done</span>
                            </div>
                            {/* düz metin, bubble yok */}
                            <div className="mt-1.5 text-[13.5px] leading-[1.6]">Perfect — one hook, one decorator, <span className="underline decoration-terracotta/50 underline-offset-4">zero magic.</span></div>
                            <div className="mt-3 rounded-xl overflow-hidden border border-line bg-[#0F0F11] dark:bg-[#1E1E21]">
                              <div className="flex items-center justify-between px-3 h-7 bg-white/5 border-b border-white/10 text-xs dark:bg-[#232326]">
                                <span className="font-mono text-white">plugins/auth.ts</span>
                                <span className="text-white/60">+18</span>
                              </div>
                              <pre className="p-3 text-xs leading-5 font-mono overflow-x-auto text-white/90"><code><span className="text-white/40">// Fastify preHandler</span>{"\n"}<span className="text-amber-300">app</span>.addHook(<span className="text-emerald-300">'preHandler'</span>, <span className="text-amber-300">async</span> (req, reply) =&gt; {"{"}{"\n"}  <span className="text-amber-300">if</span> (!req.routeOptions.config?.auth) <span className="text-amber-300">return</span>{"\n"}{"}"})</code></pre>
                            </div>
                            <div className="mt-2 flex gap-1.5">
                              <Button variant="secondary" size="sm" className="h-6 text-[11px] gap-1 bg-white text-ink hover:bg-white/90 border border-line" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Diff kopyalandı" }))}>Copy diff</Button>
                              <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => handleOpenTab("auth.ts", <CodePaneContent />)}>Open in pane</Button>
                              <Button variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => handleForkFrom("Perfect — one hook, one decorator")}>⎇ Fork</Button>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-400">
                              <span>✓ 1 tool · 12k tokens · $0.04</span>
                              <span className="mx-1">·</span>
                              <button onClick={() => { navigator.clipboard.writeText("Perfect — one hook, one decorator, zero magic."); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" })) }} className="hover:text-ink hover:underline">⎙ Copy</button>
                              <span className="mx-1">·</span>
                              <button onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Regenerate" }))} className="hover:text-ink hover:underline">↻ Regenerate</button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Scrollbar ortasında dikey noktalar — sticky, senin mesajlarına hızlı git */}
                      <div className="sticky top-1/2 self-start -translate-y-1/2 flex flex-col items-center gap-2 py-2 px-1 rounded-full bg-white dark:bg-[#1E1E21] border border-line shadow-sm h-fit">
                        <button onClick={() => document.getElementById("single-msg-aylin")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-2 h-2 rounded-full bg-terracotta hover:scale-[1.4] transition shadow" title="Aylin — 14:31" />
                        <button onClick={() => document.getElementById("single-msg-lokma")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 hover:bg-terracotta transition" title="Lokma — 14:31" />
                        <span className="w-px h-4 bg-line my-1" />
                        <button onClick={() => singleScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })} className="w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-400" title="Başa git" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 p-2 border-t border-line bg-white/90 dark:bg-[#161618]/90 backdrop-blur">
                <div className="max-w-[820px] mx-auto">
                  <Composer onSend={(text, files) => handleOpenTab("Yeni mesaj", <div className="p-3">Sent: {text} {files.length > 0 && `+ ${files.length} files`}</div>)} />
                  <div className="text-center text-[10px] text-zinc-400 mt-1">Lokma can make mistakes. Review patches before applying.</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="h-8 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#161618] shrink-0 overflow-x-auto">
                <span className="px-2 py-1 rounded-md bg-[#262624] text-white text-xs">Tiling</span>
                <span className="text-xs text-zinc-500 hidden sm:inline whitespace-nowrap">dikey/yatay böl · altına/üstüne/sağa/sola · windowed serbest · [ / ] · save/reset</span>
                <span className="ml-auto flex gap-1 shrink-0">
                  <Button variant={windowed ? "ink" : "outline"} size="sm" className="h-6 text-xs gap-1" onClick={() => setWindowed(!windowed)}>
                    Windowed
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => { const id = genId(); ensureWindowPos(id); setExtraPanes(p => [...p, { id, title: `Pane ${id.slice(2,6)}`, content: <div className="p-3">Yeni pane — altına/yanına böl</div> }]); setLayout(prev => ({ type: "split", id: "root", dir: "row", sizes: [...(prev.type==="split"?prev.sizes:[]), 50].map((s,i,a)=>s/a.reduce((x,y)=>x+y,0)*100), children: [...(prev.type==="split"?prev.children:[prev]), { type: "pane", id }] } as LayoutNode)) }}>
                    + Pane
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden lg:inline-flex" onClick={() => handleOpenTab("Terminal", <TerminalPane />)}>
                    + Terminal
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden lg:inline-flex" onClick={() => handleOpenTab("Orchestration", <OrchestrationPane />)}>
                    + Agents
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden lg:inline-flex" onClick={() => handleOpenTab("Git", <GitPane />)}>
                    + Git
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden xl:inline-flex" onClick={() => handleOpenTab("Vault", <VaultPane />)}>
                    + Vault
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden xl:inline-flex" onClick={() => handleOpenTab("Archify", <ArchifyPane />)}>
                    + Archify
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden xl:inline-flex" onClick={() => handleOpenTab("Design", <DesignStudioPane />)}>
                    + Design
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden sm:inline-flex" onClick={saveLayout}>
                    Save
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs hidden sm:inline-flex" onClick={resetLayout}>
                    Reset
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setTiling(false)}>
                    Tekil
                  </Button>
                </span>
              </div>
              <div className={`flex flex-1 min-h-0 overflow-hidden ${windowed ? "relative bg-[#FAF9F5] dark:bg-[#0F0F11] p-2 gap-2" : ""}`}>
                {windowed ? (
                  <div className="relative w-full h-full min-h-[520px]">
                    {[
                      { id: "a", node: renderPaneById("a") },
                      { id: "b", node: renderPaneById("b") },
                      ...extraPanes.map(p => ({ id: p.id, node: renderPaneById(p.id) })),
                      ...(showBrowser ? [{ id: "browser", node: <BrowserPane onClose={() => setShowBrowser(false)} /> }] : []),
                      ...(showMobile ? [{ id: "mobile", node: <MobilePane onClose={() => setShowMobile(false)} /> }] : []),
                    ].map(({ id, node }) => {
                      const pos = windowPos[id] || { x: 8, y: 8, w: 420, h: 380 }
                      return (
                        <div key={id} style={{ left: pos.x, top: pos.y, width: pos.w, height: pos.h }} className={`absolute bg-white dark:bg-[#161618] border border-line rounded-lg shadow-lg overflow-hidden flex flex-col ${focusedPane === id ? "ring-1 ring-terracotta/30 z-10" : "z-0"}`}>
                          <div onMouseDown={e => startWindowDrag(e, id)} className="h-7 shrink-0 flex items-center px-2 gap-1 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line cursor-grab active:cursor-grabbing text-xs font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-terracotta" /> {id}
                            <span className="ml-auto flex gap-1">
                              <button onClick={() => setWindowPos(prev => ({ ...prev, [id]: { ...prev[id], x: 8, y: 8, w: 480, h: 520 } }))} className="w-5 h-5 grid place-items-center rounded hover:bg-black/5">□</button>
                              <button onClick={() => { if (id === "a" || id === "b") return; closePane(id) }} className="w-5 h-5 grid place-items-center rounded hover:bg-black/5">×</button>
                            </span>
                          </div>
                          <div className="flex-1 min-h-0 overflow-hidden flex">{node}</div>
                          <div onMouseDown={e => {
                            e.preventDefault()
                            const startX = e.clientX, startY = e.clientY, startW = pos.w, startH = pos.h
                            const onMove = (ev: MouseEvent) => {
                              const dw = Math.max(320, Math.min(900, startW + (ev.clientX - startX)))
                              const dh = Math.max(240, Math.min(700, startH + (ev.clientY - startY)))
                              setWindowPos(prev => ({ ...prev, [id]: { ...prev[id], w: dw, h: dh } }))
                            }
                            const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
                            window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp)
                          }} className="absolute right-0 bottom-0 w-4 h-4 cursor-se-resize grid place-items-center text-zinc-300">◢</div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <RenderSplit node={layout} />
                )}
              </div>
            </div>
          )}
        </main>

        {rightCollapsed ? (
          <button onClick={() => setRightCollapsed(false)} className="w-6 shrink-0 hidden xl:grid place-items-center bg-[#FDFCFB] dark:bg-[#161618] border-l border-line hover:bg-muted text-zinc-400" title="Sağ paneli aç ]">
            ‹
          </button>
        ) : (
          <>
            <div
              onMouseDown={e => startDrag(e, "right")}
              onDoubleClick={() => setRightCollapsed(true)}
              className="w-1 bg-line hover:bg-[#CFC9BF] dark:bg-[#232326] dark:hover:bg-[#3A3A3E] cursor-col-resize shrink-0 hidden xl:flex items-center justify-center group"
              title="Sürükle yeniden boyutlandır · çift tık gizle"
            >
              <span className="w-0.5 h-7 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100 transition" />
            </div>
            <div id="pane-right-wrap" style={{ width: rightW }} className="shrink-0 hidden xl:flex">
              <FileBrowser onOpenFile={handleOpenFile} />
            </div>
          </>
        )}
      </div>

      <div className="h-6 border-t border-line bg-[#FDFCFB] dark:bg-[#161618] flex items-center px-3 text-[11px] text-zinc-500">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> All systems normal · window pane · row/col split · [ / ] · ⌘K
        <span className="ml-auto">UI Kit — Button, Card, Input, Composer, Pane, FileBrowser · Vite 6 · Tailwind v4</span>
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onOpenDoc={handleOpenFile} />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-[#262624] text-white text-xs shadow-lg border border-white/10 animate-pulse">
          {toast}
        </div>
      )}
    </div>
  )
}
