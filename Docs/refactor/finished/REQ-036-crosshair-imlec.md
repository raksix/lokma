# REQ-036 — Butonların üstüne gelince crosshair imleç olsun

- **Status:** done (live 2026-09-07 — implemente edildi, bundle-match + computed-style kanıtlı)
- **Asked:** 2026-09-07 — "tüm butonlara falan gelince crosshair'lı şekil olsun, cross tipi imleç tipi işte" (+ ekran görüntüsü: pane tab strip butonları — +, split, X).
- **Interpretation:** Pane butonları (ve tercihen tüm tıklanabilir aksiyon butonları) üstüne gelince imleç `crosshair` olur (`cursor-crosshair`). Metin alanları `text`, normal buton davranışı isteyen yerler aynen kalır — sadece aksiyon/pane butonları kapsanır (uygulamada liste netleşir).
- **Touched (plan):** `PaneTabBar` butonları + genelleme gerekiyorsa global buton kuralı (dark/light uyumlu, scoped — tüm siteyi etkilemez).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile computed `cursor: crosshair` kanıtlanır, bundle match.
- **Fix:** `web/src/index.css` — tek kural `button:not(:disabled):not(.cursor-default) { cursor: crosshair; }` (mevcut `.crosshair` yardımcısının yanına). Shared `Button` dahil tüm `<button>` öğelerini kapsar (84 raw + tüm Button kullanımları); `:disabled` hariç (varsayılan imleç kalır), mobil drawer backdrop'u (`cursor-default`) hariç; div tabanlı satırlar, resize handle'lar, drag-grab yüzeyleri ve metin alanları etkilenmez. Dark/light uyumlu (imleç renkten bağımsız).
- **Proof:** web `tsc --noEmit` 0 hata, `vite build` green (`index-DnW93hdo.js`), `pm2 restart lokma-web` online, served==disk BUNDLE-MATCH, headless computed-style: 118 butonun tamamı `crosshair`, metin alanı `text`, kural served CSS'te doğrulandı.
