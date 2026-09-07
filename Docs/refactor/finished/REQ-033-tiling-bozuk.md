# REQ-033 — Pane tiling sistemi çalışmıyor (concept'te çalışıyordu)

- **Status:** done (commit aşağıda, live 2026-09-07 — kullanıcı "düzelt" dedi, implemente edildi)
- **Asked:** 2026-09-07 — "pane tiling sistemi çalışmıyor, concept'te çalışıyordu, oradan bak düzelt".
- **Interpretation:** Tiling workspace (split/sürükle-bırak pane'ler) şu an bozuk; frozen `concept/` referans alınarak fark bulunup düzeltilir (concept'e DOKUNULMAZ, sadece okunur).
- **Diagnosis (canlı kanıtlı):** Concept'te split butonu ANINDA böler (`splitPane` direkt); harness'ta buton "arm" edip içerik seçilmesini bekliyordu — tıklayınca pane sayısı 3→3 kalıyordu (headless repro). Ek olarak TilingBar/+Pane akışları sağlamdı (3→4→5 doğrulandı).
- **Fix:** Concept paritesi — split butonları (`Columns2`/`Rows2`) artık `onSplitEmpty` ile ANINDA boş pane açar (yeni pane'de canlı picker), `splitArm` iki-adımlı akış + `splitArmed` prop'u tamamen kaldırıldı (drop-edge split ve chooser aynen durur).
- **Touched:** `components/panes/pane.tsx` (`onSplitEmpty`, splitArm temizliği), `components/panes/workspace.tsx` (`splitEmpty`).
- **Proof:** headless split tıklaması 3→4 pane ANINDA, 0 pageerror; panes 87/87; web+root `tsc` 0; build green (`index-CJYSO8tD.js`); live bundle == disk index.html; `/` 401 anon/200 authed, `/health` 200.
