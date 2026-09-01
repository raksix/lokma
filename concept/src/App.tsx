import { useState } from "react"
import { Header } from "@/components/layout/Header"
import { SidebarLeft } from "@/components/layout/SidebarLeft"
import { FileBrowser } from "@/components/layout/FileBrowser"
import { Pane, CodePaneContent } from "@/components/layout/Pane"
import { BrowserPane } from "@/components/layout/BrowserPane"
import { MobilePane } from "@/components/layout/MobilePane"
import { Composer } from "@/components/layout/Composer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type PaneData = { id: string; title: string; content: React.ReactNode }

export default function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [tiling, setTiling] = useState(false)
  const [windowed, setWindowed] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showMobile, setShowMobile] = useState(false)
  const [focusedPane, setFocusedPane] = useState<string>("a")
  const [extraPanes, setExtraPanes] = useState<PaneData[]>([])

  const handleOpenTab = (title: string, content: React.ReactNode) => {
    if (!tiling) setTiling(true)
    // find focused pane and add tab via DOM (since Pane manages its own tabs via internal state, we need to use a different approach)
    // For now, add as extra pane
    const id = `extra-${Date.now()}`
    setExtraPanes(prev => [...prev, { id, title, content }])
    setFocusedPane(id)
  }

  const handleOpenFile = (name: string) => {
    handleOpenTab(name, <div className="font-mono text-xs p-3">File preview: {name}<pre className="mt-2 p-2 bg-muted rounded border border-line">export const demo = true;</pre></div>)
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#FAF9F5] dark:bg-[#0F0F11] text-ink dark:text-white">
      <div className="w-full bg-[#262624] text-[#FAF9F5] text-[11px] h-7 flex items-center px-3 shrink-0">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-terracotta" /> Vite 6 + React 19 + Tailwind v4 — Concept · UI Kit
        </span>
        <span className="hidden sm:inline-flex items-center gap-2 text-white/60 ml-2">
          <span className="w-px h-3 bg-white/20" /> cream #FAF9F5 · terracotta #C96442 · component-based
        </span>
        <span className="ml-auto hidden md:flex items-center gap-1.5 text-[10px]">
          <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">Pane system</span>
          <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">UI Kit</span>
        </span>
      </div>

      <Header
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        onOpenBrowser={() => {
          if (!tiling) setTiling(true)
          setShowBrowser(true)
        }}
        onOpenMobile={() => {
          if (!tiling) setTiling(true)
          setShowMobile(true)
        }}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!leftCollapsed && <SidebarLeft onOpenTab={handleOpenTab} />}
        <div className="w-px bg-line dark:bg-[#232326] shrink-0 hidden xl:block" />

        <main className="flex-1 min-w-0 flex flex-col bg-[#FAF9F5] dark:bg-[#0F0F11] overflow-hidden">
          {!tiling ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto">
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
                  <p className="mt-2 text-[13px] text-zinc-500">Start with a brief. Lokma will scaffold the plan, run tools, and keep an inspectable trail.</p>

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

                  <div className="mt-6 space-y-4">
                    <Card className="p-3">
                      <div className="text-xs font-semibold">Aylin</div>
                      <div className="text-sm mt-1">Let's refactor the auth middleware. Move JWT verification into a Fastify <code className="px-1 py-0.5 rounded bg-muted border border-line text-xs">preHandler</code> hook.</div>
                    </Card>
                    <Card className="p-3 bg-[#262624] text-white dark:bg-[#1E1E21]">
                      <div className="text-xs font-semibold">Lokma — Claude 4 Sonnet</div>
                      <div className="text-sm mt-1">Perfect — one hook, one decorator, zero magic.</div>
                    </Card>
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
              <div className="h-8 flex items-center gap-2 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#161618] shrink-0">
                <span className="px-2 py-1 rounded-md bg-[#262624] text-white text-xs">Tiling</span>
                <span className="text-xs text-zinc-500 hidden sm:inline">pane’leri sürükle · tab olarak aç · windowed ile serbest yerleştir</span>
                <span className="ml-auto flex gap-1.5">
                  <Button variant={windowed ? "ink" : "outline"} size="sm" className="h-6 text-xs gap-1" onClick={() => setWindowed(!windowed)}>
                    Windowed
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setExtraPanes(p => [...p, { id: `pane-${Date.now()}`, title: `Pane ${p.length + 1}`, content: <div className="p-3">Yeni pane — sürükle, resize et, tab ekle</div> }])}>
                    + Pane
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setTiling(false)}>
                    Tekil
                  </Button>
                </span>
              </div>
              <div className={`flex flex-1 min-h-0 overflow-hidden ${windowed ? "relative bg-[#FAF9F5] dark:bg-[#0F0F11] p-2 gap-2" : ""}`}>
                <Pane id="a" initialTabs={[{ id: "tab-a-1", title: "Chat #482", content: <div className="space-y-3"><Card className="p-3"><div className="text-xs font-semibold">Aylin</div><div className="text-sm mt-1">Refactor auth middleware</div></Card><Card className="p-3 bg-[#262624] text-white"><div className="text-xs font-semibold">Lokma</div><div className="text-sm mt-1">One hook, one decorator.</div></Card></div> }]} isFocused={focusedPane === "a"} onFocus={() => setFocusedPane("a")} onClosePane={() => {}} onSplit={() => setExtraPanes(p => [...p, { id: `pane-${Date.now()}`, title: "Split pane", content: <div className="p-3">Split pane</div> }])} />
                <div className="w-1.5 bg-line hover:bg-[#CFC9BF] cursor-col-resize shrink-0 hidden lg:flex items-center justify-center">
                  <span className="w-0.5 h-7 bg-zinc-300 rounded-full" />
                </div>
                <Pane id="b" initialTabs={[{ id: "tab-b-1", title: "auth.ts", content: <CodePaneContent /> }]} isFocused={focusedPane === "b"} onFocus={() => setFocusedPane("b")} onClosePane={() => {}} onSplit={() => setExtraPanes(p => [...p, { id: `pane-${Date.now()}`, title: "Split pane", content: <div className="p-3">Split</div> }])} />
                {extraPanes.map(pane => (
                  <Pane key={pane.id} id={pane.id} initialTabs={[{ id: `tab-${pane.id}-1`, title: pane.title, content: pane.content }]} isFocused={focusedPane === pane.id} onFocus={() => setFocusedPane(pane.id)} onClosePane={() => setExtraPanes(prev => prev.filter(p => p.id !== pane.id))} onSplit={() => {}} />
                ))}
                {showBrowser && <BrowserPane onClose={() => setShowBrowser(false)} />}
                {showMobile && <MobilePane onClose={() => setShowMobile(false)} />}
              </div>
            </div>
          )}
        </main>

        <div className="w-px bg-line dark:bg-[#232326] shrink-0 hidden xl:block" />
        {!rightCollapsed && <FileBrowser onOpenFile={handleOpenFile} />}
      </div>

      <div className="h-6 border-t border-line bg-[#FDFCFB] dark:bg-[#161618] flex items-center px-3 text-[11px] text-zinc-500">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> All systems normal
        <span className="ml-auto">UI Kit — Button, Card, Input, Composer, Pane, FileBrowser · Vite 6 · Tailwind v4</span>
      </div>
    </div>
  )
}
