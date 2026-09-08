# REQ-042 — Windowed modda pencereler resize edilebilir olsun

- **Status:** done (2026-09-08, commit below)
- **Asked:** 2026-09-07 — "windowed modunda pencereler resize edilebilir olsun".
- **Interpretation:** Windowed (floating) pencerelerin kenar/köşelerinden sürükleyerek boyutlandırma: min boyut limitli, konum+boyut persist edilir (reload'da korunur, mevcut `winPos` yapısı genişletilir). Sadece windowed mod etkilenir, tiling split oranları aynen kalır.
- **Touched (this run):** `packages/lokma-web/web/src/components/panes/windowed-canvas.tsx` (single SE-corner `WindowResizer` → 8-handle `WindowResizeHandles`: 4 edges + 4 corners, N/W resize moves origin too, shared `WINDOWED_MIN_W/MIN_H` 320×220 clamps, `onResize(id, next: WindowPos)` full-geometry signature, SE handle keyboard arrows+Shift, `WINDOWED_POS_KEY` + `parseWindowedPos` validator export) + `workspace.tsx` (`winPos` lazy-loads from `lokma:windowed-pos:v1`, persists on change, prunes closed panes, clears on reset) + `panes/index.ts` (barrel export).
- **Proof:** root `tsc` 0 + web `tsc --noEmit` 0 + web build green (`index-FtNhj0qf.js`, feature keys in bundle), 8 `role="separator"` handles in source, single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH, served JS contains `windowed-pos` + `nwse-resize`).
- **Commit:** (annotated next)
