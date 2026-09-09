# REQ-090 — Pane üstündeki Single/Windowed/Reset kalksın

- **Status:** done (canlıda — 2026-09-09)
- **Asked:** 2026-09-09 — "panellerin üstünde single windowed ve reset var ya, onları kaldır, gerek yok" (ekran görüntüsü; vision servisi 500 — öğeler kullanıcı tarafından isimle netleştirildi).
- **Teşhis:** Üçü de `TilingToggle` kompakt kümesinde (`app-shell.tsx:753-786`, tiling açıkken): Single (single-chat'e çıkış), Windowed (toggle), Reset (`RESET_LAYOUT_EVENT`). Store aksiyonları, event dinleyicileri ve mobile guard (`setTiling(false)`/`setWindowed(false)`) aynen kalır — sadece üç butonun UI'ı kalkar, işlevsel yol kırılmaz. `Square`/`AppWindow`/`RotateCcw` importları başka yerde kullanılmıyorsa temizlenir (`LayoutGrid` entry butonunda kalır).
- **Touched:** `packages/lokma-web/web/src/components/app-shell.tsx`.
- **Verify:** web build green + canlı bundle'da Single/Windowed/Reset yazıları yok + tiling entry ("Tiling workspace") duruyor + mobile guard testi geçiyor.
- **Proof:** web build green; taze `index-DgqtuwbD.js`'de 4 benzersiz buton başlığı 0 eşleşme (eski chunk'larda 1 — `emptyOutDir:false` birikimi, normal); served `index.html` → `index-DgqtuwbD.js`; shell testi 29/29; pm2 lokma-web restart online.
