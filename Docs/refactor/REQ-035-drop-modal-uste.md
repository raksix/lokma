# REQ-035 — Dropped session modali alta sıkışıyor, üste çıkar

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "dropped session modali sıkışıp alta kalıyor, üste çıkar onu" (+ ekran görüntüsü: Dropped session dialog — Open here / Split / Fork here / Merge / Cancel).
- **Note:** SS'te modal ortada düzgün görünüyor — sorun dar/kısa pane'lerde: dialog pane altına sıkışıyor ya da içerik altında kalıyor. Fix yönü: `SessionDropChooser` overlay'i pane içinde ortalı + üstte tutulur (yüksek z-index, `max-h` + iç scroll, küçük pane'de kompakt padding), hangi pane'e bırakıldıysa onun üstünde açılır.
- **Touched (plan):** `components/panes/pane.tsx` (`SessionDropChooser` konum/z-index/boyut).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile dar pane'e drop'ta modalın tam görünür olduğu SS ile kanıtlanır, bundle match.
