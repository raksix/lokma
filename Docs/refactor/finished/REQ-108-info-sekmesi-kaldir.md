# REQ-108 — Info sekmesi (i) kalksın

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** 2026-09-10 — "bu i gereksiz galiba kaldır" (info sekmesi; stack bilgisi gösteren ekran. Vision ölü + OCR boş + ASCII'de koyu kart olduğu için kullanıcıya soruldu, "info sekmesi" dendi.)
- **Teşhis:** rail'deki "i" = `INSPECTOR_RAIL_ITEMS` girdisi (`inspector-rail.tsx:25`). Kaldırma: rail girdisi + `INSPECTOR_TABS` kayıt girdisi (`panes.ts:41`) + tüm `?? 'info'` / default `'info'` varsayılanları → `'files'` (inspector-panel, mobile-single-view, app-shell ×2) + host dalı + ikon + rail testi (24→23). Tip birliği `RailDropId` üzerinden tutarlı tutuldu (registry'den değil birlikten türedi); eski info drag/sekmeleri guard'larda elenir.
- **Touched:** `shell/inspector-rail.tsx`, `shell/inspector-rail.test.ts`, `providers/inspector-panel.tsx`, `shell/mobile-single-view.tsx`, `components/app-shell.tsx`, `panes/panes.ts` (registry + `RailDropId`), `panes/inspector-host.tsx` (info dalı + import), `panes/tab-icons.tsx` (ikon + import), `panes/pane.tsx` (drop guard), `panes/panes.test.ts`.
- **Verify:** typecheck 0 + rail/mobile testleri green + build green + canlı: rail'de Info yok, Inspector varsayılanı Files; served bundle hash.
- **Proof:** typecheck 0 + rail 9/9 + panes 97/111/129 + mobile 31/31 + activity 17/17 + build green; served `index-D9Z1Wp0Q.js` disk ile aynı. Not: `RailDropId` artık birlikten (`InspectorTab`) türevi — eski info drag'leri `isRailDropId`/`isInspectorTabId` guard'larında elenir; birlik üyesi durur (tip kırılmaz), kayıtlı eski info sekmeleri boş pane'e düşer.
