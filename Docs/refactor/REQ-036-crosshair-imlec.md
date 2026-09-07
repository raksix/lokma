# REQ-036 — Butonların üstüne gelince crosshair imleç olsun

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "tüm butonlara falan gelince crosshair'lı şekil olsun, cross tipi imleç tipi işte" (+ ekran görüntüsü: pane tab strip butonları — +, split, X).
- **Interpretation:** Pane butonları (ve tercihen tüm tıklanabilir aksiyon butonları) üstüne gelince imleç `crosshair` olur (`cursor-crosshair`). Metin alanları `text`, normal buton davranışı isteyen yerler aynen kalır — sadece aksiyon/pane butonları kapsanır (uygulamada liste netleşir).
- **Touched (plan):** `PaneTabBar` butonları + genelleme gerekiyorsa global buton kuralı (dark/light uyumlu, scoped — tüm siteyi etkilemez).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile computed `cursor: crosshair` kanıtlanır, bundle match.
