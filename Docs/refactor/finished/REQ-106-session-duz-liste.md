# REQ-106 — Session'lar kutucuktan çıksın, düz liste dursun

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** 2026-09-10 — "sessionları kutucuklardan çıkar. Bunun gibi dursun." (2 ekran görüntüsü; vision 500 — tariften: kart Kutular yerine düz satırlar.)
- **Teşhis:** `SessionRow` kart kutusu (`sessions-sidebar.tsx:143` — `rounded-md border bg-white`), liste `space-y-1` aralıklı (578). Fix: satırlar bordersız düz satır (hover `bg-muted`, aktif `bg-terracotta/10`), liste `divide-y` çizgili. Sürükleme/kebab/sağ-tık menüleri aynen kalır.
- **Touched:** `packages/lokma-web/web/src/components/sessions/sessions-sidebar.tsx`.
- **Verify:** build green + canlı: session'lar kutusuz düz satır, hover/active belli, menüler çalışır; served bundle hash.
- **Proof:** build green; served `index-CY_n3_yV.js` disk ile aynı; satır `rounded-md border bg-white` → bordersız tint; iki liste kabı `divide-y` (proje + zaman grupları); sürükleme/kebab/sağ-tık dokunulmadı.
