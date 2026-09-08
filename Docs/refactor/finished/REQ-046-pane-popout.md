# REQ-046 — Pane'de ayrı pencere butonu (sürükle + resize)

- **Status:** done (2026-09-08 — implemented + live verified, close-out commit below)
- **Asked:** 2026-09-08 — "ayrı pencere modu içinde panede bir tuş ekle, ona basınca ayrı pencere olarak alsın, istediğim yere sürükleyebileyim, resize edebileyim".
- **Interpretation:** Her pane şeridine "ayrı pencere" butonu eklenir — basınca o pane windowed modda bağımsız yüzen pencere olur; istenen yere sürüklenir + resize edilir (REQ-042 resize + REQ-014 opaklık ile aynı yüzey). Windowed canvas yoksa açılır.
- **Touched (plan):** `components/panes/pane.tsx` (şerit butonu), `workspace.tsx` (windowed'a taşıma), `windowed-canvas.tsx` (sürükle/resize — REQ-042 ile birleşebilir).
- **Touched (this run):** `panes/pane.tsx` (strip `PictureInPicture2` pop-out button after the split buttons; optional `onPopout` on WorkspacePane + PaneTabBar; full literal Tailwind classes, lucide only) + `panes/workspace.tsx` (`popoutPane`: cascaded 560x420 geometry slot for new windows, `focusPane`, `setWindowed(true)` + toast on first entry; already-windowed keeps geometry and only focuses) + `panes/windowed-canvas.tsx` (stale TilingBar empty-state copy now points at the strip pop-out button). No new state shape: REQ-042 `winPos` persistence + 8-handle drag/resize reused verbatim.
- **Proof:** root `bun x tsc --noEmit` 0 · web `tsc -b && vite build` green (`index-BVymYOmf.js`, `Pop out as a floating window` + `Pane popped out` keys in the served chunk only) · panes probe 96/96 · single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH, `/assets/index-BVymYOmf.js`).
- **Commit:** cc29a89
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile butona basınca yüzen pencere + sürükle + resize kanıtlanır, bundle match.
