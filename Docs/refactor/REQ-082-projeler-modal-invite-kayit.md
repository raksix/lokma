# REQ-082 — Projeler sidebar'da + New Project modal + /invite kayıt

- **Status:** done (canlıda — 2026-09-09)
- **Asked:** (A) session'sız proje de sidebar'da gözüksün, New Project settings-gibi modal açsın; (B) /invite?token= ile şifre belirleyip kayıt.
- **Did A:** sidebar'da PROJECTS bölümü (GET /api/projects — session'sız da listelenir); satır ProjectGroup reuse (expand → cwd eşleşen session'lar, + yeni session, ... menü + entity "Delete project"). New Project butonu modal açar (name+cwd+visibility, server hatası modalda görünür — inline formun "hiçbir şey olmuyor" hissi bitti).
- **Did B:** App gate'den ÖNCE `/invite?token=` yakalar → InvitePage (isim + şifre + tekrar, min 8, eşleşme kontrolü) → accept-invite → full reload ile shell'e. Boş token + sahte token + uyuşmazlık hepsi ele alındı.
- **Proof:** auth probe 61/61, sessions 32/32, tsc 0, build green; E2E: invite form + mismatch + bogus-reject + modal; GERÇEK kayıt: taze invite → isim+şifre → shell (ACCEPT inShell:true). Probe user temizlendi, gerçek invite token'a dokunulmadı.
- **Files:** auth.ts(+test), invite-page.tsx (yeni), App.tsx, project-modal.tsx (yeni), sessions-sidebar.tsx.
