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
import { UsagePane } from "@/components/layout/UsagePane"
import { SettingsPane } from "@/components/layout/SettingsPane"
import { SkillsPane } from "@/components/layout/SkillsPane"
import { TestingPane } from "@/components/layout/TestingPane"
import { BotsPane } from "@/components/layout/BotsPane"
import { AgentHubPane } from "@/components/layout/AgentHubPane"
import { AuthPane } from "@/components/layout/AuthPane"
import { SetupWizardPane } from "@/components/layout/SetupWizardPane"
import { PluginMarketplacePane } from "@/components/layout/PluginMarketplacePane"
import { ObservabilityPane } from "@/components/layout/ObservabilityPane"
import { CronApprovalsPane } from "@/components/layout/CronApprovalsPane"
import { ExtrasPane } from "@/components/layout/ExtrasPane"
import { Composer } from "@/components/layout/Composer"
import { FooterBar, Toast, CollapseButton, ResizeHandle } from "@/components/layout/ShellParts"
import { HeroSection } from "@/components/chat/HeroSection"
import { SingleChatView } from "@/components/chat/SingleChatView"
import { TilingBar } from "@/components/panes/TilingBar"
import { SplitTree } from "@/components/panes/SplitTree"
import { WindowedCanvas } from "@/components/panes/WindowedCanvas"

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
    sizes: [33, 34, 33],
    children: [
      { type: "pane", id: "a" },
      { type: "pane", id: "center" },
      { type: "pane", id: "empty" },
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
    setLayout({ type: "split", id: "root", dir: "row", sizes: [33, 34, 33], children: [{ type: "pane", id: "a" }, { type: "pane", id: "center" }, { type: "pane", id: "empty" }] })
    setExtraPanes([])
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Layout sıfırlandı — 3 pane image" }))
  }

  useEffect(() => {
    const h = (e: Event) => {
      const msg = (e as CustomEvent).detail as string
      setToast(msg)
      setTimeout(() => setToast(null), 1600)
    }
    window.addEventListener("lokma-toast", h as EventListener)
    const onClosePane = (e: Event) => {
      const id = (e as CustomEvent).detail as string
      if (id) closePane(id)
    }
    window.addEventListener("lokma-close-pane", onClosePane as EventListener)
    return () => {
      window.removeEventListener("lokma-toast", h as EventListener)
      window.removeEventListener("lokma-close-pane", onClosePane as EventListener)
    }
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
    const recur = (node: LayoutNode): LayoutNode | null => {
      if (node.type === "pane") return node.id === targetId ? null : node
      const children = node.children.map(recur).filter(Boolean) as LayoutNode[]
      if (children.length === 0) return null
      if (children.length === 1) return children[0]
      const sizes = node.sizes.slice(0, children.length)
      while (sizes.length < children.length) sizes.push(100 / children.length)
      const sum = sizes.reduce((a, b) => a + b, 0)
      return { ...node, children, sizes: sizes.map(s => (s / sum) * 100) }
    }
    setLayout(prev => {
      const next = recur(prev)
      if (!next) {
        const nid = genId()
        setExtraPanes(p => [...p, { id: nid, title: `Pane ${nid.slice(2,6)}`, content: <div className="p-6 text-center text-sm text-zinc-500">Yeni pane — kapatılan yerine açıldı</div> }])
        setFocusedPane(nid)
        window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Son pane kapatılamaz — yeni pane açıldı" }))
        return { type: "pane", id: nid }
      }
      return next as LayoutNode
    })
    setExtraPanes(prev => prev.filter(p => p.id !== targetId))
    setWindowPos(prev => {
      const n = { ...prev }
      delete n[targetId]
      return n
    })
    if (focusedPane === targetId) {
      setTimeout(() => {
        const allIds = ["a", "b", ...extraPanes.map(p => p.id)].filter(id => id !== targetId)
        if (allIds.length) setFocusedPane(allIds[0])
      }, 0)
    }
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Pane kapatıldı: ${targetId}` }))
  }

  const handleOpenTab = (title: string, content: React.ReactNode) => {
    if (!tiling) setTiling(true)
    const id = genId()
    ensureWindowPos(id)
    setExtraPanes(prev => [...prev, { id, title, content }])
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

  const renderPaneById = (id: string) => {
    if (id === "a") return <Pane key={id} id={id} initialTabs={[{ id: "tab-a-1", title: "auth.ts", content: <div className="space-y-3"><div className="text-xs text-zinc-500">File dropped: <span className="font-medium text-ink">auth.ts</span></div><div className="rounded-lg overflow-hidden border border-line bg-white dark:bg-[#1E1E21]"><div className="px-3 py-2 text-xs font-mono bg-muted/30 border-b border-line">export const dropped = true;</div></div></div> }]} isFocused={focusedPane === id} onFocus={() => setFocusedPane(id)} onClosePane={() => closePane(id)} onSplit={(dir, pos) => splitPane(id, dir, pos)} />
    if (id === "center") return <div key={id} className="flex-1 flex flex-col bg-[#FDE8E8] dark:bg-[#2A1E1E] border border-[#FECACA] dark:border-[#3A2A2A] rounded-lg overflow-hidden"><div className="h-7 flex items-center gap-1.5 px-2 bg-white/50 dark:bg-white/5 border-b border-[#FECACA] dark:border-[#3A2A2A] text-xs"><span className="w-4 h-4 grid place-items-center rounded bg-white border border-line">←</span> Sola böl <span className="ml-auto px-1.5 py-0.5 rounded bg-white border border-line text-[11px]">ALT</span></div><div className="flex-1 grid place-items-center text-xs text-zinc-500">Context/Alternate View — peach</div></div>
    if (id === "empty") return <div key={id} className="flex-1 flex flex-col bg-white dark:bg-[#161618] border border-line rounded-lg overflow-hidden"><div className="h-7 flex items-center gap-1 px-2 border-b border-line/60 bg-[#FDFCFB] dark:bg-[#161618]"><span className="w-6 h-6 grid place-items-center rounded hover:bg-muted cursor-pointer">+</span><span className="ml-auto flex gap-1"><span className="w-6 h-6 grid place-items-center rounded hover:bg-muted">▦</span><span className="w-6 h-6 grid place-items-center rounded hover:bg-muted">×</span></span></div><div className="flex-1 grid place-items-center text-xs text-zinc-400">Boş pane — sürükle bırak</div></div>
    if (id === "b") return <Pane key={id} id={id} initialTabs={[{ id: "tab-b-1", title: "auth.ts", content: <CodePaneContent /> }]} isFocused={focusedPane === id} onFocus={() => setFocusedPane(id)} onClosePane={() => closePane(id)} onSplit={(dir, pos) => splitPane(id, dir, pos)} />
    const extra = extraPanes.find(p => p.id === id)
    if (extra) return <Pane key={id} id={id} initialTabs={[{ id: `tab-${id}-1`, title: extra.title, content: extra.content }]} isFocused={focusedPane === id} onFocus={() => setFocusedPane(id)} onClosePane={() => closePane(id)} onSplit={(dir, pos) => splitPane(id, dir, pos)} />
    if (id === "browser") return <BrowserPane key={id} onClose={() => setShowBrowser(false)} />
    if (id === "mobile") return <MobilePane key={id} onClose={() => setShowMobile(false)} />
    return <div key={id} className="p-3 text-xs">Pane {id} not found</div>
  }

  const handleResizeLayout = (nodeId: string, sizes: number[]) => {
    setLayout(prev => {
      const update = (n: LayoutNode): LayoutNode => {
        if (n.type === "pane") return n
        if (n.id === nodeId) return { ...n, sizes }
        return { ...n, children: n.children.map(update) }
      }
      return update(prev)
    })
  }

  const windowedPanes = [
    { id: "a", node: renderPaneById("a") },
    { id: "b", node: renderPaneById("b") },
    ...extraPanes.map(p => ({ id: p.id, node: renderPaneById(p.id) })),
    ...(showBrowser ? [{ id: "browser", node: <BrowserPane onClose={() => setShowBrowser(false)} /> }] : []),
    ...(showMobile ? [{ id: "mobile", node: <MobilePane onClose={() => setShowMobile(false)} /> }] : []),
  ]

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#FAF9F5] dark:bg-[#0F0F11] text-ink dark:text-white">
      <Header
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        onOpenBrowser={() => { if (!tiling) setTiling(true); setShowBrowser(true); ensureWindowPos("browser") }}
        onOpenMobile={() => { if (!tiling) setTiling(true); setShowMobile(true); ensureWindowPos("mobile") }}
        onSearch={() => setSearchOpen(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!leftCollapsed && (
          <div id="pane-left-wrap" style={{ width: leftW }} className="shrink-0 flex">
            <SidebarLeft onOpenTab={handleOpenTab} />
          </div>
        )}
        {!leftCollapsed && <ResizeHandle side="left" onMouseDown={e => startDrag(e, "left")} onDoubleClick={() => setLeftCollapsed(true)} />}
        {leftCollapsed && <CollapseButton side="left" onOpen={() => setLeftCollapsed(false)} />}

        <main className="flex-1 min-w-0 flex flex-col bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden">
          {!tiling ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div ref={singleScrollRef} className="flex-1 overflow-y-auto">
                <div className="max-w-[820px] mx-auto w-full px-4 sm:px-5 py-5">
                  <HeroSection onOpenTab={handleOpenTab} />
                  <div className="mt-6">
                    <SingleChatView
                      scrollRef={singleScrollRef}
                      aylinText={singleAylinText}
                      draft={singleAylinDraft}
                      editing={editingSingle}
                      onDraftChange={setSingleAylinDraft}
                      onCancel={() => { setEditingSingle(false); setSingleAylinDraft(singleAylinText) }}
                      onSave={() => { setSingleAylinText(singleAylinDraft); setEditingSingle(false); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Prompt güncellendi — rewind ile yeniden gönder" })) }}
                      onEdit={() => { setSingleAylinDraft(singleAylinText); setEditingSingle(true) }}
                      onRewind={() => { document.getElementById("single-msg-lokma")?.scrollIntoView({ behavior: "smooth" }); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Rewind: bu mesaja sarıldı — sonraki mesajlar gizlendi" })) }}
                      onCopy={() => { navigator.clipboard.writeText(singleAylinText); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Kopyalandı" })) }}
                      onOpenTab={handleOpenTab}
                      onFork={handleForkFrom}
                      CodePane={<CodePaneContent />}
                    />
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
              <TilingBar
                windowed={windowed}
                onToggleWindowed={() => setWindowed(!windowed)}
                onAddPane={() => {
                  const id = genId(); ensureWindowPos(id);
                  setExtraPanes(p => [...p, { id, title: `Pane ${id.slice(2,6)}`, content: <div className="p-3">Yeni pane — altına/yanına böl</div> }]);
                  setLayout(prev => ({ type: "split", id: "root", dir: "row", sizes: [...(prev.type==="split"?prev.sizes:[]), 50].map((s,i,a)=>s/a.reduce((x,y)=>x+y,0)*100), children: [...(prev.type==="split"?prev.children:[prev]), { type: "pane", id }] } as LayoutNode))
                }}
                onOpenTerminal={() => handleOpenTab("Terminal", <TerminalPane />)}
                onOpenAgents={() => handleOpenTab("Orchestration", <OrchestrationPane />)}
                onOpenGit={() => handleOpenTab("Git", <GitPane />)}
                onOpenVault={() => handleOpenTab("Vault", <VaultPane />)}
                onOpenArchify={() => handleOpenTab("Archify", <ArchifyPane />)}
                onOpenDesign={() => handleOpenTab("Design", <DesignStudioPane />)}
                onOpenUsage={() => handleOpenTab("Usage", <UsagePane />)}
                onOpenSettings={() => handleOpenTab("Settings", <SettingsPane />)}
                onOpenSkills={() => handleOpenTab("Skills", <SkillsPane />)}
                onOpenTesting={() => handleOpenTab("Testing Lab", <TestingPane />)}
                onOpenBots={() => handleOpenTab("Bots", <BotsPane />)}
                onOpenHub={() => handleOpenTab("Agent Hub", <AgentHubPane />)}
                onOpenAuth={() => handleOpenTab("Auth", <AuthPane />)}
                onOpenSetup={() => handleOpenTab("Setup", <SetupWizardPane />)}
                onOpenPlugins={() => handleOpenTab("Plugins", <PluginMarketplacePane />)}
                onOpenObservability={() => handleOpenTab("Observability", <ObservabilityPane />)}
                onOpenCron={() => handleOpenTab("Cron & Approvals", <CronApprovalsPane />)}
                onOpenExtras={() => handleOpenTab("Extras", <ExtrasPane />)}
                onSave={saveLayout}
                onReset={resetLayout}
                onSingle={() => setTiling(false)}
              />
              <div className={`flex flex-1 min-h-0 overflow-hidden ${windowed ? "relative bg-[#FAF9F5] dark:bg-[#0F0F11] p-2 gap-2" : ""}`}>
                {windowed ? (
                  <WindowedCanvas
                    panes={windowedPanes}
                    windowPos={windowPos}
                    focusedPane={focusedPane}
                    onDragStart={startWindowDrag}
                    onResize={(id, w, h) => setWindowPos(prev => ({ ...prev, [id]: { ...prev[id], w, h } }))}
                    onMaximize={id => setWindowPos(prev => ({ ...prev, [id]: { ...prev[id], x: 8, y: 8, w: 480, h: 520 } }))}
                    onClose={closePane}
                  />
                ) : (
                  <SplitTree node={layout} renderPane={renderPaneById} onResize={handleResizeLayout} />
                )}
              </div>
            </div>
          )}
        </main>

        {rightCollapsed ? (
          <CollapseButton side="right" onOpen={() => setRightCollapsed(false)} />
        ) : (
          <>
            <ResizeHandle side="right" onMouseDown={e => startDrag(e, "right")} onDoubleClick={() => setRightCollapsed(true)} />
            <div id="pane-right-wrap" style={{ width: rightW }} className="shrink-0 hidden xl:flex">
              <FileBrowser onOpenFile={handleOpenFile} />
            </div>
          </>
        )}
      </div>

      <FooterBar />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} onOpenDoc={handleOpenFile} />
      <Toast msg={toast} />
    </div>
  )
}
