# REQ-091 — Mobil üst navbar'da sol/sağ menü tuşları

- **Status:** done (2026-09-09)
- **Asked:** 2026-09-09 — "mobil görünümde üst navbarda sol ve sağ menüleri açmak için bir tuş olsun, ona basınca sidebar olarak açılıp kapansın o kısımlar".
- **Interpretation:** mobil header'daki sol/sağ drawer butonları geri gelir: `hideSideToggles` + `noop` kalkar, `onToggleLeft/Right` gerçek `toggleSidebar('left'/'right')` olur (mobil-farkında exclusive drawer — açılan diğerini kapatır). Mobil dala sol/sağ `MobileDrawer` eklenir (swap-aware başlıklar, `leftContent`/`rightContent`, backdrop + Esc + session seçimi kapatır). Swap butonu gizli kalır (`onSwapSides` geçilmez — yer yok). Desktop değişmez.
- **Touched:** `app-shell.tsx` (mobil dal: `noop` silindi, header toggle'ları `toggleSidebar`'a bağlandı, sol/sağ `MobileDrawer` eklendi, dal yorumu güncellendi) + `shell/mobile-single-view.test.ts` (eski `hideSideToggles` assert'i yerine 3 REQ-091 guard'ı)
- **Proof:** mobile-single-view probe 31/31 · web `tsc --noEmit` 0 · web build green (`index-B_THY5Ak.js`) · `pm2 restart lokma-web` online, served `index-B_THY5Ak.js` == disk (BUNDLE-MATCH) · gate `/api/auth/me` 401 ON
- **Verify:** dar viewport'ta üst navbar'da sol/sağ tuşları; basınca ilgili drawer açılır (diğeri kapanır — exclusive), tekrar basınca/arka plana basınca kapanır; desktop değişmez.
