# REQ-041 — Tüm tıklanabilir şeylerde cursor:pointer olsun

- **Status:** done (2026-09-08, commit below)
- **Asked:** 2026-09-07 — "cursor: pointer; tüm tıklanabilir şeylerde falan böyle olmalı aq".
- **Interpretation:** Butonlar, sekmeler, satırlar, ikonlar — tıklanabilen HER şeyde hover'da `cursor: pointer`.
- **Conflict resolution:** REQ-036 (crosshair, done) ile çelişiyordu — newest request wins: global buton kuralı crosshair → pointer'a çevrildi ve link + role-based tıklanabilirlere genişletildi. `.crosshair` opt-in helper class duruyor ama hiçbir yerde uygulanmıyor (0 tsx kullanımı).
- **Touched (this run):** `packages/lokma-web/web/src/index.css` only — global rule now `button:not(:disabled):not(.cursor-default), a[href]:not(.cursor-default), [role="button"]:not(.cursor-default), [role="tab"]:not(.cursor-default), [role="menuitem"]:not(.cursor-default) { cursor: pointer; }`. Guards preserved: disabled buttons keep default, mobile drawer `cursor-default` backdrop excluded; resize handles (col/row/se-resize), drag-grab surfaces, text inputs untouched.
- **Proof:** web `tsc --noEmit` 0, web build green `index-BJDa-XPT.css`, single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH, pointer rule confirmed in served CSS), headless computed-style PASS (149/149 on-screen buttons `pointer`, text field keeps `text`).
- **Commit:** cfcafe3
