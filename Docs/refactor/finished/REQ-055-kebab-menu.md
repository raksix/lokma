# REQ-055 — Süre yazısı yerine dikey "..." menüsü gelsin

- **Status:** done 2026-09-08 (commit pending — kebab menu shipped)
- **Asked:** 2026-09-08 — "burda süren gelince direkt şöyle çıkmayın yerine sürenin yerine ... gelsin dikey şekilde, ona basınca böyle bir context menü gelsin, o şekilde olsun" (2 SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:** Session satırındaki doğrudan yazan süre/metin (`5m` vb.) kalkar; yerine dikey `⋮` (kebab) butonu gelir. Basınca context menü açılır: süre bilgisi + satır aksiyonları (yeniden adlandır, birleştir, pane sekmesi olarak aç, sil...). SS'teki menü içeriği uygulamaya bırakıldı — mevcut hover butonlarındaki aksiyonlar menüye taşınır.
- **Touched (plan):** `components/sessions/sessions-sidebar.tsx` (satır: kebab buton + menü, hover-only yerine tıklamalı menü).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile menü açılıp aksiyonların çalıştığı kanıtlanır, bundle match.
