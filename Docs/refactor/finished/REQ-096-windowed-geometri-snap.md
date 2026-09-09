# REQ-096 — Windowed geometri: full-height maximize + taşma yok + edge snap

- **Status:** done (canlıda — 2026-09-09)
- **Asked:** 2026-09-09 — "windowed modda pencere full height almıyor, altı boş kalıyor, fixle. Pencere büyütünce canvas büyüyebileceği alana kadar büyüsün, sidebarların altında kalmasın; orada da windows'daki gibi tiling yapılabilsin" (vision 500 — koddan teşhis).
- **Teşhis:** `onMaximize` sabit `{x:8,y:8,w:1100,h:680}` yazıyor (`workspace.tsx:439`) — viewport Take shorter than screen → alt boş. Sürükleme (`onWinDragStart`) ve resize (`WindowResizeHandles`) kutuya kelepçelenmiyor → pencere canvas dışına/sidebar altına kayabiliyor. Edge-snap yok.
- **Fix:** canvas kutusu ölçülür (ResizeObserver → workspace state); maximize kutuyu doldurur (8px marj); sürükleme+resize kutuya kelepçelenir; bırakırken kenara yakınsa Windows-tipi snap (sol yarı / sağ yarı / üstte maximize). Saf yardımcılar (`clampWindowPos`/`fillWindowPos`/`snapWindowPos`/`snapEdgeForPoint`) + `windowed-canvas.test.ts`.
- **Touched:** `packages/lokma-web/web/src/components/panes/windowed-canvas.tsx`, `workspace.tsx`, `windowed-canvas.test.ts`.
- **Verify:** web build green + test green + canlı: maximize tam doldurur, pencere dışarı taşmaz, kenara sürükle-bırak snap yapar, served bundle hash eşleşir.
- **Proof:** web typecheck 0 + `windowed-canvas.test.ts` 14/14 + build green; served `index-BE4WYpm8.js` disk ile aynı; pm2 lokma-web online, server /health 200.
