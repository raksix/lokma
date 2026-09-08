# REQ-047 — Pane çift-tık büyütme şimdilik kaldırılsın (bozuk)

- **Status:** done (2026-09-08 — implemented + live verified, close-out commit below)
- **Asked:** 2026-09-08 — "pane'e 2 kere tıklayınca pane genişlemesi taşıyor falan, alttan boşluk kalıyor, yanlış oluyor, onu kaldıralım şu anlık".
- **Interpretation:** Pane gövdesine çift tıklayınca olan maximize (`maximized` state — 1024×640 sabit boyut) taşma + alttan boşluk bırakıyor. Şimdilik çift-tık handler'ı tamamen kaldırılır (tek tık focus aynen kalır). Düzgün maximize daha sonra ayrı iş olarak ele alınır.
- **Touched (plan):** `components/panes/pane.tsx` (`onDoubleClick` + `maximized` state'i).
- **Touched (this run):** `packages/lokma-web/web/src/components/panes/pane.tsx` (removed `maximized` state + `onDoubleClick` toggle + fixed `1024x640` style override; `onMouseDown` focus untouched). Concept prototype untouched (dead tree, no `maximized` wiring changed there).
- **Proof:** root `bun x tsc --noEmit` 0 · web `tsc --noEmit` 0 · web `tsc -b && vite build` green (`index-DtWigJ48.js`) · concept build green · single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH, `/assets/index-DtWigJ48.js`). Headless proof: tiling view 3 panes, dblclick on pane body → size unchanged (194x600 → 194x600, no inline width/height stamped).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile çift tıkta boyut değişmediği kanıtlanır, bundle match.
