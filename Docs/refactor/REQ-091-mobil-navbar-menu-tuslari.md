# REQ-091 — Mobil üst navbar'da sol/sağ menü tuşları

- **Status:** pending
- **Asked:** 2026-09-09 — "mobil görünümde üst navbarda sol ve sağ menüleri açmak için bir tuş olsun, ona basınca sidebar olarak açılıp kapansın o kısımlar".
- **Teşhis (koddan):** mobil dal `MobileSingleView` (`app-shell.tsx:486`) header'a `hideSideToggles` veriyor (481) → `header.tsx:96/106/170` swap + sol/sağ toggle butonlarını gizliyor; ayrıca `mobile-single-view.test.ts:57` bunu assert'liyor. Altyapı HAZIR: `MobileDrawer` sol/sağ mevcut (562/598) + `toggleSidebar` mobil-farkında (`nextSidebarVisibility(..., isMobile)` — exclusive drawer) + `closeDrawers` mevcut. 'yap'ta iş: mobil header'a sol/sağ drawer butonları (mevcut `onToggleLeft`/`onToggleRight` → `toggleSidebar`), `hideSideToggles`'ın sadece swap'i gizlemesi (toggle'lar görünür), test güncellemesi.
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** dar viewport'ta üst navbar'da sol/sağ tuşları; basınca ilgili drawer açılır (diğeri kapanır — exclusive), tekrar basınca/arka plana basınca kapanır; desktop değişmez.
