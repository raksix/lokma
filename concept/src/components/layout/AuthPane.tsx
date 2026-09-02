import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Shield, KeyRound, Users, Crown, Eye, Lock, UserPlus, LogOut, Check } from "lucide-react"
import { useState } from "react"

const ROLES = [
  { id: "admin", label: "Admin", desc: "Full access — can invite, delete project, manage billing", color: "bg-[#262624] text-white border-[#262624]" },
  { id: "member", label: "Member", desc: "Can create/edit sessions, edit files, run agents", color: "bg-white dark:bg-[#1E1E21] border-line" },
  { id: "viewer", label: "Viewer", desc: "Read-only transcript + vault", color: "bg-zinc-100 border-line text-zinc-600" },
] as const

const PROJECTS = [
  { name: "lokma", visibility: "private" as const, role: "admin" as const, members: 3 },
  { name: "bounty-hunter", visibility: "private" as const, role: "member" as const, members: 2 },
  { name: "lokma-docs", visibility: "public" as const, role: "viewer" as const, members: 12 },
]

const MEMBERS = [
  { name: "Aylin", email: "aylin@lokma.sh", role: "admin" as const, avatar: "https://i.pravatar.cc/100?img=33" },
  { name: "Furkan", email: "furkan@fermag.com.tr", role: "admin" as const, avatar: "https://i.pravatar.cc/100?img=68" },
  { name: "Mira", email: "mira@lokma.sh", role: "member" as const, avatar: "https://i.pravatar.cc/100?img=47" },
]

export function AuthPane() {
  const [authed, setAuthed] = useState(true)
  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member")

  if (!authed) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
        <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
          <Lock className="w-3 h-3 text-zinc-500" />
          <span className="text-xs font-semibold">Auth</span>
          <span className="text-[11px] text-zinc-400">RBAC · JWT · can()</span>
        </div>
        <div className="flex-1 grid place-items-center p-6 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50">
          <div className="w-full max-w-[360px] rounded-xl bg-white dark:bg-[#1E1E21] border border-line p-5 shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-[#262624] text-white grid place-items-center text-xs font-bold mx-auto">◐</div>
            <h3 className="text-center text-sm font-semibold mt-2">Lokma'ya giriş yap</h3>
            <p className="text-center text-xs text-zinc-500 mt-1">lokma auth &lt;token&gt; → httpOnly cookie + Bearer</p>
            <div className="mt-4 space-y-2">
              <div className="relative">
                <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <Input type={showToken ? "text" : "password"} placeholder="Lokma token — lk_..." value={token} onChange={e => setToken(e.target.value)} className="pl-8 pr-8 h-8 text-xs font-mono" />
                <button onClick={() => setShowToken(!showToken)} className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded hover:bg-muted">
                  <Eye className="w-3 h-3 text-zinc-400" />
                </button>
              </div>
              <Button className="w-full h-7 text-xs" onClick={() => { if (token.trim().length > 8) setAuthed(true); else window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "Token gerekli — lk_..." })) }}>
                Giriş yap — verifyJwt
              </Button>
              <Button variant="ghost" size="sm" className="w-full h-6 text-xs" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "lokma auth — CLI'den token üret" }))}>
                CLI'den token al
              </Button>
            </div>
            <div className="mt-3 text-[11px] text-zinc-400 text-center">Tüm /api/* istekleri preHandler ile korunur · 401 → login</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Shield className="w-3 h-3 text-emerald-600" />
        <span className="text-xs font-semibold">Auth</span>
        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] flex items-center gap-1"><Check className="w-3 h-3" /> authenticated</span>
        <span className="hidden sm:inline ml-1 text-[11px] text-zinc-400">admin/member/viewer · project-scoped · session inheritance</span>
        <Button variant="ghost" size="sm" className="ml-auto h-5 text-[11px] gap-1" onClick={() => setAuthed(false)}>
          <LogOut className="w-3 h-3" /> Çıkış
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map(r => (
            <div key={r.id} className={`rounded-lg border p-2.5 ${r.color}`}>
              <div className="text-xs font-semibold flex items-center gap-1">
                {r.id === "admin" ? <Crown className="w-3 h-3" /> : r.id === "member" ? <Users className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {r.label}
              </div>
              <div className="text-[11px] opacity-70 mt-1 leading-4">{r.desc}</div>
              <div className="text-[11px] font-mono mt-1 opacity-60">can('{r.id}', 'project:write') → {r.id === "admin" ? "true" : r.id === "member" ? "scoped" : "false"}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
            Projects — visibility & creation policy
            <span className="ml-auto text-[11px] font-normal text-zinc-400 hidden sm:inline">private default · public → read-only link</span>
          </div>
          <div className="divide-y divide-line/50">
            {PROJECTS.map(p => (
              <div key={p.name} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="font-mono font-medium">{p.name}</span>
                <span className={`px-1.5 py-0.5 rounded-full border text-[10px] ${p.visibility === "private" ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-black" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>{p.visibility}</span>
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-full bg-muted border border-line text-[10px]">{p.role}</span>
                <span className="text-[11px] text-zinc-400 hidden md:inline">{p.members} members</span>
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `can() check — ${p.name} ${p.role}` }))}>can()</Button>
                  <Button variant="outline" size="sm" className="h-5 text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Invite → ${p.name}` }))}>Invite</Button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line overflow-hidden">
          <div className="h-7 flex items-center px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
            Members — session inheritance
            <span className="ml-auto text-[11px] font-normal text-zinc-400">JWT `sub` → session.userId → can() her istekte</span>
          </div>
          <div className="divide-y divide-line/50">
            {MEMBERS.map(m => (
              <div key={m.email} className="flex items-center gap-2 px-3 py-2">
                <img src={m.avatar} alt={m.name} className="w-7 h-7 rounded-full border border-line object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium flex items-center gap-1.5">{m.name} <span className={`px-1 py-0 rounded border text-[10px] ${m.role === "admin" ? "bg-[#262624] text-white border-[#262624]" : "bg-white border-line"}`}>{m.role}</span></div>
                  <div className="text-[11px] text-zinc-400 truncate">{m.email}</div>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `${m.name} role → ${m.role}` }))}>Manage</Button>
              </div>
            ))}
          </div>
          <div className="p-2 border-t border-line/50 bg-muted/20 flex gap-1">
            <Input placeholder="davet@eposta.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="flex-1 h-7 text-xs" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as never)} className="h-7 rounded-md border border-line bg-white dark:bg-[#1E1E21] text-xs px-2">
              <option value="viewer">viewer</option>
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!inviteEmail.includes("@")) return window.dispatchEvent(new CustomEvent("lokma-toast", { detail: "E-posta gerekli" })); window.dispatchEvent(new CustomEvent("lokma-toast", { detail: `Invite ${inviteEmail} as ${inviteRole} — JWT + email` })); setInviteEmail("") }}>
              <UserPlus className="w-3 h-3" /> Invite
            </Button>
          </div>
        </div>

        <div className="p-2 rounded-md bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] text-[11px] leading-4 text-zinc-600 dark:text-zinc-300">
          <span className="font-medium">Flow:</span> <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">lokma auth &lt;token&gt;</code> → httpOnly cookie `lokma_token` + <code className="px-1 py-0 rounded bg-white dark:bg-[#1E1E21] border border-line">Authorization: Bearer</code> fallback → Fastify `preHandler verifyJwt` → `can(user, action, resource)` → 401/403. Session `userId` inherits project membership.
        </div>
      </div>
    </div>
  )
}
