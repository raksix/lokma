import { Button } from "@/components/ui/button"
import { Moon, Sun, Search, Globe, Smartphone } from "lucide-react"
import { useEffect, useState } from "react"

export function Header({ onToggleLeft, onToggleRight, onOpenBrowser, onOpenMobile, onSearch }: { onToggleLeft: () => void; onToggleRight: () => void; onOpenBrowser: () => void; onOpenMobile: () => void; onSearch: () => void }) {
  const [dark, setDark] = useState(false)
  const [time, setTime] = useState(() => new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }))
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })), 60000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    const stored = localStorage.getItem("lokma-theme")
    if (stored === "dark") {
      document.documentElement.classList.add("dark")
      setDark(true)
    } else if (stored === "light") {
      document.documentElement.classList.remove("dark")
      setDark(false)
    } else {
      // default light — do not auto-follow system
      document.documentElement.classList.remove("dark")
      setDark(false)
    }
  }, [])
  const toggle = () => {
    const isDark = document.documentElement.classList.toggle("dark")
    localStorage.setItem("lokma-theme", isDark ? "dark" : "light")
    setDark(isDark)
  }
  const toast = (msg: string) => {
    window.dispatchEvent(new CustomEvent("lokma-toast", { detail: msg }))
  }
  return (
    <header className="shrink-0 z-40 bg-[#FAF9F5]/80 backdrop-blur-xl border-b border-line dark:bg-[#0F0F11]/80">
      <div className="w-full px-2 sm:px-3 h-11 flex items-center gap-1.5">
        <Button variant="ghost" size="iconSm" onClick={onToggleLeft} title="Sol panel [">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3v10" stroke="currentColor" strokeWidth="1.2"/></svg>
        </Button>
        <div className="flex items-center gap-2 ml-1">
          <span className="w-6 h-6 rounded-md bg-[#262624] text-white grid place-items-center text-xs font-semibold">◐</span>
          <span className="font-serif text-[17px] hidden sm:block">lokma</span>
          <span className="hidden md:inline-flex px-1 py-0.5 rounded bg-white border border-line text-[9px] tracking-widest uppercase text-zinc-500">harness</span>
        </div>
        <div className="hidden md:flex items-center gap-1 ml-2 text-xs text-zinc-500">
          <span className="w-px h-4 bg-line mx-1" />
          Workspace / <span className="px-2 py-1 rounded-md bg-white border border-line font-medium text-zinc-900">lokma-web</span> <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">● Active</span>
        </div>
        <div className="flex-1 flex justify-center">
          <span className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> main · {time}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="hidden md:inline-flex gap-1.5 text-xs" onClick={onOpenBrowser}>
            <Globe className="w-3 h-3" /> Browser
          </Button>
          <Button variant="outline" size="sm" className="hidden md:inline-flex gap-1.5 text-xs" onClick={onOpenMobile}>
            <Smartphone className="w-3 h-3" /> Mobile
          </Button>
          <Button variant="outline" size="iconSm" onClick={toggle} title="Tema">
            {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="outline" size="iconSm" onClick={onSearch} title="Ara ⌘K">
            <Search className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="iconSm" onClick={onToggleRight} title="Sağ panel ]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3" width="11" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2"/><path d="M10 3v10" stroke="currentColor" strokeWidth="1.2"/></svg>
          </Button>
          <button onClick={() => toast("Profil — yakında")} className="w-6 h-6 rounded-full bg-white border border-line overflow-hidden ml-1 hover:ring-2 hover:ring-terracotta/20 transition">
            <img src="https://i.pravatar.cc/100?img=33" alt="Aylin" className="w-full h-full object-cover" />
          </button>
        </div>
      </div>
    </header>
  )
}
