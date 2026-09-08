# REQ-047 — Pane çift-tık büyütme şimdilik kaldırılsın (bozuk)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "pane'e 2 kere tıklayınca pane genişlemesi taşıyor falan, alttan boşluk kalıyor, yanlış oluyor, onu kaldıralım şu anlık".
- **Interpretation:** Pane gövdesine çift tıklayınca olan maximize (`maximized` state — 1024×640 sabit boyut) taşma + alttan boşluk bırakıyor. Şimdilik çift-tık handler'ı tamamen kaldırılır (tek tık focus aynen kalır). Düzgün maximize daha sonra ayrı iş olarak ele alınır.
- **Touched (plan):** `components/panes/pane.tsx` (`onDoubleClick` + `maximized` state'i).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile çift tıkta boyut değişmediği kanıtlanır, bundle match.
