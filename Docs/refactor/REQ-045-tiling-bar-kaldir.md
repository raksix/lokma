# REQ-045 — Tiling üst menü çubuğu kaldırılsın

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "tiling kısmından yukarıdaki bu menüyü kaldır, bence gerek yok, otomatik single ve tiling otomatik açılıyor zaten" (SS'e bakılamadı — görüntü servisi 500 — ama TilingBar koddan biliniyor).
- **Interpretation:** Tiling workspace'in üstündeki `TilingBar` şeridi (Tiling etiketi, sayaç, 20 araç butonu, + Pane, Windowed, Save, Reset, Single) tamamen kaldırılır — single/tiling geçişleri zaten otomatik olduğu için gereksiz. Araç açma rail ikonlarından, pane ekleme/bölme pane şeridinden yapılır.
- **Touched (plan):** `components/panes/workspace.tsx` (TilingBar render'ı), `tiling-bar.tsx` (ölü kalırsa silinir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile şeridin DOM'da olmadığı + geçişlerin çalıştığı kanıtlanır, bundle match.
