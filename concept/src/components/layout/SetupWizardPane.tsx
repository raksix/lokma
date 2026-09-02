import { Button } from "@/components/ui/button"
import { Terminal, Check, X, Globe, Search, Plug2, Database, HardDrive, Sparkles } from "lucide-react"
import { useState } from "react"

type Opt = { id: string; label: string; desc: string; icon: typeof Globe; defaultOn: boolean; docs: string }
const OPTS: Opt[] = [
  { id: "browser", label: "Browser", desc: "Browser Use / Playwright / CDP — harness can navigate/click/screenshot", icon: Globe, defaultOn: true, docs: "32-§3" },
  { id: "search", label: "Web Search", desc: "SearXNG :8889 → Exa → Brave fallback chain", icon: Search, defaultOn: true, docs: "32-§4" },
  { id: "gateway", label: "Gateway", desc: "Telegram / Discord / Slack / WA / Signal — 35 platforms", icon: Plug2, defaultOn: false, docs: "32-§5" },
  { id: "mcp", label: "MCP Catalog", desc: "70 MCPs — stdio/http/sse/ws, dynamic tools", icon: Plug2, defaultOn: true, docs: "32-§6" },
  { id: "vault", label: "Vault", desc: "memory.fermag.com.tr/lokma · FTS5 + graph", icon: Database, defaultOn: true, docs: "28-29" },
]

export function SetupWizardPane() {
  const [opts, setOpts] = useState<Record<string, boolean>>(() => Object.fromEntries(OPTS.map(o => [o.id, o.defaultOn])))
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const toggle = (id: string) => setOpts(p => ({ ...p, [id]: !p[id] }))
  const doctorLines = [
    "✓ config — ~/.lokma/config.json ok (theme claude, maxAgents 20)",
    "✓ credentials — credentials.json AES-GCM 0600, keySet 3/5",
    "✓ providers — anthropic ok, openai ok, ollama ok (3/6)",
    "✓ models — 9 enabled (sonnet, haiku, gpt-4o...)",
    "✓ vault — FTS5 index 370 notes, lokma folder",
    "✓ worktree — .lokma/worktrees/ clean (0 active)",
    "✓ locks — .agentlocks/ 0 stale",
    "✓ SOUL — 6 personas parseable (builder/reviewer/tester...)",
  ]
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <HardDrive className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Setup</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">lokma init · optional stack · lokma doctor</span>
        <span className="ml-auto flex gap-1">
          <Button variant={step === 1 ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(1)}>1 Init</Button>
          <Button variant={step === 2 ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(2)}>2 Stack</Button>
          <Button variant={step === 3 ? "ink" : "ghost"} size="sm" className="h-5 px-2 text-[11px]" onClick={() => setStep(3)}>3 Doctor</Button>
        </span>
      </div>

      {step === 1 && (
        <div className="flex-1 overflow-auto p-3 space-y-3 bg-[#FAF9F5]/30 dark:bg-[#0F0F11]/30">
          <div className="rounded-xl bg-[#262624] text-white p-4 border border-[#3A3A3E]">
            <div className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-terracotta" /> lokma init</div>
            <p className="text-xs text-white/60 mt-1 leading-5">Optional stack'i seç — Ink TUI checkbox'ları web'de. Her şey isteğe bağlı, sonra <code className="px-1 py-0 rounded bg-white/10 border border-white/10">lokma setup</code> ile değiştirilebilir.</p>
            <div className="mt-3 flex gap-1.5">
              <Button size="sm" className="h-7 text-xs bg-white text-black hover:bg-white/90" onClick={() => setStep(2)}>Başlat — Stack seç →</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-white/70 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma init — repo kökünde .lokma/ oluşturur" }))}>Docs 32</Button>
            </div>
          </div>
          <div className="rounded-lg bg-white dark:bg-[#1E1E21] border border-line p-3">
            <div className="text-xs font-medium">Ne oluşturur?</div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs font-mono">
              {[".lokma/settings.json (per-project)", "~/.lokma/config.json (user)", "~/.lokma/credentials.json (0600 AES-GCM)", "~/.lokma/skills/ + agents/ + vault/"].map(f => (
                <span key={f} className="px-2 py-1.5 rounded bg-muted border border-line/60">{f}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 overflow-auto p-2 space-y-2">
          <div className="text-xs font-medium px-1">Optional stack — lokma init / lokma setup (Ink TUI checkboxes web'de)</div>
          <div className="space-y-1.5">
            {OPTS.map(o => (
              <label key={o.id} className={`flex gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${opts[o.id] ? "bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]" : "bg-white dark:bg-[#1E1E21] border-line hover:border-zinc-300"}`}>
                <input type="checkbox" checked={opts[o.id]} onChange={() => toggle(o.id)} className="mt-0.5 accent-[#C96442]" />
                <o.icon className={`w-4 h-4 mt-0.5 shrink-0 ${opts[o.id] ? "text-terracotta" : "text-zinc-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    {o.label} <span className="text-[11px] font-normal text-zinc-400">· {o.docs}</span>
                    <span className={`ml-auto w-2 h-2 rounded-full ${opts[o.id] ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  </div>
                  <div className="text-xs text-zinc-500 leading-4">{o.desc}</div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex gap-1">
            <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Setup kaydedildi — ${Object.entries(opts).filter(([,v])=>v).map(([k])=>k).join(", ")}` }))}>
              <Check className="w-3 h-3" /> Kaydet — lokma setup
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setOpts(Object.fromEntries(OPTS.map(o => [o.id, false])))}>Hepsini kapat</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpts(Object.fromEntries(OPTS.map(o => [o.id, o.defaultOn])))}>Reset</Button>
          </div>
          <div className="text-[11px] text-zinc-500 px-1">Seçimler `~/.lokma/config.json` → `features` olarak yazılır. Kapalı özellikler pane'de gizlenir ama CLI'da kalır.</div>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-auto p-2">
            <div className="rounded-lg overflow-hidden border border-line bg-[#0F0F11] text-[#EDE9E2] font-mono text-xs">
              <div className="h-7 flex items-center gap-1.5 px-3 bg-[#1E1E21] border-b border-white/10">
                <Terminal className="w-3 h-3 text-emerald-400" /> lokma doctor
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" className="h-5 text-[11px] text-white/60 hover:text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma doctor --agents SOUL/MEMORY/worktree/model/credential/locks" }))}>--agents</Button>
                  <Button variant="ghost" size="sm" className="h-5 text-[11px] text-white/60 hover:text-white hover:bg-white/10" onClick={() => navigator.clipboard.writeText(doctorLines.join("\n"))}>Copy</Button>
                </span>
              </div>
              <div className="p-3 space-y-1 leading-5">
                {doctorLines.map(l => (
                  <div key={l} className={l.startsWith("✓") ? "text-emerald-400" : l.startsWith("✗") ? "text-red-400" : "text-zinc-400"}>{l}</div>
                ))}
                <div className="pt-2 mt-2 border-t border-white/10 flex items-center gap-1 text-white">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> All checks passed · 8/8
                  <span className="ml-auto text-[11px] text-white/50">lokma doctor — layered config + vault + agents probes</span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-2 border-t border-line flex gap-1">
            <Button size="sm" className="flex-1 h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma doctor — tüm katmanlar tarandı" }))}><Terminal className="w-3 h-3" /> Run doctor</Button>
            <Button variant="outline" size="sm" className="flex-1 h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Config watcher — config/changed event yakında" }))}>Watcher</Button>
          </div>
        </div>
      )}
    </div>
  )
}
