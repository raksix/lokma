import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Settings, Plug2, Layers, Palette, Shield, Boxes, Search, GripVertical, Check, Eye, EyeOff, FlaskConical, Link2 } from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"

const PROVIDERS = [
  { id: "anthropic", name: "Anthropic", base: "https://api.anthropic.com", models: 3, enabled: 3, status: "ok" as const, keySet: true, priority: 0 },
  { id: "openai", name: "OpenAI", base: "https://api.openai.com/v1", models: 6, enabled: 4, status: "ok" as const, keySet: true, priority: 1 },
  { id: "deepseek", name: "DeepSeek", base: "https://api.deepseek.com/v1", models: 2, enabled: 2, status: "ok" as const, keySet: true, priority: 2 },
  { id: "google", name: "Google", base: "https://generativelanguage.googleapis.com", models: 2, enabled: 0, status: "error" as const, keySet: false, priority: 3 },
  { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1", models: 100, enabled: 12, status: "unconfigured" as const, keySet: false, priority: 4 },
  { id: "ollama", name: "Ollama (local)", base: "http://localhost:11434/v1", models: 5, enabled: 5, status: "ok" as const, keySet: false, priority: 5 },
]

const MODELS = [
  { id: "claude-4-sonnet", provider: "anthropic", ctx: "200k", enabled: true, badge: "High" },
  { id: "claude-4-opus", provider: "anthropic", ctx: "200k", enabled: false, badge: "High" },
  { id: "claude-4-haiku", provider: "anthropic", ctx: "200k", enabled: true, badge: "Fast" },
  { id: "gpt-4o", provider: "openai", ctx: "128k", enabled: true, badge: "Flagship" },
  { id: "gpt-4o-mini", provider: "openai", ctx: "128k", enabled: true, badge: "Cheap" },
  { id: "deepseek-chat", provider: "deepseek", ctx: "64k", enabled: true, badge: "Free" },
  { id: "deepseek-reasoner", provider: "deepseek", ctx: "64k", enabled: true, badge: "Reason" },
  { id: "gemini-2.0-flash", provider: "google", ctx: "1M", enabled: false, badge: "Long" },
  { id: "llama3.3", provider: "ollama", ctx: "128k", enabled: true, badge: "Local" },
]

const TABS = [
  { id: "providers", label: "Providers", icon: Plug2 },
  { id: "models", label: "Models", icon: Layers },
  { id: "config", label: "Config", icon: Settings },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "perms", label: "Permissions", icon: Shield },
  { id: "mcp", label: "MCP", icon: Boxes },
] as const

export function SettingsPane() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("providers")
  const [q, setQ] = useState("")
  const [showKey, setShowKey] = useState<string | null>(null)
  const [models, setModels] = useState(MODELS)
  const filteredModels = models.filter(m => !q || m.id.toLowerCase().includes(q.toLowerCase()) || m.provider.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Settings className="w-3 h-3 text-zinc-500" />
        <span className="text-xs font-semibold">Settings</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">providers · models · config · appearance · perms · mcp</span>
      </div>

      <div className="flex items-center gap-1 p-1.5 border-b border-line/60 bg-muted/20 overflow-x-auto shrink-0">
        {TABS.map(t => (
          <Button key={t.id} variant={tab === t.id ? "ink" : "ghost"} size="sm" className="h-6 text-[11px] gap-1.5 whitespace-nowrap" onClick={() => setTab(t.id)}>
            <t.icon className="w-3 h-3" /> {t.label}
          </Button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {tab === "providers" && (
          <div className="p-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">Providers · {PROVIDERS.length} · drag to reorder (priority = fallback order)</span>
              <Button size="sm" className="ml-auto h-6 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Add Provider — dialog yakında" }))}>+ Add Provider</Button>
            </div>
            <div className="space-y-1.5">
              {PROVIDERS.map(p => (
                <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition">
                  <GripVertical className="w-3 h-3 text-zinc-300 cursor-grab" />
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.status === "ok" ? "bg-emerald-500" : p.status === "error" ? "bg-red-500" : "bg-zinc-300"}`} title={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      {p.name} <span className="text-[11px] font-normal text-zinc-400">· {p.enabled}/{p.models} enabled</span>
                      {p.keySet ? <span className="px-1 py-0 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">● keySet</span> : <span className="px-1 py-0 rounded bg-zinc-100 border border-line text-zinc-500 text-[10px]">no key</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1 mt-0.5">
                      <Link2 className="w-3 h-3" /> {p.base}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="relative hidden sm:flex items-center">
                      <Input value={showKey === p.id ? "sk-ant-***-visible-mock" : p.keySet ? "••••••••••••••••" : ""} placeholder={p.keySet ? "••••" : "no key"} readOnly className="h-6 w-[140px] text-[11px] pr-7" />
                      <button onClick={() => setShowKey(showKey === p.id ? null : p.id)} className="absolute right-1 w-5 h-5 grid place-items-center rounded hover:bg-muted">
                        {showKey === p.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                    <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${p.name} test → ${p.status === "ok" ? "✓ ok" : "✗ " + p.status}` }))}>
                      <FlaskConical className="w-3 h-3" /> Test
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Edit ${p.name}` }))}>Edit</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
              Keys encrypted AES-GCM at rest (LOKMA_ENCRYPTION_KEY) — never returned in GET (only keySet: boolean). /api/providers/:id/test pings /v1/models.
            </div>
          </div>
        )}

        {tab === "models" && (
          <div className="p-2 space-y-2">
            <div className="flex items-center gap-1 flex-wrap">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                <Input placeholder="Search models — id / provider..." value={q} onChange={e => setQ(e.target.value)} className="pl-7 h-7 text-xs" />
              </div>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setModels(prev => prev.map(m => ({ ...m, enabled: true })))}>Allow All</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setModels(prev => prev.map(m => ({ ...m, enabled: false })))}>Disable All</Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setQ("")}>Clear</Button>
              <span className="text-[11px] text-zinc-400">{filteredModels.filter(m => m.enabled).length}/{filteredModels.length} enabled</span>
            </div>
            <div className="rounded-lg border border-line overflow-hidden">
              <div className="grid grid-cols-[28px_1fr_90px_60px_70px] gap-1 px-2 py-1.5 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-[11px] font-semibold text-zinc-500">
                <span>☑</span><span>Model</span><span>Provider</span><span>Ctx</span><span>Enabled</span>
              </div>
              <div className="divide-y divide-line/50 max-h-[320px] overflow-auto">
                {filteredModels.map(m => (
                  <label key={m.provider + "::" + m.id} className="grid grid-cols-[28px_1fr_90px_60px_70px] gap-1 px-2 py-1.5 items-center hover:bg-muted/30 cursor-pointer text-xs">
                    <input type="checkbox" checked={m.enabled} onChange={() => setModels(prev => prev.map(x => x.id === m.id ? { ...x, enabled: !x.enabled } : x))} className="accent-[#C96442]" />
                    <span className="font-mono truncate flex items-center gap-1.5">
                      {m.id} <span className="hidden sm:inline px-1 py-0 rounded bg-muted border border-line text-[10px]">{m.badge}</span>
                    </span>
                    <span className={cn("px-1.5 py-0.5 rounded-full border text-[10px] w-fit", m.provider === "anthropic" ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-900 dark:text-blue-300" : m.provider === "openai" ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-300" : "bg-zinc-100 border-line text-zinc-600")}>{m.provider}</span>
                    <span className="text-zinc-500">{m.ctx}</span>
                    <span className={`w-2 h-2 rounded-full justify-self-center ${m.enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  </label>
                ))}
                {filteredModels.length === 0 && <div className="p-4 text-center text-xs text-zinc-400">No matches</div>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Models refresh — fetch all providers in parallel, 5m cache" }))}>Refresh (parallel /v1/models)</Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Fallback chain editor — drag to reorder" }))}>Fallback chain</Button>
            </div>
            <div className="text-[11px] text-zinc-500">Frontend key = `provider::id` — same id on two providers stays distinct. Only enabled models appear in Composer + Ctrl+M.</div>
          </div>
        )}

        {tab === "config" && (
          <div className="p-2 space-y-2 text-xs">
            <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
              <div className="font-semibold">Layered config (priority ↑)</div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 font-mono text-[11px]">
                {[
                  { k: "CLI flags", v: "--model anthropic::claude-4-sonnet", layer: "4 · highest" },
                  { k: "env LOKMA_*", v: "LOKMA_MODEL=deepseek::deepseek-chat", layer: "3" },
                  { k: ".lokma/settings.json", v: '{ "model": "anthropic::sonnet" }', layer: "2 · per-project" },
                  { k: "~/.lokma/config.json", v: '{ "theme": "claude", "maxAgents": 20 }', layer: "1 · user" },
                ].map(r => (
                  <div key={r.k} className="flex gap-2 p-1.5 rounded bg-muted/50 border border-line/50">
                    <span className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line text-[10px] shrink-0">{r.layer}</span>
                    <span className="font-semibold shrink-0">{r.k}</span>
                    <span className="text-zinc-500 truncate">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line p-2.5 bg-[#FDF0E6] dark:bg-[#2A1E15] border-[#F2D5C2]">
              <div className="font-semibold flex items-center gap-1"><Shield className="w-3 h-3" /> credentials.json — AES-256-GCM, 0600, masked</div>
              <div className="mt-1 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">~/.lokma/credentials.json — apiKeyEncrypted never exposed (GET → keySet: true/false). lokma auth &lt;token&gt; → httpOnly cookie + Bearer.</div>
              <div className="mt-2 flex gap-1">
                <Button size="sm" className="h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma doctor — provider hilive · tokens 12k · locks ok · worktree ok" }))}>lokma doctor</Button>
                <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma config — masked GET /api/config" }))}>GET /api/config</Button>
              </div>
            </div>
          </div>
        )}

        {tab === "appearance" && (
          <div className="p-2 space-y-2">
            <div className="text-xs font-medium">Themes — themes/*.json → CSS vars + Chalk tokens</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "claude", name: "Claude", desc: "cream #FAF9F5 + terracotta #C96442", bg: "#FAF9F5", accent: "#C96442", mode: "light" as const },
                { id: "omp", name: "OMP", desc: "near-black + indigo #6366F1", bg: "#0A0A0F", accent: "#6366F1", mode: "dark" as const },
                { id: "midnight", name: "Midnight", desc: "true black #000 + zinc", bg: "#000000", accent: "#27272A", mode: "dark" as const },
                { id: "paper", name: "Paper", desc: "warm paper #FFFBF5 + ink", bg: "#FFFBF5", accent: "#78716C", mode: "light" as const },
              ].map(t => (
                <button key={t.id} onClick={() => { const isDark = t.mode === "dark"; document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("lokma-theme", isDark ? "dark" : "light"); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Theme: ${t.id} — lokma theme set ${t.id}` })) }} className="text-left rounded-lg border border-line p-2.5 hover:border-terracotta/30 hover:shadow-sm transition bg-white dark:bg-[#1E1E21]">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-md border border-line shrink-0" style={{ background: t.bg }} />
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.accent }} />
                    <span className="text-xs font-semibold">{t.name}</span>
                    <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 hidden" />
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1">{t.desc}</div>
                  <div className="text-[11px] font-mono mt-1 text-zinc-400">lokma theme set {t.id}</div>
                </button>
              ))}
            </div>
            <div className="p-2 rounded-md bg-muted/50 border border-dashed border-line text-[11px] text-zinc-500">
              Settings → Appearance live switch — updates document.documentElement.style + localStorage lokma:theme + ~/.lokma/config.json — same tokens CLI (Chalk) + Web (CSS vars).
            </div>
          </div>
        )}

        {tab === "perms" && (
          <div className="p-2 space-y-2 text-xs">
            <div className="rounded-lg border border-line overflow-hidden">
              <div className="px-3 py-2 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line font-medium">Permissions — allow / deny / ask</div>
              <div className="divide-y divide-line/50">
                {[
                  { rule: "Bash: npm *", action: "allow" },
                  { rule: "Bash: rm -rf *", action: "deny" },
                  { rule: "Read: **/*.env", action: "ask" },
                  { rule: "WebFetch: *", action: "allow" },
                ].map(r => (
                  <div key={r.rule} className="flex items-center gap-2 px-3 py-2">
                    <span className="font-mono flex-1">{r.rule}</span>
                    <span className={`px-1.5 py-0.5 rounded-full border text-[11px] ${r.action === "allow" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : r.action === "deny" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>{r.action}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-line overflow-hidden">
              <div className="px-3 py-2 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line font-medium">Hooks — PostToolUse etc.</div>
              <div className="divide-y divide-line/50">
                {[
                  { event: "PostToolUse", matcher: "Edit|Write", cmd: "bun run lint --fix" },
                  { event: "PreToolUse", matcher: "Bash", cmd: "echo $CWD" },
                ].map(h => (
                  <div key={h.event + h.matcher} className="flex items-center gap-2 px-3 py-2 font-mono text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-muted border border-line">{h.event}</span>
                    <span className="text-zinc-500">{h.matcher}</span>
                    <span className="ml-auto truncate">{h.cmd}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "mcp" && (
          <div className="p-2 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium">MCP Servers — 4 transports</span>
              <Button size="sm" className="ml-auto h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Add MCP — stdio/http/sse/ws" }))}>+ Add MCP</Button>
            </div>
            <div className="space-y-1.5">
              {[
                { name: "filesystem", transport: "stdio", cmd: "npx @modelcontextprotocol/server-filesystem", status: "ok", tools: 8 },
                { name: "vault", transport: "stdio", cmd: "lokma mcp serve --vault", status: "ok", tools: 5 },
                { name: "browser", transport: "ws", cmd: "ws://localhost:9222", status: "error", tools: 0 },
              ].map(m => (
                <div key={m.name} className="flex items-center gap-2 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition">
                  <span className={`w-2 h-2 rounded-full ${m.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="font-mono font-medium">{m.name}</span>
                  <span className="px-1 py-0 rounded bg-muted border border-line text-[10px]">{m.transport}</span>
                  <span className="text-[11px] text-zinc-500 truncate flex-1 hidden sm:inline">{m.cmd}</span>
                  <span className="text-[11px] text-zinc-400">{m.tools} tools</span>
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]">Test</Button>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-zinc-500">Same .mcp.json as CLI. Dynamic tools via ToolRegistry — no restart. lokma mcp serve --vault exposes vault as MCP.</div>
          </div>
        )}
      </div>
    </div>
  )
}
